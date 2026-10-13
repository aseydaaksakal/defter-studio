"""
Defter Studio — ses karşılaştırma aracı

Kurulu TTS motorlarını ve indirilmiş modelleri AYNI Türkçe cümlelerle kadın + erkek seslendirir ve
ses-ornekleri/<tarih>/index.html sayfasında yan yana dinletir. Her satırda süre, gerçek zaman çarpanı (RTF: üretim süresi /
ses süresi, 1'den küçükse gerçek zamandan hızlı) ve GPU belleği (nvidia-smi ile ölçülen artış) yazar.

  python karsilastir.py                         kurulu her motor ve her indirilmiş çalıştırılabilir model
  python karsilastir.py --hizli                 yalnız 2 cümle
  python karsilastir.py --motor edge,omnivoice  yalnız bu motorlar (omnivoice, voxcpm, chatterbox, pocket, xtts, edge)
  python karsilastir.py --model OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5,Trendyol/Trendyol-TTS
  python karsilastir.py --yok-model             yalnız motorlar (modelleri atla)

Hiçbir model kendiliğinden indirilmez (indirmek için tools\\modelleri-indir.bat). Klon motorları ses kütüphanesindeki
kadın/erkek referansları kullanır; hiç referans yoksa sırayla OmniVoice tasarımı, o da yoksa edge-tts (Emel/Ahmet) örneği
referans olarak üretilir (edge-tts resmî olmayan çevrimiçi Microsoft sesidir; kendi sesinizi eklemek daha iyidir).
Uygulamanın gerçek yolunu (main.py) kullandığı için buradaki sonuç podcast'te duyacağınızla aynıdır.
"""
import argparse
import asyncio
import gc
import html
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
import traceback
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

SEED_TEXT = "Merhaba, ben bu defterin sesiyim. Bugün konunun en önemli noktalarını sakin ve anlaşılır bir dille birlikte öğreneceğiz."
SENTENCES = [
    ("kısa", "Merhaba, ben Deniz. Bugün GMDSS sistemini birlikte, adım adım öğreneceğiz."),
    ("tarih ve sayı", "Ve nihai adım bir Şubat bin dokuz yüz doksan dokuzda atıldı. Bu tarihte GMDSS, dünya genelinde tüm yönleriyle tam olarak yürürlüğe girdi."),
    ("kısaltma", "Aynen öyle. Bir Ocak iki bin yirmi dörtte modernize edilen SOLAS Dördüncü Bölümü yürürlüğe girdi. Bu güncellemeyle A3 sahası artık sadece Inmarsat değil, Iridium da bu alanda tanındı."),
    ("soru ve ton", "Gerçekten mi? Peki acil bir durumda ilk olarak hangi kanalı dinlememiz gerekiyor, hatırlıyor musun?"),
    ("uzun paragraf", "Deniz sahaları, kıyı istasyonlarının menziline göre dörde ayrılır. A1 sahası, en az bir VHF kıyı istasyonunun sürekli kapsama alanındadır. "
                      "A2 sahası, A1 dışında kalan ve bir MF kıyı istasyonunun ulaştığı bölgedir. A3 sahası, uydu sisteminin kapsadığı geniş alandır. "
                      "A4 sahası ise kutup bölgelerini içerir. Gemi donanımı, seyrin yapılacağı sahaya göre seçilir; bu yüzden her telsiz zabiti sahaları ezbere bilmelidir."),
]
GENDERS = (("f", "Kadın"), ("m", "Erkek"))
ENGINE_ORDER = ["omnivoice", "voxcpm", "chatterbox", "pocket", "xtts", "edge"]


def gpu_used_mb():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5).stdout
        return max(int(x) for x in out.split() if x.isdigit())
    except Exception:
        return None


class Peak(threading.Thread):
    """Üretim sürerken GPU bellek kullanımının tepesini örnekler."""

    def __init__(self):
        super().__init__(daemon=True)
        self.stop = threading.Event()
        self.base = gpu_used_mb()
        self.peak = self.base

    def run(self):
        while not self.stop.is_set():
            v = gpu_used_mb()
            if v is not None and (self.peak is None or v > self.peak):
                self.peak = v
            time.sleep(0.5)

    def delta(self):
        return None if self.base is None or self.peak is None else max(0, self.peak - self.base)


def release(srv, adaptorler):
    """Yüklü modelleri bırak: sıradaki hedef boş GPU'da ölçülsün."""
    try:
        adaptorler.moss_kapat()
    except Exception:
        pass
    for mod in (srv, adaptorler):
        for obj in list(vars(mod).values()):
            if hasattr(obj, "cache_clear"):
                try:
                    obj.cache_clear()
                except Exception:
                    pass
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def audio_seconds(data):
    try:
        import soundfile as sf
        info = sf.info(io.BytesIO(data))
        return info.frames / info.samplerate
    except Exception:
        return None


