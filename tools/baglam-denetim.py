"""Bağlam denetimi: her çağrıda yüklenen sabit yükü ve kural dosyalarının sağlığını ölçer.

Kullanım:  python3 tools/baglam-denetim.py        (FAIL varsa çıkış kodu 1; teslim.sh çağırır)

Neden: harcamanın büyük kısmı bağlamın her çağrıda yeniden okunmasıdır; CLAUDE.md, ajan ve beceri açıklamaları
her turda bağlamdadır. "Yokluk başarı sayılmaz": ayar dosyasında kural gerçekten var mı, burada okunur.
Eşikler resmi belgelerden (code.claude.com/docs/en/costs, /skills, /model-config; 14.10.2026) ya da bu projenin kararlarından.
"""
import json
import os
import re
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONUC = []  # (durum, ad, ayrıntı)
TOKEN_KARAKTER = 3.5


def ekle(durum, ad, ayrinti):
    SONUC.append((durum, ad, ayrinti))


def oku(yol):
    try:
        with open(os.path.join(KOK, yol), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def kelime(t):
    return len(re.findall(r"\S+", t))


def tok(t):
    return round(len(t) / TOKEN_KARAKTER)


def on_madde(t):
    """YAML ön maddesi (--- ... ---) alanları ve gövde."""
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", t, re.S)
    if not m:
        return {}, t
    alan = {}
    for satir in m.group(1).splitlines():
        k, _, v = satir.partition(":")
        if v:
            alan[k.strip()] = v.strip()
    return alan, m.group(2)


def esik(ad, deger, uyari, hata, birim, ek=""):
    d = "FAIL" if deger > hata else "WARN" if deger > uyari else "OK"
    ekle(d, ad, f"{deger} {birim} (uyarı >{uyari}, hata >{hata}){ek}")


def denetle():
    sabit = 0
    # 1. CLAUDE.md: her oturumda ve her turda yüklenir
    t = oku("CLAUDE.md")
    if t is None:
        ekle("FAIL", "CLAUDE.md", "yok")
    else:
        sabit += tok(t)
        esik("CLAUDE.md kelime", kelime(t), 520, 600, "kelime")
        esik("CLAUDE.md satır", t.count("\n") + 1, 120, 200, "satır", " — resmi öneri <200")
        ekle("OK" if "# Compact instructions" in t else "WARN", "CLAUDE.md sıkıştırma talimatı", "var" if "# Compact instructions" in t else "yok: '# Compact instructions' bölümü ekle")
    # 2. Devir teslim ve AGENTS
    t = oku("DEVIR_TESLIM.md")
    if t:
        esik("DEVIR_TESLIM kelime", kelime(t), 360, 450, "kelime")
    t = oku("AGENTS.md")
    if t:
        sabit += tok(t)
        esik("AGENTS.md kelime", kelime(t), 100, 200, "kelime")
    # 3. Ajanlar: açıklamaları her turda bağlamda
    ajan_tok = 0
    ajan_dizin = os.path.join(KOK, ".claude", "agents")
    for ad in sorted(os.listdir(ajan_dizin)) if os.path.isdir(ajan_dizin) else []:
        t = oku(f".claude/agents/{ad}")
        alan, govde = on_madde(t or "")
        d = alan.get("description", "")
        ajan_tok += tok(d)
        model = alan.get("model", "")
        if model in ("", "inherit"):
            ekle("WARN", f"ajan {ad} model", "ana modeli devralır (Opus'ta 2x pahalı): model: sonnet/haiku yaz")
        if len(d) > 260:
            ekle("WARN", f"ajan {ad} açıklama", f"{len(d)} karakter; her turda bağlamda, kısalt")
        if kelime(govde) > 160:
            ekle("WARN", f"ajan {ad} gövde", f"{kelime(govde)} kelime; rol kartı kısa kalsın")
    ekle("OK", "ajan açıklamaları (her turda)", f"~{ajan_tok} token")
    sabit += ajan_tok
    # 4. Beceriler: açıklama her turda; gövde çağrılınca
    beceri_tok = 0
    bdizin = os.path.join(KOK, ".claude", "skills")
    for ad in sorted(os.listdir(bdizin)) if os.path.isdir(bdizin) else []:
        t = oku(f".claude/skills/{ad}/SKILL.md")
        if t is None:
            ekle("FAIL", f"beceri {ad}", "SKILL.md yok")
            continue
        alan, govde = on_madde(t)
        d = alan.get("description", "") + " " + alan.get("when_to_use", "")
        beceri_tok += tok(d)
        if len(d) > 1536:
            ekle("FAIL", f"beceri {ad} açıklama", f"{len(d)} karakter; 1.536'dan sonrası kesilir")
        elif len(d) > 450:
            ekle("WARN", f"beceri {ad} açıklama", f"{len(d)} karakter; her turda bağlamda, kısalt")
        if not re.search(r"[\"“”']\S", alan.get("description", "")):
            ekle("WARN", f"beceri {ad} tetik", "açıklamada kullanıcının yazacağı tırnaklı cümle yok")
        satir = t.count("\n") + 1
        esik(f"beceri {ad} satır", satir, 200, 500, "satır")
    ekle("OK", "beceri açıklamaları (her turda)", f"~{beceri_tok} token")
    sabit += beceri_tok
    # 5. Proje ayarı: kural gerçekten yazılı mı
    s = oku(".claude/settings.json")
    if s is None:
        ekle("FAIL", ".claude/settings.json", "yok: autoCompactWindow ve okuma yasağı tanımlı değil")
    else:
        try:
            j = json.loads(s)
        except ValueError:
            j = {}
            ekle("FAIL", ".claude/settings.json", "geçerli JSON değil")
        pencere = j.get("autoCompactWindow")
        if not pencere:
            ekle("FAIL", "otomatik sıkıştırma penceresi", "tanımsız: varsayılan ~967k, bağlam her çağrıda yeniden okunur")
        else:
            ekle("OK" if pencere <= 250000 else "WARN", "otomatik sıkıştırma penceresi", f"{pencere} token")
        yasak = " ".join((j.get("permissions") or {}).get("deny", []))
        for ornek in ("js/vendor", "kur.zip", "docs/token/veri.json"):
            ekle("OK" if ornek in yasak else "WARN", f"okuma yasağı {ornek}", "var" if ornek in yasak else "yok")
    # 6. En büyük izlenen metin dosyaları (bilgi)
    try:
        liste = subprocess.run(["git", "ls-files"], cwd=KOK, capture_output=True, text=True, timeout=20).stdout.split()
        boy = sorted(((os.path.getsize(os.path.join(KOK, f)), f) for f in liste
                      if os.path.isfile(os.path.join(KOK, f)) and not f.endswith((".png", ".zip", ".woff2", ".onnx", ".wasm", ".svg"))), reverse=True)[:4]
        ekle("OK", "en büyük dosyalar", "; ".join(f"{f} {b // 1024}KB" for b, f in boy))
    except Exception:
        pass
    ekle("OK", "sabit yük tahmini (her turda)", f"~{sabit} token (CLAUDE.md + AGENTS + ajan + beceri açıklamaları; sistem istemi ve araçlar hariç)")


def main():
    denetle()
    simge = {"OK": "✓", "WARN": "!", "FAIL": "✗"}
    for d, ad, a in SONUC:
        print(f" {simge[d]} {d:<4} {ad}: {a}")
    hata = sum(1 for d, _, _ in SONUC if d == "FAIL")
    uyari = sum(1 for d, _, _ in SONUC if d == "WARN")
    print(f"\nBağlam denetimi: {hata} hata, {uyari} uyarı.")
    return 1 if hata else 0


if __name__ == "__main__":
    sys.exit(main())
