"""
Defter Studio — lokal sunucu birim testi (GPU, model ve internet gerekmez)

Sunucunun "ses kilidi" mantığını, MOSS çalışan protokolünü ve model yöneticisinin ek depo desteğini sahte motorlarla sınar.
Çalıştırma (depo kökünde):
    pip install fastapi httpx numpy soundfile python-multipart huggingface_hub
    python3 tests/server_test.py
"""
import os
import sys
import tempfile
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(os.path.dirname(HERE), "server")
sys.path.insert(0, SERVER)

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import adaptorler  # noqa: E402
import main  # noqa: E402
import modeller  # noqa: E402

results = []


def ok(name, cond, info=""):
    results.append(bool(cond))
    print(("✓ " if cond else "✗ ") + name + (f" — {info}" if info else ""), flush=True)


client = TestClient(main.app)
ORIG_GPU, ORIG_MOSS = main._gpu_synth, adaptorler.moss_uret
WAV = main._wav_bytes(np.zeros(2400, dtype="float32"), 24000)
calls, piper_calls = [], []
FAIL, NEEDREF = set(), set()
REFS = {"f": None, "m": None}


def fake_gpu(eng, text, gender, lang, ref, j, repo=None):
    calls.append(eng)
    if eng in FAIL:
        raise RuntimeError("CUDA bellek yetersiz")
    if eng in NEEDREF and not ref:
        raise LookupError("referans ses yok")
    return WAV


async def fake_edge(text, gender, lang):
    calls.append("edge")
    if "edge" in FAIL:
        raise RuntimeError("çevrimdışı")
    return WAV


def fake_piper(text, gender, lang):
    piper_calls.append(gender)
    return WAV


main._gpu_synth = fake_gpu
main.tts_edge = fake_edge
main.tts_piper = fake_piper
main.ref_for = lambda gender, voice=None: REFS.get(gender)


def reset(engines, fail=(), needref=(), refs=None, pref="auto"):
    calls.clear(); piper_calls.clear(); FAIL.clear(); NEEDREF.clear()
    FAIL.update(fail); NEEDREF.update(needref)
    REFS.update(refs or {"f": None, "m": None})
    main.tts_engines = lambda: list(engines)
    main.TTS_PREF = pref


def tts(**kw):
    return client.post("/tts", json={"text": "Deneme cümlesi.", "gender": kw.pop("gender", "f"), **kw})


# ---- 1) Otomatik sırada Piper yok; plan cinsiyet başına
reset(["omnivoice", "chatterbox", "edge", "piper"])
ok("Otomatik sırada Piper yok", main.tts_auto() == ["omnivoice", "chatterbox", "edge"], str(main.tts_auto()))
reset(["chatterbox", "edge", "piper"], refs={"f": None, "m": "/tmp/erkek.wav"})
ok("Plan: kadın için referanssız chatterbox atlanır, erkek chatterbox kullanır", main.tts_plan() == {"f": "edge", "m": "chatterbox"}, str(main.tts_plan()))
reset(["piper"])
ok("Yalnız Piper kuruluysa plan boş (robot sese kendiliğinden düşülmez)", main.tts_plan() == {"f": None, "m": None}, str(main.tts_plan()))
reset(["piper"], pref="piper")
ok("DEFTER_TTS=piper ile Piper elle seçilebilir", main.tts_auto() == ["piper"] and main.tts_plan()["m"] == "piper" and main.tts_plan()["f"] is None)

# ---- 2) /health motor planı
reset(["omnivoice", "edge"])
h = client.get("/health").json()
ok("/health: plan ve auto listesi var", h["tts"]["plan"] == {"f": "omnivoice", "m": "omnivoice"} and h["tts"]["auto"] == ["omnivoice", "edge"], str(h["tts"]))

# ---- 3) Kilitsiz çağrı (yalnız ilk seçim): hatada sıradaki motor, Piper asla
reset(["omnivoice", "edge", "piper"], fail={"omnivoice"})
r = tts()
ok("Kilitsiz: omnivoice çökünce edge'e geçilir (seçim aşaması)", r.status_code == 200 and r.headers.get("x-defter-engine") == "edge" and calls == ["omnivoice", "edge"], f"{r.status_code} {calls}")
reset(["omnivoice", "piper"], fail={"omnivoice"})
r = tts()
ok("Kilitsiz: her şey çökse bile Piper denenmez, 500 + gerçek hata", r.status_code == 500 and not piper_calls and "CUDA bellek" in r.text, f"{r.status_code} {piper_calls}")

