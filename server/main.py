"""
Defter Studio — lokal yardımcı sunucu v2 (isteğe bağlı)

Uygulamayı http://localhost:8765 adresinde sunar (bu adresten açınca Ollama için OLLAMA_ORIGINS ayarı gerekmez) ve
tarayıcının tek başına yapamadığı işleri bilgisayarınızda yapar:
  GET  /              uygulamanın kendisi (depo kökündeki dosyalar)
  GET  /health        hangi motorların hazır olduğunu söyler
  POST /tts           metni sese çevirir: OmniVoice → VoxCPM2/Trendyol-TTS → Chatterbox → Pocket → XTTS-v2 → edge-tts → Piper
                      ("model" verilirse yalnız o model, hata verirse sessizce başkasına düşmez)
  GET/POST/PATCH/DELETE /voices   ses kütüphanesi: klonlar ve tasarlanan sesler (voices/<ad>.wav + <ad>.json)
  GET  /voices/<ad>/audio · GET /voices/presets · POST /voices/design   dinleme, hazır tasarımlar, yeni ses tasarlama
  GET/POST /models…   Hugging Face ses modelleri: katalog, indir, beğen, sil (modeller.py)
  POST /image         metinden görsel üretir (ComfyUI + FLUX.1-schnell; gorsel.py) — slayt, infografik, video sahneleri
  POST /transcribe    ses/video dosyasını metne döker (faster-whisper; GPU yoksa CPU)
  GET  /fetch         web sayfasını temiz metne çevirir (trafilatura)
  GET  /youtube       YouTube altyazısını / dökümünü alır
  GET  /search        web araması (DuckDuckGo, anahtar gerekmez)
  *    /ollama/...    Ollama'ya akışlı vekil (aynı köken: CORS sorunu olmaz)
  *    /proxy?url=    tarayıcıdan doğrudan çağrılamayan, izin listesindeki API'lere vekil

Çalıştırma:  python main.py   (yalnız 127.0.0.1'de dinler)   ·   Ayarlar: ortam değişkenleri, bkz. docs/KURULUM.md
"""
import asyncio
import importlib.util
import io
import json
import mimetypes
import os
import re
import random
import tempfile
import threading
import wave
import zlib
from functools import lru_cache
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

import adaptorler
import gorsel
import modeller

VERSION = "0.5.0"
HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
PORT = int(os.getenv("DEFTER_PORT", "8765"))
TTS_PREF = os.getenv("DEFTER_TTS", "auto").lower()             # auto | chatterbox | xtts | edge | piper | off
WHISPER_MODEL = os.getenv("DEFTER_WHISPER", "large-v3-turbo")  # tiny | small | medium | large-v3 | large-v3-turbo
DEVICE = os.getenv("DEFTER_DEVICE", "cuda")                    # cuda | cpu
VOICES_DIR = os.getenv("DEFTER_VOICES", os.path.join(HERE, "voices"))
OLLAMA = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
if not OLLAMA.startswith("http"):
    OLLAMA = "http://" + OLLAMA
ORIGINS = os.getenv("DEFTER_ORIGINS", "https://aseydaaksakal.github.io,http://localhost:8080,http://127.0.0.1:8080,http://localhost:8099").split(",")
PROXY_HOSTS = set(os.getenv("DEFTER_PROXY_HOSTS", "api.cerebras.ai,api.minimax.io,api.minimaxi.com,dashscope.aliyuncs.com,dashscope-intl.aliyuncs.com,api.x.ai,api.deepseek.com,api.mistral.ai,api.together.xyz,api.moonshot.ai,api.groq.com,openrouter.ai").split(","))

PIPER_VOICES = {  # Türkçe Piper seslerinin üçü de erkek
    "tr": {"f": os.getenv("DEFTER_PIPER_F", "tr_TR-dfki-medium"), "m": os.getenv("DEFTER_PIPER_M", "tr_TR-fahrettin-medium")},
    "en": {"f": "en_US-amy-medium", "m": "en_US-ryan-high"},
    "de": {"f": "de_DE-eva_k-x_low", "m": "de_DE-thorsten-high"},
}
EDGE_VOICES = {
    "tr": {"f": "tr-TR-EmelNeural", "m": "tr-TR-AhmetNeural"},
    "en": {"f": "en-US-AriaNeural", "m": "en-US-GuyNeural"},
    "de": {"f": "de-DE-KatjaNeural", "m": "de-DE-ConradNeural"},
}
for ext, typ in ((".wasm", "application/wasm"), (".js", "text/javascript"), (".mjs", "text/javascript"), (".webmanifest", "application/manifest+json"), (".svg", "image/svg+xml")):
    mimetypes.add_type(typ, ext)