def ensure_refs(srv):
    """Her cinsiyet için bir referans ses sağla (klon motorları ve MOSS için). Döner: notlar."""
    notes = []
    for g, ad in GENDERS:
        if srv.ref_for(g):
            continue
        made = None
        if srv.has("omnivoice"):
            try:
                srv._omni_ref(g)
                made = "OmniVoice tasarımı"
            except Exception as e:
                notes.append(f"{ad} referansı OmniVoice ile tasarlanamadı: {e}")
        if not made and srv.has("edge_tts"):
            try:
                import soundfile as sf
                mp3 = asyncio.run(srv.tts_edge(SEED_TEXT, g, "tr"))
                data, sr = sf.read(io.BytesIO(mp3), dtype="float32")
                name = "edge-kadin" if g == "f" else "edge-erkek"
                os.makedirs(srv.VOICES_DIR, exist_ok=True)
                sf.write(os.path.join(srv.VOICES_DIR, name + ".wav"), data, sr)
                srv._save_meta(name, {"gender": g, "label": f"edge-tts {ad} (referans örneği)", "source": "edge-tts", "engine": "edge", "text": SEED_TEXT, "textState": "var"})
                made = "edge-tts örneği (Emel/Ahmet)"
            except Exception as e:
                notes.append(f"{ad} referansı edge-tts ile üretilemedi: {e}")
        notes.append(f"{ad} referans sesi yoktu: {made}." if made else f"{ad} için referans ses yok; klon motorları atlanacak (Ayarlar › Lokal sunucu’dan ses ekleyin).")
    return notes


def build_targets(srv, modeller, adaptorler, args):
    t = []
    if not args.yok_motor:
        want = [x.strip() for x in args.motor.split(",") if x.strip()] if args.motor else None
        for e in [x for x in ENGINE_ORDER if x in srv.tts_engines()]:
            if want is None or e in want:
                t.append({"id": "motor:" + e, "ad": f"Motor: {e}", "tur": "motor", "eng": e, "param": ""})
    if not args.yok_model:
        want = [x.strip() for x in args.model.split(",") if x.strip()] if args.model else None
        for m in modeller.catalog():
            if not m.get("adaptor") or (want and m["id"] not in want):
                continue
            ok, why = adaptorler.durum(m["adaptor"])
            if not (modeller.is_ready(m["id"]) and ok):
                if want:
                    print(f"  atlandı: {m['id']} ({'indirilmemiş' if ok else why})")
                continue
            t.append({"id": m["id"], "ad": m["ad"], "tur": "model", "model": m["id"], "param": m.get("param", ""), "lisans": m.get("lisans", "")})
    return t


def synth(srv, tgt, text, g, ref):
    """Uygulamanın gerçek yolu: (bayt, uzantı)."""
    j = {"voice": None}
    if tgt["tur"] == "model":
        r = asyncio.run(srv._tts_model(tgt["model"], j, text, g, "tr", ref))
        return r.body, "wav"
    eng = tgt["eng"]
    if eng == "edge":
        return asyncio.run(srv.tts_edge(text, g, "tr")), "mp3"
    return srv._gpu_synth(eng, text, g, "tr", ref, j), "wav"


