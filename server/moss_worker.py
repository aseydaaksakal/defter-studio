"""
Defter Studio — MOSS-TTS çalışanı (ayrı sanal ortamda: server/.venv-moss)

main.py bu betiği .venv-moss'un Python'uyla alt işlem olarak başlatır (adaptorler.moss_uret). MOSS-TTS PyTorch 2.9.1 +
transformers 5.0.0 + numpy 2.1.0 sabitler; bu sürümler ana ortamdaki OmniVoice / Pocket TTS / VoxCPM ile çakışabilir, bu yüzden
ayrı ortam ve ayrı işlem kullanılır. Kurulum: tools\\kur-moss.bat

Protokol (satır tabanlı JSON):
  stdin  ← {"id", "repo", "text", "ref", "language", "seed"}   ref: ses kütüphanesindeki WAV yolu (klon için zorunlu)
  stdout → {"id", "ok": true, "wav": "<geçici dosya>", "sr": 48000}  ya da  {"id", "ok": false, "error": "..."}
Kütüphane çıktıları stderr'e (sunucu konsoluna) gider; stdout yalnız protokoldür.
Boşta DEFTER_MOSS_IDLE saniye (varsayılan 600) kalırsa çıkar: GPU belleği (≈10 GB) Ollama'ya geri verilir.

Kullanılan çağrılar MOSS-TTS deposunun moss_tts_local_v1.5/README.md "Batch Inference" örneğinden alındı (AutoProcessor /
AutoModel trust_remote_code, build_user_message(text, reference, language), processor(..., mode="generation"),
model.generate(... audio_temperature=1.7, audio_top_p=0.8, audio_top_k=25, audio_repetition_penalty=1.0), processor.decode).
Referans ses torchaudio.load/torchcodec (FFmpeg) gerektirmesin diye soundfile ile okunup processor.encode_audios_from_wav ile
ses kodlarına çevrilir; çıktı da stdlib wave ile yazılır. GPU'sunuz yoksa CPU'da çok yavaş çalışır.
"""
import json
import os
import queue
import sys
import tempfile
import threading
import traceback
import wave

OUT = sys.stdout
sys.stdout = sys.stderr  # kütüphane çıktıları protokolü bozmasın
IDLE = int(os.getenv("DEFTER_MOSS_IDLE", "600"))
LANGS = {"tr": "Turkish", "en": "English", "de": "German", "fr": "French", "es": "Spanish", "ar": "Arabic", "ru": "Russian", "it": "Italian", "nl": "Dutch", "ja": "Japanese"}
S = {"repo": None}
REFS = {}


def reply(obj):
    OUT.write(json.dumps(obj, ensure_ascii=False) + "\n")
    OUT.flush()


def load(repo):
    if S["repo"] == repo:
        return S["proc"], S["model"], S["dev"]
    import gc
    import importlib.util
    import torch
    from transformers import AutoModel, AutoProcessor
    for k in ("model", "proc"):  # başka bir model istendiyse öncekini boşalt
        S.pop(k, None)
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        # bazı CUDA/PyTorch birleşimlerinde bozuk cuDNN SDPA arka ucunu kapat (MOSS README'si)
        torch.backends.cuda.enable_cudnn_sdp(False)
        torch.backends.cuda.enable_flash_sdp(True)
        torch.backends.cuda.enable_mem_efficient_sdp(True)
        torch.backends.cuda.enable_math_sdp(True)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if dev == "cuda" else torch.float32
    attn = "eager"
    if dev == "cuda":
        attn = "sdpa"
        if importlib.util.find_spec("flash_attn") is not None and torch.cuda.get_device_capability()[0] >= 8:
            attn = "flash_attention_2"
    print(f"[moss] {repo} yükleniyor ({dev}, {dtype}, dikkat={attn}); ilk seferde model + ses kodlayıcı iner, birkaç dakika sürebilir", flush=True)
    proc = AutoProcessor.from_pretrained(repo, trust_remote_code=True)
    proc.audio_tokenizer = proc.audio_tokenizer.to(dev)
    model = AutoModel.from_pretrained(repo, trust_remote_code=True, attn_implementation=attn, torch_dtype=dtype).to(dev)
    model.eval()
    S.update(repo=repo, proc=proc, model=model, dev=dev)
    REFS.clear()
    print("[moss] hazır", flush=True)
    return proc, model, dev