app = FastAPI(title="Defter Studio yardımcı sunucu", version=VERSION)
# Chrome'un yerel ağ erişimi için özel ağ başlığına izin ver
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_private_network=True, expose_headers=["X-Defter-Engine"])

has = lambda mod: importlib.util.find_spec(mod) is not None  # noqa: E731

modeller.ADAPTER_STATUS = adaptorler.durum
modeller.ADAPTER_VOICES = adaptorler.SESLER
app.include_router(modeller.router())

VOX_REPOS = [r for r in (os.getenv("DEFTER_VOXCPM"), "Trendyol/Trendyol-TTS", "niobures/Trendyol-TTS", "openbmb/VoxCPM2") if r]


def vox_repo():
    """İndirilmiş ilk VoxCPM tabanlı model (indirme yöneticisinden); hiçbiri yoksa None."""
    return next((r for r in VOX_REPOS if modeller.is_ready(r)), None)


def tts_engines():
    e = []
    if has("omnivoice"):
        e.append("omnivoice")
    if adaptorler.durum("voxcpm")[0] and vox_repo():
        e.append("voxcpm")
    if has("chatterbox"):
        e.append("chatterbox")
    if has("pocket_tts"):
        e.append("pocket")
    if has("TTS"):
        e.append("xtts")
    if has("edge_tts"):
        e.append("edge")
    if has("piper"):
        e.append("piper")
    return e if TTS_PREF in ("auto", "") else [x for x in [TTS_PREF] if x in e] + [x for x in e if x != TTS_PREF]


# ---------------------------------------------------------------- Lokal ses referansları (klonlama)
SAFE = re.compile(r"[^a-z0-9ığüşöç_-]+")


def _clean(name):
    n = SAFE.sub("-", (name or "").lower()).strip("-_")[:48]
    if not n:
        raise HTTPException(400, "Geçersiz ses adı")
    return n


