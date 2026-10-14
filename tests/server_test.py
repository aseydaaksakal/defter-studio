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
# Testler geliştiricinin gerçek durum dosyalarını (server/veri/probe.json, cast.json) okumasın: sonuç ortama bağlı olmasın
os.environ["DEFTER_DATA"] = tempfile.mkdtemp(prefix="defter-veri-")

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import adaptorler  # noqa: E402
import main  # noqa: E402
import modeller  # noqa: E402

results = []


AYRINTI = "-v" in sys.argv or os.getenv("DEFTER_TEST_AYRINTI") == "1"


def ok(name, cond, info=""):
    results.append(bool(cond))
    if cond and not AYRINTI:  # token ekonomisi: varsayılan çıktı yalnız ✗ + özet (her satır ajan bağlamına girer)
        return
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
ORIG_PROBE = main._probe_run
main._probe_run = lambda mod: None  # testte alt süreç import denemesi yapılmaz (aşağıdaki "gerçek yüklenebilirlik" bölümü ayrıca sınar)
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
    blob = os.path.join(base, "blobs", "h1" + (".incomplete" if incomplete else ""))
    open(blob, "wb").write(b"x" * 10)
    snap = os.path.join(base, "snapshots", "abc", "model.safetensors")
    if os.path.lexists(snap): os.remove(snap)
    try:
        os.symlink(blob, snap)  # gerçek düzen: snapshots → blobs (aynı dosya iki kez sayılmaz)
    except (OSError, NotImplementedError):
        os.remove(blob) if not incomplete else None; open(snap, "wb").write(b"x" * 10)


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
_ops = main._probe_status
main._probe_status = lambda mods: {m: None for m in mods}  # denetim geçti varsay (gerçek denetim arka planda, burada sınanmaz)
eng_list = ORIG_ENGINES()
main._probe_status = _ops
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
ORIG_UYGULA = guncelle.uygula

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
    ok("Güncelleyici: index.html olmasa da (kur.bat kurulumu) uygulama dosyaları HER ZAMAN eşitlenir", main.guncelle.plan(_m, _r)["degisen"] == ["js/a.js"])
    open(os.path.join(_r, "index.html"), "w").write("x")
    ok("Güncelleyici: index.html varsa da uygulama dosyaları eşitlenir", main.guncelle.plan(_m, _r)["degisen"] == ["js/a.js"])
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

# ================================================================ 0.8.1: kur.bat tek bat, eşitlik, gerçek motor denetimi, /cast, hazır eşiği
ROOT = os.path.dirname(SERVER)
TOOLS = os.path.join(ROOT, "tools")
kur = open(os.path.join(TOOLS, "kur.bat"), "rb").read()
kurt = kur.decode("ascii")
bats = [os.path.join(dp, f) for dp, _, fs in os.walk(ROOT) for f in fs if f.endswith(".bat") and ".git" not in dp and ".venv" not in dp]
ok("Bat dosyaları: hepsi CRLF (çıplak LF yok)", all(b"\n" not in open(b, "rb").read().replace(b"\r\n", b"") for b in bats), str(len(bats)))
ok("kur.bat: yalnız ASCII", all(c < 128 for c in kur))
ok("kur.bat: 8765'i PowerShell ile kapatır (Get-NetTCPConnection + Stop-Process)", "Get-NetTCPConnection -LocalPort %PORT%" in kurt and "Stop-Process" in kurt and 'set "PORT=8765"' in kurt)
ok("kur.bat: tarayıcıda YEREL adresi açar, Pages'i açmaz", 'set "YEREL=http://localhost:%PORT%/"' in kurt and 'start "" "%YEREL%"' in kurt and 'start "" "%SITE%' not in kurt and "?bagla=1" not in kurt)
ok("kur.bat: dosyaları her çalışmada eşitler (--sync --kabuk) ve sonunda --dogrula çalıştırır", "guncelle.py\" --sync --kabuk --nopip" in kurt and "--dogrula" in kurt and "SONUC: localhost" in kurt)
ok("kur.bat: /health bekler, sunucuyu gizli başlatıcıyla açar", "/health" in kurt.replace("health'", "/health'") or "%YEREL%health" in kurt)
ok("kur.bat: eski sunucu, dosya eşitlemeden ÖNCE kapatılır (çalışan baslat.bat ezilmesin)", kurt.index("call :portkapat") < kurt.index("--sync --kabuk"))
ok("kur.bat: hata adımı yazılır (ADIM + :hata)", kurt.count('set "ADIM=') >= 8 and "adiminda sorun cikti" in kurt)
ilk = kurt.index(":ilksorular\r\necho")
chs = [m.start() for m in re.finditer(r"choice /c", kurt)] if (re := __import__("re")) else []
gpu_ch = [i for i in chs if "GPU sesleri" in kurt[i:i + 140]]
ok("kur.bat: choice yalnız ilk kurulumda (Pocket :ilksorular altında, GPU sorusu ILK=1 bloğunda; otomatik başlatma sorusuz)",
   len(chs) == 3 and sum(1 for i in chs if ilk < i < kurt.index('\r\n:portkapat')) == 1 and len(gpu_ch) == 1 and 'if "%ILK%"=="1" (' in kurt[gpu_ch[0] - 40:gpu_ch[0]] and 'if "%ILK%"=="1" goto :ilksorular' in kurt,
   f"{len(chs)} choice")
