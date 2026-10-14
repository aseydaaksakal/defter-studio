"""
Defter Studio — lokal yardımcı sunucu v2 (isteğe bağlı)

Uygulamayı http://localhost:8765 adresinde sunar (bu adresten açınca Ollama için OLLAMA_ORIGINS ayarı gerekmez) ve
tarayıcının tek başına yapamadığı işleri bilgisayarınızda yapar:
  GET  /              uygulamanın kendisi (depo kökündeki dosyalar)
  GET  /health        hangi motorların GERÇEKTEN çalıştığını söyler (tts.engines=import edilebilen, tts.installed=diskte olan, tts.engineErrors)
  GET/PUT /cast       karakter kadrosu (cast.json, kalıcı; Pages ile localhost ortak kaynağı)
  POST /tts           metni sese çevirir: Pocket TTS Türkçe (6 hazır ses) → OmniVoice → VoxCPM2/Trendyol-TTS → Chatterbox → Pocket → XTTS-v2 → edge-tts
                      ("model" ya da "engine" verilirse yalnız o, hata verirse sessizce başkasına düşmez; uygulama podcast
                      boyunca /health'teki "plan" motorunu "engine" olarak göndererek ses ve cinsiyetin değişmesini önler).
                      Piper (robot, yalnız erkek) otomatik sırada yoktur; yalnız DEFTER_TTS=piper ile seçilir.
  GET/POST/PATCH/DELETE /voices   ses kütüphanesi: klonlar ve tasarlanan sesler (voices/<ad>.wav + <ad>.json)
  GET  /voices/<ad>/audio · GET /voices/presets · POST /voices/design   dinleme, hazır tasarımlar, yeni ses tasarlama
  GET/POST /models…   Hugging Face ses modelleri: katalog, indir, beğen, sil (modeller.py)
  POST /video/start|frames|finish   hızlı MP4: tarayıcının çizdiği kareler + ses → ffmpeg (video v2)
  POST /image         metinden görsel üretir (ComfyUI + FLUX.1-schnell; gorsel.py) — slayt, infografik, video sahneleri
  POST /transcribe    ses/video dosyasını metne döker (faster-whisper; GPU yoksa CPU)
  GET  /fetch         web sayfasını temiz metne çevirir (trafilatura)
  GET  /youtube       YouTube altyazısını / dökümünü alır
  GET  /search        web araması (DuckDuckGo, anahtar gerekmez)
  *    /ollama/...    Ollama'ya akışlı vekil (aynı köken: CORS sorunu olmaz)
  *    /proxy?url=    tarayıcıdan doğrudan çağrılamayan, izin listesindeki API'lere vekil

Çalıştırma:  python main.py   (yalnız 127.0.0.1'de dinler)   ·   Ayarlar: ortam değişkenleri, bkz. docs/KURULUM.md
"""
import sys

if sys.platform == "win32":  # DLL hataları ("Entry Point Not Found" penceresi) açılır pencere yerine Python ImportError olsun; DİĞER importlardan önce
    try:
        import ctypes
        ctypes.windll.kernel32.SetErrorMode(0x8003)
    except Exception:
        pass

import asyncio
import importlib.util
import io
import json
import mimetypes
import os
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # hf_xet Windows'ta takılabiliyor; klasik indirme
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
import re
import shutil
import random
import tempfile
import time
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
import guncelle
import gorsel
import modeller

VERSION = "0.8.4"
HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
DATA_DIR = os.getenv("DEFTER_DATA") or os.getenv("DEFTER_VERI") or os.path.join(HERE, "veri")  # tek veri klasörü (DEFTER_VERI eski ad)
PORT = int(os.getenv("DEFTER_PORT", "8765"))
TTS_PREF = os.getenv("DEFTER_TTS", "auto").lower()             # auto | chatterbox | xtts | edge | piper | off
WHISPER_MODEL = os.getenv("DEFTER_WHISPER", "large-v3-turbo")  # tiny | small | medium | large-v3 | large-v3-turbo
DEVICE = os.getenv("DEFTER_DEVICE", "cuda")                    # cuda | cpu
VOICES_DIR = os.getenv("DEFTER_VOICES", os.path.join(HERE, "voices"))
modeller.VOICES_DIR_KANIT = VOICES_DIR
OLLAMA = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
if not OLLAMA.startswith("http"):
    OLLAMA = "http://" + OLLAMA
ORIGINS = os.getenv("DEFTER_ORIGINS", "https://aseydaaksakal.github.io,http://localhost:8080,http://127.0.0.1:8080,http://localhost:8099").split(",")
PROXY_HOSTS = set(os.getenv("DEFTER_PROXY_HOSTS", "api.cerebras.ai,api.fish.audio,api.minimax.io,api.minimaxi.com,dashscope.aliyuncs.com,dashscope-intl.aliyuncs.com,api.x.ai,api.deepseek.com,api.mistral.ai,api.together.xyz,api.moonshot.ai,api.groq.com,openrouter.ai").split(","))

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

def has(mod):
    try:
        return importlib.util.find_spec(mod) is not None
    except (ValueError, ImportError):  # sys.modules'a elle konmuş (spec'siz) modül
        return mod in sys.modules

modeller.ADAPTER_STATUS = adaptorler.durum
modeller.ADAPTER_VOICES = adaptorler.SESLER
app.include_router(modeller.router())

VOX_REPOS = [r for r in (os.getenv("DEFTER_VOXCPM"), "Trendyol/Trendyol-TTS", "niobures/Trendyol-TTS", "openbmb/VoxCPM2") if r]


def vox_repo():
    """İndirilmiş ilk VoxCPM tabanlı model (indirme yöneticisinden); hiçbiri yoksa None."""
    return next((r for r in VOX_REPOS if modeller.tam_hazir(r)), None)


def tts_installed():
    """Paketi diskte olan motorlar (import edilebildiği DENETLENMEZ; torch bozukken de burada görünür)."""
    e = []
    if has("pocket_tts_turkish"):  # CPU'da bile çalışır, 3 kadın + 3 erkek hazır ses (referans kaydı gerekmez)
        e.append("pockettr")
    if has("omnivoice"):
        e.append("omnivoice")
    if adaptorler.durum("voxcpm")[0] and vox_repo():
        e.append("voxcpm")
    if has("chatterbox"):
        e.append("chatterbox")
    if has("pocket_tts") and os.getenv("DEFTER_POCKET_LEGACY") == "1":  # eski (referans gerektiren) adaptör; 0.8.0'dan beri kapalı: pockettr onun yerine geçti
        e.append("pocket")
    if has("TTS"):
        e.append("xtts")
    if has("edge_tts"):
        e.append("edge")
    if has("piper"):
        e.append("piper")
    return e if TTS_PREF in ("auto", "") else [x for x in [TTS_PREF] if x in e] + [x for x in e if x != TTS_PREF]


# ---- Gerçek yüklenebilirlik denetimi: paket diskte var diye motor "hazır" sayılmaz (torch/DLL bozukken üretimde patlıyordu).
# Her modül AYRI bir alt süreçte import edilir (DLL çökmesi sunucuyu düşürmesin, zaman aşımı sunucuyu kilitlemesin); sonuç kısa süre önbelleğe alınır.
PROBE_MODS = {"pockettr": "pocket_tts_turkish", "omnivoice": "omnivoice", "voxcpm": "voxcpm", "chatterbox": "chatterbox", "pocket": "pocket_tts",
              "xtts": "TTS", "edge": "edge_tts", "piper": "piper"}
