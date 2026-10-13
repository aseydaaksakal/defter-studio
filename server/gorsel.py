"""
Defter Studio — lokal görsel üretimi (ComfyUI + FLUX.1-schnell)

ComfyUI ayrı bir programdır (varsayılan http://127.0.0.1:8188). Bu modül ona API iş akışı gönderir, bitince görseli alır.
Model denetim noktası (checkpoint) ya da ayrı dosyalar (UNET + CLIP + VAE) olabilir; ComfyUI'nin /object_info yanıtından otomatik seçilir.

Ortam değişkenleri:
  DEFTER_COMFY         ComfyUI adresi (varsayılan http://127.0.0.1:8188)
  DEFTER_COMFY_MODEL   checkpoint ya da unet dosya adı (boşsa 'schnell' ya da 'flux' içeren ilk dosya)
  DEFTER_COMFY_STEPS   adım sayısı (schnell için 4)
Kurulum: tools/kur-comfyui.bat · ayrıntı docs/GORSEL.md
"""
import asyncio
import os
import random
import time
import uuid

import httpx

COMFY = os.getenv("DEFTER_COMFY", "http://127.0.0.1:8188").rstrip("/")
MODEL = os.getenv("DEFTER_COMFY_MODEL", "")
STEPS = int(os.getenv("DEFTER_COMFY_STEPS", "4"))
_lock = asyncio.Lock()          # GPU'da aynı anda tek iş
_cache = {"at": 0.0, "val": None}


class GorselHata(Exception):
    def __init__(self, mesaj, kod=500):
        super().__init__(mesaj)
        self.kod = kod


def _liste(info, dugum, alan):
    try:
        return list(info[dugum]["input"]["required"][alan][0])
    except Exception:
        return []


def _sec(adlar, tercih=""):
    """Dosya adı listesinden FLUX schnell'i seçer."""
    if tercih and tercih in adlar:
        return tercih
    for anahtar in ("schnell", "flux"):
        for a in adlar:
            if anahtar in a.lower():
                return a
    return None


def _kesfet(info):
    """/object_info yanıtından kullanılacak iş akışı türünü ve dosya adlarını bulur."""
    ckpt = _sec(_liste(info, "CheckpointLoaderSimple", "ckpt_name"), MODEL)
    if ckpt:
        return {"tur": "ckpt", "model": ckpt}
    unet = _sec(_liste(info, "UNETLoader", "unet_name"), MODEL)
    if unet:
        clips = _liste(info, "DualCLIPLoader", "clip_name1")
        t5 = next((c for c in clips if "t5" in c.lower()), None)
        cl = next((c for c in clips if "clip_l" in c.lower()), None)
        vae = next((v for v in _liste(info, "VAELoader", "vae_name") if v.lower().startswith("ae") or "flux" in v.lower()), None)
        if t5 and cl and vae:
            return {"tur": "ayri", "model": unet, "t5": t5, "clip_l": cl, "vae": vae}
        return {"tur": None, "model": unet, "eksik": "t5xxl, clip_l ve ae.safetensors dosyaları"}
    return {"tur": None, "model": None, "eksik": "FLUX.1-schnell modeli (checkpoints klasörüne flux1-schnell-fp8.safetensors)"}


def durum():
    """Sağlık denetimi için: {ok, model, url} ya da {ok: False, neden}. 10 sn önbellekli, çevrimdışıyken hızlı döner."""
    if time.time() - _cache["at"] < 10 and _cache["val"] is not None:
        return _cache["val"]
    try:
        with httpx.Client(timeout=httpx.Timeout(1.5, connect=0.6)) as c:
            c.get(COMFY + "/system_stats").raise_for_status()
            info = {}
            for k in ("CheckpointLoaderSimple", "UNETLoader", "DualCLIPLoader", "VAELoader"):
                info.update(c.get(COMFY + "/object_info/" + k).json())
        k = _kesfet(info)
        val = {"ok": bool(k["tur"]), "model": k.get("model"), "tur": k["tur"], "url": COMFY}
        if not k["tur"]:
            val["neden"] = "ComfyUI çalışıyor ama eksik: " + k["eksik"]
    except Exception:
        val = {"ok": False, "neden": f"ComfyUI çalışmıyor ({COMFY})", "url": COMFY}
    _cache.update(at=time.time(), val=val)
    return val


def is_akisi(k, istem, w, h, tohum):
    """Basit FLUX schnell iş akışı (ComfyUI API biçimi)."""
    if k["tur"] == "ckpt":
        a = {"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": k["model"]}}}
        clip, model, vae = ["1", 1], ["1", 0], ["1", 2]
    else:
        a = {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": k["model"], "weight_dtype": "default"}},
            "8": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": k["t5"], "clip_name2": k["clip_l"], "type": "flux"}},
            "9": {"class_type": "VAELoader", "inputs": {"vae_name": k["vae"]}},
        }
        clip, model, vae = ["8", 0], ["1", 0], ["9", 0]
    a.update({
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": istem, "clip": clip}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": clip}},
        "3": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "4": {"class_type": "KSampler", "inputs": {"model": model, "positive": ["2", 0], "negative": ["5", 0], "latent_image": ["3", 0],
                                                  "seed": tohum, "steps": STEPS, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["4", 0], "vae": vae}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "defter"}},
    })
    return a


def _boyut(v, varsayilan):
    try:
        v = int(v)
    except Exception:
        v = varsayilan
    return max(256, min(1536, (v // 16) * 16))


async def uret(istem, genislik=1024, yukseklik=576, tohum=None, zaman_asimi=240):
    """Görseli üretir; (bayt, ortam_türü) döndürür."""
    if not istem or not istem.strip():
        raise GorselHata("İstem boş", 400)
    _cache["at"] = 0  # taze denetim
    d = durum()
    if not d["ok"]:
        raise GorselHata(d.get("neden", "ComfyUI hazır değil") + " — tools\\kur-comfyui.bat, docs/GORSEL.md", 503)
    async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=5)) as c:
        info = {}
        for k in ("CheckpointLoaderSimple", "UNETLoader", "DualCLIPLoader", "VAELoader"):
            info.update((await c.get(COMFY + "/object_info/" + k)).json())
        k = _kesfet(info)
        w, h = _boyut(genislik, 1024), _boyut(yukseklik, 576)
        tohum = tohum if tohum is not None else random.randint(1, 2**31 - 1)
        async with _lock:
            r = await c.post(COMFY + "/prompt", json={"prompt": is_akisi(k, istem.strip()[:1500], w, h, tohum), "client_id": uuid.uuid4().hex})
            if r.status_code != 200:
                raise GorselHata("ComfyUI iş akışını reddetti: " + r.text[:300], 502)
            pid = r.json().get("prompt_id")
            bitis = time.time() + zaman_asimi
            while time.time() < bitis:
                await asyncio.sleep(0.6)
                g = (await c.get(f"{COMFY}/history/{pid}")).json().get(pid)
                if not g:
                    continue
                if g.get("status", {}).get("status_str") == "error":
                    raise GorselHata("ComfyUI hata verdi (GPU belleği ya da model dosyası): " + str(g["status"].get("messages", ""))[-300:], 502)
                for cikti in g.get("outputs", {}).values():
                    for im in cikti.get("images", []):
                        v = await c.get(COMFY + "/view", params={"filename": im["filename"], "subfolder": im.get("subfolder", ""), "type": im.get("type", "output")})
                        v.raise_for_status()
                        return v.content, v.headers.get("content-type", "image/png")
            raise GorselHata("ComfyUI zaman aşımı (görsel üretilemedi)", 504)