ok("kur.bat: NVIDIA varsa torch bozuksa kur-gpu otomatik (soru yok), yoksa atlanır", "nvidia-smi" in kurt and "torch-denetim.py" in kurt and 'call "%HEDEF%\\tools\\kur-gpu.bat" /otomatik' in kurt and "otomatik onarim" in kurt)
ok("kur.bat: eski Downloads kopyası için uyarı (silmez)", "Downloads\\defter-studio*" in kurt and "artik kullanmayin" in kurt and "rmdir" not in kurt.lower() and not any("del " in l.lower() and "downloads" in l.lower() for l in kurt.splitlines()))
_k9 = kurt.index("echo [9/9]")
ok("kur.bat: otomatik başlatma HER çalışmada kurulur (soru yok), kapatma işareti silinir", "Startup\\Defter Studio.lnk" in kurt[kurt.index("[8/9]"):_k9] and "otobaslat-kapali" in kurt[kurt.index("[8/9]"):_k9])
_kal = open(os.path.join(ROOT, "tools", "otomatik-baslat-kaldir.bat"), encoding="utf-8", newline="").read()
ok("otomatik-baslat-kaldir.bat: kapatma işareti yazar (sunucu kısayolu geri kurmaz), CRLF", "otobaslat-kapali" in _kal and "\r\n" in _kal)
gpu = open(os.path.join(TOOLS, "kur-gpu.bat"), "rb").read().decode("ascii")
iu, ie, ip = gpu.index("pip uninstall -y torch torchaudio torchvision"), gpu.index("install --upgrade omnivoice pocket-tts"), gpu.rindex('install "torch>=2.7" "torchaudio>=2.7"')
ok("kur-gpu.bat: torch ailesi önce tamamen kaldırılır, omnivoice/pocket-tts önce, torch+torchaudio EN SON tek komutla cu128'den",
   iu < ie < ip and "download.pytorch.org/whl/cu128" in gpu[ip:ip + 160] and "--force-reinstall" not in gpu and "--no-deps" not in gpu and gpu.count('"torchaudio>=2.7"') == 1)
ok("kur-gpu.bat: bitişte sürüm/CUDA doğrulaması başarısızsa net hata", gpu.index('"%PY%" "%DEN%"') > ip and 'if errorlevel 1 goto :hata' in gpu[gpu.index('"%PY%" "%DEN%"'):][:80] and "KURULUM HATASI" in gpu)
import py_compile  # noqa: E402
py_compile.compile(os.path.join(TOOLS, "torch-denetim.py"), doraise=True); py_compile.compile(os.path.join(TOOLS, "esitlik.py"), doraise=True)
ok("torch-denetim.py: Windows'ta SetErrorMode ve çıkış kodları (3/4/5)", "SetErrorMode(0x8003)" in open(os.path.join(TOOLS, "torch-denetim.py")).read() and "sys.exit(4)" in open(os.path.join(TOOLS, "torch-denetim.py")).read())
msrc = open(os.path.join(SERVER, "main.py"), encoding="utf-8").read()
ok("main.py: SetErrorMode(0x8003) diğer importlardan önce", 0 < msrc.index("SetErrorMode(0x8003)") < msrc.index("import asyncio") < msrc.index("from fastapi"))
um = open(os.path.join(TOOLS, "uret-manifest.py"), encoding="utf-8").read()
ok("uret-manifest: server/.guncel.json manifest dışı (DISLA)", '"server/.guncel.json"' in um.split("DISLA", 1)[1].split("\n", 1)[0] and ".guncel.json" not in _json.dumps(gm["files"]))
ok("Manifest: esitlik.py ve torch-denetim.py dağıtılır", "tools/esitlik.py" in gm["files"] and "tools/torch-denetim.py" in gm["files"])

# ---- guncelle --dogrula
guncelle.uygula = ORIG_UYGULA
import io, contextlib  # noqa: E402
droot = tempfile.mkdtemp()
dm = site_yaz({"server/main.py": b'VERSION = "1.2.3"\n', "tools/c.bat": b"@echo off\r\n"}, {"app": {"index.html": hashlib.sha256(b"<html>").hexdigest(), "js/a.js": hashlib.sha256(b"a=1").hexdigest()}})
for _y, _v in (("index.html", b"<html>"), ("js/a.js", b"a=1")):
    open(os.path.join(site, *_y.split("/")), "wb") if os.makedirs(os.path.dirname(os.path.join(site, *_y.split("/"))), exist_ok=True) is None else None
    open(os.path.join(site, *_y.split("/")), "wb").write(_v)
rr = guncelle.uygula(dm, droot, BASE, log=lambda *a: None)
ok("Güncelle: kök dizinde index.html olmasa da uygulama dosyaları indirilir", os.path.exists(os.path.join(droot, "index.html")) and os.path.exists(os.path.join(droot, "js", "a.js")) and not rr["hatalar"], str(rr))
ok("Güncelle: yerel manifest kopyası yazılır, durum dosyası manifestte yok", guncelle.yerel_surum(droot) == "1.2.3" and not any(".guncel" in k for g in ("files", "app", "kabuk") for k in dm.get(g, {})))


