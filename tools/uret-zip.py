"""kur.zip üretir (içinde yalnız kur.bat): Chrome .bat'ı engelleyebildiği için zip olarak da indirilebilir. teslim.sh çalıştırır."""
import os, zipfile
k = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with zipfile.ZipFile(os.path.join(k, "kur.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    zi = zipfile.ZipInfo("kur.bat", (2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(zi, open(os.path.join(k, "tools", "kur.bat"), "rb").read())
print("kur.zip üretildi")
