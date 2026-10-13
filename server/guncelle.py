"""
Defter Studio — kendini güncelleyen yardımcı sunucu (yalnız standart kütüphane; internetsiz de zarar vermez).

Fikir: Siteyle birlikte `server/manifest.json` yayınlanır (her dosyanın SHA-256 özeti). Bu betik yerel dosyaları
manifestle karşılaştırır ve YALNIZ değişenleri indirir. Hiçbir şey değişmediyse hiçbir şey indirilmez, pip çalışmaz.
  - requirements.txt değiştiyse pip çalışır (aksi hâlde çalışmaz); edge-tts günde en fazla bir kez yükseltilir.
  - Kabuk dosyaları (baslat.bat, gizli-baslat.vbs…) çalışırken ezilmesin diye yalnız --kabuk ile (kur.bat) yazılır.
Kullanım:
    python guncelle.py --sync [--quiet] [--kabuk] [--nopip] [--root KLASÖR] [--base ADRES]   # farkları indir + gerekirse pip
    python guncelle.py --check                                                      # yalnız farkları yaz
    python guncelle.py --dogrula [--root KLASÖR] [--base ADRES]                     # yerel her dosya özeti == Pages manifesti? FARK varsa liste + çıkış 1 (ağ yoksa 2)
Uygulama dosyaları (index.html, js/, css/…) HER ZAMAN eşitlenir (kur.bat kurulumu da uygulamayı yerelden sunar; localhost:8765 Pages ile aynı olur).
Durum dosyası server/.guncel.json manifestte yer almaz (yerel durumdur).
Güvenlik: adres yalnız ortam değişkeni DEFTER_UPDATE_URL ya da --base ile verilir (varsayılan: resmî GitHub Pages);
dosya yolları server/ ve tools/ altında olmak zorundadır, `..` ve mutlak yol reddedilir, özet tutmayan dosya yazılmaz.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = os.getenv("DEFTER_UPDATE_URL", "https://aseydaaksakal.github.io/defter-studio/").rstrip("/") + "/"
IZINLI = ("server/", "tools/", "js/", "css/")
KOK_DOSYA = ("index.html", "sw.js", "icon.svg", "manifest.webmanifest")  # uygulama (Pages ile aynı) kök dosyaları
STATE = os.path.join(HERE, ".guncel.json")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _get(url: str, timeout=30) -> bytes:
    req = urllib.request.Request(url + ("&" if "?" in url else "?") + f"t={int(time.time())}", headers={"User-Agent": "DefterStudio-updater", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def guvenli(yol: str) -> bool:
    p = yol.replace("\\", "/")
    if p in KOK_DOSYA:
        return True
    return p.startswith(IZINLI) and ".." not in p.split("/") and not p.startswith("/") and ":" not in p and "/." not in "/" + p


def manifest(base=None) -> dict:
    return json.loads(_get((base or BASE) + "server/manifest.json", 15).decode("utf-8"))


def _yerel_sha(root, yol):
    try:
        with open(os.path.join(root, *yol.split("/")), "rb") as f:
            return sha(f.read())
    except OSError:
        return None


def plan(m: dict, root=ROOT, kabuk=False) -> dict:
    """Değişen dosyaları bulur. {'degisen': [...], 'kabuk': [...], 'py': bool, 'pip': bool}"""
    files = {k: v for k, v in m.get("files", {}).items() if guvenli(k)}
    if True:  # uygulama dosyaları (index.html, js/, css/…) her kurulumda eşitlenir: localhost:8765 her zaman Pages ile aynı sürümü sunar
        files.update({k: v for k, v in m.get("app", {}).items() if guvenli(k)})
    shell = {k: v for k, v in m.get("kabuk", {}).items() if guvenli(k)}
    degisen = [k for k, v in files.items() if _yerel_sha(root, k) != v]
    kabuk_fark = [k for k, v in shell.items() if _yerel_sha(root, k) != v]
    st = _state()
    req = files.get("server/requirements.txt")
    pip = bool(req) and st.get("pip", {}).get("requirements.txt") != req
    return {"degisen": degisen, "kabuk": kabuk_fark, "kabukYaz": kabuk, "py": any(k.endswith(".py") for k in degisen), "pip": pip,
            "surum": m.get("version"), "files": files, "shell": shell}


def _state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_state(st):
    try:
        with open(STATE, "w", encoding="utf-8") as f:
            json.dump(st, f)
    except OSError:
        pass


def _yaz(root, yol, beklenen, base):
    veri = _get(base + yol, 120)
    if sha(veri) != beklenen:
        raise RuntimeError(f"{yol}: özet tutmadı (indirme bozuk ya da site henüz güncellenmedi)")
    hedef = os.path.join(root, *yol.split("/"))
    os.makedirs(os.path.dirname(hedef), exist_ok=True)
    tmp = hedef + ".yeni"
    with open(tmp, "wb") as f:
        f.write(veri)
    os.replace(tmp, hedef)


def _pip(*args, log=print):
    log("  pip " + " ".join(args))
    return subprocess.call([sys.executable, "-m", "pip", "install", "-q", *args]) == 0


def uygula(m: dict, root=ROOT, base=None, kabuk=False, log=print, pip=True) -> dict:
    base = base or BASE
    if os.path.isdir(os.path.join(root, ".git")) and os.getenv("DEFTER_UPDATE_FORCE") != "1":
        raise RuntimeError("Bu klasör bir git deposu (geliştirme kopyası): yerel değişiklikler ezilmesin diye otomatik güncelleme kapalı. 'git pull' kullanın.")
    p = plan(m, root, kabuk)
    yazilan, hatalar = [], []
    liste = list(p["degisen"]) + (list(p["kabuk"]) if kabuk else [])
    ozet = {**p["files"], **p["shell"]}
    for yol in liste:
        try:
            _yaz(root, yol, ozet[yol], base)
            yazilan.append(yol)
        except Exception as e:  # tek dosya hatası diğerlerini durdurmaz
            hatalar.append(f"{yol}: {e}")
    st = _state()
    pip_yapildi = False
    if pip and p["pip"] and not hatalar:
        req = os.path.join(root, "server", "requirements.txt")
        if os.path.exists(req) and _pip("-r", req, log=log):
            st.setdefault("pip", {})["requirements.txt"] = p["files"]["server/requirements.txt"]
            pip_yapildi = True
        else:
            hatalar.append("pip: requirements.txt kurulamadı")
    # Ek paketler: Pocket TR kuruluysa kendi gereksinim dosyası değişince yükselt
    ek = "server/requirements-pocket.txt"
    if pip and ek in p["files"] and st.get("pip", {}).get(ek) != p["files"][ek]:
        try:
            import importlib.util
            kurulu = importlib.util.find_spec("pocket_tts_turkish") is not None
        except Exception:
            kurulu = False
        if kurulu and _pip("-U", "-r", os.path.join(root, "server", "requirements-pocket.txt"), log=log):
            st.setdefault("pip", {})[ek] = p["files"][ek]
            pip_yapildi = True
        elif not kurulu:
            st.setdefault("pip", {})[ek] = p["files"][ek]
    # edge-tts günde en fazla bir kez (Microsoft eski sürümleri 403 ile reddeder)
    if pip and time.time() - st.get("edgeAt", 0) > 86400:
        _pip("-U", "edge-tts", log=log)
        st["edgeAt"] = time.time()
    st["surum"] = m.get("version")
    _save_state(st)
    if not hatalar:  # yerel manifest kopyası: --dogrula yerel sürümü buradan okur
        try:
            os.makedirs(os.path.join(root, "server"), exist_ok=True)
            tmp = os.path.join(root, "server", "manifest.json.yeni")
            with open(tmp, "w", encoding="utf-8", newline="\n") as f:
                json.dump({k: m.get(k) for k in ("version", "files", "kabuk", "app") if k in m}, f, indent=1, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, os.path.join(root, "server", "manifest.json"))
        except OSError:
            pass
    return {"yazilan": yazilan, "hatalar": hatalar, "py": any(k.endswith(".py") for k in yazilan), "pip": pip_yapildi,
            "kabuk": [k for k in p["kabuk"] if not kabuk], "surum": m.get("version")}


def yerel_surum(root):
    """Yerel sürüm: root/server/manifest.json 'version'; yoksa main.py VERSION."""
    try:
        with open(os.path.join(root, "server", "manifest.json"), encoding="utf-8") as f:
            return json.load(f).get("version")
    except Exception:
        pass
    try:
        import re
        with open(os.path.join(root, "server", "main.py"), encoding="utf-8") as f:
            return re.search(r'VERSION\s*=\s*"([^"]+)"', f.read()).group(1)
    except Exception:
        return None


def dogrula(m: dict, root=ROOT) -> list:
    """Yerel her dosyanın özetini canlı manifestle karşılaştırır. Fark listesi döner (boşsa eşit)."""
    fark = []
    ys = yerel_surum(root)
    if ys != m.get("version"):
        fark.append(f"sürüm: yerel {ys} ≠ Pages {m.get('version')}")
    for grup in ("files", "kabuk", "app"):
        for yol, h in sorted((m.get(grup) or {}).items()):
            if not guvenli(yol):
                continue
            y = _yerel_sha(root, yol)
            if y is None:
                fark.append(f"eksik: {yol}")
            elif y != h:
                fark.append(f"farklı: {yol}")
    return fark


def main(argv):
    quiet = "--quiet" in argv
    log = (lambda *a, **k: None) if quiet else print
    root, base, kabuk = ROOT, BASE, "--kabuk" in argv
    pip = "--nopip" not in argv  # kur.bat ilk indirmede sistem Python'una paket kurmasın
    if "--root" in argv:
        root = os.path.abspath(argv[argv.index("--root") + 1])
    if "--base" in argv:
        base = argv[argv.index("--base") + 1].rstrip("/") + "/"
    if "--dogrula" in argv:
        try:
            m = manifest(base)
        except Exception as e:
            print(f"Doğrulanamadı: Pages'e ulaşılamadı ({e}). İnternet bağlantınızı denetleyin.")
            return 2
        fark = dogrula(m, root)
        if fark:
            print(f"EŞİT DEĞİL: yerel kopya Pages ile aynı değil ({len(fark)} fark):")
            for x in fark[:40]:
                print("  - " + x)
            return 1
        n = sum(len(m.get(g) or {}) for g in ("files", "kabuk", "app"))
        print(f"EŞİT: yerel kopya Pages ile aynı (sürüm {m.get('version')}, {n} dosya özeti tutuyor).")
        return 0
    try:
        m = manifest(base)
    except Exception as e:
        log(f"Güncelleme denetlenemedi (çevrimdışı olabilir): {e}")
        return 0  # internet yoksa sunucu yine açılır
    if "--check" in argv:
        p = plan(m, root, kabuk)
        print(json.dumps({k: p[k] for k in ("surum", "degisen", "kabuk", "pip")}, ensure_ascii=False))
        return 0
    if os.path.isdir(os.path.join(root, ".git")) and os.getenv("DEFTER_UPDATE_FORCE") != "1":
        log("Geliştirme kopyası (git deposu): otomatik güncelleme atlandı; git pull kullanın.")
        return 0
    p = plan(m, root, kabuk)
    p["pip"] = p["pip"] and pip
    if not p["degisen"] and not (kabuk and p["kabuk"]) and not p["pip"]:
        log("Güncel: indirilecek bir şey yok.")
        # yine de günlük edge-tts denetimi
        uygula(m, root, base, kabuk, log, pip)
        return 0
    log(f"Güncelleniyor: {len(p['degisen'])} dosya değişmiş" + (", paketler yenilenecek" if p["pip"] else ""))
    r = uygula(m, root, base, kabuk, log, pip)
    for e in r["hatalar"]:
        log("  ! " + e)
    if r["kabuk"]:
        log("  Not: başlatıcı dosyaları değişti; tools\\kur.bat dosyasını yeniden çalıştırırsanız yenilenir (zorunlu değil).")
    log(f"Tamam: {len(r['yazilan'])} dosya yazıldı.")
    return 1 if r["hatalar"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