def calistir(argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = guncelle.main(argv)
    return rc, buf.getvalue()


rc, out = calistir(["--dogrula", "--root", droot, "--base", BASE])
ok("--dogrula: her şey eşitse 0 ve 'EŞİT'", rc == 0 and "EŞİT:" in out, out[:120])
open(os.path.join(droot, "js", "a.js"), "w").write("a=2"); os.remove(os.path.join(droot, "tools", "c.bat"))
rc, out = calistir(["--dogrula", "--root", droot, "--base", BASE])
ok("--dogrula: fark varsa liste + çıkış 1", rc == 1 and "farklı: js/a.js" in out and "eksik: tools/c.bat" in out, out[:200])
open(os.path.join(droot, "server", "manifest.json"), "w").write(_json.dumps({"version": "0.0.1"}))
rc, out = calistir(["--dogrula", "--root", droot, "--base", BASE])
ok("--dogrula: sürüm farkı da bildirilir", rc == 1 and "sürüm: yerel 0.0.1 ≠ Pages 1.2.3" in out, out[:200])
rc, out = calistir(["--dogrula", "--root", droot, "--base", "http://127.0.0.1:9/"])
ok("--dogrula: ağ yoksa çıkış 2 ve anlaşılır mesaj", rc == 2 and "ulaşılamadı" in out, out[:120])

# ---- tools/esitlik.py
_sp = importlib.util.spec_from_file_location("esitlik", os.path.join(TOOLS, "esitlik.py"))
esit = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(esit)
ekok = tempfile.mkdtemp(); esite = tempfile.mkdtemp()
efiles = {"server/main.py": b'VERSION = "9"\n', "tools/x.bat": b"@echo off\r\n", "index.html": b"<html>", "js/a.js": b"a=1"}
for _y, _v in efiles.items():
    for _b in (ekok, esite):
        os.makedirs(os.path.dirname(os.path.join(_b, *_y.split("/"))), exist_ok=True); open(os.path.join(_b, *_y.split("/")), "wb").write(_v)
_man = {"version": "9", "files": {"server/main.py": hashlib.sha256(efiles["server/main.py"]).hexdigest(), "tools/x.bat": hashlib.sha256(efiles["tools/x.bat"]).hexdigest()}, "kabuk": {},
        "app": {k: hashlib.sha256(efiles[k]).hexdigest() for k in ("index.html", "js/a.js")}}
for _b in (ekok, esite):
    open(os.path.join(_b, "server", "manifest.json"), "w").write(_json.dumps(_man))


class _EH(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=esite, **k)
    def log_message(self, *a): pass


esrv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _EH); _th.Thread(target=esrv.serve_forever, daemon=True).start()
EB = f"http://127.0.0.1:{esrv.server_port}/"


def esit_run(base, bekle="0"):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = esit.main(["--bekle", bekle, "--base", base], kok=ekok, aralik=0.1)
    return rc, buf.getvalue()


rc, out = esit_run(EB)
ok("esitlik.py: manifest + her dosya Pages ile aynıysa 0 ve 'EŞİT (4 dosya)'", rc == 0 and "EŞİT (4 dosya)" in out, out[:160])
open(os.path.join(ekok, "js", "a.js"), "wb").write(b"a=2")
rc, out = esit_run(EB)
ok("esitlik.py: bir dosya farklıysa fark listesi ve çıkış 1", rc == 1 and "farklı: js/a.js" in out and "EŞİT DEĞİL" in out, out[:160])
open(os.path.join(ekok, "js", "a.js"), "wb").write(b"a=1")
os.remove(os.path.join(esite, "tools", "x.bat"))
rc, out = esit_run(EB)
ok("esitlik.py: Pages'te eksik dosya fark sayılır (1)", rc == 1 and "Pages'te yok" in out and "tools/x.bat" in out, out[:160])
rc, out = esit_run("http://127.0.0.1:9/")
ok("esitlik.py: ağ yoksa anlaşılır mesajla 2", rc == 2 and "ulaşılamadı" in out, out[:120])
_man2 = dict(_man, version="10")
open(os.path.join(esite, "server", "manifest.json"), "w").write(_json.dumps(_man2))
import time as _t  # noqa: E402
_t0 = _t.time(); rc, out = esit_run(EB, "1")
ok("esitlik.py: manifest eşit olmazsa süre dolana dek yoklar, sonra 1", rc == 1 and _t.time() - _t0 >= 0.9 and "Pages sürümü 10" in out, out[:200])
esrv.shutdown()

# ---- Gerçek yüklenebilirlik: /health engines yalnız import edilebilenler
ok("Alt süreç denetimi: var olan modül None, olmayan modül ModuleNotFoundError", ORIG_PROBE("json") is None and "ModuleNotFoundError" in (ORIG_PROBE("yok_boyle_modul_xyz") or ""))
DLL = "OSError: [WinError 127] Belirtilen yordam bulunamadı. Error loading \"C:\\\\x\\\\torch\\\\lib\\\\c10_cuda.dll\" or one of its dependencies."
def warm():
    """Arka plan denetimi bitene dek bekler (/health artık beklemez; sonuç gelene dek 'probing')."""
    main.engine_errors()
    for _i in range(100):
        if not main._probe_bg["busy"]: break
        _t.sleep(0.05)
    main.engine_errors()
    for _i in range(100):
        if not main._probe_bg["busy"]: break
        _t.sleep(0.05)


