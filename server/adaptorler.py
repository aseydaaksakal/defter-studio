"""
Defter Studio — ek TTS adaptörleri (yalnız resmî kartında/README'sinde kullanım kodunu doğruladıklarım)

  voxcpm      Trendyol/Trendyol-TTS, openbmb/VoxCPM2 — VoxCPM2 README'si ve Trendyol kartı
  bark        Suno Bark (transformers)               — Türkçe için v2/tr_speaker_0..9 hazır sesleri
  kugelaudio  KugelAudio 0 Open                      — kugelaudio-open README'si (klonlama yok, hazır sesler)
  moss        MOSS-TTS-Local-Transformer-v1.5        — OpenMOSS/MOSS-TTS deposu, moss_tts_local_v1.5/README.md (ayrı ortam .venv-moss)

OmniVoice ve Pocket TTS main.py içinde. Hepsi (ses dizisi, örnekleme hızı) döndürür; WAV'a main.py çevirir.
Kodlar sandbox'ta GPU olmadığı için burada çalıştırılamadı: ilk gerçek denemede hata çıkarsa docs/NOT_DEFTERI.md'ye bakın.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
from functools import lru_cache

DEVICE = os.getenv("DEFTER_DEVICE", "cuda")

GEREK = {  # adaptör -> (python modülü, kurulum ipucu)
    "voxcpm": ("voxcpm", "tools\\kur-gpu.bat (pip install voxcpm; Python 3.10–3.12, CUDA 12+)"),
    "bark": ("transformers", "pip install transformers scipy"),
    "kugelaudio": ("kugelaudio_open", "pip install kugelaudio-open"),
    "pocket": ("pocket_tts", "tools\\kur-gpu.bat"),
    "pockettr": ("pocket_tts_turkish", "tools\\kur-pocket-tr.bat"),
    "omnivoice": ("omnivoice", "tools\\kur-gpu.bat"),
}
BARK_TR = [f"v2/tr_speaker_{i}" for i in range(10)]
SESLER = {  # modeli denemek için seçilebilen hazır sesler
    "bark": [{"id": p, "ad": f"Türkçe konuşmacı {i}"} for i, p in enumerate(BARK_TR)],
    "kugelaudio": [{"id": v, "ad": v} for v in ("default", "warm", "clear")],
    "pockettr": [{"id": f"pt-{c}-{i}", "ad": f"{'Kadın' if c == 'kadin' else 'Erkek'} {i}"} for c in ("kadin", "erkek") for i in (1, 2, 3)],
}


HERE = os.path.dirname(os.path.abspath(__file__))
MOSS_VENV = os.path.join(HERE, ".venv-moss")
MOSS_WORKER = os.path.join(HERE, "moss_worker.py")  # testler sahte çalışanla değiştirir


def moss_python():
    """MOSS-TTS'in ayrı sanal ortamındaki Python (tools\\kur-moss.bat kurar); yoksa None."""
    for rel in (("Scripts", "python.exe"), ("bin", "python")):
        p = os.path.join(MOSS_VENV, *rel)
        if os.path.exists(p):
            return p
    return None


def durum(adaptor):
    if adaptor == "moss":  # ana ortamda paket aranmaz: ayrı ortam + çalışan betiği
        ok = moss_python() is not None
        return ok, "" if ok else "Kurulu değil: tools\\kur-moss.bat (ayrı sanal ortam, PyTorch 2.9 + transformers 5)"
    mod, ipucu = GEREK.get(adaptor, (None, ""))
    if not mod:
        return False, "bilinmeyen adaptör"
    ok = importlib.util.find_spec(mod) is not None
    return ok, "" if ok else f"Kurulu değil: {ipucu}"


def _dev():
    import torch
    return "cuda" if DEVICE == "cuda" and torch.cuda.is_available() else "cpu"


# ---------------------------------------------------------------- VoxCPM2 (Trendyol-TTS, VoxCPM2)
@lru_cache(maxsize=1)
def _voxcpm(repo):
    from voxcpm import VoxCPM
    try:  # Trendyol kartındaki çağrı; optimize=False Windows'ta torch.compile sorunlarını önler
        return VoxCPM.from_pretrained(hf_model_id=repo, load_denoiser=False, optimize=False)
    except TypeError:
        return VoxCPM.from_pretrained(hf_model_id=repo, load_denoiser=False)


def tohumla(seed):
    """Aynı tohum = aynı ses. Kütüphane 'seed' parametresi almasa da (voxcpm sürüm farkı) üretim tekrarlanabilir kalsın."""
    import random
    import numpy as np
    random.seed(seed)
    np.random.seed(seed % (2 ** 32))
    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except Exception:
        pass


def esnek_cagir(fn, **kw):
    """Sürüme dayanıklı çağrı: "unexpected keyword argument 'x'" hatasında yalnız o argümanı atıp yeniden dener.
    Neden: voxcpm generate(**kw) argümanları iç fonksiyona aktarıyor; imza incelemesi desteklenmeyeni göremiyor (0.8.1: 'seed')."""
    for _ in range(len(kw) + 1):
        try:
            return fn(**kw)
        except TypeError as e:
            m = re.search(r"unexpected keyword argument '(\w+)'", str(e))
            if not m or m.group(1) not in kw or m.group(1) == "text":
                raise
            kw.pop(m.group(1))
    return fn(**kw)