# ---- 4) Kilitli çağrı: başka motora asla düşmez
reset(["omnivoice", "edge", "piper"], fail={"omnivoice"})
r = tts(engine="omnivoice")
ok("Kilitli: motor çökünce 500, edge/Piper denenmedi", r.status_code == 500 and calls == ["omnivoice"] and not piper_calls and "omnivoice çalışmadı" in r.text and "CUDA bellek" in r.text, f"{r.status_code} {calls}")
reset(["chatterbox", "edge"], needref={"chatterbox"})
r = tts(engine="chatterbox")
ok("Kilitli: referans yoksa 409 ve sıradaki motora geçilmez", r.status_code == 409 and calls == ["chatterbox"], f"{r.status_code} {calls}")
reset(["edge"])
r = tts(engine="omnivoice")
ok("Kilitli: kurulu olmayan motor 503", r.status_code == 503 and not calls, r.text[:90])
reset(["omnivoice", "edge"])
r = tts(engine="edge")
ok("Kilitli: edge çalışır, başlık motoru söyler", r.status_code == 200 and r.headers.get("x-defter-engine") == "edge" and calls == ["edge"])
reset(["omnivoice"])
ok("Kilitli satırlar arasında motor değişmez (10 satır)", all(tts(engine="omnivoice").status_code == 200 for _ in range(10)) and set(calls) == {"omnivoice"} and len(calls) == 10)

# ---- 5) MOSS: adaptör, referans şartı
moss_calls = []
adaptorler.moss_uret = lambda repo, text, ref, lang="tr", seed=None: (moss_calls.append((repo, ref, lang, seed)) or (np.zeros(4800, dtype="float32"), 48000))
mid = "OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5"
real = main
real._gpu_synth = ORIG_GPU  # gerçek _gpu_synth: yalnız MOSS dalı sınanır, moss_uret sahte
raised = False
try:
    real._gpu_synth("moss", "Merhaba dünya. Nasılsın?", "f", "tr", None, {"voice": None}, mid)
except LookupError:
    raised = True
ok("MOSS: referans ses yoksa LookupError (rastgele ses üretmez)", raised)
data = real._gpu_synth("moss", "Merhaba dünya. Nasılsın? Bugün hava çok güzel.", "m", "tr", "/tmp/erkek.wav", {"voice": "erkek-1"}, mid)
ok("MOSS: referansla çağrılır, WAV döner, dil ve tohum gider", data[:4] == b"RIFF" and moss_calls and moss_calls[0][1] == "/tmp/erkek.wav" and moss_calls[0][2] == "tr" and isinstance(moss_calls[0][3], int), str(moss_calls[:1]))
seeds = {c[3] for c in moss_calls}
real._gpu_synth("moss", "Merhaba dünya. Nasılsın? Bugün hava çok güzel.", "m", "tr", "/tmp/erkek.wav", {"voice": "erkek-1"}, mid)
ok("MOSS: aynı satır + aynı ses → aynı tohum (devam ederken tutarlı)", {c[3] for c in moss_calls} == seeds)

# ---- 6) MOSS çalışan protokolü (sahte çalışan betiği)
adaptorler.moss_uret = ORIG_MOSS
tmp = tempfile.mkdtemp()
fake = os.path.join(tmp, "fake_worker.py")
open(fake, "w", encoding="utf-8").write(textwrap.dedent('''
    import json, os, sys, tempfile, wave
    for line in sys.stdin:
        req = json.loads(line)
        if req["text"] == "HATA":
            print(json.dumps({"id": req["id"], "ok": False, "error": "ValueError: sahte hata"})); sys.stdout.flush(); continue
        fd, path = tempfile.mkstemp(suffix=".wav"); os.close(fd)
        with wave.open(path, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(b"\\x00\\x01" * 4800)
        print(json.dumps({"id": req["id"], "ok": True, "wav": path, "sr": 48000, "pid": os.getpid()})); sys.stdout.flush()
'''))
adaptorler.MOSS_WORKER = fake
adaptorler.moss_python = lambda: sys.executable
a, sr = adaptorler.moss_uret("repo", "Merhaba", "/tmp/ref.wav", "tr", seed=7)
pid1 = adaptorler._moss["proc"].pid
a2, sr2 = adaptorler.moss_uret("repo", "İkinci", "/tmp/ref.wav", "tr", seed=8)
ok("MOSS çalışan protokolü: ses dizisi + 48 kHz döner", len(a) == 4800 and sr == 48000 and a.dtype == np.float32)
ok("MOSS çalışan: model bir kez yüklenir (aynı işlem yeniden kullanılır)", adaptorler._moss["proc"].pid == pid1 and len(a2) == 4800)
err = ""
try:
    adaptorler.moss_uret("repo", "HATA", "/tmp/ref.wav")