probe_calls = []
main._probe_run = lambda mod: (probe_calls.append(mod), DLL if mod == "omnivoice" else None)[1]
_inst = main.tts_installed
main.tts_installed = lambda: ["pockettr", "omnivoice", "edge", "piper"]
main.tts_engines = ORIG_ENGINES; main.probe_reset(); main.TTS_PREF = "auto"
main.PROBE_FILE = os.path.join(tempfile.mkdtemp(), "probe.json")
_slow = _th.Event()
main._probe_run = lambda mod: (_slow.wait(5), probe_calls.append(mod), DLL if mod == "omnivoice" else None)[2]
_t0 = _t.time(); _h0 = client.get("/health").json()["tts"]
ok("/health beklemez: denetim sürerken hemen döner, motorlar 'probing' (çalışıyor denmez)", _t.time() - _t0 < 2 and "omnivoice" in _h0["probing"] and "omnivoice" not in _h0["engines"] and _h0["engineErrors"] == {}, str(_h0.get("probing")))
_slow.set(); warm()
main._probe_run = lambda mod: (probe_calls.append(mod), DLL if mod == "omnivoice" else None)[1]
h = client.get("/health").json()["tts"]
ok("/health: engines yalnız gerçekten import edilebilenler (omnivoice DLL hatası → yok)", h["engines"] == ["pockettr", "edge", "piper"], str(h["engines"]))
ok("/health: installed paketi diskte olanların hepsi", h["installed"] == ["pockettr", "omnivoice", "edge", "piper"], str(h["installed"]))
er = h["engineErrors"]
ok("/health: engineErrors {motor: kısa Türkçe ipucu ≤160, kur.bat}", list(er) == ["omnivoice"] and len(er["omnivoice"]) <= 160 and "kur.bat" in er["omnivoice"] and "c10_cuda" not in er["omnivoice"], str(er))
n0 = len(probe_calls); client.get("/health"); client.get("/health")
ok("Denetim sonucu önbelleğe alınır (tekrar /health alt süreç açmaz)", len(probe_calls) == n0 and sorted(set(probe_calls)) == ["edge_tts", "omnivoice", "piper", "pocket_tts_turkish"], str(probe_calls))
main._probe_cache["omnivoice"] = (0, DLL)  # TTL doldu: eski sonuç hemen döner, arka planda tazelenir
main._probe_run = lambda mod: None
_ = main.engine_errors(); main._probe_bg["busy"] and _th.Event().wait(0.5)
for _i in range(30):
    if not main._probe_bg["busy"]: break
    _t.sleep(0.1)
ok("TTL: bayat hata arka planda yeniden denenir, düzelince engines'e girer", "omnivoice" in main.tts_engines() and main.engine_errors() == {}, str(main.tts_engines()))
main._probe_run = lambda mod: DLL if mod == "omnivoice" else None; main.probe_reset(); warm()
r = tts(engine="omnivoice")
ok("/tts: çalışmayan kilitli motor 503 + Türkçe neden (ham DLL metni yok)", r.status_code == 503 and "kur.bat" in r.text and "c10_cuda" not in r.text and "WinError" not in r.text, r.text[:200])
# ses tasarla: motor yok → 503 Türkçe; motor çöker → ham metin sızmaz; zaman aşımı → takılmaz
main.tts_installed = lambda: ["omnivoice"]
r = client.post("/voices/design", json={"preset": "kadin-sicak"} if any(p["id"] == "kadin-sicak" for p in main.PRESETS) else {"preset": main.PRESETS[0]["id"]})
ok("/voices/design: motor çalışmıyorsa hemen 503, Türkçe ve ham DLL yok", r.status_code == 503 and "tasarlanamıyor" in r.text and "c10_cuda" not in r.text and "WinError" not in r.text, r.text[:200])
main._probe_run = lambda mod: None; main.probe_reset()
_old_omni, _old_vd = main._omni, main.VOICES_DIR
main.VOICES_DIR = tempfile.mkdtemp()
main._omni = lambda: (_ for _ in ()).throw(OSError("[WinError 127] torch_cuda.dll bulunamadı"))
r = client.post("/voices/design", json={"preset": main.PRESETS[0]["id"]})
ok("/voices/design: motor DLL hatasıyla çökerse 503 + Türkçe ipucu (ham metin yok)", r.status_code == 503 and "kur.bat" in r.text and "torch_cuda" not in r.text and "WinError" not in r.text, r.text[:200])
main._omni = lambda: (_ for _ in ()).throw(RuntimeError("beklenmeyen"))
_dt = main.DESIGN_TIMEOUT
r = client.post("/voices/design", json={"preset": main.PRESETS[0]["id"]})
ok("/voices/design: genel hata 500 + okunur metin", r.status_code == 500 and "beklenmeyen" in r.text)
import threading as _thr  # noqa: E402
_ev = _thr.Event(); main.DESIGN_TIMEOUT = 0.3
main._omni = lambda: _ev.wait(1.5) or (_ for _ in ()).throw(RuntimeError("geç"))
_t0 = _t.time(); r = client.post("/voices/design", json={"preset": main.PRESETS[0]["id"]})
ok("/voices/design: zaman aşımında takılmaz (504, Türkçe)", r.status_code == 504 and "sn içinde bitmedi" in r.text, f"{r.status_code} {r.text[:120]}")
_ev.set(); main.DESIGN_TIMEOUT = _dt; main._omni, main.VOICES_DIR = _old_omni, _old_vd
main.GPU_WAIT = 0.2; main._gpu_lock.acquire()
try:
    ORIG_GPU("pockettr", "x", "f", "tr", None, {}); gt = None
except TimeoutError as e:
    gt = e
finally:
    main._gpu_lock.release(); main.GPU_WAIT = 120.0
ok("GPU kilidi: meşgulse sonsuza beklemez (TimeoutError → 504)", gt is not None and main.tr_hata(gt)[0] == 504)
ok("tr_hata: ImportError/DLL → 503 Türkçe, genel hata 500 ham mesaj", main.tr_hata(ImportError("DLL load failed"))[0] == 503 and "kur.bat" in main.tr_hata(OSError("x.dll"))[1] and main.tr_hata(RuntimeError("abc"))[0] == 500)
main.tts_installed = _inst; main.tts_engines = lambda: []; main._probe_run = lambda mod: None