def main():
    ap = argparse.ArgumentParser(description="Türkçe TTS motorlarını/modellerini aynı cümlelerle karşılaştır")
    ap.add_argument("--hizli", action="store_true", help="yalnız 2 cümle")
    ap.add_argument("--motor", default="", help="virgülle: omnivoice,voxcpm,chatterbox,pocket,xtts,edge")
    ap.add_argument("--model", default="", help="virgülle model kimlikleri (katalogdan)")
    ap.add_argument("--yok-motor", action="store_true")
    ap.add_argument("--yok-model", action="store_true")
    ap.add_argument("--acma", action="store_true", help="tarayıcıda açma")
    args = ap.parse_args()

    import adaptorler
    import main as srv
    import modeller

    sentences = SENTENCES[:2] if args.hizli else SENTENCES
    out_dir = os.path.join(ROOT, "ses-ornekleri", time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)

    print("Referans sesler denetleniyor…")
    notes = ensure_refs(srv)
    for n in notes:
        print("  ·", n)
    targets = build_targets(srv, modeller, adaptorler, args)
    if not targets:
        print("\nKarşılaştırılacak motor/model bulunamadı. Önce tools\\kur-gpu.bat ya da tools\\modelleri-indir.bat çalıştırın.")
        return 1
    print(f"\n{len(targets)} hedef × {len(GENDERS)} ses × {len(sentences)} cümle. Çıktı: {out_dir}\n")

    report = []
    for tgt in targets:
        print(f"▶ {tgt['ad']} {tgt.get('param', '')}")
        res = {"id": tgt["id"], "ad": tgt["ad"], "param": tgt.get("param", ""), "lisans": tgt.get("lisans", ""), "tur": tgt["tur"], "ornekler": [], "hata": None}
        release(srv, adaptorler)
        peak = Peak(); peak.start()
        total_gen = total_audio = 0.0
        failed = False
        for g, gad in GENDERS:
            if failed:
                break
            ref = srv.ref_for(g)
            for si, (sad, text) in enumerate(sentences):
                t0 = time.time()
                try:
                    data, ext = synth(srv, tgt, text, g, ref)
                except Exception as e:
                    msg = e.detail if hasattr(e, "detail") else str(e)
                    res["hata"] = f"{gad}: {msg}"[:500]
                    print(f"   ✗ {gad} / {sad}: {msg}"[:300])
                    if not isinstance(e, LookupError) and "HTTPException" not in type(e).__name__:
                        traceback.print_exc(limit=2)
                    failed = True
                    break
                dt = time.time() - t0
                secs = audio_seconds(data)
                name = re.sub(r"[^A-Za-z0-9._-]+", "_", tgt["id"]) + f"__{g}__{si + 1}.{ext}"
                with open(os.path.join(out_dir, name), "wb") as fh:
                    fh.write(data)
                total_gen += dt
                total_audio += secs or 0
                res["ornekler"].append({"cinsiyet": g, "cumle": si, "dosya": name, "uretim_sn": round(dt, 1), "ses_sn": round(secs, 1) if secs else None})
                print(f"   ✓ {gad} / {sad}: üretim {dt:.1f} sn" + (f", ses {secs:.1f} sn" if secs else ""))
        peak.stop.set()
        res["rtf"] = round(total_gen / total_audio, 2) if total_audio else None
        res["vram_mb"] = peak.delta()
        report.append(res)
        release(srv, adaptorler)

    with open(os.path.join(out_dir, "rapor.json"), "w", encoding="utf-8") as fh:
        json.dump({"cumleler": [{"ad": a, "metin": t} for a, t in sentences], "notlar": notes, "sonuclar": report}, fh, ensure_ascii=False, indent=1)
    page = html_page(sentences, report, notes)
    idx = os.path.join(out_dir, "index.html")
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write(page)
    print("\n" + "=" * 70)
    print(f"{'Hedef':44} {'Durum':8} {'RTF':>6} {'GPU belleği':>12}")
    for r in report:
        d = "✓" if r["ornekler"] and not r["hata"] else ("kısmi" if r["ornekler"] else "✗")
        vm = f"{r['vram_mb'] / 1024:.1f} GB" if r["vram_mb"] else "-"
        print(f"{(r['ad'] + ' ' + r['param'])[:43]:44} {d:8} {r['rtf'] if r['rtf'] is not None else '-':>6} {vm:>12}")
    print(f"\nDinlemek için: {idx}")
    if not args.acma:
        try:
            webbrowser.open("file:///" + idx.replace("\\", "/"))
        except Exception:
            pass
    return 0


def html_page(sentences, report, notes):
    e = html.escape
    rows = []
    for r in report:
        d = "✓" if r["ornekler"] and not r["hata"] else ("kısmi" if r["ornekler"] else "✗")
        vm = f"{r['vram_mb'] / 1024:.1f} GB" if r["vram_mb"] else "–"
        rows.append(f"<tr><td>{e(r['ad'])}</td><td>{e(r['param'])}</td><td>{e(r['lisans'])}</td><td>{d}</td><td>{r['rtf'] if r['rtf'] is not None else '–'}</td><td>{vm}</td><td>{e(r['hata'] or '')}</td></tr>")
    blocks = []
    for si, (sad, text) in enumerate(sentences):
        cells = []
        for r in report:
            for g, gad in GENDERS:
                ex = next((x for x in r["ornekler"] if x["cinsiyet"] == g and x["cumle"] == si), None)
                if ex:
                    cells.append(f"<div class='c'><b>{e(r['ad'])}</b> · {gad} <small>({ex['uretim_sn']} sn)</small><br><audio controls preload='none' src='{e(ex['dosya'])}'></audio></div>")
        blocks.append(f"<h3>{si + 1}. {e(sad)}</h3><p class='t'>{e(text)}</p><div class='g'>{''.join(cells)}</div>")
    note_html = "".join(f"<li>{e(n)}</li>" for n in notes)
    return f"""<!doctype html><meta charset="utf-8"><title>Ses karşılaştırması</title>
<style>body{{font:15px system-ui;background:#16181d;color:#e8eaf0;max-width:1100px;margin:24px auto;padding:0 16px}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #333;padding:6px 8px;text-align:left}}
.t{{color:#aab;font-style:italic}}.g{{display:flex;flex-wrap:wrap;gap:10px}}.c{{background:#20232b;border-radius:8px;padding:8px 10px;min-width:280px}}
audio{{width:260px;margin-top:4px}}small{{color:#889}}</style>
<h1>Ses karşılaştırması</h1>
<p>Aynı cümleler, aynı referans sesler. <b>RTF</b> = üretim süresi / ses süresi (1'den küçük = gerçek zamandan hızlı). GPU belleği nvidia-smi ile ölçülen artıştır.
Dinlerken şunlara bakın: kadın/erkek ayrımı net mi, 5. paragrafta ses bozuluyor mu, sayılar ve kısaltmalar doğru okunuyor mu, nefes ve tonlama doğal mı.</p>
{'<ul>' + note_html + '</ul>' if note_html else ''}
<table><tr><th>Hedef</th><th>Parametre</th><th>Lisans</th><th>Durum</th><th>RTF</th><th>GPU belleği</th><th>Hata</th></tr>{''.join(rows)}</table>
{''.join(blocks)}"""


if __name__ == "__main__":
    sys.exit(main())