PROBE_TIMEOUT = float(os.getenv("DEFTER_PROBE_TIMEOUT", "90"))
PROBE_TTL_OK, PROBE_TTL_ERR = 600.0, 60.0
_PROBE_CODE = (
    "import sys\n"
    "if sys.platform == 'win32':\n"
    "    import ctypes; ctypes.windll.kernel32.SetErrorMode(0x8003)\n"
    "import importlib\n"
    "try:\n"
    "    importlib.import_module(sys.argv[1])\n"
    "except BaseException as e:\n"
    "    print(type(e).__name__ + ': ' + ' '.join(str(e).split())[:300]); sys.exit(1)\n"
)
_probe_cache = {}          # modül -> (zaman, None | ham hata metni)
_probe_lock = threading.Lock()
_probe_bg = {"busy": False}


def _probe_run(mod):
    """Modülü alt süreçte import eder. None = tamam, str = ham hata metni."""
    import subprocess
    try:
        r = subprocess.run([sys.executable, "-c", _PROBE_CODE, mod], capture_output=True, text=True, timeout=PROBE_TIMEOUT)
    except subprocess.TimeoutExpired:
        return "zaman aşımı: modül yüklenemedi"
    except Exception as e:
        return f"{type(e).__name__}: {e}"
    if r.returncode == 0:
        return None
    return (r.stdout or r.stderr or f"süreç çöktü (kod {r.returncode})").strip().splitlines()[-1][:300]


PROBE_FILE = os.path.join(DATA_DIR, "probe.json")  # son denetim sonucu: yeniden başlatmada anında doğru durum
PENDING = "__bekleniyor__"


def _probe_load():
    try:
        with open(PROBE_FILE, encoding="utf-8") as f:
            for m, (t, err) in json.load(f).items():
                _probe_cache.setdefault(m, (min(t, time.time() - PROBE_TTL_OK - 1), err))  # bayat sayılır: arka planda yeniden denenir
    except Exception:
        pass


def _probe_save():
    try:
        os.makedirs(os.path.dirname(PROBE_FILE), exist_ok=True)
        with open(PROBE_FILE, "w", encoding="utf-8") as f:
            json.dump(_probe_cache, f)
    except OSError:
        pass


def _probe_refresh(mods):
    from concurrent.futures import ThreadPoolExecutor
    with _probe_lock:
        with ThreadPoolExecutor(max_workers=max(1, min(4, len(mods)))) as ex:
            for m, err in zip(mods, ex.map(_probe_run, mods)):
                _probe_cache[m] = (time.time(), err)
    _probe_save()


def _probe_bg_start(mods):
    if _probe_bg["busy"] or not mods:
        return

    _probe_bg["busy"] = True

    def work():
        try:
            _probe_refresh(mods)
        finally:
            _probe_bg["busy"] = False
    threading.Thread(target=work, daemon=True).start()


def _probe_status(mods):
    """{modül: None | hata | PENDING}. HİÇBİR ZAMAN beklemez (/health hemen döner): denetim arka planda yürür; sonuç gelene dek PENDING."""
    if os.getenv("DEFTER_PROBE", "1") == "0":
        return {m: None for m in mods}
    if not _probe_cache:
        _probe_load()
    now = time.time()
    need = [m for m in mods if m not in _probe_cache]
    stale = [m for m in mods if m in _probe_cache and now - _probe_cache[m][0] > (PROBE_TTL_OK if _probe_cache[m][1] is None else PROBE_TTL_ERR)]
    _probe_bg_start(need + stale)
    return {m: (_probe_cache[m][1] if m in _probe_cache else PENDING) for m in mods}


def probing():
    """Henüz sonucu gelmemiş motorlar (arayüz 'kontrol ediliyor' gösterir)."""
    inst = tts_installed()
    st = _probe_status([PROBE_MODS[e] for e in inst if e in PROBE_MODS])
    return [e for e in inst if e in PROBE_MODS and st.get(PROBE_MODS[e]) == PENDING]


def probe_reset():
    _probe_cache.clear()


def engine_errors():
    """{motor: 'kısa Türkçe hata'} — paketi diskte olup import EDİLEMEYEN motorlar."""
    inst = tts_installed()
    st = _probe_status([PROBE_MODS[e] for e in inst if e in PROBE_MODS])
    return {e: _engine_err_text(st[PROBE_MODS[e]]) for e in inst if e in PROBE_MODS and st.get(PROBE_MODS[e]) and st.get(PROBE_MODS[e]) != PENDING}


def _engine_err_text(raw):
    t = (raw or "").lower()
    if any(k in t for k in ("dll", "entry point", "winerror", "c10", "torch_cuda", "libtorchaudio", "undefined symbol", "çöktü")):
        kisa = "PyTorch/DLL uyumsuz"
    elif "zaman aşımı" in t:
        kisa = "yükleme zaman aşımına uğradı"
    elif "no module named" in t or "modulenotfound" in t:
        kisa = "bağımlı paket eksik"
    else:
        kisa = " ".join((raw or "yüklenemedi").split())[:80]
    return (kisa + ". kur.bat'ı yeniden çalıştırın")[:160]


def tts_engines():
    """Gerçekten ÇALIŞAN (import edilebilen) motorlar; /health tts.engines ve tüm seçim mantığı bunu kullanır."""
    inst = tts_installed()
    st = _probe_status([PROBE_MODS[e] for e in inst if e in PROBE_MODS])
    return [e for e in inst if e not in PROBE_MODS or st.get(PROBE_MODS[e]) is None]


def tts_auto():
    """Otomatik sıra: Piper yok. Türkçe Piper sesleri yalnız erkek ve robot gibi; podcast ortasında ona düşmek sesi bozuyordu."""
    return [x for x in tts_engines() if x != "piper" or TTS_PREF == "piper"]


def _engine_can(eng, gender):
    """Bu motor, bu cinsiyette (ek ayar gerekmeden) hemen konuşabilir mi?"""
    if eng in ("pockettr", "omnivoice", "voxcpm", "edge"):
        return True
    if eng == "piper":
        return gender == "m"
    if eng in ("chatterbox", "xtts"):
        return ref_for(gender) is not None
    if eng == "pocket":
        return ref_for(gender) is not None or os.path.exists(os.path.join(VOICES_DIR, ("omni-kadin" if gender == "f" else "omni-erkek") + ".wav"))
    return False


CLONERS = ("omnivoice", "voxcpm", "chatterbox", "xtts")  # referans kayıtla klonlayabilen motorlar (öncelik sırası)


def clone_engine():
    return next((e for e in CLONERS if e in tts_engines()), None)


def _engine_for_voice(voice, want):
    """Seçilen sese göre motor: hazır Pocket TR sesi → pockettr; kütüphanedeki klon/tasarım ses → klonlayabilen motor
    (cinsiyet için kilitlenen motor klon yapamıyorsa — pockettr/edge/piper — klonlayabilen motora geçilir)."""
    if not voice or voice in ("f", "m"):
        return want
    if voice in _PT_BY_NAME:
        return "pockettr" if "pockettr" in tts_engines() else want
    try:
        lib = os.path.exists(os.path.join(VOICES_DIR, _clean(voice) + ".wav"))
    except HTTPException:
        return want
    if lib and want in ("", "pockettr", "edge", "piper"):
        return clone_engine() or want
    return want


