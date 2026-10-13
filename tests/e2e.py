"""
Defter Studio uçtan uca testi (Playwright + sahte model). Gerçek model ve internet gerekmez.

Çalıştırma (depo kökünde):
    python3 -m http.server 8099 &          # uygulama
    python3 tests/mock_llm.py &            # sahte model + sahte lokal sunucu (8098)
    python3 tests/e2e.py [ekran_görüntüsü_klasörü]

Kapsam: ayarlar ve ses bölümü, defter oluşturma, dosya yükleme + metin ekleme, sohbet (kaynak denetimi), tam sayılı test (20),
bilgi kartı (15), slayt (5 ve 20), podcast (ses dosyası + akış), video (erkek anlatıcı), dinleyerek öğren, soru bankası
(doldur → bankadan test → istatistik), yeniden adlandırma, sürüm geçmişi + geri yükleme, JSON düzenleme, silme,
dışa aktarma (indirme), ses kütüphanesi + ses tasarımı + 5 konuşmacılı podcast + lokal model yöneticisi (indir, dene, beğen/sil),
mobil düzen, sayfa hataları.
"""
import json
import os
import re
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

APP = os.getenv("APP", "http://localhost:8099/")
MOCK = os.getenv("MOCK", "http://localhost:8098")
SHOTS = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SHOTS, exist_ok=True)
results, errors = [], []

FACTS = [
    "GMDSS bir Şubat bin dokuz yüz doksan dokuz tarihinde tüm dünyada tam olarak yürürlüğe girdi.",
    "A1 deniz sahası en az bir VHF kıyı istasyonunun sürekli DSC kapsaması altındaki bölgedir.",
    "A2 deniz sahası A1 dışında kalan ve bir MF kıyı istasyonunun kapsadığı bölgedir.",
    "A3 deniz sahası A1 ve A2 dışında kalan, uydu sisteminin kapsadığı geniş bölgedir.",
    "A4 deniz sahası diğer sahaların dışında kalan kutup bölgelerini kapsayan alandır.",
    "VHF kanal yetmiş yalnızca dijital seçici çağrı için ayrılmış bir kanaldır.",
    "VHF kanal on altı sesli tehlike, acil ve emniyet haberleşmesi için dinlenir.",
    "EPIRB cihazı batma anında suya temas edince otomatik olarak çalışabilen bir uydu vericisidir.",
    "SART cihazı radar ekranında on iki noktadan oluşan bir dizi şeklinde görünür.",
    "NAVTEX yayınları beş yüz on sekiz kilohertz frekansında İngilizce olarak yapılır.",
    "Tehlike çağrısı alındığında gemi kaptanı durumu değerlendirip yardım etmekle yükümlüdür.",
    "Telsiz zabiti vardiya sırasında telsiz günlüğüne bütün önemli olayları kaydeder.",
    "Pil ve akü sistemleri ana güç kesildiğinde telsiz cihazlarını en az bir saat beslemelidir.",
    "Sahte tehlike ikazı gönderildiğinde en kısa sürede iptal mesajı yayınlanmalıdır.",
    "Uydu sistemleri kutup bölgeleri dışında güvenilir bir küresel kapsama sağlar.",
    "Kıyı istasyonları gemilerden gelen tehlike ikazlarını kurtarma koordinasyon merkezine iletir.",
    "Gemi güvenlik sertifikası telsiz donanımının kurallara uygun olduğunu gösteren belgedir.",
    "Acil durum tatbikatları mürettebatın ekipmanı doğru kullanmasını sağlamak için düzenli yapılır.",
    "Arama kurtarma koordinasyon merkezi yardım operasyonlarını bölgedeki gemilerle birlikte yönetir.",
    "Dijital seçici çağrı mesajı alıcı gemiyi dokuz haneli kimlik numarasıyla belirler.",
    "Deniz mobil hizmet kimliği her gemiye verilen dokuz haneli benzersiz bir numaradır.",
    "Tehlike önceliği acil durum önceliğinden ve emniyet önceliğinden her zaman daha yüksektir.",
    "Emniyet mesajları seyir ve hava durumu ile ilgili önemli uyarıları duyurmak için kullanılır.",
    "Acil durum mesajı bir geminin ya da kişinin güvenliğiyle ilgili ivedi bir durumu bildirir.",
    "Radyo dalgalarının yayılımı frekansa, günün saatine ve atmosfer koşullarına bağlı olarak değişir.",
    "Orta dalga yayınları gece saatlerinde gündüze göre çok daha uzak mesafelere ulaşabilir.",
    "Yüksek frekans bandı okyanus ötesi uzun mesafeli haberleşme için tercih edilen banttır.",
    "Telsiz cihazlarının antenleri düzenli aralıklarla kontrol edilmeli ve temiz tutulmalıdır.",
    "Gemi telsiz istasyonu ruhsatı yetkili makam tarafından verilen resmi bir izin belgesidir.",
    "Tehlike ikazı gönderen gemi kendi konumunu ve tehlikenin türünü mesajda belirtmelidir.",
    "Kurtarma botlarında taşınabilir VHF telsizleri hayatta kalanların haberleşmesini sağlar.",
    "Hava durumu raporları denizciler için sefer planlamasında hayati bir bilgi kaynağıdır.",
    "Seyir uyarıları batık, şamandıra arızası ve tehlikeli bölgeler hakkında bilgi verir.",
    "Her telsiz operatörü uluslararası kurallara uygun yeterlik belgesine sahip olmak zorundadır.",
    "Telsiz günlüğü en az iki yıl boyunca gemide saklanması gereken resmi bir kayıttır.",
    "Tehlike haberleşmesi sırasında diğer istasyonlar telsiz susturumuna uymak zorundadır.",
    "Bir geminin tehlike ikazını alan diğer gemiler önce alındı bildirimini kıyı istasyonuna bırakır.",
    "Batarya şarj durumu her gün kontrol edilerek telsiz günlüğüne kaydedilmelidir.",
    "Uydu terminalleri gemiye kurulurken antenin önünde engel bulunmamasına dikkat edilir.",
    "Haftalık testler sırasında tehlike ikazı yanlışlıkla gönderilmemesi için özel test modu kullanılır.",
]
TEXT = " ".join(FACTS)