# ---- /cast
main.DATA_DIR = tempfile.mkdtemp(); main.CAST_FILE = os.path.join(main.DATA_DIR, "veri", "cast.json"); main.DATA_DIR = os.path.dirname(main.CAST_FILE)
ok("/cast: kayıt yokken boş kadro", client.get("/cast").json()["cast"] == [])
kadro = {"cast": [{"id": "a1", "name": "Ayşe", "gender": "f", "voice": "pt-kadin-1"}, {"id": "b2", "name": "Mehmet", "gender": "m", "voice": "pt-erkek-2", "fazla": "atılır"}]}
r = client.put("/cast", json=kadro)
ok("/cast PUT: kaydeder, bilinmeyen alanı atar", r.status_code == 200 and r.json()["n"] == 2 and "fazla" not in r.json()["cast"][1])
ok("/cast GET: kalıcı dosyadan geri okur (cast.json)", client.get("/cast").json()["cast"] == [{k: c[k] for k in ("id", "name", "gender", "voice")} for c in kadro["cast"]] and os.path.exists(main.CAST_FILE))
ok("/cast: 12'den fazla kişi 400", client.put("/cast", json={"cast": [{"id": str(i), "name": "x", "gender": "f", "voice": ""} for i in range(13)]}).status_code == 400)
ok("/cast: 12 kişi kabul", client.put("/cast", json={"cast": [{"id": str(i), "name": "x", "gender": "f", "voice": ""} for i in range(12)]}).status_code == 200)
ok("/cast: 80 karakterden uzun alan 400", client.put("/cast", json={"cast": [{"id": "a", "name": "x" * 81, "gender": "f", "voice": ""}]}).status_code == 400 and client.put("/cast", json={"cast": [{"id": "a", "name": "x" * 80, "gender": "f", "voice": ""}]}).status_code == 200)
ok("/cast: metin olmayan alan ve liste olmayan gövde 400", client.put("/cast", json={"cast": [{"id": 5, "name": "x"}]}).status_code == 400 and client.put("/cast", json={"cast": "x"}).status_code == 400 and client.put("/cast", content=b"{boz").status_code == 400)
r = client.put("/cast", content=_json.dumps({"cast": [{"id": "a", "name": "x", "gender": "f", "voice": ""}], "pad": "y" * 70000}).encode())
ok("/cast: 64 KB'tan büyük gövde 413 ve eski kayıt bozulmaz", r.status_code == 413 and client.get("/cast").json()["cast"][0]["name"] == "x" * 80)

# ---- Modeller: 'hazir' yalnız gerçekten inmişse (boyutun ≥%50'si)
tid = "Trendyol/Trendyol-TTS"
for rp in modeller._repos(tid):
    fake_repo(rp)
modeller._sizes[tid] = (_t.time(), 4_000_000_000)
modeller.prefetch_sizes = lambda: None
row = next(m for m in client.get("/models").json()["models"] if m["id"] == tid)
ok("/models: 4 MB inmiş 2B model 'hazır' değil, 'diskte' gerçek boyut", row["hazir"] is False and row["diskte"] == modeller.local_size(tid) > 0 and modeller.is_ready(tid), str(row["diskte"]))
modeller._sizes[tid] = (_t.time(), row["diskte"] * 2)
ok("/models: boyutun tam %50'si inmişse hazır", next(m for m in client.get("/models").json()["models"] if m["id"] == tid)["hazir"] is True)
modeller._sizes[tid] = (_t.time(), row["diskte"] * 2 + 1)
ok("/models: %50'nin altındaysa hazır değil", next(m for m in client.get("/models").json()["models"] if m["id"] == tid)["hazir"] is False)
modeller._sizes[tid] = (_t.time(), None)
ok("/models: uzak boyut bilinmiyorsa parametre sayısından tahminle (2B ≥ ~1 GB) 10 bayt hazır değil", modeller.tam_hazir(tid) is False)
modeller._sizes[tid] = (_t.time(), 20)
modeller._jobs[tid] = {"state": "iniyor", "received": 0, "total": 20, "msg": ""}
ok("/models: indirme sürüyorsa hazır değil", next(m for m in client.get("/models").json()["models"] if m["id"] == tid)["hazir"] is False)
modeller._jobs.pop(tid)

# Kanıt: motor gerçekten ses ürettiyse (kayıtlı ses ya da başarılı üretim) disk boyutu küçük görünse de model hazır sayılır
import tempfile as _tf
_vd = _tf.mkdtemp(); _kp = os.path.join(_tf.mkdtemp(), "kanit.json")
modeller.VOICES_DIR_KANIT, modeller.KANIT_PATH = _vd, _kp
_oid = "k2-fsa/OmniVoice"
ok("Kanıt yokken küçük/yarım model hazır değil", modeller.kanitli(_oid) is False)
open(os.path.join(_vd, "kadin-genc.json"), "w", encoding="utf-8").write('{"engine": "omnivoice", "source": "tasarım"}')
ok("OmniVoice ile tasarlanmış ses varsa model çalışıyor sayılır (tam_hazir)", modeller.kanitli(_oid) and modeller.tam_hazir(_oid))
os.remove(os.path.join(_vd, "kadin-genc.json")); modeller.kanit_yaz(_oid)
ok("Başarılı üretim kaydı model hazırlığını kalıcı kılar", modeller.kanitli(_oid) and modeller.tam_hazir(_oid))

# ---- Dayanıklı indirme: hata → yeniden dene, takılma → öldür, Türkçe hata
import textwrap as _tw
_mid = next(m["id"] for m in modeller.catalog())
_sz = {"n": 0}
_orig_ls, _orig_cmd, _orig_dur = modeller.local_size, modeller._dl_cmd, modeller.INDIR_DURGUN_SN
modeller.local_size = lambda mid: _sz["n"]
_state_f = os.path.join(tempfile.mkdtemp(), "st")
def _bekle(j):
    for _i in range(200):
        if j["state"] in ("bitti", "hata"): return
        _t.sleep(0.1)