def tts_plan():
    """Cinsiyet başına kilitlenecek motor: uygulama bunu her satırda 'engine' olarak gönderir, böylece bir podcast boyunca
    aynı motor ve aynı ses kullanılır; hata olursa başka motora düşülmez, gerçek hata gösterilir."""
    eng = tts_auto()
    return {g: next((x for x in eng if _engine_can(x, g)), None) for g in ("f", "m")}


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
                            "engine": meta.get("engine"), "instruct": meta.get("instruct"), "text": meta.get("text"), "hasText": bool(meta.get("text")), "textState": meta.get("textState") or ("var" if meta.get("text") else "otomatik"),
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


def builtin_voices():
    """Referans kaydı gerektirmeyen hazır sesler (şu an Pocket TTS Türkçe). Ses kadrosu ve podcast bunları cinsiyete göre dağıtır."""
    if not has("pocket_tts_turkish"):
        return []
    return [{"name": n, "gender": g, "label": lab, "source": "hazır", "engine": "pockettr", "text": None, "hasText": False,
             "textState": "var", "seconds": 0, "builtin": True} for n, _v, g, lab in POCKETTR_VOICES]


@app.get("/voices")
def voices_get():
    return {"voices": builtin_voices() + list_voices()}


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


ORNEK_METIN = "Merhaba, ben bu defterin sesiyim. Bugün birlikte önemli konulara bakacağız; hazırsan başlayalım."


@app.get("/voices/{name}/audio")
async def voices_audio(name: str):
    n = _clean(name)
    p = os.path.join(VOICES_DIR, n + ".wav")
    if os.path.exists(p):
        return FileResponse(p, media_type="audio/wav")
    if n in _PT_BY_NAME and has("pocket_tts_turkish"):  # hazır ses: örnek kayıt ilk dinlemede üretilir ve saklanır
        cache = os.path.join(HERE, ".ornek", n + ".wav")
        if not os.path.exists(cache):
            try:
                data = await asyncio.to_thread(_gpu_synth, "pockettr", ORNEK_METIN, _PT_BY_NAME[n][1][0], "tr", None, {"voice": n})
            except Exception as e:
                print(f"[örnek ses/{n}] {type(e).__name__}: {e}")
                code, msg = tr_hata(e, "pockettr")
                raise HTTPException(code, "Örnek ses üretilemedi. " + msg)
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            with open(cache, "wb") as f:
                f.write(data)
        return FileResponse(cache, media_type="audio/wav")
    raise HTTPException(404, "Ses bulunamadı")


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
    eng = tts_engines()
    return [m for m in ("omnivoice", "voxcpm") if m in eng]


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
        hata = engine_errors()
        ek = f" ({hata['omnivoice']})" if "omnivoice" in hata else ""
        raise HTTPException(503, "Ses tasarlanamıyor: çalışan bir tasarım motoru yok" + ek + ". tools\\kur-gpu.bat ile OmniVoice kurun ya da Trendyol-TTS / VoxCPM2 indirin.")
    base = _clean(j.get("name") or (p or {}).get("id") or "ses")
    n, k = base, 2
    while os.path.exists(os.path.join(VOICES_DIR, n + ".wav")):
        n, k = f"{base}-{k}", k + 1
    seed = int(j.get("seed") or random.randint(1, 99999))

    def run():
        import numpy as np
        import soundfile as sf
        with _GpuSlot(20):
            if motor == "omnivoice":
                audio, sr = np.asarray(_omni().generate(text=DESIGN_TEXT, instruct=omni)[0], dtype="float32"), 24000
            else:
                audio, sr = adaptorler.voxcpm_uret(vox_repo(), DESIGN_TEXT, desc=vox, seed=seed)
        os.makedirs(VOICES_DIR, exist_ok=True)
        sf.write(os.path.join(VOICES_DIR, n + ".wav"), audio, sr)
    try:
        await asyncio.wait_for(asyncio.to_thread(run), DESIGN_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(504, f"Ses tasarlama {DESIGN_TIMEOUT:g} sn içinde bitmedi ({motor}). GPU meşgul olabilir; biraz sonra yeniden deneyin.")
    except Exception as e:
        print(f"[ses tasarla/{motor}] {type(e).__name__}: {e}")
        code, msg = tr_hata(e, motor)
        raise HTTPException(code, "Ses tasarlanamadı. " + msg)
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


# ---- Pocket TTS Türkçe (wite-tech/pocket-tts-turkish, CC-BY-4.0, ~110M parametre): 3 kadın + 3 erkek hazır ses, referans gerekmez
POCKETTR_VOICES = [  # (sunucu adı, modeldeki ses, cinsiyet, açıklama)
    ("pt-kadin-1", "female_1", "f", "Kadın 1 · parlak, enerjik"),
    ("pt-kadin-2", "female_2", "f", "Kadın 2 · sıcak, samimi"),
    ("pt-kadin-3", "female_3", "f", "Kadın 3 · kendinden emin, net"),
    ("pt-erkek-1", "male_1", "m", "Erkek 1 · sakin, derin, anlatıcı"),
    ("pt-erkek-2", "male_2", "m", "Erkek 2 · enerjik, parlak"),
    ("pt-erkek-3", "male_3", "m", "Erkek 3 · kendinden emin, keskin"),
]
_PT_BY_NAME = {n: (v, g) for n, v, g, _ in POCKETTR_VOICES}


@lru_cache(maxsize=1)
def _pockettr():
    from pocket_tts_turkish import TurkishTTS  # pip install pocket-tts-turkish
    dev = "cuda" if DEVICE == "cuda" else "cpu"
    try:
        return TurkishTTS.from_pretrained(os.getenv("DEFTER_POCKETTR", "wite-tech/pocket-tts-turkish"), device=dev)
    except Exception:
        if dev == "cpu":
            raise
        return TurkishTTS.from_pretrained(os.getenv("DEFTER_POCKETTR", "wite-tech/pocket-tts-turkish"), device="cpu")


def pockettr_voice(name, gender):
    """Uygulamanın gönderdiği ses adını (pt-kadin-2 ya da female_2) modeldeki sese çevirir; bilinmiyorsa cinsiyete göre ilki."""
    if name in _PT_BY_NAME and _PT_BY_NAME[name][1] == gender:
        return _PT_BY_NAME[name][0]
    if isinstance(name, str) and re.fullmatch(r"(fe)?male_\d+", name or ""):
        return name
    return "female_1" if gender == "f" else "male_1"


def tts_pockettr(text, voice, gender):
    m = _pockettr()
    t = text.replace("İ", "i").replace("I", "ı").lower()  # eğitimde büyük İ/I yok
    v = pockettr_voice(voice, gender)
    if v not in m.voices:
        v = next((x for x in m.voices if x.startswith("female" if gender == "f" else "male")), m.default_voice)
    audio = m.generate(t, voice=v, seed=zlib.crc32((v + t).encode()))  # aynı satır = aynı ses (tekrarlanabilir)
    return _wav_bytes(audio, m.sample_rate)


def _edge_version():
    try:
        from importlib.metadata import version
        return version("edge-tts")
    except Exception:
        return None


_edge_upgrade = {"done": False}


def _edge_try_upgrade():
    """Microsoft ses hizmeti eski edge-tts sürümlerini 403 ile reddeder (Sec-MS-GEC jetonu gerekir). Bir kez kendiliğinden güncellemeyi dener."""
    import importlib
    import subprocess
    import sys
    if _edge_upgrade["done"]:
        return False
    _edge_upgrade["done"] = True
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "edge-tts"], check=True, timeout=180)
        for k in [k for k in sys.modules if k == "edge_tts" or k.startswith("edge_tts.")]:
            del sys.modules[k]
        importlib.invalidate_caches()
        importlib.import_module("edge_tts")
        return True
    except Exception:
        return False