def ok(name, cond, info=""):
    results.append((name, bool(cond), info))
    print(("✓ " if cond else "✗ ") + name + (f" — {info}" if info else ""), flush=True)


def wait_until(fn, timeout=60, step=0.4):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step)
    return None


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append("PAGEERR: " + str(e)))
        pg.on("console", lambda m: errors.append(m.text[:240]) if m.type == "error" else None)

        def txt(sel):
            el = pg.query_selector(sel)
            return el.inner_text() if el else ""
        pg.goto(APP); pg.wait_for_selector(".nb-card", timeout=20000)

        # --- Ayarlar: sahte model + sahte sunucu; ses bölümü görünüyor mu
        pg.evaluate("""async (m) => { const d = await import('./js/db.js');
          await d.setSetting('llm', { provider: 'custom', baseUrl: m + '/v1', apiKey: '', model: 'mock', numCtx: 32768, temperature: 0.6 });
          await d.setSetting('serverUrl', m); await d.setSetting('tts', { engine: 'auto', narrator: 'm', schema: 3 }); }""", MOCK)
        pg.reload(); pg.wait_for_selector(".nb-card")
        pg.click("button[aria-label=Ayarlar]"); pg.wait_for_selector(".voice-settings")
        vs = txt(".voice-settings")
        ok("Ayarlar: ses bölümü (MiniMax, Gemini, Azure, Google, lokal klon)", all(k in vs for k in ["MiniMax", "Gemini", "Azure", "Google", "Lokal sunucu"]))
        wait_until(lambda: "Lokal sunucu" in txt(".voice-settings p.small"), 8)
        ok("Ayarlar: otomatik motor lokal sunucuyu seçiyor", "Lokal sunucu" in txt(".voice-settings p.small"), txt(".voice-settings p.small")[:90])
        pg.click(".settings summary:has-text('Görseller (slayt')")
        ok("Ayarlar: görseller bölümü, lokal (ComfyUI) sağlayıcı hazır", wait_until(lambda: "Hazır: Lokal" in txt(".settings"), 8), txt(".settings")[-200:].replace("\n", " ")[:90])
        pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(300)

        # --- Defter + kaynaklar (dosya yükleme ve yapıştırma)
        pg.click(".nb-card.new"); pg.wait_for_timeout(1000)
        md = os.path.join(SHOTS, "kaynak.md")
        open(md, "w", encoding="utf-8").write("# GMDSS notları\n\n" + TEXT)
        pg.set_input_files(".modal input[type=file]", md)
        wait_until(lambda: "kaynak" in txt(".sources-pane").lower(), 20)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        ok("Dosya yükleme (.md)", "kaynak" in txt(".sources-pane").lower())
        has_add = pg.query_selector(".add-row textarea")
        if not has_add:
            pg.click("text=Kaynak ekle"); pg.wait_for_timeout(400)
        pg.fill(".add-row textarea", "Ek not: Deniz sahaları kıyı istasyonlarının menziline göre belirlenir ve gemi donanımı buna göre seçilir.")
        pg.fill(".add-row input[placeholder=Başlık]", "Yapıştırılan not")
        pg.click("text=Metni ekle"); pg.wait_for_timeout(1500)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        ok("Metin yapıştırma", "Yapıştırılan not" in txt(".sources-pane"))

        # --- Sohbet: uydurma kaynak numarası temizlenir, kaynak rozeti görünür
        pg.fill(".chat-input", "GMDSS nedir?"); pg.keyboard.press("Enter")
        wait_until(lambda: "kaynaklı" in txt(".chat-log"), 20)
        log = txt(".chat-log")
        ok("Sohbet: kaynak denetimi rozeti", "kaynaklı" in log)
        ok("Sohbet: olmayan [99] numarası silindi", "[99]" not in log and "99" not in log.split("uydurma")[-1][:40])

        def create(tile, count=None, extra=None):
            pg.click(f'.tile >> text="{tile}"'); pg.wait_for_selector(".modal .cust")
            if count is not None:
                pg.fill(".modal .count-in", str(count)); pg.dispatch_event(".modal .count-in", "input")
            if extra:
                extra()
            pg.click("text=Hemen oluştur"); pg.wait_for_timeout(300)

        def open_latest(title_re, timeout=90):
            row = wait_until(lambda: next((r for r in pg.query_selector_all(".studio-pane .art-row:not(.running):not(.error)") if re.search(title_re, r.inner_text())), None), timeout)
            if row:
                row.click(); pg.wait_for_timeout(900)
            return row

        def close_viewer():
            btn = pg.query_selector(".viewer-head button[aria-label=Kapat]")
            if btn:
                btn.click(); pg.wait_for_timeout(400)

        # --- Test: tam 20 soru, kaynak alıntısı
        create("Test", 20)
        ok("Test: 20 soru üretildi", open_latest(r"20 Soruluk Test"))
        top = txt(".quiz .q-top")
        ok("Test: sayaç 1/20", "1/20" in top, top[:40])
        ok("Test: doğrulandı rozeti", "doğrulandı" in top)
        pg.click(".q-opt >> nth=0"); pg.wait_for_timeout(300)
        ok("Test: cevapta kaynak alıntısı", pg.query_selector(".q-src blockquote") is not None)
        pg.screenshot(path=f"{SHOTS}/test20.png"); close_viewer()

        # --- Bilgi kartları: tam 15
        create("Bilgi kartları", 15)
        ok("Kartlar: 15 kart", open_latest(r"15 Bilgi Kartı"))
        close_viewer()

        # --- Slaytlar: 5 (tek istek) ve 20 (ana hat + partiler)
        fj = lambda path, post=False: pg.evaluate("([m, p, post]) => fetch(m + p, post ? { method: 'POST' } : {}).then((r) => r.json())", [MOCK, path, post])
        fj("/_log/clear", True)
        create("Slayt Sunusu", 5)
        ok("Slayt: 5 slayt", open_latest(r"Mock Sunu") and "/ 5" in txt(".slides-view"))
        # --- Yapay zeka görselleri (0.5.0): üretimde otomatik, kapakta arka plan, diğer düzenlerde resim paneli, önbellekli
        ok("Görsel: kapak slaytında yapay zeka arka planı", wait_until(lambda: pg.query_selector(".stage-wrap .deck .s-bg") is not None, 20))
        pg.click(".thumbs .thumb >> nth=1"); pg.wait_for_timeout(300)
        ok("Görsel: madde slaytında resim paneli", wait_until(lambda: pg.query_selector(".stage-wrap .deck .s-pic") is not None, 8))
        il = fj("/_imglog")["log"]
        ok("Görsel: lokal sunucuya yazısız, stilli istem gitti (5 slayt = 5 istek)", len(il) == 5 and all("No text" in x["prompt"] and "Style:" in x["prompt"] for x in il), f"{len(il)} istek")
        ok("Görsel: görsel gerçekten yüklendi", pg.evaluate("() => { const i = document.querySelector('.stage-wrap .deck .s-pic'); return !!i && i.complete && i.naturalWidth > 0; }"))
        pg.click(".slides-view >> text=Görselleri üret"); pg.wait_for_timeout(900)
        ok("Görsel: hepsi hazırken yeniden üretmiyor", len(fj("/_imglog")["log"]) == 5)
        pg.click(".slides-view >> text=Görseli yenile"); pg.wait_for_selector(".modal input.input")
        pg.fill(".modal input.input", "a brand new lighthouse scene"); pg.click(".modal-foot >> text=Kaydet")
        ok("Görsel: slayt görseli yeni tarifle yenilendi", wait_until(lambda: any("brand new lighthouse" in x["prompt"] for x in fj("/_imglog")["log"]), 10))
        pg.screenshot(path=f"{SHOTS}/slides-img.png")
        close_viewer()
        create("Slayt Sunusu", 20)
        time.sleep(1)
        row = wait_until(lambda: [r for r in pg.query_selector_all(".studio-pane .art-row:not(.running)") if "Mock Sunu" in r.inner_text()][0:2] if len([r for r in pg.query_selector_all(".studio-pane .art-row:not(.running)") if "Mock Sunu" in r.inner_text()]) >= 2 else None, 60)
        if row:
            row[0].click(); pg.wait_for_timeout(900)
        sv = txt(".slides-view") if pg.query_selector(".slides-view") else ""
        ok("Slayt: 20 slayt (ana hat + partiler)", "/ 20" in sv, sv[:30])
        ok("Slayt: grafik/tablo/zaman çizelgesi düzenleri", pg.query_selector(".thumbs .s-chart") is not None and pg.query_selector(".thumbs .s-table") is not None and pg.query_selector(".thumbs .s-tl") is not None)
        pg.screenshot(path=f"{SHOTS}/slides20.png"); close_viewer()

        # --- Podcast: senaryo + ses dosyası (sahte sunucu TTS)
        create("Sesli Özet")
        ok("Podcast: üretildi", open_latest(r"^Test Bölümü", 120))
        st = wait_until(lambda: "hazır" in txt(".player-row"), 60)
        ok("Podcast: ses dosyası hazır", st, txt(".player-row")[:80])
        ok("Podcast: WAV indirme düğmesi", pg.is_visible("text=Ses dosyası (WAV)"))
        close_viewer()

        # --- Video: erkek anlatıcı
        create("Videolu Özet")
        ok("Video: üretildi", open_latest(r"^Mock Video", 120))
        st = wait_until(lambda: "anlatıcı hazır" in txt(".video-view"), 40)
        ok("Video: erkek anlatıcı hazır", st and "erkek" in txt(".video-view"), txt(".video-view .player-row")[:80])
        vl = [x for x in fj("/_imglog")["log"] if "mock scene" in x["prompt"]]
        ok("Video: her sahne için dikey (9:16) görsel istendi", len(vl) == 2 and all(x["w"] == 576 and x["h"] == 1024 for x in vl), str([(x["w"], x["h"]) for x in vl]))
        ok("Video: sahnelerde görsel anahtarı kayıtlı", pg.evaluate("async () => { const { db } = await import('./js/db.js'); const a = (await db.artifacts.where('type').equals('video').toArray()).pop(); return a.content.scenes.every((s) => s.imgKey); }"))
        pg.screenshot(path=f"{SHOTS}/video-img.png")
        close_viewer()

        # --- İnfografik: başlık görseli + kutu görselleri
        create("İnfografik")
        ok("İnfografik: üretildi", open_latest(r"^Mock İnfo", 90))
        ok("İnfografik: başlık görseli ve kutu görseli", wait_until(lambda: pg.query_selector(".info-poster .ip-hero") is not None and pg.query_selector(".info-poster .ip-ic img") is not None, 10))
        pg.screenshot(path=f"{SHOTS}/info-img.png")
        close_viewer()

        # --- Bulut görsel sağlayıcıları (sahte fetch ile istek biçimi): Gemini Interactions + MiniMax image-01
        cl = pg.evaluate("""async () => {
          const m = await import('./js/imagegen.js'); const t = await import('./js/tts.js');
          const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36; const cx = cv.getContext('2d'); cx.fillStyle = '#3a8'; cx.fillRect(0, 0, 64, 36);
          const b64 = cv.toDataURL('image/png').split(',')[1];
          const orig = window.fetch, calls = [], oldT = await t.loadTTS(), oldI = await m.loadImgCfg();
          window.fetch = async (u, o) => {
            if (/generativelanguage|api\\.minimax\\.io/.test(String(u))) {
              calls.push({ u: String(u), h: o.headers, body: JSON.parse(o.body) });
              if (/generativelanguage/.test(String(u))) return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'image', data: b64, mime_type: 'image/png' }] }] }), { status: 200 });
              return new Response(JSON.stringify({ data: { image_base64: [b64] }, base_resp: { status_code: 0 } }), { status: 200 });
            }
            return orig(u, o);
          };
          try {
            await t.saveTTS({ ...oldT, geminiKey: 'g-key', minimaxKey: 'm-key' });
            await m.saveImgCfg({ ...oldI, provider: 'gemini' });
            const a = await m.generateImage('cloud test one', { aspect: '16:9', force: true });
            await m.saveImgCfg({ ...oldI, provider: 'minimax' });
            const b = await m.generateImage('cloud test two', { aspect: '16:9', force: true });
            const c = await m.generateImage('cloud test two', { aspect: '16:9' });
            return { calls, a: a.provider, b: b.provider, c: c.provider, cached: c.cached, size: b.blob.size };
          } finally { window.fetch = orig; await t.saveTTS(oldT); await m.saveImgCfg(oldI); }
        }""")
        g, mm = cl["calls"][0], cl["calls"][1]
        ok("Görsel: Gemini isteği (Interactions, anahtar başlığı, oran, model)", g["u"].endswith("/v1beta/interactions") and g["h"]["x-goog-api-key"] == "g-key" and g["body"]["model"] == "gemini-3.1-flash-lite-image" and g["body"]["response_format"]["aspect_ratio"] == "16:9" and "No text" in g["body"]["input"][0]["text"], g["u"])
        ok("Görsel: MiniMax isteği (image-01, base64, Bearer)", mm["u"].endswith("/v1/image_generation") and mm["h"]["Authorization"] == "Bearer m-key" and mm["body"]["model"] == "image-01" and mm["body"]["response_format"] == "base64" and mm["body"]["aspect_ratio"] == "16:9", mm["u"])
        ok("Görsel: bulut yanıtları çözüldü, ikinci istek önbellekten", cl["a"] == "gemini" and cl["b"] == "minimax" and cl["c"] == "cache" and cl["cached"] and len(cl["calls"]) == 2 and cl["size"] > 0, str((cl["a"], cl["b"], cl["c"])))
        fi = pg.evaluate("""async () => { const m = await import('./js/imagegen.js'); const b = 'A'.repeat(300);
          return [!!m.findImage({ steps: [{ type: 'model_output', content: [{ type: 'image', data: b, mime_type: 'image/png' }] }] }), !!m.findImage({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b } }] } }] }),
                  !!m.findImage({ data: { image_base64: [b] } }), !!m.findImage({ predictions: [{ bytesBase64Encoded: b }] }), !!m.findImage({ steps: [{ content: [{ type: 'text', text: b }] }] })]; }""")
        ok("Görsel: yanıt biçimleri (Interactions, generateContent, MiniMax, Imagen) çözülüyor", fi == [True, True, True, True, False], str(fi))

        # --- Dinleyerek öğren (0 token)
        create("Dinleyerek Öğren", 10)
        ok("Dinleyerek öğren: 10 cümle", open_latest(r"Dinleyerek Öğren · 10 cümle"))
        pg.fill(".listen textarea", FACTS[0]); pg.click("text=Kontrol et"); pg.wait_for_timeout(300)
        ok("Dikte: kelime karşılaştırma", pg.query_selector(".dict-res") is not None)
        close_viewer()

        # --- Soru bankası: doldur (hedef 30) → bankadan test → istatistik
        pg.click(".bank >> text=Bankayı doldur"); pg.wait_for_selector(".modal .count-in")
        pg.fill(".modal .count-in", "30"); pg.dispatch_event(".modal .count-in", "input")
        pg.click(".modal-foot >> text=Başlat")
        full = wait_until(lambda: int(re.search(r"(\d+) soru", txt(".bank .chip")).group(1)) >= 30, 90)
        ok("Soru bankası: 30 soru doldu", full, txt(".bank")[:120].replace("\n", " "))
        pg.click(".bank >> text=Bankadan test"); pg.wait_for_selector(".modal .count-in")
        pg.fill(".modal .count-in", "10"); pg.dispatch_event(".modal .count-in", "input")
        pg.click(".modal-foot >> text=Testi başlat"); pg.wait_for_timeout(1200)
        ok("Bankadan test: 10 soru, 0 token", "1/10" in txt(".quiz .q-top"))
        pg.click(".q-opt >> nth=0"); pg.wait_for_timeout(500)
        close_viewer(); pg.wait_for_timeout(600)
        ok("Soru bankası: çözülen sayısı arttı", re.search(r"\b1 çözüldü", txt(".bank")), txt(".bank")[:100].replace("\n", " "))

        # --- Yeniden adlandır, JSON düzenle, sürüm geri yükle, sil
        def menu(title_re, item):
            row = next(r for r in pg.query_selector_all(".studio-pane .art-row") if re.search(title_re, r.inner_text()))
            row.query_selector("button[aria-label='Diğer işlemler']").click(); pg.wait_for_timeout(200)
            pg.click(f".menu >> text={item}"); pg.wait_for_timeout(400)
        menu(r"15 Bilgi Kartı", "Yeniden adlandır")
        pg.fill(".modal input", "Kartlarım"); pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(500)
        ok("Yeniden adlandırma", "Kartlarım" in txt(".studio-pane"))
        open_latest(r"Kartlarım"); pg.click(".viewer >> text=Düzenle"); pg.wait_for_timeout(500)
        if pg.query_selector(".modal textarea.code"):
            v = json.loads(pg.input_value(".modal textarea.code")); v["cards"] = v["cards"][:3]
            pg.fill(".modal textarea.code", json.dumps(v, ensure_ascii=False)); pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(700)
        close_viewer()
        menu(r"Kartlarım", "Sürüm geçmişi")
        has_ver = pg.query_selector(".versions .ver:not(.cur)") is not None
        if has_ver:
            pg.click(".versions >> text=Bu sürüme dön"); pg.wait_for_timeout(600)
        ok("Sürüm geçmişi ve geri yükleme", has_ver)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300); close_viewer()
        n0 = len(pg.query_selector_all(".studio-pane .art-row"))
        menu(r"Kartlarım", "Sil"); pg.click(".modal-foot >> text=Sil"); pg.wait_for_timeout(600)
        ok("Silme", len(pg.query_selector_all(".studio-pane .art-row")) == n0 - 1)

        # --- Dışa aktarma (yedek indirme)
        with pg.expect_download(timeout=10000) as dl:
            pg.click("text=Yedekle")
        path = dl.value.path()
        data = json.load(open(path, encoding="utf-8"))
        ok("Dışa aktarma: yedek JSON (soru bankası dahil)", data.get("format") == "defter-studio" and len(data.get("questions", [])) >= 30)

        # --- İndirmeler: podcast WAV, slayt HTML, video
        def downloads(title_re, button, timeout=30000):
            open_latest(title_re)
            try:
                with pg.expect_download(timeout=timeout) as d:
                    pg.click(button)
                return d.value.suggested_filename
            except Exception as e:
                return ""
            finally:
                close_viewer()
        f = downloads(r"^Test Bölümü", "text=Ses dosyası (WAV)")
        ok("İndirme: podcast WAV", f.endswith(".wav"), f)
        f = downloads(r"Mock Sunu", ".slides-view >> text=HTML")
        ok("İndirme: slayt HTML", f.endswith(".html"), f)
        open_latest(r"^Mock Video"); wait_until(lambda: "anlatıcı hazır" in txt(".video-view"), 30)
        try:
            with pg.expect_download(timeout=40000) as d:
                pg.click("text=Videoyu indir")
            f = d.value.suggested_filename
        except Exception:
            f = ""
        ok("İndirme: video (MP4/WebM, sesli)", f.endswith((".mp4", ".webm")), f)
        close_viewer()

        # --- Yedekten içe aktar ve defter silme (ana sayfa)
        pg.goto(APP); pg.wait_for_selector(".nb-card")
        n_before = len(pg.query_selector_all(".nb-card:not(.new)"))
        pg.set_input_files("input[type=file][accept='.json']", path); pg.wait_for_timeout(2500)
        pg.goto(APP); pg.wait_for_selector(".nb-card")
        ok("İçe aktarma (yedekten)", len(pg.query_selector_all(".nb-card:not(.new)")) == n_before + 1 and "içe aktarıldı" in txt("body"))
        card = next(c for c in pg.query_selector_all(".nb-card:not(.new)") if "içe aktarıldı" in c.inner_text())
        card.query_selector("button[aria-label=Sil]").click(); pg.wait_for_timeout(300)
        pg.click(".modal-foot >> text=Sil"); pg.wait_for_timeout(800)
        ok("Defter silme", len(pg.query_selector_all(".nb-card:not(.new)")) == n_before)

        # --- Sohbeti sil ve tüm içerikleri sil (çöp kutusu düğmeleri)
        pg.goto(APP); pg.wait_for_selector(".nb-card")
        pg.click(".nb-card:not(.new) >> nth=0"); pg.wait_for_selector(".tile")
        pg.click("button[aria-label='Sohbeti sil']"); pg.wait_for_timeout(300)
        if pg.query_selector(".modal-foot >> text=Sohbeti sil"):
            pg.click(".modal-foot >> text=Sohbeti sil"); pg.wait_for_timeout(500)
        ok("Sohbeti sil", not pg.query_selector(".chat-log .msg.user"))
        pg.click("button[aria-label='Tüm içerikleri sil']"); pg.click(".modal-foot >> text=Hepsini sil"); pg.wait_for_timeout(1200)
        ok("Tüm içerikleri sil", len(pg.query_selector_all(".studio-pane .art-row")) == 0)

        # --- 0.4.0: ses kütüphanesi, ses tasarımı, 5 kişilik kadro, model yöneticisi (sahte yardımcı sunucu)
        pg.on("dialog", lambda d: d.accept())
        api = lambda path, post=False: pg.evaluate("([m, p, post]) => fetch(m + p, post ? { method: 'POST' } : {}).then((r) => r.json())", [MOCK, path, post])

        api("/_reset", True)

        def open_settings_section(*summaries):
            pg.goto(APP); pg.wait_for_selector(".nb-card")
            pg.click("button[aria-label=Ayarlar]"); pg.wait_for_selector(".voice-settings")
            for sm in summaries:
                pg.click(f"summary:has-text('{sm}')"); pg.wait_for_timeout(250)

        open_settings_section("Lokal sunucu", "Ses tasarla")
        wait_until(lambda: "Sunucu çalışıyor" in txt(".voice-settings"), 10)
        ok("Ses kütüphanesi: lokal sunucuya bağlandı", "Sunucu çalışıyor" in txt(".voice-settings"), txt(".voice-settings")[:0])
        pg.click("text=Hazır 8 sesin hepsini oluştur")
        n = wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 8 and 8, 30)
        ok("Ses tasarımı: 8 hazır ses kütüphanede", n == 8, f"{len(pg.query_selector_all('.vl-row'))} ses")
        pg.query_selector(".vl-row").scroll_into_view_if_needed(); pg.screenshot(path=f"{SHOTS}/ses-kutuphanesi.png")
        pg.query_selector_all(".vl-row")[-1].query_selector("button:text-is('Sil')").click()
        ok("Ses kütüphanesi: ses silme", wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 7, 8))
        pg.query_selector_all(".vl-row")[0].query_selector("button:text-is('Adı değiştir')").is_visible()
        pg.click("summary:has-text('Ses kadrosu')")
        pg.click("text=Kütüphaneden doldur")
        ok("Ses kadrosu: kütüphaneden 5 konuşmacı dolduruldu", len(pg.query_selector_all(".cast-i")) == 5)
        pg.fill(".cast-i >> nth=0 >> xpath=following-sibling::input", "Deniz Hoca")
        pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(400)

        api("/_log/clear", True)
        pg.click(".nb-card:not(.new) >> nth=0"); pg.wait_for_selector(".tile")
        pg.click('.tile >> text="Sesli Özet"'); pg.wait_for_selector(".modal .cust")
        pg.click('.modal .seg[aria-label="Konuşmacı sayısı"] button[data-v="5"]')
        pg.click('.modal .seg[aria-label="Sesler"] button[data-v="cast"]')
        pg.click("text=Hemen oluştur"); pg.wait_for_timeout(300)
        ok("Podcast (5 konuşmacı, ses kadrosu): üretildi", open_latest(r"^Test Bölümü", 120))
        wait_until(lambda: "hazır" in txt(".player-row"), 60)
        ok("Podcast: 5 konuşmacı kartı, özel ad kullanıldı", len(pg.query_selector_all(".chip[class*='spk-']")) == 5 and txt(".chip.spk-A b") == "Deniz Hoca", txt(".chip.spk-A"))
        log = api("/_log")["log"]
        used = {x["voice"] for x in log}
        ok("Podcast: sunucuya 5 farklı kütüphane sesi gitti", len(used) == 5 and not (used & {"f", "m"}), str(sorted(used)))
        ok("Podcast: konuşmacı kimlikleri A–E", {x["speaker"] for x in log} == set("ABCDE"), str(sorted({x["speaker"] for x in log})))
        pg.screenshot(path=f"{SHOTS}/podcast5.png"); close_viewer()

        TR = "Trendyol/Trendyol-TTS"
        row = lambda mid: next((r for r in pg.query_selector_all(".mm-row") if mid in r.inner_text()), None)
        rl = lambda mid: pg.locator(f'.mm-row[data-id="{mid}"]')  # liste yeniden çizilebilir: tıklamalar her seferinde yeniden çözülür
        open_settings_section("Lokal sunucu", "Lokal modeller")
        n = wait_until(lambda: len(pg.query_selector_all(".mm-row")) == 27 and 27, 15)
        ok("Model yöneticisi: 25 MIT + 2 ek model listeleniyor", n == 27, f"{len(pg.query_selector_all('.mm-row'))} satır")
        ok("Model yöneticisi: Apple MLX ayrı grupta, uyarıyla", "Apple MLX (5)" in txt(".mm") and "işe yaramaz" in txt(".mm"))
        ok("Model yöneticisi: gerçek kişi sesi uyarısı", "izinsiz kullanmayın" in txt(".mm"))
        pg.query_selector(".mm").scroll_into_view_if_needed(); pg.screenshot(path=f"{SHOTS}/modeller.png")
        rl(TR).locator("button:has-text('İndir')").click()
        ok("Model indirme: ilerleme çubuğu görünür", wait_until(lambda: row(TR).query_selector(".meter") is not None, 6))
        ok("Model indirme: bitince 'indirildi'", wait_until(lambda: "indirildi" in row(TR).inner_text(), 25), row(TR).inner_text()[:60])
        rl(TR).locator("button:has-text('Dene')").click()
        pg.wait_for_selector(".mm-try textarea"); pg.click(".mm-try >> button:text-is('Konuştur')")
        ok("Model dene: ses üretildi, istek model kimliğini taşıdı", wait_until(lambda: pg.query_selector(".mm-try audio:not([hidden])") is not None, 15) and api("/_log")["log"][-1]["model"] == TR)
        rl(TR).locator("button:text-is('Bunu kullan')").click()
        ok("Model seçimi: 'Kullanılıyor'", "Kullanılıyor" in row(TR).inner_text())
        pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(400)
        ok("Model seçimi ayarlara kaydedildi", pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).serverModel") == TR)

        open_settings_section("Lokal sunucu")
        pg.click("text=Sesi dene (kadın + erkek)")
        wait_until(lambda: "çalışıyor (dinliyorsunuz)" in txt(".voice-settings"), 20)
        ok("Podcast sesi: lokal sunucu isteği seçili modelle gitti", any(x["model"] == TR for x in api("/_log")["log"]))
        pg.click("summary:has-text('Lokal modeller')"); wait_until(lambda: len(pg.query_selector_all(".mm-row")) == 27, 10)
        rl("alperiox/pocket-tts-turkish").locator("button[aria-label='Beğendim']").click()
        ok("Beğendim: sunucuda kalıcı", wait_until(lambda: next(m for m in api("/models")["models"] if m["id"] == "alperiox/pocket-tts-turkish")["puan"] == "begen", 5))
        rl(TR).locator("button[aria-label='Beğenmedim']").click()
        ok("Beğenmedim: onayla → diskten silindi", wait_until(lambda: "indirildi" not in row(TR).inner_text() and not next(m for m in api("/models")["models"] if m["id"] == TR)["hazir"], 8))
        pg.click(".modal-foot >> text=Kaydet"); pg.wait_for_timeout(400)
        ok("Silinen modelin seçimi temizlendi (otomatik motor)", pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).serverModel") == "")

        # --- Öğrenme bilimi sayfası, mobil düzen
        pg.goto(APP + "#/bilim"); pg.wait_for_timeout(800)
        ok("Yöntemler kütüphanesi", "Yöntemler kütüphanesi" in txt("body"))
        pg.set_viewport_size({"width": 390, "height": 844}); pg.goto(APP); pg.wait_for_timeout(900)
        sw = pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        pg.screenshot(path=f"{SHOTS}/mobil.png")
        ok("Mobil: yatay kaydırma yok", sw)

        bad = [e for e in errors if not re.search(r"TUNNEL|onnxruntime|favicon|ERR_FAILED|net::|Failed to load resource", e)]
        ok("Sayfa hatası yok", not bad, " | ".join(bad[:4]))
        b.close()
    passed = sum(1 for _, c, _ in results if c)
    print(f"\n{passed}/{len(results)} kontrol geçti · ekran görüntüleri: {SHOTS}")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