def voxcpm_uret(repo, text, ref=None, ref_text=None, desc=None, seed=42):
    """ref: klon (reference_wav_path; transkript varsa prompt ile 'ultimate' klon). ref yoksa desc ile metinle ses tasarımı
    (README: açıklama metnin başına parantez içinde). seed aynı kaldıkça aynı ses çıkar."""
    import numpy as np
    m = _voxcpm(repo)
    kw = dict(cfg_value=2.0, inference_timesteps=16, seed=seed, max_len=4096, normalize=True, denoise=False)  # Trendyol kartındaki parametreler
    if ref:
        kw["reference_wav_path"] = ref
        if ref_text:
            kw.update(prompt_wav_path=ref, prompt_text=ref_text)
    elif desc:
        text = f"({desc}){text}"
    tohumla(seed)
    wav = esnek_cagir(m.generate, text=text, **kw)
    return np.asarray(wav, dtype="float32").squeeze(), int(m.tts_model.sample_rate)


# ---------------------------------------------------------------- Bark (transformers)
@lru_cache(maxsize=1)
def _bark(repo):
    import torch
    from transformers import AutoProcessor, BarkModel
    dev = _dev()
    proc = AutoProcessor.from_pretrained(repo)
    model = BarkModel.from_pretrained(repo, torch_dtype=torch.float16 if dev == "cuda" else torch.float32).to(dev)
    return proc, model, dev


def bark_uret(repo, text, preset=None):
    proc, model, dev = _bark(repo)
    inputs = proc(text, voice_preset=preset or BARK_TR[0]).to(dev)
    audio = model.generate(**inputs)
    return audio.detach().float().cpu().numpy().squeeze(), int(model.generation_config.sample_rate)


# ---------------------------------------------------------------- KugelAudio
@lru_cache(maxsize=1)
def _kugel(repo):
    import torch
    from kugelaudio_open import KugelAudioForConditionalGenerationInference, KugelAudioProcessor
    dev = _dev()
    model = KugelAudioForConditionalGenerationInference.from_pretrained(repo, torch_dtype=torch.bfloat16).to(dev)
    model.eval()
    model.model.strip_encoders()  # README: VRAM'i azaltır (klonlama zaten yok)
    return model, KugelAudioProcessor.from_pretrained(repo), dev


def kugel_uret(repo, text, voice=None):
    import torch
    model, proc, dev = _kugel(repo)
    inputs = proc(text=text, voice=voice or "default", return_tensors="pt")
    inputs = {k: v.to(dev) if isinstance(v, torch.Tensor) else v for k, v in inputs.items()}
    with torch.no_grad():
        out = model.generate(**inputs, cfg_scale=3.0)
    audio = out.speech_outputs[0]
    return torch.as_tensor(audio).detach().float().cpu().numpy().squeeze(), 24000  # kart: 24 kHz mono


# ---------------------------------------------------------------- MOSS-TTS (ayrı işlem, ayrı sanal ortam)
_moss = {"proc": None, "n": 0}
_moss_lock = threading.Lock()


def _moss_baslat():
    py = moss_python()
    if not py:
        raise RuntimeError("MOSS-TTS kurulu değil: tools\\kur-moss.bat çalıştırın")
    p = _moss["proc"]
    if p is not None and p.poll() is None:
        return p
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1", "HF_HUB_DISABLE_TELEMETRY": "1"}
    # stderr devralınır: model yükleme ve hata izleri sunucu konsolunda görünür
    _moss["proc"] = subprocess.Popen([py, MOSS_WORKER], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      text=True, encoding="utf-8", bufsize=1, env=env, cwd=HERE)
    return _moss["proc"]


def moss_uret(repo, text, ref, language="tr", seed=None):
    """MOSS-TTS ile klonlanmış sesle bir parça üretir → (float32 mono dizi, örnekleme hızı). Çalışan ilk istekte modeli yükler."""
    import numpy as np
    import soundfile as sf
    with _moss_lock:  # tek işlem, tek istek
        p = _moss_baslat()
        _moss["n"] += 1
        rid = _moss["n"]
        try:
            p.stdin.write(json.dumps({"id": rid, "repo": repo, "text": text, "ref": ref, "language": language, "seed": seed}, ensure_ascii=False) + "\n")
            p.stdin.flush()
            line = p.stdout.readline()
        except (BrokenPipeError, OSError):
            line = ""
        if not line:
            _moss["proc"] = None
            raise RuntimeError("MOSS çalışanı kapandı (bellek yetmemiş olabilir: Ollama modelini boşaltın, sunucu konsolundaki hata izine bakın)")
    r = json.loads(line)
    if not r.get("ok"):
        raise RuntimeError(r.get("error") or "MOSS hatası")
    try:
        a, sr = sf.read(r["wav"], dtype="float32")
    finally:
        try:
            os.remove(r["wav"])
        except OSError:
            pass
    return np.asarray(a, dtype="float32").squeeze(), int(sr)


def moss_kapat():
    """MOSS çalışanını durdurur: GPU belleği (≈10 GB) hemen boşalır."""
    p = _moss["proc"]
    _moss["proc"] = None
    if p is not None and p.poll() is None:
        try:
            p.stdin.close()  # çalışan stdin kapanınca çıkar
            p.wait(timeout=20)
        except Exception:
            p.kill()