async def tts_edge(text, gender, lang):
    import edge_tts  # Ücretsiz ama çevrimiçi Microsoft sesleri; resmî API değildir
    voice = EDGE_VOICES.get(lang, EDGE_VOICES["tr"])[gender]

    async def once(mod):
        out = bytearray()
        async for chunk in mod.Communicate(text, voice).stream():
            if chunk["type"] == "audio":
                out += chunk["data"]
        if not out:
            raise RuntimeError("edge-tts boş ses döndürdü")
        return bytes(out)

    async def dayanikli(mod):
        # Microsoft ara sıra sesi boş döndürür (NoAudioReceived; PC'de 14.10.2026 erkek seste görüldü, kadın aynı anda çalıştı):
        # kısa bekleyip iki kez daha dene. Kalıcı hata (403, geçersiz ses) beklemeden yukarı çıkar.
        for bekle in (1.0, 2.5, None):
            try:
                return await once(mod)
            except Exception as e:
                gecici = type(e).__name__ == "NoAudioReceived" or "boş ses" in str(e) or "No audio was received" in str(e)
                if not gecici or bekle is None:
                    raise
                await asyncio.sleep(bekle)

    try:
        return await dayanikli(edge_tts)
    except Exception as e:
        if "403" not in str(e) and "Invalid response status" not in str(e):
            raise
        # 403 = eski edge-tts (jeton eksik) ya da Microsoft uç noktası değişti: bir kez güncelle ve yeniden dene
        if await asyncio.to_thread(_edge_try_upgrade):
            import edge_tts as fresh
            try:
                return await dayanikli(fresh)
            except Exception as e2:
                e = e2
        raise RuntimeError(f"Microsoft ses hizmeti isteği reddetti (403). Kurulu edge-tts: {_edge_version() or '?'}. "
                           "server\\baslat.bat'ı kapatıp yeniden açın (açılışta edge-tts güncellenir) ya da Pocket TTS Türkçe'yi kurun: tools\\kur-pocket-tr.bat") from e


def _piper_fetch(voice_name):
    """tr_TR-dfki-medium → rhasspy/piper-voices deposundan .onnx + .onnx.json indirir (ilk kullanımda)."""
    import urllib.request
    m = re.fullmatch(r"([a-z]{2})_([A-Z]{2})-([A-Za-z0-9_]+)-([a-z_]+)", voice_name)
    if not m:
        raise RuntimeError(f"Piper ses adı geçersiz: {voice_name}")
    fam, reg, name, q = m.group(1), m.group(1) + "_" + m.group(2), m.group(3), m.group(4)
    os.makedirs(VOICES_DIR, exist_ok=True)
    for ext in (".onnx", ".onnx.json"):
        dest = os.path.join(VOICES_DIR, voice_name + ext)
        if os.path.exists(dest):
            continue
        url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{fam}/{reg}/{name}/{q}/{voice_name}{ext}"
        try:
            with urllib.request.urlopen(url, timeout=60) as r, open(dest + ".part", "wb") as f:
                shutil.copyfileobj(r, f)
            os.replace(dest + ".part", dest)
        except Exception as e:
            raise RuntimeError(f"Piper sesi indirilemedi ({url}): {e}")


@lru_cache(maxsize=8)
def _piper(voice_name):
    from piper import PiperVoice  # pip install piper-tts
    path = os.path.join(VOICES_DIR, voice_name + ".onnx")
    if not os.path.exists(path):
        _piper_fetch(voice_name)
    return PiperVoice.load(path, use_cuda=False)


def tts_piper(text, gender, lang):
    voice = _piper(PIPER_VOICES.get(lang, PIPER_VOICES["tr"])[gender])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w)
    return buf.getvalue()


_gpu_lock = threading.Lock()  # aynı anda tek GPU üretimi
GPU_WAIT = float(os.getenv("DEFTER_GPU_WAIT", "120"))   # başka üretim bitmediyse en çok bu kadar bekle (sonsuza takılma)
DESIGN_TIMEOUT = float(os.getenv("DEFTER_DESIGN_TIMEOUT", "300"))


class _GpuSlot:
    def __init__(self, wait=None):
        self.wait = GPU_WAIT if wait is None else wait

    def __enter__(self):
        if not _gpu_lock.acquire(timeout=self.wait):
            raise TimeoutError("GPU başka bir ses işiyle meşgul")
        return self

    def __exit__(self, *a):
        _gpu_lock.release()


def _is_load_error(e):
    t = str(e).lower()
    return isinstance(e, (ImportError, OSError)) or any(k in t for k in (".dll", "entry point", "winerror", "libtorchaudio", "c10_cuda", "torch_cuda", "undefined symbol"))


def tr_hata(e, motor=""):
    """Kullanıcıya gösterilecek Türkçe hata (ham Python/DLL metni DEĞİL). (durum_kodu, metin) döner."""
    ad = f"{motor}: " if motor else ""
    if isinstance(e, TimeoutError) or "zaman aşımı" in str(e).lower():
        return 504, ad + "işlem zaman aşımına uğradı (GPU meşgul olabilir). Biraz bekleyip yeniden deneyin."
    if _is_load_error(e):
        return 503, ad + "ses motoru yüklenemedi (PyTorch/DLL uyumsuzluğu olabilir). kur.bat dosyasını yeniden çalıştırın."
    h = hint_for(e)
    ham = " ".join(str(e).split())[:200]
    return 500, ad + (ham if ham else type(e).__name__) + (" — " + h if h else "")

# ---- VRAM koruması: RTX 5090 (24 GB) üzerinde Ollama'daki 27B model VRAM'in büyük kısmını tutar; TTS modeli sığmayınca "çalışmıyor" görünür.
# Çözüm (sıralı çalıştırma): TTS'ten önce Ollama'nın yüklü modellerini boşalt (keep_alive=0); sohbet sırası gelince Ollama kendisi yeniden yükler.
def _free_vram_gb():
    try:
        import torch
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            return free / 2**30, total / 2**30
    except Exception:
        pass
    return None, None


def _ollama_loaded():
    try:
        import httpx
        r = httpx.get(OLLAMA + "/api/ps", timeout=2)
        return [m.get("name") or m.get("model") for m in r.json().get("models", [])] if r.status_code == 200 else []
    except Exception:
        return []


