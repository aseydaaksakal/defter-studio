"""server/manifest.json üretir: kendini güncelleyen yardımcı sunucu için dosya özetleri. tools/teslim.sh her teslimde çalıştırır."""
import hashlib, json, os, re

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KABUK = {"server/baslat.bat", "server/baslat.sh", "server/gizli-baslat.vbs"}
DISLA = {"server/manifest.json", "tools/kur.bat"}  # kur.bat kullanıcının indirdiği dosyadır, kendini ezmez


def dosyalar():
    for klasor, uzantilar in (("server", (".py", ".json", ".txt", ".bat", ".sh", ".vbs")), ("tools", (".bat", ".py", ".sh"))):
        for ad in sorted(os.listdir(os.path.join(KOK, klasor))):
            yol = f"{klasor}/{ad}"
            if ad.endswith(uzantilar) and yol not in DISLA and os.path.isfile(os.path.join(KOK, klasor, ad)):
                yield yol


files, kabuk = {}, {}
for y in dosyalar():
    h = hashlib.sha256(open(os.path.join(KOK, *y.split("/")), "rb").read()).hexdigest()
    (kabuk if y in KABUK else files)[y] = h
surum = re.search(r'VERSION\s*=\s*"([^"]+)"', open(os.path.join(KOK, "server", "main.py"), encoding="utf-8").read()).group(1)
with open(os.path.join(KOK, "server", "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump({"version": surum, "files": files, "kabuk": kabuk}, f, indent=1, ensure_ascii=False)
    f.write("\n")
print(f"manifest: sürüm {surum}, {len(files)} dosya, {len(kabuk)} kabuk dosyası")
