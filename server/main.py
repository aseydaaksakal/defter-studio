"""
Defter Studio — lokal yardımcı sunucu (isteğe bağlı)

Tarayıcıdaki uygulamanın tek başına yapamadığı işleri bilgisayarınızda yapar:
  POST /tts         metni sese çevirir (Piper, XTTS-v2, Chatterbox veya Edge-TTS)
  POST /transcribe  ses/video dosyasını metne döker (faster-whisper, GPU)
  GET  /fetch       web sayfasını temiz metne çevirir (trafilatura)
  GET  /youtube     YouTube altyazısını / dökümünü alır
  GET  /search      web araması (DuckDuckGo, anahtar gerekmez)
  GET  /health      hangi motorların hazır olduğunu söyler

Çalıştırma:  python main.py      (varsayılan adres http://localhost:8765)
Ayarlar ortam değişkenleriyle yapılır, bkz. README.md
"""
import io
import os
import re
import tempfile
import wave
from functools import lru_cache

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

PORT = int(os.getenv("DEFTER_PORT", "8765"))
TTS_ENGINE = os.getenv("DEFTER_TTS", "piper").lower()          # piper | xtts | chatterbox | edge | off
WHISPER_MODEL = os.getenv("DEFTER_WHISPER", "large-v3-turbo")  # tiny | small | medium | large-v3 | large-v3-turbo
DEVICE = os.getenv("DEFTER_DEVICE", "cuda")                    # cuda | cpu
VOICES_DIR = os.getenv("DEFTER_VOICES", os.path.join(os.path.dirname(__file__), "voices"))
ORIGINS = os.getenv("DEFTER_ORIGINS", "https://aseydaaksakal.github.io,http://localhost:8080,http://127.0.0.1:8080").split(",")

# Her sunucu (A, B) için ses seçimi. Piper ses adları: https://huggingface.co/rhasspy/piper-voices
PIPER_VOICES = {
    "tr": {"A": os.getenv("DEFTER_PIPER_A", "tr_TR-dfki-medium"), "B": os.getenv("DEFTER_PIPER_B", "tr_TR-fahrettin-medium")},
    "en": {"A": "en_US-amy-medium", "B": "en_US-ryan-high"},
    "de": {"A": "de_DE-eva_k-x_low", "B": "de_DE-thorsten-high"},
}
EDGE_VOICES = {
    "tr": {"A": "tr-TR-EmelNeural", "B": "tr-TR-AhmetNeural"},
    "en": {"A": "en-US-AriaNeural", "B": "en-US-GuyNeural"},
    "de": {"A": "de-DE-KatjaNeural", "B": "de-DE-ConradNeural"},
}

app = FastAPI(title="Defter Studio yardımcı sunucu")
# Chrome'un yerel ağ erişimi için özel ağ başlığına izin ver
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_private_network=True)


@app.get("/health")
def health():
    return {"ok": True, "tts": TTS_ENGINE, "stt": f"faster-whisper {WHISPER_MODEL} ({DEVICE})"}


# ---------------------------------------------------------------- TTS
def _wav_bytes(samples, sr):
    import numpy as np
    pcm = (np.clip(np.asarray(samples, dtype="float32"), -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm)
    return buf.getvalue()


@lru_cache(maxsize=8)
def _piper(voice_name):
    import subprocess, sys
    from piper import PiperVoice  # pip install piper-tts
    os.makedirs(VOICES_DIR, exist_ok=True)
    path = os.path.join(VOICES_DIR, voice_name + ".onnx")
    if not os.path.exists(path):  # ilk kullanımda sesi indir
        subprocess.run([sys.executable, "-m", "piper.download_voices", "--download-dir", VOICES_DIR, voice_name], check=True)
    return PiperVoice.load(path, use_cuda=DEVICE == "cuda")


def tts_piper(text, speaker, lang):
    voice = _piper(PIPER_VOICES.get(lang, PIPER_VOICES["tr"])[speaker])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w)
    return buf.getvalue()


@lru_cache(maxsize=1)
def _xtts():
    from TTS.api import TTS  # pip install coqui-tts
    return TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)


def tts_xtts(text, speaker, lang):
    # voices/A.wav ve voices/B.wav: 6-20 sn temiz konuşma kaydı (ses klonlama referansı)
    ref = os.path.join(VOICES_DIR, f"{speaker}.wav")
    kw = {"speaker_wav": ref} if os.path.exists(ref) else {"speaker": "Ana Florence" if speaker == "A" else "Damien Black"}
    wav = _xtts().tts(text=text, language=lang, **kw)
    return _wav_bytes(wav, 24000)


@lru_cache(maxsize=1)
def _chatterbox():
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # pip install chatterbox-tts
    return ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)


def tts_chatterbox(text, speaker, lang):
    m = _chatterbox()
    ref = os.path.join(VOICES_DIR, f"{speaker}.wav")
    kw = {"audio_prompt_path": ref} if os.path.exists(ref) else {}
    wav = m.generate(text, language_id=lang, **kw)
    return _wav_bytes(wav.squeeze().cpu().numpy(), m.sr)


async def tts_edge(text, speaker, lang):
    import edge_tts  # Ücretsiz ama çevrimiçi Microsoft sesleri; açık kaynak motor değildir
    voice = EDGE_VOICES.get(lang, EDGE_VOICES["tr"])[speaker]
    out = b""
    async for chunk in edge_tts.Communicate(text, voice).stream():
        if chunk["type"] == "audio":
            out += chunk["data"]
    return out, "audio/mpeg"


@app.post("/tts")
async def tts(req: Request):
    j = await req.json()
    text = (j.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Metin boş")
    speaker = "B" if j.get("speaker") == "B" else "A"
    lang = (j.get("lang") or "tr-TR")[:2].lower()
    try:
        if TTS_ENGINE == "edge":
            data, mime = await tts_edge(text, speaker, lang)
            return Response(data, media_type=mime)
        fn = {"piper": tts_piper, "xtts": tts_xtts, "chatterbox": tts_chatterbox}.get(TTS_ENGINE)
        if not fn:
            raise HTTPException(503, "TTS kapalı (DEFTER_TTS)")
        return Response(fn(text, speaker, lang), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:  # motor kurulmamış olabilir
        raise HTTPException(500, f"{TTS_ENGINE} hatası: {e}")


# ---------------------------------------------------------------- Ses dökümü
@lru_cache(maxsize=1)
def _whisper():
    from faster_whisper import WhisperModel
    return WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")


def _transcribe_path(path):
    segs, info = _whisper().transcribe(path, vad_filter=True, beam_size=5)
    lines = []
    for s in segs:
        m, sec = divmod(int(s.start), 60)
        lines.append(f"[{m:02d}:{sec:02d}] {s.text.strip()}")
    return "\n".join(lines), info.language


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
    try:
        text, lang = _transcribe_path(tmp.name)
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


if __name__ == "__main__":
    import uvicorn
    print(f"Defter Studio yardımcı sunucu: http://localhost:{PORT}  ·  TTS={TTS_ENGINE}  ·  Whisper={WHISPER_MODEL}/{DEVICE}")
    uvicorn.run(app, host="127.0.0.1", port=PORT)