def ollama_unload():
    """Ollama'nın yüklü bütün modellerini VRAM'den boşaltır; boşaltılanların adlarını döndürür."""
    names = [n for n in _ollama_loaded() if n]
    try:
        import httpx
        for n in names:
            httpx.post(OLLAMA + "/api/generate", json={"model": n, "keep_alive": 0}, timeout=30)
    except Exception:
        pass
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    return names


def vram_guard(need_gb=6.0):
    """Boş VRAM yetersizse Ollama modellerini boşaltır (DEFTER_UNLOAD_OLLAMA=0 ile kapatılır). Boşaltılan model adlarını döndürür."""
    if os.getenv("DEFTER_UNLOAD_OLLAMA", "1") == "0":
        return []
    free, _total = _free_vram_gb()
    if free is None or free >= need_gb:
        return []
    return ollama_unload()


def _is_oom(e):
    t = str(e).lower()
    return "out of memory" in t or "cuda error: out of memory" in t or "cublas_status_alloc_failed" in t


GPU_NEED_GB = {"pockettr": 2.0, "pocket": 2.0, "omnivoice": 6.0, "voxcpm": 8.0, "chatterbox": 6.0, "xtts": 4.0, "moss": 12.0, "bark": 6.0, "kugelaudio": 8.0}


def hint_for(err):
    """Ses motoru hatasını Türkçe, uygulanabilir bir ipucuna çevirir."""
    t = str(err).lower()
    if _is_oom(err):
        return "VRAM yetmedi: Ollama'daki büyük model GPU belleğini tutuyor. Sunucu otomatik boşaltmayı dener; olmazsa komut satırında 'ollama stop <model>' çalıştırın."
    if "no kernel image" in t or "sm_120" in t or "sm_90" in t or "not compatible with the current pytorch" in t:
        return "PyTorch bu ekran kartını (RTX 50xx, sm_120) tanımıyor: tools\\kur-gpu.bat ile CUDA 12.8 (cu128) PyTorch kurun."
    if "no module named" in t or "modulenotfounderror" in t:
        return "Paket kurulu değil: ilgili kurulum betiğini çalıştırın (tools\\kur-gpu.bat, tools\\kur-pocket-tr.bat, tools\\kur-moss.bat)."
    if "403" in t and ("bing" in t or "edge" in t or "invalid response status" in t):
        return "edge-tts eski: server\\baslat.bat'ı kapatıp yeniden açın (açılışta güncellenir) ya da: pip install -U edge-tts"
    if "401" in t or "gated" in t or "access to model" in t or "repository not found" in t:
        return "Hugging Face erişimi gerekli: modelin sayfasında koşulları kabul edin ve 'hf auth login' ile giriş yapın."
    if "connection" in t or "timed out" in t or "max retries" in t or "name resolution" in t:
        return "İnternet bağlantısı gerekiyor (model ilk kullanımda indirilir)."
    if "referans" in t:
        return "Bu motor ses klonlamayla konuşur: Ayarlar › Lokal sunucu › ses kütüphanesine bir kayıt ekleyin."
    if "cuda" in t and ("not available" in t or "no cuda" in t):
        return "CUDA görünmüyor: NVIDIA sürücüsünü ve tools\\kur-gpu.bat'ı kontrol edin."
    return ""


@app.get("/tts/selftest")
async def tts_selftest(engines: str = ""):
    """Kurulu bütün ses motorlarını kısa bir cümleyle dener; her biri için süre, boyut, gerçek hata ve çözüm ipucu döndürür."""
    import time
    want = [e for e in engines.split(",") if e] or [e for e in tts_engines() if e != "piper"]  # Piper otomatikte yok; elle istenirse ?engines=piper
    free, total = await asyncio.to_thread(_free_vram_gb)
    info = {"vramFreeGb": round(free, 1) if free is not None else None, "vramTotalGb": round(total, 1) if total is not None else None,
            "ollamaLoaded": await asyncio.to_thread(_ollama_loaded), "edge": _edge_version()}
    try:
        import torch
        info.update(torch=torch.__version__, cuda=bool(torch.cuda.is_available()), gpu=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                    capability="sm_%d%d" % torch.cuda.get_device_capability(0) if torch.cuda.is_available() else None)
    except Exception as e:
        info.update(torch=None, cuda=False, torchError=str(e)[:120])
    results = []
    for eng in want:
        t0 = time.time()
        row = {"engine": eng}
        try:
            for g in ("f", "m"):
                if eng == "edge":
                    data = await tts_edge("Merhaba, bu bir ses denemesidir.", g, "tr")
                elif eng == "piper":
                    data = await asyncio.to_thread(tts_piper, "Merhaba, bu bir ses denemesidir.", g, "tr")
                else:
                    data = await asyncio.to_thread(_gpu_synth, eng, "Merhaba, bu bir ses denemesidir.", g, "tr", ref_for(g), {"voice": ("pt-kadin-1" if g == "f" else "pt-erkek-1") if eng == "pockettr" else None})
                row[g] = {"ok": True, "bytes": len(data)}
        except LookupError as e:
            row["error"] = f"referans ses yok: {e}"
        except Exception as e:
            row["error"] = f"{type(e).__name__}: {str(e)[:260]}"
        row["ok"] = "error" not in row
        row["seconds"] = round(time.time() - t0, 1)
        if not row["ok"]:
            row["hint"] = hint_for(row["error"])
        results.append(row)
    return {"info": info, "results": results}



def _gpu_synth(eng, text, gender, lang, ref, j, repo=None):
    """GPU/PyTorch motorları; aynı anda tek üretim. Referansı olmayan klon motorları LookupError verir (sıradaki motora geçilir)."""
    with _GpuSlot():
        try:
            vram_guard(GPU_NEED_GB.get(eng, 6.0))
            return _gpu_synth_inner(eng, text, gender, lang, ref, j, repo)
        except Exception as e:
            if not _is_oom(e):
                raise
            ollama_unload()  # bellek yetmedi: Ollama'yı boşalt, bir kez daha dene
            return _gpu_synth_inner(eng, text, gender, lang, ref, j, repo)


