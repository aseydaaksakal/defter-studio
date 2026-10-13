"""
Defter Studio — ses modeli yöneticisi (katalog · indirme · beğen / sil)

Hugging Face'teki MIT lisanslı Türkçe TTS modellerini listeler, boyutlarını gösterir, indirir, siler ve
"beğendim / beğenmedim" işaretini saklar. Hem sunucuya (/models uçları) hem komut satırına hizmet verir:

    python modeller.py liste
    python modeller.py indir --onerilen            # önerilen küçük set
    python modeller.py indir --hepsi [--ek]        # katalogdaki hepsi (boyut gösterilir, onay istenir)
    python modeller.py indir Trendyol/Trendyol-TTS
    python modeller.py puan Trendyol/Trendyol-TTS begen|begenme
    python modeller.py sil Trendyol/Trendyol-TTS
    python modeller.py temizle                     # "beğenmedim" işaretlileri siler

İndirmeler Hugging Face önbelleğine gider (Windows'ta %USERPROFILE%\\.cache\\huggingface\\hub) ve kesilirse kaldığı yerden sürer.
Hiçbir model sizin onayınız olmadan indirilmez; TTS uçları indirilmemiş modeli kendiliğinden çekmez.
"""
import json
import os
import re
import shutil
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
KATALOG = os.path.join(HERE, "model_katalog.json")
STATE_PATH = os.path.join(os.getenv("DEFTER_STATE", HERE), "models_state.json")  # beğeniler (git'e girmez)

_lock = threading.Lock()
_jobs = {}        # model id -> {"state": kuyrukta|iniyor|bitti|hata, "received": bayt, "total": bayt, "msg": str}
_sizes = {}       # model id -> (zaman, bayt | None)
_sizes_busy = False
ADAPTER_STATUS = lambda adaptor: (False, "adaptör bilgisi yok")  # noqa: E731  main.py kendi işlevini atar
ADAPTER_VOICES = {}  # adaptör -> denemede seçilebilecek hazır sesler


def hf():
    try:
        import huggingface_hub
        return huggingface_hub
    except Exception:
        return None


# ---------------------------------------------------------------- Katalog ve durum
def catalog():
    with open(KATALOG, encoding="utf-8") as fh:
        return json.load(fh)["modeller"]


def entry(model_id):
    for m in catalog():
        if m["id"] == model_id:
            return m
    return None


