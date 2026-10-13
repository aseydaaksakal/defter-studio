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
ORIG_EDGE, ORIG_ENGINES, ORIG_HAS = main.tts_edge, main.tts_engines, main.has
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


# ---------------------------------------------------------------- 0.6.0: Pocket TTS Türkçe (6 hazır ses)
import asyncio  # noqa: E402
import types  # noqa: E402

main.has = lambda mod: mod in ("pocket_tts_turkish", "edge_tts")
main.tts_engines = ORIG_ENGINES
eng_list = ORIG_ENGINES()
ok("Pocket TTS Türkçe: kuruluysa ilk sırada", eng_list[:1] == ["pockettr"] and "edge" in eng_list, str(eng_list))
bv = main.builtin_voices()
ok("Pocket TTS Türkçe: 3 kadın + 3 erkek hazır ses listelenir", sorted(v["gender"] for v in bv) == ["f", "f", "f", "m", "m", "m"] and all(v["builtin"] for v in bv))
ok("Hazır sesler /voices içinde görünür", {v["name"] for v in client.get("/voices").json()["voices"]} >= {"pt-kadin-1", "pt-erkek-3"})
ok("Ses adı → model sesi eşlemesi (cinsiyet uyuşmazsa ilk ses)",
   main.pockettr_voice("pt-kadin-2", "f") == "female_2" and main.pockettr_voice("pt-erkek-3", "m") == "male_3"
   and main.pockettr_voice("pt-kadin-2", "m") == "male_1" and main.pockettr_voice(None, "f") == "female_1" and main.pockettr_voice("male_2", "m") == "male_2")
seen = []
main._gpu_synth = ORIG_GPU
orig_pt = main.tts_pockettr
main.tts_pockettr = lambda text, voice, gender: (seen.append((voice, gender)), WAV)[1]
main.tts_engines = lambda: ["pockettr", "edge"]
main.TTS_PREF = "auto"
plan = main.tts_plan()
ok("Plan: kadın ve erkek ikisi de Pocket TTS Türkçe (referans kaydı gerekmez)", plan == {"f": "pockettr", "m": "pockettr"}, str(plan))
r = client.post("/tts", json={"text": "Merhaba", "gender": "f", "voice": "pt-kadin-3", "engine": "pockettr"})
ok("/tts: seçilen hazır ses motora iletilir", r.status_code == 200 and seen == [("pt-kadin-3", "f")], f"{r.status_code} {seen}")
main.tts_pockettr = orig_pt
main._gpu_synth = fake_gpu

# ---------------------------------------------------------------- 0.6.0: Edge 403 → bir kez güncelle ve yeniden dene
class _Comm:
    def __init__(self, ok_, *a, **k):
        self.ok_ = ok_

    async def stream(self):
        if not self.ok_:
            raise RuntimeError("403, message='Invalid response status', url='wss://speech.platform.bing.com/...'")
        yield {"type": "audio", "data": b"ID3audio"}


old_mod = types.ModuleType("edge_tts"); old_mod.Communicate = lambda *a, **k: _Comm(False)
new_mod = types.ModuleType("edge_tts"); new_mod.Communicate = lambda *a, **k: _Comm(True)
import sys as _sys  # noqa: E402
_sys.modules["edge_tts"] = old_mod
main._edge_upgrade["done"] = False
upgrades = []
main._edge_try_upgrade = lambda: (upgrades.append(1), _sys.modules.__setitem__("edge_tts", new_mod), True)[2]
data = asyncio.run(ORIG_EDGE("Merhaba", "f", "tr"))
ok("Edge 403: eski sürüm bir kez güncellenir ve istek başarıyla yinelenir", data == b"ID3audio" and len(upgrades) == 1)
_sys.modules["edge_tts"] = old_mod
main._edge_try_upgrade = lambda: False
try:
    asyncio.run(ORIG_EDGE("Merhaba", "f", "tr")); msg = ""
except RuntimeError as e:
    msg = str(e)
ok("Edge 403: güncelleme olmazsa açık mesaj (baslat.bat / Pocket TTS önerisi)", "403" in msg and "baslat.bat" in msg and "kur-pocket-tr" in msg, msg[:90])
class _Boom(types.ModuleType):
    Communicate = staticmethod(lambda *a, **k: _Comm(False))