def _gpu_synth_inner(eng, text, gender, lang, ref, j, repo=None):
    if True:
        if eng == "pockettr":
            return tts_pockettr(text, j.get("voice"), gender)
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
        if eng == "moss":  # MOSS-TTS-Local-Transformer-v1.5: ayrı ortamdaki çalışan; yalnız klonla (referans ses şart) → ses sabit kalır
            if not ref:
                raise LookupError("referans ses yok (MOSS ses klonlamayla konuşur)")
            import numpy as np
            chunks, sr = [], 48000
            for part in _sentences(text, 280):
                a, sr = adaptorler.moss_uret(repo, part, ref, lang, seed=zlib.crc32((os.path.basename(ref) + part).encode()))
                chunks.append(a); chunks.append(np.zeros(int(sr * 0.15), dtype="float32"))
            return _wav_bytes(np.concatenate(chunks), sr)
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
    if not modeller.tam_hazir(model_id):
        raise HTTPException(409, f"{m['ad']} indirilmemiş. Ayarlar › Seslendirme › Lokal modeller bölümünden indirin.")
    eng = m["adaptor"]
    try:
        data = await asyncio.to_thread(_gpu_synth, eng, text, gender, lang, ref, j, model_id)
    except LookupError as e:
        raise HTTPException(409, f"{m['ad']}: {e}. Ses kütüphanesine bir kayıt ekleyin ya da bir ses tasarlayın.")
    except Exception as e:
        print(f"[tts/{eng}] {type(e).__name__}: {e}")
        code, msg = tr_hata(e)
        raise HTTPException(code, f"{m['ad']} çalışmadı: {msg}")
    modeller.kanit_yaz(model_id)  # üretti: indirme boyutu küçük görünse de model çalışıyor
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
    want = (j.get("engine") or "").strip().lower()  # kilitli motor: yalnız o denenir, başkasına düşülmez
    want = _engine_for_voice(j.get("voice"), want)
    if want:
        if want not in tts_engines():
            hata = engine_errors().get(want)
            raise HTTPException(503, f"Kilitli motor '{want}' bu sunucuda çalışmıyor" + (f": {hata}" if hata else f" (çalışan motorlar: {', '.join(tts_engines()) or 'yok'})") + ".")
        order = [want]
    else:
        order = tts_auto()
    errors = []
    for eng in order:
        try:
            if eng in ("pockettr", "omnivoice", "voxcpm", "pocket", "chatterbox", "xtts"):
                data = await asyncio.to_thread(_gpu_synth, eng, text, gender, lang, ref, j)
                return Response(data, media_type="audio/wav", headers={"X-Defter-Engine": eng})
            if eng == "edge":
                return Response(await tts_edge(text, gender, lang), media_type="audio/mpeg", headers={"X-Defter-Engine": eng})
            if eng == "piper":
                data = await asyncio.to_thread(tts_piper, text, gender, lang)
                return Response(data, media_type="audio/wav", headers={"X-Defter-Engine": eng})
        except LookupError as e:  # eksik referans ses
            if want:
                raise HTTPException(409, f"{eng}: {e}. Ses kütüphanesine bir kayıt ekleyin ya da bir ses tasarlayın.")
            errors.append(f"{eng}: {e}")
        except Exception as e:  # motor kurulmamış/çevrimdışı olabilir
            print(f"[tts/{eng}] {type(e).__name__}: {e}")
            code, msg = tr_hata(e)
            if want:  # kilitliyse sessizce başka sese geçme: gerçek hatayı göster
                raise HTTPException(code, f"{eng} çalışmadı: {msg}")
            errors.append(f"{eng}: {msg}")
    raise HTTPException(500, "Hiçbir seslendirme motoru çalışmadı. " + " | ".join(errors) if errors else "Seslendirme motoru kurulu değil. tools\\kur-gpu.bat ile OmniVoice/Pocket TTS ya da pip install edge-tts kurun.")


# ---------------------------------------------------------------- Motor kurulumu arayüzden (0.8.0): bat çalıştırmadan
_KUR = {"state": "idle", "msg": "", "engine": None}


def _pip_install(*pkgs):
    import subprocess
    import sys
    r = subprocess.run([sys.executable, "-m", "pip", "install", "-U", "-q", *pkgs], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("pip hata verdi: " + (r.stderr or r.stdout).strip()[-400:])


def _kur_pockettr():
    try:
        _KUR.update(state="running", engine="pockettr", msg="Paket kuruluyor (pocket-tts-turkish)…")
        _pip_install("pocket-tts-turkish")
        importlib.invalidate_caches()
        _pockettr.cache_clear()
        _KUR["msg"] = "Model indiriliyor ve deneniyor (ilk sefer ~440 MB)…"
        tts_pockettr("Merhaba, bu bir ses denemesidir.", "pt-kadin-1", "f")
        _KUR.update(state="done", msg="Pocket TTS Türkçe hazır: 3 kadın + 3 erkek ses.")
    except Exception as e:
        _KUR.update(state="error", msg=f"{type(e).__name__}: {str(e)[:400]}")


@app.post("/kur/pockettr")
def kur_pockettr():
    if _KUR["state"] == "running":
        return {"ok": True, **_KUR}
    _KUR.update(state="running", engine="pockettr", msg="Başlıyor…")
    threading.Thread(target=_kur_pockettr, daemon=True).start()
    return {"ok": True, **_KUR}


@app.get("/kur/durum")
def kur_durum():
    return {**_KUR, "pocketTr": has("pocket_tts_turkish")}


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


# ---------------------------------------------------------------- Kendini güncelleme (0.7.0)
# Site yeni sürüm yayınlayınca bat çalıştırmadan güncellenir: yalnız değişen dosyalar indirilir, paketler yalnız requirements.txt değişirse kurulur.
_UPD = {"at": 0.0, "latest": None, "n": 0, "error": None, "plan": None}
_UPD_LOCK = threading.Lock()


def update_check(force=False):
    with _UPD_LOCK:
        if not force and time.time() - _UPD["at"] < 6 * 3600 and _UPD["plan"] is not None:
            return _UPD
        try:
            m = guncelle.manifest()
            p = guncelle.plan(m, APP_DIR)
            _UPD.update(at=time.time(), latest=m.get("version"), n=len(p["degisen"]), error=None, plan=m,
                        pip=p["pip"], kabuk=p["kabuk"], files=p["degisen"])
        except Exception as e:
            _UPD.update(at=time.time(), error=str(e)[:200])
        return _UPD


# Çalışan kod = açılıştaki server/*.py. Dosyalar güncellenip süreç yeniden başlamazsa (yarım güncelleme turu, portu tutan
# eski süreç) sürüm eskir ve "güncelleme yok" görünür. 0.8.1'de gerçekten oldu (diskte 0.8.2, çalışan 0.8.1): bu özetle yakalanır.
def _py_durum():
    d = {}
    for ad in sorted(os.listdir(HERE)):
        if ad.endswith(".py"):
            try:
                d[ad] = os.stat(os.path.join(HERE, ad)).st_mtime_ns
            except OSError:
                pass
    return d


def _py_ozet():
    d = {}
    for ad in _py_durum():
        try:
            with open(os.path.join(HERE, ad), "rb") as f:
                d[ad] = guncelle.sha(f.read())
        except OSError:
            pass
    return d


_ACILIS_ZAMAN, _ACILIS_PY = _py_durum(), _py_ozet()


def kod_eski():
    """Diskteki sunucu kodu bu süreç başladıktan sonra değişti mi? (Hızlı yol: değişiklik zamanı aynıysa özet hesaplanmaz.)"""
    return _py_durum() != _ACILIS_ZAMAN and _py_ozet() != _ACILIS_PY


def _yeniden_baslat(neden):
    print(f"[oto-güncelleme] sunucu yeniden başlıyor: {neden}")
    threading.Timer(1.0, lambda: os._exit(75)).start()  # baslat.bat/.sh döngüsü yeniden açar


def _update_public():
    u = _UPD
    eski = kod_eski()
    return {"current": VERSION, "latest": u.get("latest"), "available": bool(u.get("n")) or bool(u.get("pip")) or eski, "n": u.get("n", 0), "restart": eski,
            "files": (u.get("files") or [])[:30], "pip": bool(u.get("pip")), "kabuk": u.get("kabuk") or [], "error": u.get("error"),
            "launcher": os.getenv("DEFTER_LAUNCHER") == "1", "checkedAt": u.get("at")}


def oto_baslat_kur():
    """Windows: Başlangıç klasöründe sunucu kısayolu yoksa kurar (bilgisayar açılınca sunucu kendiliğinden başlasın).
    Kullanıcı tools\\otomatik-baslat-kaldir.bat ile kapattıysa (veri/otobaslat-kapali) dokunmaz. Dönüş: var|kuruldu|kapali|atla|hata."""
    if os.name != "nt" or os.path.isdir(os.path.join(APP_DIR, ".git")) or os.getenv("DEFTER_LAUNCHER") != "1":
        return "atla"
    if os.path.exists(os.path.join(os.getenv("DEFTER_DATA") or DATA_DIR, "otobaslat-kapali")):
        return "kapali"
    lnk = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Defter Studio.lnk")
    if os.path.exists(lnk):
        return "var"
    q = lambda p: p.replace("'", "''")  # noqa: E731  PowerShell tek tırnak kaçışı
    vbs = os.path.join(HERE, "gizli-baslat.vbs")
    ps = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(lnk)}'); $s.TargetPath='wscript.exe'; "
          f"$s.Arguments=[char]34+'{q(vbs)}'+[char]34; $s.WorkingDirectory='{q(HERE)}'; $s.Save()")
    try:
        import subprocess
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], timeout=30, capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except Exception as e:
        print(f"[oto-başlat] kısayol kurulamadı: {e}")
        return "hata"
    return "kuruldu" if os.path.exists(lnk) else "hata"


