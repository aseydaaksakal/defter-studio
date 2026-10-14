"""server/manifest.json üretir: kendini güncelleyen yardımcı sunucu için dosya özetleri. tools/teslim.sh her teslimde çalıştırır."""
import hashlib, json, os, re

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KABUK = {"server/baslat.bat", "server/baslat.sh", "server/gizli-baslat.vbs"}
DISLA = {"server/manifest.json", "server/.guncel.json", "tools/kur.bat"}  # kur.bat kullanıcının indirdiği dosyadır, kendini ezmez; .guncel.json yerel durumdur


def dosyalar():
    for klasor, uzantilar in (("server", (".py", ".json", ".txt", ".bat", ".sh", ".vbs")), ("tools", (".bat", ".py", ".sh", ".ps1"))):
        for ad in sorted(os.listdir(os.path.join(KOK, klasor))):
            yol = f"{klasor}/{ad}"
            if ad.endswith(uzantilar) and yol not in DISLA and os.path.isfile(os.path.join(KOK, klasor, ad)):
                yield yol


def uygulama():
    for y in ("index.html", "sw.js", "icon.svg", "manifest.webmanifest"):
        yield y
    for klasor in ("css", "js"):
        for dp, dn, fn in os.walk(os.path.join(KOK, klasor)):
            dn.sort()
            for f in sorted(fn):
                yield os.path.relpath(os.path.join(dp, f), KOK).replace(os.sep, "/")


app = {y: hashlib.sha256(open(os.path.join(KOK, *y.split("/")), "rb").read()).hexdigest() for y in uygulama()}
files, kabuk = {}, {}
for y in dosyalar():
    h = hashlib.sha256(open(os.path.join(KOK, *y.split("/")), "rb").read()).hexdigest()
    (kabuk if y in KABUK else files)[y] = h
surum = re.search(r'VERSION\s*=\s*"([^"]+)"', open(os.path.join(KOK, "server", "main.py"), encoding="utf-8").read()).group(1)
with open(os.path.join(KOK, "server", "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump({"version": surum, "files": files, "kabuk": kabuk, "app": app}, f, indent=1, ensure_ascii=False)
    f.write("\n")
print(f"manifest: sürüm {surum}, {len(files)} sunucu/araç dosyası, {len(kabuk)} kabuk, {len(app)} uygulama dosyası")
