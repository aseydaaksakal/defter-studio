"""
Defter Studio — lokal yardımcı sunucu v2 (isteğe bağlı)

Uygulamayı http://localhost:8765 adresinde sunar (bu adresten açınca Ollama için OLLAMA_ORIGINS ayarı gerekmez) ve
tarayıcının tek başına yapamadığı işleri bilgisayarınızda yapar:
  GET  /              uygulamanın kendisi (depo kökündeki dosyalar)
  GET  /health        hangi motorların hazır olduğunu söyler
  POST /tts           metni sese çevirir: Chatterbox (klon) → XTTS-v2 (klon) → edge-tts (Emel/Ahmet) → Piper
  GET/POST/DELETE /voices   lokal ses klonlama referansları (voices/<ad>.wav + <ad>.json)
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
import tempfile
import threading
import wave
from functools import lru_cache
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

VERSION = "0.3.0"
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


def tts_engines():
    e = []
    if has("omnivoice"):
        e.append("omnivoice")
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


def list_voices():
    out = []
    if os.path.isdir(VOICES_DIR):
        for f in sorted(os.listdir(VOICES_DIR)):
            if f.endswith(".wav"):
                n = f[:-4]
                meta = {}
                try:
                    with open(os.path.join(VOICES_DIR, n + ".json"), encoding="utf-8") as fh:
                        meta = json.load(fh)
                except Exception:
                    pass
                g = meta.get("gender") or ("m" if n.upper() == "B" else "f")
                out.append({"name": n, "gender": g})
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


@app.post("/voices")
async def voices_post(name: str = Form(...), gender: str = Form("f"), file: UploadFile = File(...)):
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
    with open(os.path.join(VOICES_DIR, n + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"gender": "m" if gender == "m" else "f"}, fh)
    return {"ok": True, "name": n}


@app.delete("/voices/{name}")
def voices_delete(name: str):
    n = _clean(name)
    for ext in (".wav", ".json"):
        p = os.path.join(VOICES_DIR, n + ext)
        if os.path.exists(p):
            os.remove(p)
    return {"ok": True}


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
    if not ref or not rtext:  # transkripti olmayan referans → tasarlanmış ses
        ref, rtext = _omni_ref(gender)
    chunks = []
    for part in _sentences(text, 300):
        audio = m.generate(text=part, ref_audio=ref, ref_text=rtext)
        chunks.append(np.asarray(audio[0], dtype="float32")); chunks.append(np.zeros(int(24000 * 0.15), dtype="float32"))
    return _wav_bytes(np.concatenate(chunks), 24000)


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
    errors = []
    for eng in tts_engines():
        try:
            if eng == "omnivoice":
                def run_omni():
                    with _gpu_lock:
                        return tts_omni(text, ref, gender)
                return Response(await asyncio.to_thread(run_omni), media_type="audio/wav", headers={"X-Defter-Engine": eng})
            if eng == "pocket":
                pref = ref or (os.path.join(VOICES_DIR, ("omni-kadin" if gender == "f" else "omni-erkek") + ".wav"))
                if not os.path.exists(pref):
                    continue
                return Response(await asyncio.to_thread(tts_pocket, text, pref), media_type="audio/wav", headers={"X-Defter-Engine": eng})
            if eng in ("chatterbox", "xtts"):
                if not ref:
                    continue  # bu cinsiyette referans ses yok → sıradaki motor
                fn = tts_chatterbox if eng == "chatterbox" else tts_xtts

                def run():
                    with _gpu_lock:
                        return fn(text, ref, lang, j.get("tone"))
                data = await asyncio.to_thread(run)
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
    clone = any(e in eng for e in ("chatterbox", "xtts", "pocket", "omnivoice"))
    female = "edge" in eng or "omnivoice" in eng or (clone and any(v["gender"] == "f" for v in vs))
    return {"ok": True, "version": VERSION, "app": os.path.exists(os.path.join(APP_DIR, "index.html")),
            "tts": {"pref": TTS_PREF, "engines": eng, "female": female, "clone": clone, "voices": len(vs)},
            "stt": f"faster-whisper {WHISPER_MODEL}" if has("faster_whisper") else None, "ollama": OLLAMA}


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