OTO_GUNCELLE_SN = int(os.getenv("DEFTER_AUTO_UPDATE_SN", "600"))  # 0 = kapalı


def _bosta():
    """Yeniden başlatmak güvenli mi: GPU üretimi ya da model indirmesi sürmüyor."""
    if _gpu_lock.locked():
        return False
    return not any(j.get("state") in ("kuyrukta", "iniyor") for j in modeller._jobs.values())


def oto_guncelle_tur():
    """Bir tur: site yeni sürüm yayınladıysa dosyaları indirir; Python/paket değiştiyse ve sunucu boştaysa kendini yeniden başlatır.
    Dönüş: 'yok' | 'yazildi' | 'yeniden' | 'bekliyor' | 'hata'."""
    if os.path.isdir(os.path.join(APP_DIR, ".git")):
        return "yok"  # geliştirme kopyası: git pull kullanılır
    try:
        m = guncelle.manifest()
        p = guncelle.plan(m, APP_DIR)
        baslatici = os.getenv("DEFTER_LAUNCHER") == "1"
        if not p["degisen"] and not p["pip"]:
            if not (baslatici and kod_eski()):
                return "yok"
            if not _bosta():
                return "bekliyor"
            _yeniden_baslat(f"dosyalar {m.get('version')}, çalışan kod eski ({VERSION})")  # yarım kalan önceki turu tamamlar
            return "yeniden"
        if (p["py"] or p["pip"] or kod_eski()) and not _bosta():
            return "bekliyor"  # iş bitince bir sonraki turda
        r = guncelle.uygula(m, APP_DIR, log=lambda *a, **k: None)
        update_check(True)
        if r["hatalar"]:
            return "hata"
        if baslatici and (r["py"] or r["pip"] or kod_eski()):
            _yeniden_baslat(f"{len(r['yazilan'])} dosya ({m.get('version')})")
            return "yeniden"
        return "yazildi"
    except Exception as e:
        print(f"[oto-güncelleme] atlandı: {e}")
        return "hata"


def _oto_guncelle_dongu():
    while OTO_GUNCELLE_SN > 0:
        time.sleep(OTO_GUNCELLE_SN)
        oto_guncelle_tur()


@app.get("/update/check")
async def update_check_ep(force: bool = False):
    await asyncio.to_thread(update_check, force)
    return _update_public()


@app.post("/update/apply")
async def update_apply_ep():
    """Siteyle farklı dosyaları indirir (adres yalnız sunucu yapılandırmasından gelir). Python dosyası değiştiyse ve başlatıcı (baslat.bat/.sh) varsa kendini yeniden başlatır."""
    def work():
        m = guncelle.manifest()
        return guncelle.uygula(m, APP_DIR, log=lambda *a, **k: None)
    try:
        r = await asyncio.to_thread(work)
    except Exception as e:
        raise HTTPException(502, f"Güncelleme alınamadı: {e}")
    await asyncio.to_thread(update_check, True)
    restart = bool(r["py"] or r["pip"]) or kod_eski()  # eski kod: dosyalar zaten yeni, yalnız yeniden başlatma eksik
    auto = restart and os.getenv("DEFTER_LAUNCHER") == "1" and not r["hatalar"]
    if auto:
        _yeniden_baslat("arayüzden güncelleme")
    return {**r, "restart": "auto" if auto else ("manual" if restart else "none")}


# ---------------------------------------------------------------- Karakter kadrosu (sunucuda kalıcı): Pages ile localhost farklı köken olduğundan ortak kaynak burası
CAST_FILE = os.path.join(DATA_DIR, "cast.json")
CAST_MAX_BYTES, CAST_MAX_ITEMS, CAST_FIELD_MAX = 64 * 1024, 12, 80
CAST_FIELDS = ("id", "name", "gender", "voice")


def cast_dogrula(j):
    """Gövdeyi doğrular; temiz kadro listesini döner ya da HTTPException(400) fırlatır."""
    if not isinstance(j, dict) or not isinstance(j.get("cast"), list):
        raise HTTPException(400, 'Gövde {"cast":[...]} biçiminde olmalı')
    if len(j["cast"]) > CAST_MAX_ITEMS:
        raise HTTPException(400, f"Kadro en çok {CAST_MAX_ITEMS} kişi olabilir")
    out = []
    for i, c in enumerate(j["cast"]):
        if not isinstance(c, dict):
            raise HTTPException(400, f"{i + 1}. kişi nesne olmalı")
        row = {}
        for k in CAST_FIELDS:
            v = c.get(k, "")
            if v is None:
                v = ""
            if not isinstance(v, str):
                raise HTTPException(400, f"{i + 1}. kişi: '{k}' metin olmalı")
            if len(v) > CAST_FIELD_MAX:
                raise HTTPException(400, f"{i + 1}. kişi: '{k}' en çok {CAST_FIELD_MAX} karakter olabilir")
            row[k] = v
        out.append(row)
    return out


@app.get("/cast")
def cast_get():
    try:
        with open(CAST_FILE, encoding="utf-8") as f:
            d = json.load(f)
        return {"cast": d.get("cast", []) if isinstance(d, dict) else [], "updatedAt": d.get("updatedAt") if isinstance(d, dict) else None}
    except (OSError, ValueError):
        return {"cast": [], "updatedAt": None}


@app.put("/cast")
async def cast_put(req: Request):
    raw = await req.body()
    if len(raw) > CAST_MAX_BYTES:
        raise HTTPException(413, "Kadro verisi 64 KB'tan büyük olamaz")
    try:
        j = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Geçersiz JSON")
    cast = cast_dogrula(j)
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = CAST_FILE + ".yeni"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"cast": cast, "updatedAt": int(time.time())}, f, ensure_ascii=False)
    os.replace(tmp, CAST_FILE)
    return {"ok": True, "cast": cast, "n": len(cast)}


