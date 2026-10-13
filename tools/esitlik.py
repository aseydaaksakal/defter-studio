"""Defter Studio — yerel kopya ile GitHub Pages eşit mi? (yalnız standart kütüphane; depo kökünde çalıştırın)

    python3 tools/esitlik.py [--bekle SANİYE] [--base ADRES]

1) Pages'teki server/manifest.json, yerel manifestle AYNI olana dek (en çok 3 dk) yoklanır (yayın 1-2 dk sürer).
2) Manifestteki HER dosya (server, tools, kabuk, uygulama) Pages'ten indirilip özeti yerel dosyayla karşılaştırılır.
Çıkış kodu: 0 = EŞİT, 1 = fark var, 2 = ağ yok / Pages'e ulaşılamadı.
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.getenv("DEFTER_UPDATE_URL", "https://aseydaaksakal.github.io/defter-studio/").rstrip("/") + "/"


def al(base, yol, timeout=30):
    url = base + yol + "?t=" + str(int(time.time() * 1000))
    req = urllib.request.Request(url, headers={"User-Agent": "DefterStudio-esitlik", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def yerel_manifest(kok):
    with open(os.path.join(kok, "server", "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def dosyalar(m):
    out = {}
    for g in ("files", "kabuk", "app"):
        out.update(m.get(g) or {})
    return out


def main(argv, kok=KOK, base=BASE, aralik=10):
    bekle = 180
    if "--bekle" in argv:
        bekle = int(argv[argv.index("--bekle") + 1])
    if "--base" in argv:
        base = argv[argv.index("--base") + 1].rstrip("/") + "/"
    try:
        yerel = yerel_manifest(kok)
    except Exception as e:
        print(f"Yerel server/manifest.json okunamadı ({e}). Önce: python3 tools/uret-manifest.py")
        return 1
    bitis = time.time() + bekle
    canli, yazildi = None, False
    while True:
        try:
            canli = json.loads(al(base, "server/manifest.json", 20).decode("utf-8"))
        except Exception as e:
            if canli is None and time.time() >= bitis:
                print(f"Pages'e ulaşılamadı ({e}). İnternet bağlantınızı denetleyin; eşitlik doğrulanamadı.")
                return 2
            canli = None
        if canli is not None and canli == yerel:
            break
        if time.time() >= bitis:
            break
        if not yazildi:
            print(f"Pages manifesti yerelle henüz aynı değil (yerel {yerel.get('version')}, Pages {(canli or {}).get('version', '?')}); en çok {bekle} sn beklenecek...")
            yazildi = True
        time.sleep(aralik)
    if canli is None:
        print("Pages'e ulaşılamadı; eşitlik doğrulanamadı.")
        return 2
    fark = []
    if canli != yerel:
        fark.append(f"manifest: Pages sürümü {canli.get('version')} ≠ yerel {yerel.get('version')} (süre doldu, yayın bitmemiş olabilir)")
    ozet = dosyalar(yerel)
    for yol in sorted(ozet):
        try:
            with open(os.path.join(kok, *yol.split("/")), "rb") as f:
                y = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            fark.append(f"yerelde yok: {yol}")
            continue
        try:
            p = hashlib.sha256(al(base, yol, 60)).hexdigest()
        except urllib.error.HTTPError as e:
            fark.append(f"Pages'te yok ({e.code}): {yol}")
            continue
        except Exception as e:
            print(f"Ağ hatası ({yol}): {e}")
            return 2
        if p != y:
            fark.append(f"farklı: {yol}")
    if fark:
        print(f"EŞİT DEĞİL ({len(fark)} fark):")
        for x in fark[:60]:
            print("  - " + x)
        return 1
    print(f"EŞİT ({len(ozet)} dosya)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