except RuntimeError as e:
    err = str(e)
ok("MOSS çalışan: hata mesajı aktarılır, işlem ayakta kalır", "sahte hata" in err and adaptorler._moss["proc"].poll() is None, err)
adaptorler.moss_kapat()
ok("MOSS çalışan: moss_kapat işlemi durdurur (GPU belleği boşalır)", adaptorler._moss["proc"] is None)
adaptorler.MOSS_WORKER = os.path.join(SERVER, "moss_worker.py")
# gerçek çalışan: torch yoksa (bu ortam) protokol hatası döner, çökmez
import subprocess  # noqa: E402
import json  # noqa: E402
p = subprocess.Popen([sys.executable, adaptorler.MOSS_WORKER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
p.stdin.write(json.dumps({"id": 1, "repo": "x/y", "text": "Merhaba", "ref": __file__, "language": "tr"}) + "\n"); p.stdin.flush()
resp = json.loads(p.stdout.readline())
p.stdin.close(); p.wait(timeout=20)
try:
    import torch  # noqa: F401
    have_torch = True
except Exception:
    have_torch = False
ok("moss_worker.py: istek-yanıt protokolü çalışıyor (torch yoksa temiz hata)", resp["id"] == 1 and (have_torch or (resp["ok"] is False and "torch" in resp["error"].lower())), str(resp)[:120])
ok("moss_worker.py: stdin kapanınca çıkar", p.returncode == 0)

# ---- 7) Model yöneticisi: ek depo (MOSS ses kodlayıcısı)
repos = modeller._repos(mid)
ok("Katalog: MOSS Local çalıştırılabilir, ses kodlayıcı ek depo olarak bağlı", len(repos) == 2 and repos[1].endswith("MOSS-Audio-Tokenizer-v2") and modeller.entry(mid)["adaptor"] == "moss", str(repos))
cache = tempfile.mkdtemp()
modeller.cache_dir = lambda: cache


def fake_repo(rid, incomplete=False):
    base = os.path.join(cache, "models--" + rid.replace("/", "--"))
    os.makedirs(os.path.join(base, "snapshots", "abc"), exist_ok=True)
    os.makedirs(os.path.join(base, "blobs"), exist_ok=True)
    for f in os.listdir(os.path.join(base, "blobs")):  # yarım indirmenin yerine tamamı geldi
        os.remove(os.path.join(base, "blobs", f))
    open(os.path.join(base, "snapshots", "abc", "model.safetensors"), "wb").write(b"x" * 10)
    open(os.path.join(base, "blobs", "h1" + (".incomplete" if incomplete else "")), "wb").write(b"x" * 10)


fake_repo(repos[0])
ok("Model yöneticisi: yalnız ana depo inmişse 'hazır' değil", not modeller.is_ready(mid))
fake_repo(repos[1], incomplete=True)
ok("Model yöneticisi: ek depo yarım inmişse hazır değil", not modeller.is_ready(mid))
fake_repo(repos[1])
ok("Model yöneticisi: ana + ek depo tam inince hazır, boyut ikisini toplar", modeller.is_ready(mid) and modeller.local_size(mid) == 20, str(modeller.local_size(mid)))
modeller.delete_model(mid)
ok("Model yöneticisi: silince ek depo da gider", not modeller.is_ready(mid) and modeller.local_size(mid) == 0)

n = sum(results)
print(f"\n{n}/{len(results)} sunucu kontrolü geçti")
sys.exit(0 if n == len(results) else 1)