def ref_codes(proc, path):
    """Referans WAV → ses kodları [T, n_vq]; aynı dosya için önbellekte tutulur (podcast boyunca aynı ses)."""
    key = (path, os.path.getmtime(path))
    if key not in REFS:
        import numpy as np
        import soundfile as sf
        import torch
        data, sr = sf.read(path, dtype="float32", always_2d=True)  # [örnek, kanal]
        data = data[: int(sr * 30)]  # en çok 30 sn referans
        wav = torch.from_numpy(np.ascontiguousarray(data.T))
        REFS[key] = proc.encode_audios_from_wav(wav, int(sr))[0]
    return REFS[key]


def synth(req):
    import numpy as np
    import torch
    proc, model, dev = load(req["repo"])
    text = (req.get("text") or "").strip()
    if not text:
        raise ValueError("metin boş")
    ref = req.get("ref")
    if not ref or not os.path.exists(ref):
        raise ValueError("referans ses yok: MOSS ses klonlamayla çalışır, ses kütüphanesine bir kayıt ekleyin")
    lang = LANGS.get(str(req.get("language") or "tr")[:2].lower(), req.get("language") or "Turkish")
    conv = [proc.build_user_message(text=text, reference=[ref_codes(proc, ref)], language=lang)]
    batch = proc([conv], mode="generation")
    # 12,5 kare/sn: yavaş konuşma ≈ 9 karakter/sn varsayımıyla bol bir üst sınır (kaçak üretimi keser)
    max_new = int(min(4096, (max(2.0, len(text) / 9.0) * 12.5 * 1.6) + 60))
    seed = req.get("seed")
    if seed is not None:  # aynı satır + aynı ses → aynı sonuç (devam ederken tutarlılık)
        torch.manual_seed(int(seed))
        if dev == "cuda":
            torch.cuda.manual_seed_all(int(seed))
    with torch.no_grad():
        out = model.generate(
            input_ids=batch["input_ids"].to(dev), attention_mask=batch["attention_mask"].to(dev),
            max_new_tokens=max_new, do_sample=True,
            audio_temperature=1.7, audio_top_p=0.8, audio_top_k=25, audio_repetition_penalty=1.0)
    msgs = [m for m in proc.decode(out) if m is not None]
    if not msgs or not msgs[0].audio_codes_list:
        raise RuntimeError("model ses üretmedi (boş çıktı)")
    a = msgs[0].audio_codes_list[0].detach().float().cpu().numpy()  # [kanal, örnek], 48 kHz stereo
    mono = a.mean(axis=0) if a.ndim == 2 else a
    mono = np.clip(mono, -1.0, 1.0)
    sr = int(proc.model_config.sampling_rate)
    fd, path = tempfile.mkstemp(suffix=".wav", prefix="moss_")
    os.close(fd)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((mono * 32767).astype("<i2").tobytes())
    return path, sr


def main():
    q = queue.Queue()

    def reader():
        for line in sys.stdin:
            if line.strip():
                q.put(line)
        q.put(None)  # ana süreç kapandı
    threading.Thread(target=reader, daemon=True).start()
    while True:
        try:
            line = q.get(timeout=IDLE)
        except queue.Empty:
            print(f"[moss] {IDLE} sn boşta: çıkılıyor (GPU belleği boşaltılır)", flush=True)
            return
        if line is None:
            return
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            path, sr = synth(req)
            reply({"id": rid, "ok": True, "wav": path, "sr": sr})
        except Exception as e:
            traceback.print_exc()
            reply({"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"[:600]})


if __name__ == "__main__":
    main()