_flag = os.path.join(tempfile.mkdtemp(), "ilk")
modeller._dl_cmd = lambda rid: [sys.executable, "-c", f"import os,sys\nf={_flag!r}\nif not os.path.exists(f):\n    open(f,'w').write('x'); print('ConnectionError: ag yok'); sys.exit(1)\nsys.exit(0)"]
_orig_ready = modeller.is_ready; modeller.is_ready = lambda m: True
j = modeller.start_download(_mid); _bekle(j)
modeller.is_ready = _orig_ready
ok("İndirme: ilk deneme ağ hatası verse de yeniden denenir ve biter", j["state"] == "bitti", str(j))
modeller._jobs.pop(_mid, None)
modeller.INDIR_DURGUN_SN = 2; modeller.INDIR_DENEME = 2
modeller._dl_cmd = lambda rid: [sys.executable, "-c", "import time; time.sleep(60)"]
_t0 = _t.time(); j = modeller.start_download(_mid); _bekle(j)
ok("İndirme: boyut büyümüyorsa takıldı sayılıp öldürülür, süresiz beklemez", j["state"] == "hata" and _t.time() - _t0 < 15 and "bağlanılamadı" in j["msg"], j["msg"][:160])
modeller._jobs.pop(_mid, None)
modeller._dl_cmd = lambda rid: [sys.executable, "-c", "import sys; print('HfHubHTTPError: 403 Client Error gated repo'); sys.exit(1)"]
j = modeller.start_download(_mid); _bekle(j)
ok("İndirme: 403 gated → Türkçe 'erişim onayı' + ham ayrıntı", j["state"] == "hata" and "erişim onayı" in j["msg"] and "403" in j["msg"], j["msg"][:200])
modeller._jobs.pop(_mid, None)
modeller.local_size, modeller._dl_cmd, modeller.INDIR_DURGUN_SN, modeller.INDIR_DENEME = _orig_ls, _orig_cmd, _orig_dur, 4
ok("İndirme alt sürecinde XET kapalı ve zaman aşımı ayarlı", modeller._dl_env(1)["HF_HUB_DISABLE_XET"] == "1" and modeller._dl_env(1)["HF_HUB_DOWNLOAD_TIMEOUT"] == "60")

# ---- Disk boyutu: Windows'ta symlink yok → dosyalar snapshots içinde gerçek dosya (blobs boş). "yarım 1 MB" hatasının kök nedeni.
import tempfile as _tf2
_c = _tf2.mkdtemp(); _oc = modeller.cache_dir; modeller.cache_dir = lambda: _c
_rid = "acme/ses-modeli"
_snap = os.path.join(_c, "models--acme--ses-modeli", "snapshots", "abc123"); os.makedirs(_snap); os.makedirs(os.path.join(_c, "models--acme--ses-modeli", "blobs"))
open(os.path.join(_snap, "model.safetensors"), "wb").write(b"x" * 5000)
open(os.path.join(_snap, "config.json"), "wb").write(b"y" * 100)
ok("Boyut: symlinksiz (Windows) düzende snapshots içindeki gerçek dosyalar sayılır", modeller._local_size_one(_rid) == 5100, str(modeller._local_size_one(_rid)))
_bl = os.path.join(_c, "models--acme--ses-modeli", "blobs"); open(os.path.join(_bl, "h1.incomplete"), "wb").write(b"z" * 700)
ok("Boyut: yarım indirme (.incomplete) eklenir", modeller._local_size_one(_rid) == 5800, str(modeller._local_size_one(_rid)))
os.remove(os.path.join(_bl, "h1.incomplete"))
if hasattr(os, "symlink"):
    _c2 = _tf2.mkdtemp(); modeller.cache_dir = lambda: _c2
    _b2 = os.path.join(_c2, "models--acme--ses-modeli", "blobs"); _s2 = os.path.join(_c2, "models--acme--ses-modeli", "snapshots", "r1"); os.makedirs(_b2); os.makedirs(_s2)
    open(os.path.join(_b2, "h2"), "wb").write(b"q" * 3000); os.symlink(os.path.join(_b2, "h2"), os.path.join(_s2, "w.bin"))
    ok("Boyut: symlinkli düzende aynı dosya iki kez sayılmaz", modeller._local_size_one(_rid) == 3000, str(modeller._local_size_one(_rid)))
modeller.cache_dir = _oc
_kb = open(os.path.join(ROOT, "tools", "kur.bat"), encoding="utf-8", newline="").read()
ok("kur.bat: bekle.ps1 ile 127.0.0.1 /health'i 300 sn bekler, ilk açılışta çifte eşitleme yok (DEFTER_SKIP_SYNC)", "bekle.ps1" in _kb and "127.0.0.1" in _kb and "-Sn 300" in _kb and "DEFTER_SKIP_SYNC=1" in _kb and os.path.exists(os.path.join(ROOT, "tools", "bekle.ps1")))
ok("kur.bat kendini günceller: Pages'teki kur.bat farklıysa onu --guncel ile çalıştırır (döngü yok)", all(x in _kb for x in ("--guncel", "fc /b", "tools/kur.bat?t=", "call \"%YENI%\" --guncel")))
import guncelle as _g
ok("guncelle: DEFTER_SKIP_SYNC=1 iken --sync hiçbir şey yapmaz; pocket pip -U içermez", (os.environ.__setitem__("DEFTER_SKIP_SYNC", "1"), _g.main(["--sync", "--quiet"]))[1] == 0 and (os.environ.pop("DEFTER_SKIP_SYNC"), '"-U", "-r"' not in open(os.path.join(ROOT, "server", "guncelle.py"), encoding="utf-8").read())[1])