def _meta(n):
    try:
        with open(os.path.join(VOICES_DIR, n + ".json"), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _save_meta(n, meta):
    os.makedirs(VOICES_DIR, exist_ok=True)
    with open(os.path.join(VOICES_DIR, n + ".json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False)


def _seconds(path):
    try:
        import soundfile as sf
        i = sf.info(path)
        return round(i.frames / i.samplerate, 1)
    except Exception:
        return None


def list_voices():
    out = []
    if os.path.isdir(VOICES_DIR):
        for f in sorted(os.listdir(VOICES_DIR)):
            if f.endswith(".wav"):
                n = f[:-4]
                meta = _meta(n)
                g = meta.get("gender") or ("m" if n.upper() == "B" else "f")
                out.append({"name": n, "gender": g, "label": meta.get("label") or n, "source": meta.get("source") or "klon",
                            "engine": meta.get("engine"), "text": meta.get("text"), "hasText": bool(meta.get("text")), "textState": meta.get("textState") or ("var" if meta.get("text") else "otomatik"),
                            "seconds": _seconds(os.path.join(VOICES_DIR, f))})
    return out


def ref_for(gender, voice=None):
    if voice and voice not in ("f", "m"):
        p = os.path.join(VOICES_DIR, _clean(voice) + ".wav")
        if os.path.exists(p):
            return p
    for v in list_voices():
        if v["gender"] == gender:
            return os.path.join(VOICES_DIR, v["name"] + ".wav")
    return None


@app.get("/voices")
def voices_get():
    return {"voices": list_voices()}


def _auto_text(n):
    """Klon kaydının transkriptini arka planda çıkarır (faster-whisper). Transkript klonu iyileştirir; yoksa OmniVoice kendisi döker."""
    try:
        segs, _ = _whisper().transcribe(os.path.join(VOICES_DIR, n + ".wav"), vad_filter=True, beam_size=5)
        text = " ".join(s.text.strip() for s in segs).strip()
        meta = _meta(n)
        meta.update(text=text or None, textState="var" if text else "otomatik")
        _save_meta(n, meta)
    except Exception:
        meta = _meta(n)
        meta["textState"] = "otomatik"
        _save_meta(n, meta)


@app.post("/voices")
async def voices_post(name: str = Form(...), gender: str = Form("f"), label: str = Form(""), text: str = Form(""), file: UploadFile = File(...)):
    n = _clean(name)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Dosya çok büyük (en fazla 25 MB)")
    os.makedirs(VOICES_DIR, exist_ok=True)
    path = os.path.join(VOICES_DIR, n + ".wav")
    if data[:4] == b"RIFF":
        with open(path, "wb") as fh:
            fh.write(data)
    else:  # wav değilse dönüştür
        try:
            import soundfile as sf
            audio, sr = sf.read(io.BytesIO(data))
            sf.write(path, audio, sr)
        except Exception as e:
            raise HTTPException(400, f"Ses dosyası okunamadı, WAV gönderin: {e}")
    text = (text or "").strip()
    auto = not text and has("faster_whisper")
    _save_meta(n, {"gender": "m" if gender == "m" else "f", "label": (label or "").strip() or n, "source": "klon", "text": text or None,
                   "textState": "var" if text else ("bekliyor" if auto else "otomatik")})
    if auto:
        threading.Thread(target=_auto_text, args=(n,), daemon=True).start()
    return {"ok": True, "name": n, "textState": _meta(n).get("textState")}


@app.patch("/voices/{name}")
async def voices_patch(name: str, req: Request):
    n = _clean(name)
    if not os.path.exists(os.path.join(VOICES_DIR, n + ".wav")):
        raise HTTPException(404, "Ses bulunamadı")
    j = await req.json()
    meta = _meta(n)
    if j.get("gender") in ("f", "m"):
        meta["gender"] = j["gender"]
    if isinstance(j.get("label"), str) and j["label"].strip():
        meta["label"] = j["label"].strip()[:60]
    if isinstance(j.get("text"), str):
        meta["text"] = j["text"].strip() or None
        meta["textState"] = "var" if meta["text"] else "otomatik"
    _save_meta(n, meta)
    return {"ok": True}


@app.get("/voices/{name}/audio")
def voices_audio(name: str):
    p = os.path.join(VOICES_DIR, _clean(name) + ".wav")
    if not os.path.exists(p):
        raise HTTPException(404, "Ses bulunamadı")
    return FileResponse(p, media_type="audio/wav")


@app.delete("/voices/{name}")
def voices_delete(name: str):
    n = _clean(name)
    for ext in (".wav", ".json"):
        p = os.path.join(VOICES_DIR, n + ext)
        if os.path.exists(p):
            os.remove(p)
    return {"ok": True}


# ---- Ses tasarımı: tarif → örnek kayıt → kütüphaneye klon referansı olarak eklenir (tüm motorlar aynı sesi sürdürür)
DESIGN_TEXT = "Merhaba, ben bu defterin sesiyim. Bugün konunun en önemli noktalarını sakin ve anlaşılır bir dille birlikte öğreneceğiz."
PRESETS = [  # omni: OmniVoice'un belgelenmiş sözlüğü (cinsiyet · yaş · perde) · vox: VoxCPM2'ye serbest metin tarifi
    {"id": "kadin-genc", "label": "Kadın · genç · canlı", "gender": "f", "omni": "female, young adult, moderate pitch", "vox": "A young woman, lively and bright voice"},
    {"id": "kadin-orta", "label": "Kadın · orta yaş · sakin", "gender": "f", "omni": "female, middle-aged, moderate pitch", "vox": "A middle-aged woman, calm and warm voice"},
    {"id": "kadin-derin", "label": "Kadın · derin sesli", "gender": "f", "omni": "female, middle-aged, low pitch", "vox": "A middle-aged woman with a deep, composed voice"},
    {"id": "kadin-olgun", "label": "Kadın · olgun · öğretmen", "gender": "f", "omni": "female, elderly, moderate pitch", "vox": "An elderly woman, gentle and wise, like a kind teacher"},
    {"id": "erkek-genc", "label": "Erkek · genç · enerjik", "gender": "m", "omni": "male, young adult, moderate pitch", "vox": "A young man, energetic and friendly voice"},
    {"id": "erkek-orta", "label": "Erkek · orta yaş · net", "gender": "m", "omni": "male, middle-aged, moderate pitch", "vox": "A middle-aged man, clear and confident voice"},
    {"id": "erkek-derin", "label": "Erkek · derin sesli · belgesel", "gender": "m", "omni": "male, middle-aged, low pitch", "vox": "A middle-aged man with a deep, warm documentary narrator voice"},
    {"id": "erkek-olgun", "label": "Erkek · olgun · hoca", "gender": "m", "omni": "male, elderly, low pitch", "vox": "An elderly man, slow and thoughtful, like a respected professor"},
]
VOX_DEFAULT = {"f": "A middle-aged woman, calm and warm voice", "m": "A middle-aged man, clear and confident voice"}


def design_motors():
    m = []
    if has("omnivoice"):
        m.append("omnivoice")
    if adaptorler.durum("voxcpm")[0] and vox_repo():
        m.append("voxcpm")
    return m


@app.get("/voices/presets")
def voices_presets():
    have = {v["name"] for v in list_voices()}
    return {"presets": [{**p, "created": p["id"] in have or any(x.startswith(p["id"] + "-") for x in have)} for p in PRESETS], "motors": design_motors()}


@app.post("/voices/design")
async def voices_design(req: Request):
    j = await req.json()
    p = next((x for x in PRESETS if x["id"] == j.get("preset")), None)
    if not p and not (j.get("gender") in ("f", "m") and (j.get("instruct") or j.get("desc"))):
        raise HTTPException(400, "Hazır tasarımlardan birini seçin ya da cinsiyet + tarif gönderin")
    gender = (p or j)["gender"]
    omni = j.get("instruct") or (p or {}).get("omni") or ("female" if gender == "f" else "male")
    vox = j.get("desc") or (p or {}).get("vox") or VOX_DEFAULT[gender]
    motors = design_motors()
    motor = j.get("motor") if j.get("motor") in motors else (motors[0] if motors else None)
    if not motor:
        raise HTTPException(503, "Ses tasarlamak için OmniVoice kurulu (tools\\kur-gpu.bat) ya da Trendyol-TTS / VoxCPM2 indirilmiş olmalı")
    base = _clean(j.get("name") or (p or {}).get("id") or "ses")
    n, k = base, 2
    while os.path.exists(os.path.join(VOICES_DIR, n + ".wav")):
        n, k = f"{base}-{k}", k + 1
    seed = int(j.get("seed") or random.randint(1, 99999))

    def run():
        import numpy as np
        import soundfile as sf
        with _gpu_lock:
            if motor == "omnivoice":
                audio, sr = np.asarray(_omni().generate(text=DESIGN_TEXT, instruct=omni)[0], dtype="float32"), 24000
            else:
                audio, sr = adaptorler.voxcpm_uret(vox_repo(), DESIGN_TEXT, desc=vox, seed=seed)
        os.makedirs(VOICES_DIR, exist_ok=True)
        sf.write(os.path.join(VOICES_DIR, n + ".wav"), audio, sr)
    try:
        await asyncio.to_thread(run)
    except Exception as e:
        raise HTTPException(500, f"Ses tasarlanamadı ({motor}): {e}")
    label = (j.get("label") or (p or {}).get("label") or n) + ("" if n == base else f" #{n.rsplit('-', 1)[-1]}")
    _save_meta(n, {"gender": gender, "label": label, "source": "tasarım", "engine": motor, "text": DESIGN_TEXT, "textState": "var", "instruct": omni, "desc": vox, "seed": seed})
    return {"ok": True, "name": n, "motor": motor}


# ---------------------------------------------------------------- TTS
def _wav_bytes(samples, sr):
    import numpy as np
    pcm = (np.clip(np.asarray(samples, dtype="float32"), -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm)
    return buf.getvalue()


def _sentences(text, limit=260):
    # Klon modelleri uzun metinde bozulabilir: cümlelere böl, uzunları virgülden kır
    parts, cur = [], ""
    for s in re.split(r"(?<=[.!?…])\s+", text.strip()):
        while len(s) > limit:
            cut = s.rfind(",", 0, limit)
            cut = cut if cut > 40 else limit
            parts.append(s[:cut + 1].strip()); s = s[cut + 1:].strip()
        if len(cur) + len(s) + 1 <= limit:
            cur = (cur + " " + s).strip()
        else:
            if cur:
                parts.append(cur)
            cur = s
    if cur:
        parts.append(cur)
    return [p for p in parts if p]


def _exaggeration(tone):
    t = (tone or "").lower()
    if re.search(r"heyecan|coşku|neşe|gülerek|şaşkın", t):
        return 0.7
    if re.search(r"sakin|ciddi|sabırlı|düşünceli", t):
        return 0.4
    return 0.5


@lru_cache(maxsize=1)
def _chatterbox():
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # tools/kur-chatterbox.bat kurar
    return ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)


def tts_chatterbox(text, ref, lang, tone):
    import numpy as np
    m = _chatterbox()
    chunks = []
    for s in _sentences(text):
        wav = m.generate(s, language_id=lang, audio_prompt_path=ref, exaggeration=_exaggeration(tone), cfg_weight=0.5)
        chunks.append(wav.squeeze().cpu().numpy()); chunks.append(np.zeros(int(m.sr * 0.18), dtype="float32"))
    return _wav_bytes(np.concatenate(chunks), m.sr)


@lru_cache(maxsize=1)
def _xtts():
    from TTS.api import TTS  # pip install coqui-tts (lisans: ticari olmayan)
    return TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)


def tts_xtts(text, ref, lang, tone):
    return _wav_bytes(_xtts().tts(text=text, language=lang, speaker_wav=ref), 24000)


# ---- OmniVoice (k2-fsa, 600+ dil, referanssız "ses tasarımı": kadın/erkek) — GPU; ağırlıklar ticari olmayan kullanım
OMNI_DESIGN = {"f": os.getenv("DEFTER_OMNI_F", "female, middle-aged, moderate pitch"), "m": os.getenv("DEFTER_OMNI_M", "male, middle-aged, low pitch")}
OMNI_SEED_TEXT = "Merhaba, ben bu defterin sesiyim. Bugün konunun en önemli noktalarını sakin ve anlaşılır bir dille birlikte öğreneceğiz."


@lru_cache(maxsize=1)
def _omni():
    import torch
    from omnivoice import OmniVoice
    return OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0" if DEVICE == "cuda" else "cpu", dtype=torch.float16 if DEVICE == "cuda" else torch.float32)


def _omni_ref(gender):
    """Her cinsiyet için bir kez ses tasarlanır ve voices/omni-<cinsiyet>.wav olarak saklanır; sonraki satırlar aynı sesle (klon) okunur."""
    name = "omni-kadin" if gender == "f" else "omni-erkek"
    path = os.path.join(VOICES_DIR, name + ".wav")
    if not os.path.exists(path):
        import soundfile as sf
        audio = _omni().generate(text=OMNI_SEED_TEXT, instruct=OMNI_DESIGN[gender])
        os.makedirs(VOICES_DIR, exist_ok=True)
        sf.write(path, audio[0], 24000)
        with open(os.path.join(VOICES_DIR, name + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"gender": gender, "text": OMNI_SEED_TEXT, "engine": "omnivoice"}, fh, ensure_ascii=False)
    return path, OMNI_SEED_TEXT


def _ref_text(ref):
    try:
        with open(ref[:-4] + ".json", encoding="utf-8") as fh:
            return json.load(fh).get("text")
    except Exception:
        return None


def tts_omni(text, ref, gender):
    import numpy as np
    m = _omni()
    rtext = _ref_text(ref) if ref else None
    if not ref:  # referans yok → bu cinsiyet için bir kez tasarlanmış ses
        ref, rtext = _omni_ref(gender)
    kw = {"ref_audio": ref}
    if rtext:  # transkript yoksa atlanır: OmniVoice README'sine göre referansı kendisi Whisper ile döker
        kw["ref_text"] = rtext
    chunks = []
    for part in _sentences(text, 300):
        audio = m.generate(text=part, **kw)
        chunks.append(np.asarray(audio[0], dtype="float32")); chunks.append(np.zeros(int(24000 * 0.15), dtype="float32"))
    return _wav_bytes(np.concatenate(chunks), 24000)


# ---- VoxCPM2 / Trendyol-TTS (adaptorler.py): referans varsa klon, yoksa metinle tasarlanmış ses; tohum sabit → aynı ses
def tts_voxcpm(repo, text, ref, gender, voice):
    import numpy as np
    rtext = _ref_text(ref) if ref else None
    seed = zlib.crc32(str(voice or gender).encode()) % 99999 + 1
    chunks, sr = [], 24000
    for part in _sentences(text, 300):
        a, sr = adaptorler.voxcpm_uret(repo, part, ref=ref, ref_text=rtext, desc=None if ref else VOX_DEFAULT[gender], seed=seed)
        chunks.append(a); chunks.append(np.zeros(int(sr * 0.15), dtype="float32"))
    return _wav_bytes(np.concatenate(chunks), sr)


# ---- Pocket TTS Türkçe (alperiox/pocket-tts-turkish, MIT, CPU'da gerçek zamanın 5 katı) — referans ses gerekir
@lru_cache(maxsize=1)
def _pocket():
    from pocket_tts import TTSModel
    return TTSModel.load_model(os.getenv("DEFTER_POCKET", "alperiox/pocket-tts-turkish"))


@lru_cache(maxsize=8)
def _pocket_voice(ref):
    return _pocket().get_state_for_audio_prompt(ref)


def tts_pocket(text, ref):
    import numpy as np
    m = _pocket()
    t = text.replace("İ", "i").replace("I", "ı").lower()  # model büyük İ/I görmedi
    audio = m.generate_audio(_pocket_voice(ref), t)
    return _wav_bytes(np.asarray(audio, dtype="float32"), m.sample_rate)


async def tts_edge(text, gender, lang):
    import edge_tts  # Ücretsiz ama çevrimiçi Microsoft sesleri; resmî API değildir
    voice = EDGE_VOICES.get(lang, EDGE_VOICES["tr"])[gender]
    out = bytearray()
    async for chunk in edge_tts.Communicate(text, voice).stream():
        if chunk["type"] == "audio":
            out += chunk["data"]
    if not out:
        raise RuntimeError("edge-tts boş ses döndürdü")
    return bytes(out)


@lru_cache(maxsize=8)
def _piper(voice_name):
    import subprocess
    import sys
    from piper import PiperVoice  # pip install piper-tts
    os.makedirs(VOICES_DIR, exist_ok=True)
    path = os.path.join(VOICES_DIR, voice_name + ".onnx")
    if not os.path.exists(path):  # ilk kullanımda sesi indir
        subprocess.run([sys.executable, "-m", "piper.download_voices", "--download-dir", VOICES_DIR, voice_name], check=True)
    return PiperVoice.load(path, use_cuda=False)


def tts_piper(text, gender, lang):
    voice = _piper(PIPER_VOICES.get(lang, PIPER_VOICES["tr"])[gender])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w)
    return buf.getvalue()


_gpu_lock = threading.Lock()  # aynı anda tek GPU üretimi


def _gpu_synth(eng, text, gender, lang, ref, j, repo=None):
    """GPU/PyTorch motorları; aynı anda tek üretim. Referansı olmayan klon motorları LookupError verir (sıradaki motora geçilir)."""
    with _gpu_lock:
        if eng == "omnivoice":
            return tts_omni(text, ref, gender)
        if eng == "voxcpm":
            return tts_voxcpm(repo or vox_repo(), text, ref, gender, j.get("voice"))
        if eng == "pocket":
            pref = ref or os.path.join(VOICES_DIR, ("omni-kadin" if gender == "f" else "omni-erkek") + ".wav")
            if not os.path.exists(pref):
                raise LookupError("referans ses yok")
            return tts_pocket(text, pref)
        if eng in ("chatterbox", "xtts"):
            if not ref:
                raise LookupError("referans ses yok")  # bu cinsiyette referans ses yok → sıradaki motor
            return (tts_chatterbox if eng == "chatterbox" else tts_xtts)(text, ref, lang, j.get("tone"))
        if eng in ("bark", "kugelaudio"):  # yalnız dinleme testi için: hazır seslerle konuşur, klon yok
            import numpy as np
            fn = adaptorler.bark_uret if eng == "bark" else adaptorler.kugel_uret
            chunks, sr = [], 24000
            for part in _sentences(text, 160 if eng == "bark" else 300):  # Bark ~13 sn ile sınırlı
                a, sr = fn(repo, part, j.get("voice") if j.get("voice") not in (None, "f", "m") else None)
                chunks.append(a); chunks.append(np.zeros(int(sr * 0.15), dtype="float32"))
            return _wav_bytes(np.concatenate(chunks), sr)
    raise LookupError("bilinmeyen motor")


async def _tts_model(model_id, j, text, gender, lang, ref):
    """Belirli bir kataloğ modeliyle üretir. Hata olursa başka motora düşmez: seçtiğiniz modelin gerçek hatasını görürsünüz."""
    m = modeller.entry(model_id)
    if not m:
        raise HTTPException(404, f"Katalogda yok: {model_id}")
    if not m.get("adaptor"):
        raise HTTPException(400, f"{m['ad']} için Defter Studio'da çalıştırıcı yok (yalnız indirilebilir).")
    ok, why = adaptorler.durum(m["adaptor"])
    if not ok:
        raise HTTPException(503, f"{m['ad']}: {why}")
    if not modeller.is_ready(model_id):
        raise HTTPException(409, f"{m['ad']} indirilmemiş. Ayarlar › Seslendirme › Lokal modeller bölümünden indirin.")
    eng = m["adaptor"]
    try:
        data = await asyncio.to_thread(_gpu_synth, eng, text, gender, lang, ref, j, model_id)
    except LookupError as e:
        raise HTTPException(409, f"{m['ad']}: {e}. Ses kütüphanesine bir kayıt ekleyin ya da bir ses tasarlayın.")
    except Exception as e:
        raise HTTPException(500, f"{m['ad']} çalışmadı: {e}")
    return Response(data, media_type="audio/wav", headers={"X-Defter-Engine": eng + ":" + model_id})


@app.post("/tts")
async def tts(req: Request):
    j = await req.json()
    text = (j.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Metin boş")
    if TTS_PREF == "off":
        raise HTTPException(503, "TTS kapalı (DEFTER_TTS=off)")
    gender = "m" if j.get("gender") == "m" else "f"
    lang = (j.get("lang") or "tr-TR")[:2].lower()
    ref = ref_for(gender, j.get("voice"))
    if j.get("model"):
        return await _tts_model(j["model"], j, text, gender, lang, ref)
    errors = []
    for eng in tts_engines():
        try:
            if eng in ("omnivoice", "voxcpm", "pocket", "chatterbox", "xtts"):
                data = await asyncio.to_thread(_gpu_synth, eng, text, gender, lang, ref, j)
                return Response(data, media_type="audio/wav", headers={"X-Defter-Engine": eng})
            if eng == "edge":
                return Response(await tts_edge(text, gender, lang), media_type="audio/mpeg", headers={"X-Defter-Engine": eng})
            if eng == "piper":
                data = await asyncio.to_thread(tts_piper, text, gender, lang)
                return Response(data, media_type="audio/wav", headers={"X-Defter-Engine": eng})
        except Exception as e:  # motor kurulmamış/çevrimdışı olabilir → sıradaki
            errors.append(f"{eng}: {e}")
    raise HTTPException(500, "Hiçbir seslendirme motoru çalışmadı. " + " | ".join(errors) if errors else "Seslendirme motoru kurulu değil (pip install edge-tts piper-tts)")


# ---------------------------------------------------------------- Ses dökümü
@lru_cache(maxsize=1)
def _whisper():
    from faster_whisper import WhisperModel
    try:
        return WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
    except Exception:  # CUDA kütüphaneleri yoksa CPU ile çalış
        return WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")


def _transcribe_path(path):
    segs, info = _whisper().transcribe(path, vad_filter=True, beam_size=5)
    lines = []
    for s in segs:
        m, sec = divmod(int(s.start), 60)
        lines.append(f"[{m:02d}:{sec:02d}] {s.text.strip()}")
    return "\n".join(lines), info.language


@app.post("/image")
async def image(req: Request):
    """{prompt, width, height, seed?} → görsel baytları (ComfyUI + FLUX.1-schnell)."""
    j = await req.json()
    try:
        data, tur = await gorsel.uret(j.get("prompt", ""), j.get("width", 1024), j.get("height", 576), j.get("seed"))
    except gorsel.GorselHata as e:
        raise HTTPException(e.kod, str(e))
    return Response(content=data, media_type=tur, headers={"X-Defter-Engine": "comfyui-flux"})


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not has("faster_whisper"):
        raise HTTPException(503, "faster-whisper kurulu değil (pip install faster-whisper)")
    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
    try:
        text, lang = await asyncio.to_thread(_transcribe_path, tmp.name)
    finally:
        os.unlink(tmp.name)
    return {"text": text, "language": lang}


# ---------------------------------------------------------------- Web
@app.get("/fetch")
def fetch(url: str):
    import trafilatura
    html = trafilatura.fetch_url(url)
    if not html:
        raise HTTPException(502, "Sayfa indirilemedi")
    text = trafilatura.extract(html, include_tables=True, include_comments=False) or ""
    meta = trafilatura.extract_metadata(html)
    return {"title": (meta.title if meta else None) or url, "text": text}


@app.get("/youtube")
def youtube(url: str):
    vid = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url)
    if not vid:
        raise HTTPException(400, "YouTube kimliği bulunamadı")
    vid = vid.group(1)
    title = url
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as y:
            title = y.extract_info(url, download=False).get("title", url)
    except Exception:
        pass
    try:  # 1) Hazır altyazı
        from youtube_transcript_api import YouTubeTranscriptApi
        tr = YouTubeTranscriptApi().fetch(vid, languages=["tr", "en", "de"])
        return {"title": title, "text": "\n".join(s.text for s in tr)}
    except Exception:
        pass
    # 2) Altyazı yoksa: sesi indir ve Whisper ile dök
    import yt_dlp
    with tempfile.TemporaryDirectory() as d:
        with yt_dlp.YoutubeDL({"quiet": True, "format": "bestaudio/best", "outtmpl": os.path.join(d, "a.%(ext)s")}) as y:
            y.download([url])
        path = os.path.join(d, os.listdir(d)[0])
        text, _ = _transcribe_path(path)
    return {"title": title, "text": text}


@app.get("/search")
def search(q: str, n: int = 8):
    from ddgs import DDGS
    res = DDGS().text(q, max_results=n)
    return {"results": [{"title": r.get("title"), "url": r.get("href"), "snippet": r.get("body")} for r in res]}


# ---------------------------------------------------------------- Vekiller
HOP = {"host", "origin", "referer", "cookie", "content-length", "connection", "accept-encoding"}


async def _relay(method, url, headers, body):
    import httpx
    client = httpx.AsyncClient(timeout=httpx.Timeout(600, connect=10))
    req = client.build_request(method, url, headers=headers, content=body)
    try:
        r = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        raise HTTPException(502, f"Bağlanılamadı: {e}")

    async def body_iter():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose(); await client.aclose()
    keep = {k: v for k, v in r.headers.items() if k.lower() in ("content-type", "cache-control", "x-request-id")}
    return StreamingResponse(body_iter(), status_code=r.status_code, headers=keep)


@app.api_route("/ollama/{path:path}", methods=["GET", "POST", "DELETE", "HEAD"])
async def ollama_proxy(path: str, req: Request):
    headers = {k: v for k, v in req.headers.items() if k.lower() not in HOP}
    return await _relay(req.method, f"{OLLAMA.rstrip('/')}/{path}", headers, await req.body())


@app.api_route("/proxy", methods=["GET", "POST"])
async def api_proxy(url: str, req: Request):
    host = urlparse(url).hostname or ""
    if urlparse(url).scheme != "https" or host not in PROXY_HOSTS:
        raise HTTPException(403, f"Bu adres izin listesinde değil: {host} (DEFTER_PROXY_HOSTS)")
    headers = {k: v for k, v in req.headers.items() if k.lower() not in HOP}
    return await _relay(req.method, url, headers, await req.body())


@app.get("/health")
def health():
    eng = tts_engines()
    vs = list_voices()
    clone = any(e in eng for e in ("chatterbox", "xtts", "pocket", "omnivoice", "voxcpm"))
    female = "edge" in eng or "omnivoice" in eng or "voxcpm" in eng or (clone and any(v["gender"] == "f" for v in vs))
    ready = [m["id"] for m in modeller.catalog() if m.get("adaptor") and modeller.is_ready(m["id"])]
    return {"ok": True, "version": VERSION, "app": os.path.exists(os.path.join(APP_DIR, "index.html")),
            "tts": {"pref": TTS_PREF, "engines": eng, "female": female, "clone": clone, "voices": len(vs), "models": ready, "design": design_motors()},
            "stt": f"faster-whisper {WHISPER_MODEL}" if has("faster_whisper") else None, "ollama": OLLAMA, "image": gorsel.durum()}


# ---------------------------------------------------------------- Uygulama (statik dosyalar) — en sonda bağlanmalı
class AppFiles(StaticFiles):
    async def get_response(self, path, scope):
        p = path.replace("\\", "/").lstrip("/")
        if p not in ("", ".") and (p.startswith((".", "server/", "tools/", "tests/")) or "/." in p):
            raise HTTPException(404)
        r = await super().get_response(path, scope)
        r.headers["Cache-Control"] = "no-cache"
        return r


if os.path.exists(os.path.join(APP_DIR, "index.html")):
    app.mount("/", AppFiles(directory=APP_DIR, html=True), name="app")


if __name__ == "__main__":
    import uvicorn
    url = f"http://localhost:{PORT}/"
    print(f"Defter Studio {VERSION}: {url}  ·  TTS={','.join(tts_engines()) or 'yok'}  ·  Whisper={WHISPER_MODEL}/{DEVICE}  ·  Ollama={OLLAMA}")
    if os.getenv("DEFTER_OPEN", "1") != "0":
        import webbrowser
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT)