def _state():
    try:
        with open(STATE_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {"puan": {}}


def set_rating(model_id, puan):
    if not entry(model_id):
        raise KeyError(model_id)
    with _lock:
        s = _state()
        s.setdefault("puan", {})
        if puan in ("begen", "begenme"):
            s["puan"][model_id] = puan
        else:
            s["puan"].pop(model_id, None)
        with open(STATE_PATH, "w", encoding="utf-8") as fh:
            json.dump(s, fh, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- Diskteki durum (Hugging Face önbelleği)
def cache_dir():
    try:
        from huggingface_hub import constants
        return constants.HF_HUB_CACHE
    except Exception:
        return os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")


def repo_path(model_id):
    return os.path.join(cache_dir(), "models--" + model_id.replace("/", "--"))


def _repos(model_id):
    """Ana depo + (varsa) birlikte inmesi gereken ek depolar (katalogda ek_depo)."""
    m = entry(model_id)
    return [model_id] + list((m or {}).get("ek_depo") or [])


def _local_size_one(model_id):
    blobs = os.path.join(repo_path(model_id), "blobs")
    total = 0
    if os.path.isdir(blobs):
        for f in os.listdir(blobs):
            p = os.path.join(blobs, f)
            if os.path.isfile(p) and not os.path.islink(p):
                total += os.path.getsize(p)
    return total


def local_size(model_id):
    return sum(_local_size_one(r) for r in _repos(model_id))


def _ready_one(model_id):
    base = repo_path(model_id)
    snaps = os.path.join(base, "snapshots")
    blobs = os.path.join(base, "blobs")
    if not os.path.isdir(snaps) or not any(files for _, _, files in os.walk(snaps)):
        return False
    return not (os.path.isdir(blobs) and any(f.endswith(".incomplete") for f in os.listdir(blobs)))


def is_ready(model_id):
    """Tamamen inmiş mi (ek depolar dahil)? Yarım indirme (.incomplete) ya da çalışan iş varsa hayır."""
    j = _jobs.get(model_id)
    if j and j["state"] in ("kuyrukta", "iniyor"):
        return False
    return all(_ready_one(r) for r in _repos(model_id))


HAZIR_ORAN = 0.5  # diskteki boyut, katalogdaki (Hugging Face) boyutun en az bu oranı olmalı; "4 MB indi" modeli hazır sayılmaz


KANIT_PATH = os.path.join(os.getenv("DEFTER_STATE", HERE), "models_kanit.json")  # gerçekten ses üretmiş modeller (git'e girmez)
VOICES_DIR_KANIT = None  # main.py ses klasörünü atar: tasarım/klon kaydı bu motorla üretildiyse model çalışıyor demektir


def kanit_yaz(model_id):
    """Model gerçekten ses ürettiyse kaydet: motor kendi önbelleğine indirmiş olabilir (disk boyutu küçük görünür), yine de çalışıyordur."""
    try:
        with open(KANIT_PATH, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        d = {}
    if model_id not in d:
        d[model_id] = time.time()
        try:
            with open(KANIT_PATH, "w", encoding="utf-8") as f:
                json.dump(d, f)
        except OSError:
            pass


def kanitli(model_id):
    try:
        with open(KANIT_PATH, encoding="utf-8") as f:
            if model_id in json.load(f):
                return True
    except Exception:
        pass
    ad = (entry(model_id) or {}).get("adaptor")
    if ad and VOICES_DIR_KANIT and os.path.isdir(VOICES_DIR_KANIT):  # eski kayıtlar: bu motorla tasarlanmış/klonlanmış ses var
        for fn in os.listdir(VOICES_DIR_KANIT):
            if fn.endswith(".json"):
                try:
                    with open(os.path.join(VOICES_DIR_KANIT, fn), encoding="utf-8") as f:
                        if json.load(f).get("engine") == ad:
                            return True
                except Exception:
                    pass
    return False


def tam_hazir(model_id, uzak=None, diskte=None):
    """'hazir' alanı: indirme gerçekten tamam (is_ready) VE bilinen uzak boyutun en az %50'si diskte.
    Uzak boyut bilinmiyorsa (çevrimdışı/henüz çekilmedi) yalnızca tam indirme denetimi geçerlidir."""
    j = _jobs.get(model_id)
    if j and j["state"] in ("kuyrukta", "iniyor"):
        return False
    if kanitli(model_id):
        return True
    if not is_ready(model_id):
        return False
    uzak = uzak if uzak is not None else (_sizes.get(model_id) or (0, None))[1]
    diskte = diskte if diskte is not None else local_size(model_id)
    if uzak:
        return diskte >= HAZIR_ORAN * uzak
    tahmin = _param_bayt(model_id)  # uzak boyut bilinmiyorsa parametre sayısından en az (1 bayt/parametre) tahmini
    return diskte >= HAZIR_ORAN * tahmin if tahmin else diskte > 0


def _param_bayt(model_id):
    m = entry(model_id) or {}
    mt = re.match(r"^\s*([\d.]+)\s*([BM])", str(m.get("param") or ""), re.I)
    if not mt:
        return 0
    return int(float(mt.group(1)) * (1e9 if mt.group(2).upper() == "B" else 1e6))


def snapshot_path(model_id):
    """Önbellekteki anlık görüntü klasörü (çalıştırıcılar yerel yol isterse)."""
    snaps = os.path.join(repo_path(model_id), "snapshots")
    if not os.path.isdir(snaps):
        return None
    subs = sorted(os.listdir(snaps), key=lambda d: os.path.getmtime(os.path.join(snaps, d)), reverse=True)
    return os.path.join(snaps, subs[0]) if subs else None


def remote_size(model_id):
    t = _sizes.get(model_id)
    if t and time.time() - t[0] < 900:
        return t[1]
    h = hf()
    size = None
    if h:
        try:
            size = 0
            for rid in _repos(model_id):
                info = h.HfApi().model_info(rid, files_metadata=True)
                size += sum((s.size or 0) for s in (info.siblings or []))
        except Exception:
            size = None
    _sizes[model_id] = (time.time(), size)
    return size


def prefetch_sizes():
    """Boyutları arka planda toplar; liste hemen döner, boyutlar geldikçe dolar."""
    global _sizes_busy
    if _sizes_busy or not hf():
        return
    _sizes_busy = True

    def run():
        global _sizes_busy
        try:
            for m in catalog():
                if m["id"] not in _sizes:
                    remote_size(m["id"])
        finally:
            _sizes_busy = False
    threading.Thread(target=run, daemon=True).start()


def list_models():
    prefetch_sizes()
    puan = _state().get("puan", {})
    out = []
    for m in catalog():
        mid = m["id"]
        j = _jobs.get(mid)
        ok, why = ADAPTER_STATUS(m.get("adaptor")) if m.get("adaptor") else (False, "Defter Studio'da bu model için çalıştırıcı yok; yalnız indirilebilir")
        diskte, uzak = local_size(mid), (_sizes.get(mid) or (0, None))[1]
        out.append({**m, "hazir": tam_hazir(mid, uzak, diskte), "diskte": diskte, "uzak": uzak,
                    "puan": puan.get(mid), "is": ({k: j[k] for k in ("state", "received", "total", "msg")} if j else None),
                    "calistirilabilir": bool(ok), "calistirNot": "" if ok else why, "sesler": ADAPTER_VOICES.get(m.get("adaptor"), [])})
    return out


# ---------------------------------------------------------------- İndir / sil
def start_download(model_id):
    if not entry(model_id):
        raise KeyError(model_id)
    h = hf()
    if not h:
        raise RuntimeError("huggingface_hub kurulu değil (pip install huggingface_hub)")
    with _lock:
        j = _jobs.get(model_id)
        if j and j["state"] in ("kuyrukta", "iniyor"):
            return j
        j = _jobs[model_id] = {"state": "kuyrukta", "received": local_size(model_id), "total": remote_size(model_id) or 0, "msg": ""}

    def run():
        stop = threading.Event()

        def watch():
            while not stop.is_set():
                j["received"] = local_size(model_id)
                time.sleep(1)
        threading.Thread(target=watch, daemon=True).start()
        try:
            j["state"] = "iniyor"
            for rid in _repos(model_id):
                h.snapshot_download(repo_id=rid)
            j.update(state="bitti", received=local_size(model_id), msg="")
        except Exception as e:
            j.update(state="hata", msg=str(e)[:300])
        finally:
            stop.set()
    threading.Thread(target=run, daemon=True).start()
    return j


def delete_model(model_id):
    if not entry(model_id):
        raise KeyError(model_id)
    j = _jobs.get(model_id)
    if j and j["state"] in ("kuyrukta", "iniyor"):
        raise RuntimeError("İndirme sürüyor; bitmeden silinemez")
    h = hf()
    freed = local_size(model_id)
    if h:
        try:
            scan = h.scan_cache_dir()
            for repo in scan.repos:
                if repo.repo_id == model_id and repo.repo_type == "model":
                    scan.delete_revisions(*[r.commit_hash for r in repo.revisions]).execute()
        except Exception:
            pass
    for rid in _repos(model_id):
        if os.path.isdir(repo_path(rid)):
            shutil.rmtree(repo_path(rid), ignore_errors=True)
    _jobs.pop(model_id, None)
    return freed


# ---------------------------------------------------------------- Sunucu uçları
def router():
    from fastapi import APIRouter, HTTPException, Request
    r = APIRouter()

    async def body(req):
        try:
            return await req.json()
        except Exception:
            raise HTTPException(400, "Geçersiz JSON")

    def need_hf():
        if not hf():
            raise HTTPException(503, "huggingface_hub kurulu değil: server\\.venv içinde  pip install huggingface_hub")

    @r.get("/models")
    def models_get():
        return {"models": list_models(), "hf": bool(hf()), "onbellek": cache_dir()}

    @r.post("/models/download")
    async def models_download(req: Request):
        need_hf()
        ids = (await body(req)).get("ids") or []
        try:
            return {"started": [i for i in ids if start_download(i)]}
        except KeyError as e:
            raise HTTPException(404, f"Katalogda yok: {e}")

    @r.post("/models/rate")
    async def models_rate(req: Request):
        j = await body(req)
        try:
            set_rating(j.get("id"), j.get("puan"))
        except KeyError:
            raise HTTPException(404, "Katalogda yok")
        return {"ok": True}

    @r.post("/models/delete")
    async def models_delete(req: Request):
        j = await body(req)
        try:
            return {"ok": True, "serbest": delete_model(j.get("id"))}
        except KeyError:
            raise HTTPException(404, "Katalogda yok")
        except RuntimeError as e:
            raise HTTPException(409, str(e))

    return r


# ---------------------------------------------------------------- Komut satırı
def _gb(n):
    return "?" if n is None else (f"{n / 1e9:.1f} GB" if n >= 1e8 else f"{n / 1e6:.0f} MB")


def _pick(args):
    ms = catalog()
    ek = "--ek" in args
    ids = [a for a in args if not a.startswith("--")]
    if "--hepsi" in args:
        return [m["id"] for m in ms if ek or not m.get("ek")]
    if "--onerilen" in args:
        return [m["id"] for m in ms if m.get("oneri")]
    if "--calisan" in args:
        return [m["id"] for m in ms if m.get("adaptor") and m["platform"] == "cuda"]
    return ids


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "yardim"):
        print(__doc__)
        return 0
    if not hf():
        print("huggingface_hub kurulu değil. server\\.venv içinde:  pip install huggingface_hub")
        return 1
    cmd, rest = argv[0], argv[1:]
    puan = _state().get("puan", {})
    if cmd == "liste":
        print(f"Önbellek: {cache_dir()}\n")
        for m in catalog():
            durum = "HAZIR" if is_ready(m["id"]) else "-"
            p = {"begen": "👍", "begenme": "👎"}.get(puan.get(m["id"]), " ")
            print(f"{durum:6} {p} {m['id']:58} {m['param']:>8} {_gb(remote_size(m['id'])):>9} {m['platform']:5} {'çalışır' if m.get('adaptor') else 'yalnız indir'}")
        return 0
    if cmd == "indir":
        ids = _pick(rest)
        if not ids:
            print("Ne indirilecek? örn:  indir --onerilen   |   indir --hepsi   |   indir Trendyol/Trendyol-TTS")
            return 1
        todo = [i for i in ids if entry(i) and not is_ready(i)]
        sizes = {i: remote_size(i) for i in todo}
        print("İndirilecekler:")
        for i in todo:
            print(f"  {_gb(sizes[i]):>9}  {i}")
        total = sum(v or 0 for v in sizes.values())
        print(f"\nToplam yaklaşık {_gb(total)} (zaten inenler atlandı). Disk: {cache_dir()}")
        if "--evet" not in rest and input("Başlansın mı? [e/H] ").strip().lower() not in ("e", "evet", "y"):
            print("Vazgeçildi.")
            return 0
        for i in todo:
            print(f"\n▶ {i}")
            j = start_download(i)
            while j["state"] in ("kuyrukta", "iniyor"):
                tot = j["total"] or sizes.get(i) or 0
                print(f"\r  {_gb(j['received'])} / {_gb(tot)}   ", end="", flush=True)
                time.sleep(2)
            print(f"\r  {'✓ bitti' if j['state'] == 'bitti' else '✗ ' + j['msg']}                    ")
        return 0
    if cmd == "puan" and len(rest) == 2:
        set_rating(rest[0], rest[1])
        print("Kaydedildi.")
        return 0
    if cmd == "sil" and rest:
        print(f"{rest[0]}: {_gb(delete_model(rest[0]))} boşaldı")
        return 0
    if cmd == "temizle":
        bad = [i for i, p in puan.items() if p == "begenme" and entry(i)]
        if not bad:
            print("'Beğenmedim' işaretli model yok.")
            return 0
        for i in bad:
            print(f"  {_gb(local_size(i)):>9}  {i}")
        if input("Hepsi silinsin mi? [e/H] ").strip().lower() in ("e", "evet", "y"):
            for i in bad:
                delete_model(i)
            print("Silindi.")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