# ---- Windows açılışında otomatik başlatma: sunucu kısayolu kendisi kurar, kullanıcı kapattıysa dokunmaz
import subprocess as _sp
_on, _oe, _orun = os.name, dict(os.environ), _sp.run
_ad = tempfile.mkdtemp(); _vd = tempfile.mkdtemp()
_lnk = os.path.join(_ad, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Defter Studio.lnk")
os.environ.update(APPDATA=_ad, DEFTER_LAUNCHER="1", DEFTER_DATA=_vd)
_cagri = []
def _sahte_run(cmd, **kw):
    _cagri.append(cmd); os.makedirs(os.path.dirname(_lnk), exist_ok=True); open(_lnk, "w").close()
_sp.run = _sahte_run
_oapp = main.APP_DIR; main.APP_DIR = tempfile.mkdtemp()  # git kopyası değil (kur.bat kurulumu gibi)
try:
    os.name = "nt"
    ok("Oto-başlat: kısayol yoksa kurar (PowerShell, gizli-baslat.vbs)", main.oto_baslat_kur() == "kuruldu" and "gizli-baslat.vbs" in _cagri[0][-1])
    ok("Oto-başlat: kısayol varsa dokunmaz", main.oto_baslat_kur() == "var" and len(_cagri) == 1)
    os.remove(_lnk); open(os.path.join(_vd, "otobaslat-kapali"), "w").close()
    ok("Oto-başlat: kullanıcı kapattıysa (işaret) kurmaz", main.oto_baslat_kur() == "kapali" and len(_cagri) == 1)
finally:
    os.name = _on; _sp.run = _orun; os.environ.clear(); os.environ.update(_oe); main.APP_DIR = _oapp
ok("Oto-başlat: Windows dışında atlanır; açılışta çağrılır", main.oto_baslat_kur() == "atla" and "target=oto_baslat_kur" in open(os.path.join(SERVER, "main.py"), encoding="utf-8").read())

# ---- Çalışırken otomatik güncelleme (elle bat/zip yok)
_om, _op, _ou, _ag = main.guncelle.manifest, main.guncelle.plan, main.guncelle.uygula, main.APP_DIR
main.APP_DIR = tempfile.mkdtemp()
main.guncelle.manifest = lambda *a, **k: {"version": "9.9.9", "files": {}}
main.guncelle.plan = lambda m, root, *a, **k: {"degisen": [], "pip": False, "py": False, "kabuk": []}
ok("Oto-güncelleme: değişiklik yoksa hiçbir şey yapmaz", main.oto_guncelle_tur() == "yok")
main.guncelle.plan = lambda m, root, *a, **k: {"degisen": ["server/main.py"], "pip": False, "py": True, "kabuk": []}
main._gpu_lock.acquire()
ok("Oto-güncelleme: GPU üretimi sürerken yeniden başlatmaz (bekler)", main.oto_guncelle_tur() == "bekliyor")
main._gpu_lock.release()
main.guncelle.plan = lambda m, root, *a, **k: {"degisen": ["js/app.js"], "pip": False, "py": False, "kabuk": []}
main.guncelle.uygula = lambda *a, **k: {"yazilan": ["js/app.js"], "hatalar": [], "py": False, "pip": False}
ok("Oto-güncelleme: yalnız uygulama dosyası değiştiyse yazar, sunucuyu yeniden başlatmaz", main.oto_guncelle_tur() == "yazildi")
os.makedirs(os.path.join(main.APP_DIR, ".git"))
ok("Oto-güncelleme: git kopyasında devre dışı", main.oto_guncelle_tur() == "yok")
main.guncelle.manifest, main.guncelle.plan, main.guncelle.uygula, main.APP_DIR = _om, _op, _ou, _ag
ok("Oto-güncelleme açılışta başlar (10 dk)", "_oto_guncelle_dongu, daemon" in open(os.path.join(SERVER, "main.py"), encoding="utf-8").read() and main.OTO_GUNCELLE_SN == 600)

# ---- 0.8.4: eski kodla çalışan süreç (PC'de görüldü: diskte 0.8.2, çalışan 0.8.1, "güncelleme yok") kendini yeniden başlatır
_om, _op, _ou, _ag = main.guncelle.manifest, main.guncelle.plan, main.guncelle.uygula, main.APP_DIR
_oy, _oz, _ob = main._yeniden_baslat, dict(main._ACILIS_ZAMAN), dict(main._ACILIS_PY)
basla = []
main._yeniden_baslat = lambda neden: basla.append(neden)
main.APP_DIR = tempfile.mkdtemp()
os.environ["DEFTER_LAUNCHER"] = "1"
main.guncelle.manifest = lambda *a, **k: {"version": "9.9.9", "files": {}}
main.guncelle.plan = lambda m, root, *a, **k: {"degisen": [], "pip": False, "py": False, "kabuk": []}
ok("Eski kod: dosyalar ve süreç aynıysa hiçbir şey yapmaz", not main.kod_eski() and main.oto_guncelle_tur() == "yok" and not basla)
main._ACILIS_ZAMAN = {"main.py": 1}; main._ACILIS_PY = {"main.py": "0" * 64}  # açılıştaki kod farklıydı
ok("Eski kod: diskteki .py açılıştakinden farklıysa algılanır", main.kod_eski())
main._gpu_lock.acquire()
ok("Eski kod: GPU üretimi sürerken yeniden başlatmaz (bekler)", main.oto_guncelle_tur() == "bekliyor" and not basla)
main._gpu_lock.release()
ok("Eski kod: değişen dosya olmasa da boştayken yeniden başlar", main.oto_guncelle_tur() == "yeniden" and len(basla) == 1, str(basla))
h = client.get("/health").json()["update"]
ok("/health: eski kodda update.available ve restart doğru", h["available"] is True and h["restart"] is True, str(h))
main.guncelle.uygula = lambda m, root, log=None, **k: {"yazilan": [], "hatalar": [], "py": False, "pip": False, "kabuk": [], "surum": "9.9.9"}
basla.clear()
ap = client.post("/update/apply").json()
ok("/update/apply: yazılacak dosya yoksa da eski kodda yeniden başlar", ap["restart"] == "auto" and len(basla) == 1, str(ap))
os.environ["DEFTER_LAUNCHER"] = "0"; basla.clear()
ok("Eski kod: başlatıcı yoksa kapanmaz (yeniden açacak döngü yok)", main.oto_guncelle_tur() == "yok" and not basla)
main.guncelle.manifest, main.guncelle.plan, main.guncelle.uygula, main.APP_DIR = _om, _op, _ou, _ag
main._yeniden_baslat, main._ACILIS_ZAMAN, main._ACILIS_PY = _oy, _oz, _ob
ok("Eski kod: arayüz 'yeniden başlat' durumunu ayırır", "yalnizBaslat" in open(os.path.join(os.path.dirname(SERVER), "js", "app.js"), encoding="utf-8").read())

# ---- 0.8.4: Edge ara sıra boş ses döndürür (PC'de erkek seste NoAudioReceived): kısa bekleyip yeniden dener
class NoAudioReceived(Exception):
    pass


class _Bos:
    n = 0

    def __init__(self, *a, **k):
        pass

    async def stream(self):
        _Bos.n += 1
        if _Bos.n < 3:
            raise NoAudioReceived("No audio was received. Please verify that your parameters are correct.")
        yield {"type": "audio", "data": b"ID3ok"}


_bos_mod = types.ModuleType("edge_tts"); _bos_mod.Communicate = _Bos
_sys.modules["edge_tts"] = _bos_mod
_osl = main.asyncio.sleep
async def _hizli(*a, **k):
    return None
main.asyncio.sleep = _hizli
try:
    veri = asyncio.run(ORIG_EDGE("Merhaba", "m", "tr"))
    ok("Edge: NoAudioReceived'da iki kez daha dener ve sesi alır", veri == b"ID3ok" and _Bos.n == 3, str(_Bos.n))
    _Bos.n = -10
    try:
        asyncio.run(ORIG_EDGE("Merhaba", "m", "tr")); _kalici = False
    except NoAudioReceived:
        _kalici = True
    ok("Edge: sürekli boş seste sonsuz denemez (3 denemede hata verir)", _kalici and _Bos.n == -7, str(_Bos.n))
finally:
    main.asyncio.sleep = _osl

# ---- 0.8.4: VoxCPM sürüm farkı ('seed' almıyor; PC'de TypeError) → desteklenmeyen argüman atılıp yeniden denenir
_cagri_kw = []
def _vox_gen(**kw):
    _cagri_kw.append(sorted(kw))
    for k in ("seed", "max_len"):
        if k in kw:
            raise TypeError(f"VoxCPM._generate() got an unexpected keyword argument '{k}'")
    return [0.0, 0.1]
r = adaptorler.esnek_cagir(_vox_gen, text="a", seed=1, max_len=4096, cfg_value=2.0)
ok("VoxCPM: desteklenmeyen 'seed'/'max_len' atılır, üretim sürer", r == [0.0, 0.1] and _cagri_kw[-1] == ["cfg_value", "text"], str(_cagri_kw))
try:
    adaptorler.esnek_cagir(lambda **kw: (_ for _ in ()).throw(TypeError("başka hata")), text="a"); _yuk = False
except TypeError:
    _yuk = True
ok("VoxCPM: başka TypeError gizlenmez", _yuk)
_kat = {m["id"]: m for m in modeller.catalog()}
ok("Katalog: kullanılan Pocket TR modeli (wite-tech) kartta, hazır sesli adaptörle",
   _kat.get("wite-tech/pocket-tts-turkish", {}).get("adaptor") == "pockettr" and len(adaptorler.SESLER["pockettr"]) == 6
   and _kat["alperiox/pocket-tts-turkish"]["adaptor"] == "pocket")

# ---- 0.8.4: istem denetimi (defter-istem becerisi) eskimiş kalıbı yakalar, konu anlatımını yakalamaz
import importlib.util as _ilu  # noqa: E402
_bds = _ilu.spec_from_file_location("baglam_denetim", os.path.join(os.path.dirname(SERVER), "tools", "baglam-denetim.py"))
_bd = _ilu.module_from_spec(_bds); _bds.loader.exec_module(_bd)
ok("İstem denetimi: eskimiş kalıbı yakalar, konu anlatımını yakalamaz",
   all(_bd.ESKI_KALIP.search(x) for x in ("Lütfen adım adım düşün.", "Think step by step.", "Önce akıl yürütmeni yaz.", "show your reasoning first"))
   and not any(_bd.ESKI_KALIP.search(x) for x in ("çok adımlı akıl yürütme", "konuyu adım adım anlatır", "Kısaca gerekçelendir.")))

srv.shutdown()

n = sum(results)
print(f"\n{n}/{len(results)} sunucu kontrolü geçti")
sys.exit(0 if n == len(results) else 1)
