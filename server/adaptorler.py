"""
Defter Studio — ek TTS adaptörleri (yalnız resmî kartında/README'sinde kullanım kodunu doğruladıklarım)

  voxcpm      Trendyol/Trendyol-TTS, openbmb/VoxCPM2 — VoxCPM2 README'si ve Trendyol kartı
  bark        Suno Bark (transformers)               — Türkçe için v2/tr_speaker_0..9 hazır sesleri
  kugelaudio  KugelAudio 0 Open                      — kugelaudio-open README'si (klonlama yok, hazır sesler)

OmniVoice ve Pocket TTS main.py içinde. Hepsi (ses dizisi, örnekleme hızı) döndürür; WAV'a main.py çevirir.
Kodlar sandbox'ta GPU olmadığı için burada çalıştırılamadı: ilk gerçek denemede hata çıkarsa docs/NOT_DEFTERI.md'ye bakın.
"""
import importlib.util
import os
from functools import lru_cache

DEVICE = os.getenv("DEFTER_DEVICE", "cuda")

GEREK = {  # adaptör -> (python modülü, kurulum ipucu)
    "voxcpm": ("voxcpm", "tools\\kur-gpu.bat (pip install voxcpm; Python 3.10–3.12, CUDA 12+)"),
    "bark": ("transformers", "pip install transformers scipy"),
    "kugelaudio": ("kugelaudio_open", "pip install kugelaudio-open"),
    "pocket": ("pocket_tts", "tools\\kur-gpu.bat"),
    "omnivoice": ("omnivoice", "tools\\kur-gpu.bat"),
}
BARK_TR = [f"v2/tr_speaker_{i}" for i in range(10)]
SESLER = {  # modeli denemek için seçilebilen hazır sesler
    "bark": [{"id": p, "ad": f"Türkçe konuşmacı {i}"} for i, p in enumerate(BARK_TR)],
    "kugelaudio": [{"id": v, "ad": v} for v in ("default", "warm", "clear")],
}


def durum(adaptor):
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


def voxcpm_uret(repo, text, ref=None, ref_text=None, desc=None, seed=42):
    """ref: klon (reference_wav_path; transkript varsa prompt ile 'ultimate' klon). ref yoksa desc ile metinle ses tasarımı
    (README: açıklama metnin başına parantez içinde). seed aynı kaldıkça aynı ses çıkar."""
    import numpy as np
    m = _voxcpm(repo)
    kw = dict(cfg_value=2.0, inference_timesteps=16, seed=seed)
    if ref:
        kw["reference_wav_path"] = ref
        if ref_text:
            kw.update(prompt_wav_path=ref, prompt_text=ref_text)
    elif desc:
        text = f"({desc}){text}"
    try:
        wav = m.generate(text=text, max_len=4096, normalize=True, denoise=False, **kw)  # Trendyol kartındaki parametreler
    except TypeError:
        wav = m.generate(text=text, **kw)
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