boom = types.ModuleType("edge_tts")
boom.Communicate = lambda *a, **k: type("C", (), {"stream": lambda self: (_ for _ in ()).throw(RuntimeError("bağlantı koptu"))})()
_sys.modules["edge_tts"] = boom
upgrades.clear()
main._edge_try_upgrade = lambda: (upgrades.append(1), True)[1]
try:
    asyncio.run(ORIG_EDGE("Merhaba", "f", "tr")); other = ""
except RuntimeError as e:
    other = str(e)
ok("Edge: 403 dışı hata olduğu gibi iletilir (güncelleme denenmez)", other == "bağlantı koptu" and not upgrades, other)
main.has = ORIG_HAS
main.tts_engines = lambda: []

# ---------------------------------------------------------------- 0.6.0: Hızlı MP4 (gerçek ffmpeg varsa)
import subprocess  # noqa: E402

exe = main.ffmpeg_exe()
ok("ffmpeg bulunur ve /health bildirir", (exe is not None) == client.get("/health").json()["ffmpeg"])
if exe:
    fr = subprocess.run([exe, "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x3366cc:s=320x240:r=24:d=1", "-frames:v", "24", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"], capture_output=True)
    sil = main._wav_bytes(np.zeros(24000, dtype="float32"), 24000)
    st = client.post("/video/start", data={"fps": "24", "width": "320", "height": "240"}, files={"audio": ("a.wav", sil, "audio/wav")})
    vid = st.json().get("id")
    r1 = client.post(f"/video/frames/{vid}", content=fr.stdout[: len(fr.stdout) // 2])
    r2 = client.post(f"/video/frames/{vid}", content=fr.stdout[len(fr.stdout) // 2:])
    ok("Hızlı MP4: başlat + iki parça kare kabul edilir", st.status_code == 200 and r1.status_code == 200 and r2.status_code == 200)
    fin = client.post(f"/video/finish/{vid}")
    ok("Hızlı MP4: ffmpeg geçerli MP4 döndürür", fin.status_code == 200 and fin.content[4:8] == b"ftyp" and len(fin.content) > 2000, f"{fin.status_code} {len(fin.content)} bayt")
    ok("Hızlı MP4: iş temizlenir", vid not in main._VIDEO_JOBS)
    pr = subprocess.run([exe, "-hide_banner", "-i", "-"], input=fin.content, capture_output=True)
    info = pr.stderr.decode("utf-8", "replace")
    ok("Hızlı MP4: H.264 video + AAC ses, 320x240", "h264" in info and "aac" in info and "320x240" in info, info[info.find("Stream"):info.find("Stream") + 120] if "Stream" in info else info[-120:])
    ab = client.post("/video/start", data={"fps": "24"}, files={"audio": ("a.wav", sil, "audio/wav")}).json()["id"]
    client.delete(f"/video/{ab}")
    ok("Hızlı MP4: iptal işi siler", ab not in main._VIDEO_JOBS)
bad = client.post("/video/frames/yok", content=b"x")
ok("Hızlı MP4: bilinmeyen iş 404", bad.status_code == 404)


# ---------------------------------------------------------------- 0.6.0: VRAM koruması, motor tanısı, hata ipuçları
unloaded = []
main._free_vram_gb = lambda: (3.0, 24.0)
main._ollama_loaded = lambda: ["qwen3.8:27b"]
orig_unload = main.ollama_unload
main.ollama_unload = lambda: (unloaded.append(1), ["qwen3.8:27b"])[1]
got = main.vram_guard(6.0)
ok("VRAM koruması: boş bellek yetmezse Ollama modeli boşaltılır", got == ["qwen3.8:27b"] and unloaded == [1])
main._free_vram_gb = lambda: (20.0, 24.0)
unloaded.clear()
ok("VRAM koruması: bellek yeterliyse dokunulmaz", main.vram_guard(6.0) == [] and not unloaded)
main._free_vram_gb = lambda: (3.0, 24.0)
os.environ["DEFTER_UNLOAD_OLLAMA"] = "0"
ok("VRAM koruması: DEFTER_UNLOAD_OLLAMA=0 ile kapatılır", main.vram_guard(6.0) == [] and not unloaded)
del os.environ["DEFTER_UNLOAD_OLLAMA"]

tries = []
orig_inner = main._gpu_synth_inner
def oom_once(eng, text, gender, lang, ref, j, repo=None):
    tries.append(eng)
    if len(tries) == 1:
        raise RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")
    return WAV
main._gpu_synth_inner = oom_once
unloaded.clear()
data = ORIG_GPU("omnivoice", "Merhaba", "f", "tr", None, {})
ok("OOM: Ollama boşaltılıp bir kez yeniden denenir", data == WAV and len(tries) == 2 and unloaded, f"{len(tries)} deneme, boşaltma {len(unloaded)}")
main._gpu_synth_inner = lambda *a, **k: (_ for _ in ()).throw(ValueError("başka hata"))
try:
    ORIG_GPU("omnivoice", "Merhaba", "f", "tr", None, {}); other = ""
except ValueError as e:
    other = str(e)
ok("OOM dışı hata yeniden denenmeden iletilir", other == "başka hata")
main._gpu_synth_inner = orig_inner
main._free_vram_gb = lambda: (None, None); main.ollama_unload = orig_unload

ok("Hata ipucu: RTX 50xx / sm_120", "cu128" in main.hint_for("CUDA error: no kernel image is available for execution on the device (sm_120)"))
ok("Hata ipucu: VRAM", "ollama stop" in main.hint_for("CUDA out of memory"))
ok("Hata ipucu: eksik paket", "kur-gpu" in main.hint_for("ModuleNotFoundError: No module named 'omnivoice'"))
ok("Hata ipucu: edge 403", "baslat.bat" in main.hint_for("403, message='Invalid response status', url='wss://speech.platform.bing.com'"))
ok("Hata ipucu: bilinmeyen hata boş", main.hint_for("tuhaf bir şey") == "")

reset(["omnivoice", "edge"], fail=["omnivoice"])
main._ollama_loaded = lambda: []
st = client.get("/tts/selftest").json()
rows = {r["engine"]: r for r in st["results"]}
ok("Motor tanısı: çalışan motor ✓, çöken motor gerçek hatayla ✗", rows["edge"]["ok"] and not rows["omnivoice"]["ok"] and "CUDA bellek" in rows["omnivoice"]["error"], str(rows)[:200])
ok("Motor tanısı: kadın ve erkek ayrı denenir, süre bildirilir", rows["edge"]["f"]["ok"] and rows["edge"]["m"]["ok"] and "seconds" in rows["edge"])
ok("Motor tanısı: ortam bilgisi (VRAM/Ollama/edge sürümü) döner", "vramFreeGb" in st["info"] and "ollamaLoaded" in st["info"] and "edge" in st["info"])
one = client.get("/tts/selftest?engines=edge").json()
ok("Motor tanısı: engines= ile yalnız seçilen motor denenir", [r["engine"] for r in one["results"]] == ["edge"])

# ---- Kendini güncelleme (0.7.0): yalnız değişenler indirilir, bozuk/güvensiz dosya yazılmaz
import hashlib, http.server, json as _json, threading as _th  # noqa: E402
import guncelle  # noqa: E402

site = tempfile.mkdtemp(); root = tempfile.mkdtemp(); sayac = []


def site_yaz(files, extra=None):
    for y, v in files.items():
        os.makedirs(os.path.dirname(os.path.join(site, y)), exist_ok=True)
        open(os.path.join(site, y), "wb").write(v)
    man = {"version": "1.2.3", "files": {y: hashlib.sha256(v).hexdigest() for y, v in files.items()}, "kabuk": {}}
    man.update(extra or {})
    os.makedirs(os.path.join(site, "server"), exist_ok=True)
    open(os.path.join(site, "server", "manifest.json"), "w").write(_json.dumps(man))
    return man


class _H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=site, **k)
    def log_message(self, *a): sayac.append(self.path.split("?")[0])


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _H); _th.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}/"
os.environ["DEFTER_UPDATE_URL"] = BASE; guncelle.BASE = BASE
guncelle.STATE = os.path.join(root, "state.json")
guncelle._pip = lambda *a, log=print: True  # testte gerçek pip çalışmasın
A, B = b"print('a')\n", b"x = 1\n"
m = site_yaz({"server/a.py": A, "server/b.py": B, "server/requirements.txt": b"fastapi\n", "tools/c.bat": b"@echo off\r\n"})
r = guncelle.uygula(m, root, BASE, log=lambda *a: None)
ok("Güncelleme: ilk eşitleme tüm dosyaları yazar, tüm özetler tutar", len(r["yazilan"]) == 4 and not r["hatalar"] and open(os.path.join(root, "server", "a.py"), "rb").read() == A, str(r["yazilan"]))
ok("Güncelleme: requirements.txt ilk kez geldi → pip çalıştı", r["pip"] is True)
sayac.clear()
r = guncelle.uygula(guncelle.manifest(BASE), root, BASE, log=lambda *a: None)
ok("Güncelleme: hiçbir şey değişmediyse HİÇBİR dosya indirilmez ve pip çalışmaz", r["yazilan"] == [] and r["pip"] is False and [u for u in sayac if not u.endswith("manifest.json")] == [], str(sayac))
m = site_yaz({"server/a.py": b"print('yeni')\n", "server/b.py": B, "server/requirements.txt": b"fastapi\n", "tools/c.bat": b"@echo off\r\n"})
sayac.clear()
r = guncelle.uygula(m, root, BASE, log=lambda *a: None)
ok("Güncelleme: yalnız değişen dosya indirilir (a.py), pip çalışmaz", r["yazilan"] == ["server/a.py"] and r["py"] and not r["pip"] and sorted(u for u in sayac if not u.endswith("manifest.json")) == ["/server/a.py"], str(r) + str(sayac))
m = site_yaz({"server/a.py": b"print('yeni')\n", "server/b.py": B, "server/requirements.txt": b"fastapi\nhttpx\n", "tools/c.bat": b"@echo off\r\n"})
r = guncelle.uygula(m, root, BASE, log=lambda *a: None)
ok("Güncelleme: requirements.txt değişince pip yeniden çalışır", r["pip"] is True and r["yazilan"] == ["server/requirements.txt"])
bozuk = site_yaz({"server/a.py": b"print('yeni')\n", "server/z.py": b"z=1\n"}); bozuk["files"]["server/z.py"] = "0" * 64
r = guncelle.uygula(bozuk, root, BASE, log=lambda *a: None)
ok("Güncelleme: özeti tutmayan dosya yazılmaz, hata bildirilir", r["hatalar"] and not os.path.exists(os.path.join(root, "server", "z.py")) and not os.path.exists(os.path.join(root, "server", "z.py.yeni")))
zararli = {"version": "9", "files": {"../disari.py": "0" * 64, "/etc/x": "0" * 64, "server/../../k.py": "0" * 64, "C:/x.py": "0" * 64, "app.js": "0" * 64}, "kabuk": {}}
ok("Güncelleme: .., mutlak yol ve server/ tools/ dışı yollar reddedilir", guncelle.plan(zararli, root)["degisen"] == [])
m2 = site_yaz({"server/a.py": b"print('yeni')\n"}, {"kabuk": {"server/baslat.bat": hashlib.sha256(b"yeni").hexdigest()}})
open(os.path.join(site, "server", "baslat.bat"), "wb").write(b"yeni")
r = guncelle.uygula(m2, root, BASE, log=lambda *a: None)
ok("Güncelleme: kabuk dosyaları (baslat.bat) kendiliğinden ezilmez, yalnız bildirilir", r["kabuk"] == ["server/baslat.bat"] and not os.path.exists(os.path.join(root, "server", "baslat.bat")))
r = guncelle.uygula(m2, root, BASE, kabuk=True, log=lambda *a: None)
ok("Güncelleme: --kabuk (kur.bat) ile kabuk dosyaları yazılır", "server/baslat.bat" in r["yazilan"])
os.makedirs(os.path.join(root, ".git"), exist_ok=True)
try:
    guncelle.uygula(m2, root, BASE, log=lambda *a: None); gitok = False
except RuntimeError:
    gitok = True
ok("Güncelleme: git deposunda (geliştirme kopyası) otomatik güncelleme kapalı", gitok)
ok("Güncelleme: çevrimdışıyken CLI hata vermeden 0 döner (sunucu yine açılır)", guncelle.main(["--sync", "--quiet", "--base", "http://127.0.0.1:9/"]) == 0)
# gerçek manifest: depodaki dosyalar özetleriyle tutuyor mu
import subprocess  # noqa: E402
subprocess.run([sys.executable, os.path.join(os.path.dirname(SERVER), "tools", "uret-manifest.py")], check=True, capture_output=True)
gm = _json.load(open(os.path.join(SERVER, "manifest.json")))
ok("Manifest: depodaki her dosyanın özeti tutuyor; main.py sürümüyle aynı sürüm", gm["version"] == main.VERSION and all(guncelle._yerel_sha(os.path.dirname(SERVER), y) == h for y, h in {**gm["files"], **gm["kabuk"]}.items()) and "server/guncelle.py" in gm["files"] and "server/baslat.bat" in gm["kabuk"])
ok("Manifest: .bat dosyaları CRLF (özet Windows'taki dosyayla tutsun)", b"\r\n" in open(os.path.join(SERVER, "baslat.bat"), "rb").read() and b"\r\n" in open(os.path.join(os.path.dirname(SERVER), "tools", "kur.bat"), "rb").read())
# uç noktalar
main._UPD.update(at=0.0, plan=None)
guncelle_man = guncelle.manifest
main.guncelle.manifest = lambda base=None: {"version": "9.9.9", "files": {"server/main.py": "0" * 64}, "kabuk": {}}
ck = client.get("/update/check?force=true").json()
ok("/update/check: yeni sürümü ve değişen dosyaları bildirir", ck["available"] and ck["latest"] == "9.9.9" and ck["current"] == main.VERSION and "server/main.py" in ck["files"], str(ck)[:160])
ok("/health: update.available döner (arayüz bildirim göstersin)", client.get("/health").json()["update"]["available"] is True)
main.guncelle.uygula = lambda m, root, log=None, **k: {"yazilan": ["server/main.py"], "hatalar": [], "py": True, "pip": False, "kabuk": [], "surum": "9.9.9"}
exits = []
_Timer = main.threading.Timer
main.threading.Timer = lambda t, fn: type("T", (), {"start": lambda self: exits.append(t)})()
os.environ["DEFTER_LAUNCHER"] = "1"
ap = client.post("/update/apply").json()
ok("/update/apply: .py değişti ve başlatıcı varsa kendini yeniden başlatır (çıkış 75)", ap["restart"] == "auto" and len(exits) == 1, str(ap))
os.environ["DEFTER_LAUNCHER"] = "0"; exits.clear()
ap = client.post("/update/apply").json()
ok("/update/apply: başlatıcı yoksa kapanmaz, elle yeniden başlatma ister", ap["restart"] == "manual" and not exits, str(ap))
main.threading.Timer = _Timer; main.guncelle.manifest = guncelle_man

# ---- 0.8.0: sese göre motor, Piper doğrudan indirme hatası, arayüzden kurulum, güncelleyici uygulama grubu
try:
    main._piper_fetch("gecersiz ad")
    ok("Piper: geçersiz ses adı reddedilir", False)
except RuntimeError as e:
    ok("Piper: geçersiz ses adı reddedilir", "geçersiz" in str(e))
ok("Ses seçimi: 'f'/'m' ve boş seçim kilitli motoru değiştirmez", main._engine_for_voice("f", "edge") == "edge" and main._engine_for_voice("", "omnivoice") == "omnivoice" and main._engine_for_voice(None, "edge") == "edge")
_OLD_TE = main.tts_engines
main.tts_engines = lambda: ["pockettr", "edge"]
ok("Ses seçimi: hazır Pocket TR sesi → pockettr motoru", main._engine_for_voice("pt-kadin-2", "edge") == "pockettr")
main.tts_engines = lambda: ["edge"]
ok("Ses seçimi: Pocket TR kurulu değilse kilitli motorda kalır", main._engine_for_voice("pt-kadin-2", "edge") == "edge")
main.tts_engines = _OLD_TE
_pc = []
_OLD_PIP, _OLD_PT = main._pip_install, main.tts_pockettr
main._pip_install = lambda *a: _pc.append(a)
main.tts_pockettr = lambda *a, **k: WAV
main._kur_pockettr()
d = client.get("/kur/durum").json()
ok("Pocket TR kurulumu (arayüzden): pip + model denemesi sonrası 'done'", d["state"] == "done" and _pc and "pocket-tts-turkish" in _pc[0], str(d)[:120])
main._pip_install = lambda *a: (_ for _ in ()).throw(RuntimeError("pip hata verdi: ağ yok"))
main._kur_pockettr()
d = client.get("/kur/durum").json()
ok("Pocket TR kurulumu: hata durumda 'error' ve gerçek mesaj döner", d["state"] == "error" and "ağ yok" in d["msg"], str(d)[:120])
main._pip_install, main.tts_pockettr = _OLD_PIP, _OLD_PT
main._KUR.update(state="idle", msg="")
_mf = json.load(open(os.path.join(os.path.dirname(SERVER), "server", "manifest.json"), encoding="utf-8")) if os.path.exists(os.path.join(SERVER, "manifest.json")) else {}
ok("Manifest: uygulama dosyaları (index.html, js/, css/) 'app' grubunda", "index.html" in _mf.get("app", {}) and any(k.startswith("js/") for k in _mf.get("app", {})) and not any(k.startswith("js/") for k in _mf.get("files", {})))
with tempfile.TemporaryDirectory() as _r:
    _m = {"version": "x", "files": {}, "app": {"js/a.js": "0" * 64}, "kabuk": {}}
    ok("Güncelleyici: index.html yoksa (kur.bat kurulumu) uygulama dosyaları eşitlenmez", main.guncelle.plan(_m, _r)["degisen"] == [])
    open(os.path.join(_r, "index.html"), "w").write("x")
    ok("Güncelleyici: index.html varsa (zip/depo kopyası) uygulama dosyaları eşitlenir", main.guncelle.plan(_m, _r)["degisen"] == ["js/a.js"])
ok("Güncelleyici: kök dosyalar izinli, üst dizin ve mutlak yol reddedilir", main.guncelle.guvenli("index.html") and not main.guncelle.guvenli("../index.html") and not main.guncelle.guvenli("/etc/passwd"))

# ---- 0.8.0: eğitim veri seti hazırlayıcı (sahte döküm; ffmpeg gerekir)
import importlib.util  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import wave  # noqa: E402
_sp = importlib.util.spec_from_file_location("vs", os.path.join(os.path.dirname(SERVER), "tools", "veri-seti-hazirla.py"))
_vs = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(_vs)
_r = _vs.kliplere_bol([(0, 3, "Ee, merhaba"), (3.2, 6, "nasılsın"), (20, 21, "kısa"), (30, 60, "çok uzun"), (70, 74, "a|b  c")])
ok("Veri seti: yakın cümleler birleşir, kısa/çok uzun parça atılır, '|' temizlenir", _r == [(0, 6, "Ee, merhaba nasılsın"), (70, 74, "a b c")], str(_r))
if shutil.which("ffmpeg"):
    with tempfile.TemporaryDirectory() as _d:
        _src = os.path.join(_d, "s.mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=12", "-ac", "2", "-ar", "44100", _src], check=True)
        _rows = _vs.hazirla([_src], os.path.join(_d, "o"), dokum_fn=lambda w: [(0, 4, "Ee, birinci"), (4.2, 7, "ikinci"), (8, 11, "üçüncü")])
        _w = wave.open(os.path.join(_d, "o", "wavs", "00001.wav"))
        ok("Veri seti: 24 kHz mono parçalar + metadata.csv üretilir", len(_rows) == 2 and _w.getframerate() == 24000 and _w.getnchannels() == 1 and os.path.exists(os.path.join(_d, "o", "metadata.csv")))
srv.shutdown()

n = sum(results)
print(f"\n{n}/{len(results)} sunucu kontrolü geçti")
sys.exit(0 if n == len(results) else 1)