@app.get("/health")
def health():
    eng = tts_engines()
    vs = list_voices()
    clone = any(e in eng for e in ("chatterbox", "xtts", "pocket", "omnivoice", "voxcpm"))
    female = "edge" in eng or "pockettr" in eng or "omnivoice" in eng or "voxcpm" in eng or (clone and any(v["gender"] == "f" for v in vs))
    ready = [m["id"] for m in modeller.catalog() if m.get("adaptor") and modeller.tam_hazir(m["id"])]
    plan = tts_plan()
    return {"ok": True, "version": VERSION, "app": os.path.exists(os.path.join(APP_DIR, "index.html")),
            "tts": {"pref": TTS_PREF, "engines": eng, "installed": tts_installed(), "engineErrors": engine_errors(), "probing": probing(), "auto": tts_auto(), "plan": plan, "female": female, "clone": clone, "voices": len(vs) + len(builtin_voices()), "models": ready, "design": design_motors(),
                    "edgeVersion": _edge_version(), "pocketTr": has("pocket_tts_turkish")},
            "ffmpeg": bool(ffmpeg_exe()),
            "update": {"available": bool(_UPD.get("n")) or bool(_UPD.get("pip")) or kod_eski(), "latest": _UPD.get("latest"), "n": _UPD.get("n", 0), "restart": kod_eski()},
            "stt": f"faster-whisper {WHISPER_MODEL}" if has("faster_whisper") else None, "ollama": OLLAMA, "image": gorsel.durum()}



# ---------------------------------------------------------------- Hızlı MP4 (ffmpeg): tarayıcı kareleri JPEG olarak yollar, ffmpeg MP4'e çevirir
import shutil
import subprocess

_VIDEO_JOBS = {}
_VIDEO_LOCK = threading.Lock()


def ffmpeg_exe():
    """Sistemdeki ffmpeg ya da imageio-ffmpeg'in getirdiği ikili (Windows'ta ayrıca kurulum gerekmez)."""
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


@app.post("/video/start")
async def video_start(audio: UploadFile = File(...), fps: int = Form(24), width: int = Form(1280), height: int = Form(720)):
    exe = ffmpeg_exe()
    if not exe:
        raise HTTPException(503, "ffmpeg bulunamadı. pip install imageio-ffmpeg (server\\baslat.bat kurar) ya da ffmpeg'i PATH'e ekleyin.")
    fps = max(10, min(60, fps))
    d = tempfile.mkdtemp(prefix="defter-video-")
    wav = os.path.join(d, "anlatim.wav")
    with open(wav, "wb") as f:
        f.write(await audio.read())
    out = os.path.join(d, "video.mp4")
    enc = os.getenv("DEFTER_FFMPEG_ENC", "libx264")  # RTX için: h264_nvenc
    vopts = ["-c:v", enc] + (["-preset", "veryfast", "-crf", "21"] if enc == "libx264" else ["-preset", "p4", "-cq", "23"])
    cmd = [exe, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "pipe:0", "-i", wav,
           "-map", "0:v:0", "-map", "1:a:0", *vopts, "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]
    log = open(os.path.join(d, "ffmpeg.log"), "wb")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=log, stderr=log)
    vid = os.path.basename(d).replace("defter-video-", "")
    with _VIDEO_LOCK:
        _VIDEO_JOBS[vid] = {"dir": d, "proc": proc, "out": out, "log": log, "frames": 0}
    return {"id": vid, "size": [width, height], "fps": fps}


@app.post("/video/frames/{vid}")
async def video_frames(vid: str, req: Request):
    job = _VIDEO_JOBS.get(vid)
    if not job:
        raise HTTPException(404, "Video işi yok (sunucu yeniden başlamış olabilir)")
    data = await req.body()
    if job["proc"].poll() is not None:
        raise HTTPException(500, "ffmpeg erken kapandı: " + _ffmpeg_tail(job))
    try:
        await asyncio.to_thread(job["proc"].stdin.write, data)
        await asyncio.to_thread(job["proc"].stdin.flush)
    except Exception as e:
        raise HTTPException(500, f"ffmpeg'e kare yazılamadı: {e}. {_ffmpeg_tail(job)}")
    job["frames"] += data.count(b"\xff\xd8\xff")  # yaklaşık kare sayısı (JPEG başlangıç imzası)
    return {"ok": True, "bytes": len(data)}


def _ffmpeg_tail(job):
    try:
        job["log"].flush()
        with open(os.path.join(job["dir"], "ffmpeg.log"), "rb") as f:
            return f.read()[-400:].decode("utf-8", "replace")
    except Exception:
        return ""


def _video_cleanup(vid):
    with _VIDEO_LOCK:
        job = _VIDEO_JOBS.pop(vid, None)
    if job:
        try:
            if job["proc"].poll() is None:
                job["proc"].kill()
            job["log"].close()
        except Exception:
            pass
        shutil.rmtree(job["dir"], ignore_errors=True)


@app.post("/video/finish/{vid}")
async def video_finish(vid: str):
    job = _VIDEO_JOBS.get(vid)
    if not job:
        raise HTTPException(404, "Video işi yok")
    try:
        job["proc"].stdin.close()
    except Exception:
        pass
    try:
        code = await asyncio.to_thread(job["proc"].wait, 900)
    except Exception:
        _video_cleanup(vid)
        raise HTTPException(504, "ffmpeg zaman aşımına uğradı")
    if code != 0 or not os.path.exists(job["out"]) or os.path.getsize(job["out"]) < 1000:
        tail = _ffmpeg_tail(job)
        _video_cleanup(vid)
        raise HTTPException(500, f"ffmpeg başarısız (kod {code}): {tail}")
    with open(job["out"], "rb") as f:
        data = f.read()
    _video_cleanup(vid)
    return Response(data, media_type="video/mp4")


@app.delete("/video/{vid}")
def video_abort(vid: str):
    _video_cleanup(vid)
    return {"ok": True}


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
    threading.Thread(target=tts_engines, daemon=True).start()  # motor yüklenebilirlik denetimini ısıt (/health ilk çağrıda beklemesin)
    print(f"Defter Studio {VERSION}: {url}  ·  TTS(kurulu)={','.join(tts_installed()) or 'yok'}  ·  Whisper={WHISPER_MODEL}/{DEVICE}  ·  Ollama={OLLAMA}")
    _probe_status([PROBE_MODS[e] for e in tts_installed() if e in PROBE_MODS])  # motor denetimini arka planda başlat (açılışı geciktirmez)
    threading.Timer(60, lambda: guncelle.edge_gunle(lambda *a, **k: None)).start()  # edge-tts günlük yükseltme: açılışı geciktirmesin
    threading.Thread(target=oto_baslat_kur, daemon=True).start()  # Windows açılışında kendiliğinden başlama (yoksa kurar)
    threading.Thread(target=_oto_guncelle_dongu, daemon=True).start()  # 10 dk'da bir siteyle eşitle; boştaysa yeniden başla
    threading.Thread(target=update_check, args=(True,), daemon=True).start()  # güncelleme var mı (arka planda; /health bildirir)
    if os.getenv("DEFTER_OPEN", "1") != "0":
        import webbrowser
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT)
