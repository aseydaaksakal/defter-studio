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
_ARGS = [a for a in sys.argv[1:] if not a.startswith("-")]  # -v: her kontrolü yaz
SHOTS = _ARGS[0] if _ARGS else tempfile.mkdtemp()
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


AYRINTI = "-v" in sys.argv or os.getenv("DEFTER_TEST_AYRINTI") == "1"


def ok(name, cond, info=""):
    results.append((name, bool(cond), info))
    if cond and not AYRINTI:  # token ekonomisi: varsayılan çıktı yalnız ✗ + özet (her satır ajan bağlamına girer)
        return
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

        pg.evaluate("(m) => fetch(m + '/_reset', { method: 'POST' })", MOCK)  # sahte sunucu önceki çalıştırmadan temiz başlasın
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
        # Sunucu kendini günceller: bat çalıştırmadan düğmeyle
        pg.click(".settings >> text=Bağlan / kontrol et")
        ok("Sunucu güncelleme: yeni sürüm bildirilir", wait_until(lambda: "Yeni sürüm var" in txt(".settings"), 8), txt(".settings")[-300:].replace("\n", " ")[:120])
        pg.click(".settings button:text-is('Sunucuyu güncelle')")
        ok("Sunucu güncelleme: düğme uygular ve yeniden başlatılacağını söyler", wait_until(lambda: "yeniden başlıyor" in txt(".settings"), 8))
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

        # --- Video v2: kelime düzeyinde altyazı, sahneler arası geçiş, hızlı MP4 (lokal sunucuda ffmpeg)
        v2 = pg.evaluate("""async () => {
          const m = await import('./js/studio/views/video.js');
          const plan = m.wordPlan('Bir iki üç. Dört beş altı yedi.');
          const c1 = m.wordCaption(plan, 0.05), c2 = m.wordCaption(plan, 0.95);
          const sc = [{ title: 'Birinci sahne', icon: '⚓', bullets: ['a'], narration: 'x' }, { title: 'İkinci sahne', icon: '🌊', bullets: ['b'], narration: 'y' }];
          const mk = () => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; return c; };
          const url = (fn) => { const c = mk(); fn(c.getContext('2d')); return c.toDataURL(); };
          const prevFinal = url((x) => m.drawScene(x, 320, 180, sc[0], 0, 1, 2, 'night', 'T', ''));
          const nextPure = url((x) => m.drawScene(x, 320, 180, sc[1], 1, 0.5, 2, 'night', 'T', ''));
          const f0 = url((x) => m.drawFrame(x, 320, 180, sc, 1, 0.5, 0, 'night', 'T', ''));
          const fMid = url((x) => m.drawFrame(x, 320, 180, sc, 1, 0.5, m.TRANSITION_SEC / 2, 'night', 'T', ''));
          const fEnd = url((x) => m.drawFrame(x, 320, 180, sc, 1, 0.5, m.TRANSITION_SEC + 0.2, 'night', 'T', ''));
          const capOn = url((x) => m.drawFrame(x, 320, 180, sc, 1, 0.5, 5, 'night', 'T', m.wordCaption(m.wordPlan('Merhaba sevgili denizciler'), 0.5)));
          const capOff = url((x) => m.drawFrame(x, 320, 180, sc, 1, 0.5, 5, 'night', 'T', ''));
          return { n: plan.length, s0: plan[2].sent, s1: plan[3].sent, c1: c1.words.map((w) => w.t + ':' + w.state).join(' '), c2: c2.words.map((w) => w.t + ':' + w.state).join(' '),
                   start: f0 === prevFinal, mid: fMid !== prevFinal && fMid !== nextPure, end: fEnd === nextPure, cap: capOn !== capOff };
        }""")
        ok("Video v2: kelime planı cümleleri ayırır, okunan kelime 'now' olur", v2["n"] == 7 and v2["s0"] == 0 and v2["s1"] == 1 and v2["c1"].startswith("Bir:now") and v2["c2"].endswith("yedi.:now") and "Dört:past" in v2["c2"], f'{v2["c1"]} | {v2["c2"]}')
        ok("Video v2: geçiş başında önceki sahne, ortasında karışım, sonunda yeni sahne", v2["start"] and v2["mid"] and v2["end"], str((v2["start"], v2["mid"], v2["end"])))
        ok("Video v2: kelime altyazısı çizilir", v2["cap"])
        ok("Video v2: altyazı kipi düğmesi döner (kelime → cümle → kapalı)", wait_until(lambda: "kelime" in txt(".video-view .player-ctrl"), 5))
        pg.click(".video-view >> text=Altyazı: kelime"); pg.wait_for_timeout(200)
        ok("Video v2: altyazı kipi cümleye geçti", "cümle" in txt(".video-view .player-ctrl"))
        pg.click(".video-view >> text=Altyazı: cümle"); pg.click(".video-view >> text=Altyazı: kapalı"); pg.wait_for_timeout(200)
        ok("Video v2: kapalıdan başa dönüş (kelime)", "Altyazı: kelime" in txt(".video-view .player-ctrl"))
        ok("Video v2: lokal sunucuda ffmpeg varsa 'Hızlı MP4' düğmesi görünür", wait_until(lambda: pg.query_selector(".video-view button:has-text('Hızlı MP4'):not([hidden])") is not None, 10))
        with pg.expect_download(timeout=60000) as dl:
            pg.click(".video-view button:has-text('Hızlı MP4')")
        vf = dl.value.suggested_filename
        mv = fj("/_video")
        ok("Hızlı MP4: .mp4 indirildi", vf.endswith(".mp4"), vf)
        ok("Hızlı MP4: kareler JPEG olarak toplu gitti, ses + 24 fps + 720x1280 bildirildi", mv.get("finished") and mv.get("jpeg_ok") and mv.get("frames", 0) >= 48 and mv.get("batches", 0) >= 2 and mv.get("fps") == "24" and (mv.get("w"), mv.get("h")) == ("720", "1280") and mv.get("audio", 0) > 1000, str(mv))
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

        # --- 0.8.0: Ses stüdyosu (kütüphane, tek tıkla yeni ses, karakterler, modeller) — sahte yardımcı sunucu
        pg.on("dialog", lambda d: d.accept())
        api = lambda path, post=False: pg.evaluate("([m, p, post]) => fetch(m + p, post ? { method: 'POST' } : {}).then((r) => r.json())", [MOCK, path, post])

        api("/_reset", True)

        def open_studio(*summaries):
            pg.goto(APP); pg.wait_for_selector(".nb-card")
            pg.click("button[aria-label='Ses stüdyosu']"); pg.wait_for_selector(".studio")
            for sm in summaries:
                pg.click(f".studio summary:has-text('{sm}')"); pg.wait_for_timeout(250)

        def close_studio():
            pg.keyboard.press("Escape"); pg.wait_for_timeout(700)

        open_studio()
        ok("Ses stüdyosu: üst çubuktaki düğmeyle açılır, lokal sunucuya bağlandı", wait_until(lambda: "Sunucu çalışıyor" in txt(".studio"), 10), txt(".studio")[:60])
        close_studio()
        icons = pg.eval_on_selector_all("header.topbar button.icon-btn, header.topbar a.icon-btn", "(bs) => bs.map((b) => [b.getAttribute('aria-label'), b.querySelector('path')?.getAttribute('d') || ''])")
        ds = [d for _, d in icons if d]
        ok("Üst çubuk: simge çiftlenmesi yok (her düğmenin simgesi farklı)", len(ds) == len(set(ds)) and len(ds) >= 4, str([n for n, _ in icons]))
        ok("Üst çubuk: 'Ses efektleri' kalktı; 'Alıştırma sesleri' açık adla, tooltip ne yaptığını söylüyor", pg.query_selector("button[aria-label='Ses efektleri']") is None and "doğru/yanlış" in (pg.get_attribute("#fx-btn", "title") or ""))
        pg.click("#fx-btn")
        ok("Alıştırma sesleri düğmesi ayarı değiştirir (ds-sound)", pg.evaluate("() => localStorage.getItem('ds-sound')") == "off" and pg.get_attribute("#fx-btn", "aria-pressed") == "false")
        pg.click("#fx-btn")
        ok("Alıştırma sesleri tekrar açılır", pg.evaluate("() => localStorage.getItem('ds-sound')") == "on")
        pg.click("button[aria-label='Ses stüdyosu']"); pg.wait_for_selector(".studio")
        ok("Motor durumu: çalışan motor yeşil '✓ … çalışıyor'", wait_until(lambda: "✓ VoxCPM2 çalışıyor" in txt(".studio .engines") and "✓ Pocket TR çalışıyor" in txt(".studio .engines"), 10), txt(".studio .engines")[:160])
        ok("Motor durumu: paketi var ama hatalı motor kırmızı '✗ …: hata' + kur.bat ipucu", "✗ OmniVoice: ekran kartı belleği yetmedi" in txt(".studio .engines") and "kur.bat" in txt(".studio"), txt(".studio .engines")[:200])
        ok("Motor durumu: hiç olmayan motor gri 'kurulu değil' (Edge dahil çalışanlar hariç)", pg.query_selector(".studio .engines .chip.engine-bad") is not None and "Sunucu çalışıyor" in txt(".studio") and "Lokal sunucu çalışmıyor" not in txt(".studio"))
        ok("Ses stüdyosu: ses yokken 'Pocket TR kur' düğmesi görünür", pg.is_visible(".studio button:has-text('Pocket TR kur')"))
        pg.click(".studio button:has-text('Pocket TR kur')")
        n = wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 6 and 6, 20)
        ok("Pocket TR arayüzden kuruldu: 3 kadın + 3 erkek hazır ses", n == 6, f"{len(pg.query_selector_all('.vl-row'))} ses")
        pg.click(".studio button:has-text('Yeni kadın sesi üret')")
        ok("Yeni kadın sesi tek tıkla üretildi", wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 7, 10))
        pg.click(".studio button:has-text('Yeni erkek sesi üret')")
        ok("Yeni erkek sesi tek tıkla üretildi", wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 8, 10))
        pg.query_selector(".vl-row").scroll_into_view_if_needed(); pg.screenshot(path=f"{SHOTS}/ses-studyosu.png")
        pg.query_selector_all(".vl-row")[-1].query_selector("button:text-is('Sil')").click()
        ok("Ses kütüphanesi: ses silme", wait_until(lambda: len(pg.query_selector_all(".vl-row")) == 7, 8))
        ok("Ses kütüphanesi: üretilen seste 'Adı' düğmesi, hazır seste yok", pg.query_selector_all(".vl-row")[-1].query_selector("button:text-is('Adı')") is not None and pg.query_selector_all(".vl-row")[0].query_selector("button:text-is('Adı')") is None)
        pg.click("text=Hazır kadro: Ayşe")
        ok("Karakterler: hazır kadro 4 kişi (Ayşe, Fatma, Hasan, Hüseyin)", len(pg.query_selector_all(".cast-i")) == 4 and pg.input_value(".cast-row >> nth=3 >> input") == "Hüseyin")
        pg.click("text=+ Karakter ekle")
        ok("Karakterler: 5. karakter eklendi", len(pg.query_selector_all(".cast-i")) == 5)
        pg.fill(".cast-row >> nth=0 >> input", "Deniz Hoca")
        pg.locator(".cast-row >> nth=4 >> select").nth(1).select_option(index=3)  # 5. karaktere farklı bir kadın sesi
        close_studio()
        ok("Ses stüdyosu: kadro kendiliğinden kaydedildi", pg.evaluate("async () => { const c = (await (await import('./js/tts.js')).loadTTS()).cast; return c.length === 5 && c[0].name === 'Deniz Hoca' && c.every((x) => x.voice); }"))

        ok("Kadro sunucuya yazıldı (PUT /cast): 5 karakter, ad ve ses dahil", wait_until(lambda: len(api("/cast")["cast"]) == 5 and api("/cast")["cast"][0]["name"] == "Deniz Hoca" and all(c["voice"] for c in api("/cast")["cast"]), 8))
        # başka tarayıcı kökeni benzetimi: yerel depolar boş, kadro yalnız sunucuda
        pg.evaluate("async () => { localStorage.removeItem('ds-cast'); const d = await import('./js/db.js'); await d.setSetting('tts', { ...(await d.getSetting('tts', {})), cast: [] }); }")
        pg.reload(); pg.wait_for_selector(".nb-card")
        ok("Kadro sunucudan yüklenir (yerel depo boşken, açılışta GET /cast)", wait_until(lambda: pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).cast.length") == 5, 10))
        # sunucu boş, yerelde var -> yerel kadro sunucuya taşınır; sunucu yoksa localStorage yedeği
        pg.evaluate("async (m) => { await fetch(m + '/cast', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cast: [] }) }); }", MOCK)
        pg.reload(); pg.wait_for_selector(".nb-card")
        ok("Sunucuda kadro yokken yerel kadro sunucuya taşınır", wait_until(lambda: len(api("/cast")["cast"]) == 5, 10))
        ok("Kadro yerel yedeği (localStorage) tutulur", pg.evaluate("() => JSON.parse(localStorage.getItem('ds-cast') || '[]').length") == 5)
        api("/_log/clear", True)
        pg.click(".nb-card:not(.new) >> nth=0"); pg.wait_for_selector(".tile")
        pg.click('.tile >> text="Sesli Özet"'); pg.wait_for_selector(".modal .cust")
        pg.click('.modal .seg[aria-label="Sesler"] button[data-v="cast"]')
        # 'Karakterlerim' seçilince kadro listesi: her karakterin yanında ▶ dinle, ses seçici ve kaç kişilik konuşma
        ok("Podcast seçenekleri: 'Karakterlerim' kadro listesini açar (5 karakter, ▶ ve ses seçici)", wait_until(lambda: len(pg.query_selector_all(".cast-pick-row")) == 5, 10) and len(pg.query_selector_all(".cast-pick-row button")) == 5 and len(pg.query_selector_all(".cast-pick-row select")) == 5)
        ok("Podcast seçenekleri: kadro varken eski 'Konuşmacı sayısı' gizli, yerine 'N kişilik konuşma'", not pg.is_visible('.modal .seg[aria-label="Konuşmacı sayısı"]') and "5 kişilik konuşma" in txt(".cast-sum"))
        api("/_log/clear", True)
        pg.locator(".cast-pick-row button").nth(1).click()
        ok("Podcast seçenekleri: karakter ▶ ile dinlenir (sunucuya o karakterin sesi gitti)", wait_until(lambda: len(api("/_log")["log"]) == 1 and api("/_log")["log"][0]["voice"] not in ("f", "m", ""), 8), str(api("/_log")["log"]))
        pg.click(".cast-pick .chip:has-text('3 kişi')")
        ok("Podcast seçenekleri: '3 kişi' seçilince 3 kişilik konuşma", "3 kişilik konuşma" in txt(".cast-sum") and len(pg.query_selector_all(".cast-pick-row input:checked")) == 3)
        pg.screenshot(path=f"{SHOTS}/podcast-kadro-secimi.png")
        pg.click(".cast-pick .chip:has-text('Hepsi')")
        api("/_log/clear", True)
        pg.click("text=Hemen oluştur"); pg.wait_for_timeout(300)
        ok("Podcast (5 konuşmacı, karakterlerim): üretildi", open_latest(r"^Test Bölümü", 120))
        wait_until(lambda: "hazır" in txt(".player-row"), 60)
        ok("Podcast: 5 konuşmacı kartı, özel ad kullanıldı", len(pg.query_selector_all(".chip[class*='spk-']")) == 5 and txt(".chip.spk-A b") == "Deniz Hoca", txt(".chip.spk-A"))
        log = api("/_log")["log"]
        used = {x["voice"] for x in log}
        ok("Podcast: sunucuya 5 farklı kütüphane sesi gitti", len(used) == 5 and not (used & {"f", "m"}), str(sorted(used)))
        ok("Podcast: konuşmacı kimlikleri A–E", {x["speaker"] for x in log} == set("ABCDE"), str(sorted({x["speaker"] for x in log})))
        pg.screenshot(path=f"{SHOTS}/podcast5.png")
        # Satır başına konuşmacı: seçici bütün kadroyu (betik konuşmacıları + karakterler + hazır sesler) listeler
        sel = pg.query_selector(".tline-sel")
        ok("Podcast: her satırda konuşmacı seçici var", sel is not None)
        groups = pg.eval_on_selector(".tline-sel", "(s) => [...s.querySelectorAll('optgroup')].map((g) => [g.label, g.children.length])")
        gd = dict(groups)
        ok("Podcast: satır seçicisi bütün kadroyu listeler (5 konuşmacı + 5 karakter + hazır sesler)", gd.get("Bu podcast") == 5 and gd.get("Karakterlerim") == 5 and gd.get("Hazır sesler", 0) >= 6, str(groups))
        n_lines = len(pg.query_selector_all(".tline"))
        api("/_log/clear", True)
        first = pg.query_selector_all(".tline-sel")[0]
        first.select_option(label="Pocket erkek 2 · erkek")
        ok("Podcast: satırın konuşmacısı hazır sesle değişti, 'Değişiklikleri uygula' göründü", first.input_value() == "v:pt-erkek-2" and pg.is_visible("button:has-text('Değişiklikleri uygula')"))
        pg.locator(".tline-play").nth(0).click()
        ok("Podcast: değişen satır yeni sesle dinlenir (▶ sunucuya hazır sesi gönderdi)", wait_until(lambda: any(x["voice"] == "pt-erkek-2" for x in api("/_log")["log"]), 10), str(api("/_log")["log"]))
        api("/_log/clear", True)
        pg.click("button:has-text('Değişiklikleri uygula')")
        pg.wait_for_timeout(500)
        wait_until(lambda: "hazır" in txt(".player-row"), 60)
        lg = api("/_log")["log"]
        ok("Podcast: konuşmacı değişince yalnız o satır yeniden üretildi", len(lg) == 1 and lg[0]["voice"] == "pt-erkek-2", f"{len(lg)} istek / {n_lines} satır")
        ok("Podcast: yeniden açılınca seçim korundu", pg.query_selector_all(".tline-sel")[0].input_value() == "v:pt-erkek-2")
        pg.screenshot(path=f"{SHOTS}/podcast-satir-konusmaci.png")
        # Karakterler ve sesler paneli: kadro + hazır sesler ▶ ile dinletir
        pg.click(".cast-panel summary")
        ok("Karakterler paneli: kadro (5) ve hazır sesler listelenir", wait_until(lambda: len(pg.query_selector_all(".cast-panel [data-roster]")) == 5, 8))
        pg.click(".cast-panel details summary")
        ok("Karakterler paneli: hazır sesler açılır listede", wait_until(lambda: len(pg.query_selector_all(".cast-panel [data-voice]")) >= 6, 8))
        api("/_log/clear", True)
        pg.locator(".cast-panel [data-voice='pt-kadin-2'] button").click()
        ok("Karakterler paneli: hazır ses ▶ ile dinlenir", wait_until(lambda: any(x["voice"] == "pt-kadin-2" for x in api("/_log")["log"]), 8))
        api("/_log/clear", True)
        pg.locator(".cast-panel [data-roster] button").nth(0).click()
        ok("Karakterler paneli: kadro karakteri ▶ ile dinlenir", wait_until(lambda: len(api("/_log")["log"]) == 1, 8))
        # Motor hata verince 'Ses durdu' ham JSON/DLL yolu göstermez; sade neden + tek eylem
        api("/_tts_fail?after=0&dll=1", True)
        pg.click("button:has-text('Sesi yeniden üret')")
        ok("Podcast: motor hatasında sade Türkçe ileti (ham JSON ve DLL yolu yok)", wait_until(lambda: "Ses durdu" in txt(".player-row"), 30) and '{"detail"' not in txt(".player-row") and "fbgemm" not in txt(".player-row") and "Sunucu TTS" not in txt(".player-row") and "kur.bat" in txt(".player-row"), txt(".player-row")[:200])
        api("/_tts_fail", True)
        close_viewer()

        TR = "Trendyol/Trendyol-TTS"
        row = lambda mid: next((r for r in pg.query_selector_all(".mm-row") if mid in r.inner_text()), None)
        rl = lambda mid: pg.locator(f'.mm-row[data-id="{mid}"]')  # liste yeniden çizilebilir: tıklamalar her seferinde yeniden çözülür

        def open_models():
            open_studio("Modeller (Hugging Face)")
            for g in ("Ses klonlayan modeller", "Ses klonlamayan modeller", "Yalnız indirilebilir", "Apple MLX"):
                if pg.query_selector(f".studio summary:has-text('{g}')"):
                    pg.click(f".studio summary:has-text('{g}')"); pg.wait_for_timeout(150)

        open_models()
        _kat = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "model_katalog.json"), encoding="utf-8"))["modeller"]
        _ek = sum(1 for m in _kat if m.get("ek"))  # beklenen sayı katalogdan (tek doğruluk kaynağı), elle yazılmaz
        n = wait_until(lambda: len(pg.query_selector_all(".mm-row")) == len(_kat) and len(_kat), 15)
        ok(f"Model yöneticisi: {len(_kat) - _ek} MIT + {_ek} ek model listeleniyor", n == len(_kat), f"{len(pg.query_selector_all('.mm-row'))} satır")
        ok("Model yöneticisi: klonlayan / klonlamayan ayrı açılır gruplar", pg.query_selector(".studio summary:has-text('Ses klonlayan modeller')") is not None and pg.query_selector(".studio summary:has-text('Ses klonlamayan modeller')") is not None)
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
        close_studio()
        ok("Model seçimi kendiliğinden kaydedildi", pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).serverModel") == TR)

        pg.goto(APP); pg.wait_for_selector(".nb-card")
        pg.click("button[aria-label=Ayarlar]"); pg.wait_for_selector(".voice-settings")
        pg.click("text=Sesi dene (kadın + erkek)")
        wait_until(lambda: "çalışıyor (dinliyorsunuz)" in txt(".voice-settings"), 20)
        ok("Podcast sesi: lokal sunucu isteği seçili modelle gitti", any(x["model"] == TR for x in api("/_log")["log"]))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        open_studio()
        pg.click("text=Motorları sına")
        ok("Motor tanısı: ortam, çalışan motor ve gerçek hata + çözüm ipucu gösterilir", wait_until(lambda: "RTX 5090" in txt(".studio") and "✓ edge" in txt(".studio") and "✗ omnivoice" in txt(".studio") and "Ollama modeli GPU" in txt(".studio"), 10), txt(".studio")[-260:])
        close_studio()
        open_models()
        wait_until(lambda: len(pg.query_selector_all(".mm-row")) == 31, 10)
        rl("alperiox/pocket-tts-turkish").locator("button[aria-label='Beğendim']").click()
        ok("Beğendim: sunucuda kalıcı", wait_until(lambda: next(m for m in api("/models")["models"] if m["id"] == "alperiox/pocket-tts-turkish")["puan"] == "begen", 5))
        rl(TR).locator("button[aria-label='Beğenmedim']").click()
        ok("Beğenmedim: onayla → diskten silindi", wait_until(lambda: "indirildi" not in row(TR).inner_text() and not next(m for m in api("/models")["models"] if m["id"] == TR)["hazir"], 8))
        close_studio()
        ok("Silinen modelin seçimi temizlendi (otomatik motor)", pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).serverModel") == "")

        # --- Motor çalışmıyorken: sahte 'kurulu/indirildi' yok, düğmeler kapalı ve nedeni yazıyor
        api("/_engines?none=1", True)
        open_models()
        wait_until(lambda: len(pg.query_selector_all(".mm-row")) == 31, 10)
        rl(TR).locator("button:has-text('İndir')").click()
        wait_until(lambda: "indirildi" in row(TR).inner_text(), 25)
        rt = row(TR).inner_text()
        ok("Model kartı: motor çalışmıyorsa kırmızı '✗ motor hatası' + kur.bat ipucu", "✗ torch DLL yüklenemedi" in rt and "kur.bat" in rt, rt[-160:])
        ok("Model kartı: motor çalışmıyorsa 'dinlenebilir', 'Dene' ve 'Bunu kullan' yok", "dinlenebilir" not in rt and rl(TR).locator("button:has-text('Dene')").count() == 0 and rl(TR).locator("button:has-text('Bunu kullan')").count() == 0)
        ok("Modeller ile Ses stüdyosu üstü çelişmez: sunucu çalışıyor, 'Lokal sunucu çalışmıyor' yok", "Lokal sunucu çalışmıyor" not in txt(".studio") and "Sunucu çalışıyor" in txt(".studio"))
        close_studio()
        open_studio()
        ok("Motor yok: üstte 'çalışan ses motoru yok' ve her hatalı motor kırmızı", wait_until(lambda: "çalışan ses motoru yok" in txt(".studio") and "✗ VoxCPM2: torch DLL yüklenemedi" in txt(".studio .engines") and "✗ Pocket TR: model dosyası eksik" in txt(".studio .engines"), 10), txt(".studio .engines")[:200])
        ok("Motor yok: 'Yeni ses üret' ve 'Tarifle tasarla' kapalı, nedeni yazıyor", all(pg.is_disabled(f".studio button:has-text('{t}')") for t in ("Yeni kadın sesi üret", "Yeni erkek sesi üret")) and "Tasarım motoru çalışmıyor" in txt(".design-why") and "kur.bat" in txt(".design-why"), txt(".design-why")[:160])
        pg.click("text=Motorları sına")
        ok("Motorları sına: çalışan (✓ … çalışıyor) ile çalışmayan (✗ … çalışmıyor) ayrımı net", wait_until(lambda: "✓ edge — çalışıyor" in txt(".studio") and "✗ omnivoice — çalışmıyor" in txt(".studio"), 10))
        close_studio()
        api("/_engines?none=0", True)
        # sunucu hiç yokken: tek ileti, 'baslat.bat' geçmez
        pg.evaluate("async () => { const d = await import('./js/db.js'); await d.setSetting('serverUrl', 'http://127.0.0.1:9'); }")
        pg.goto(APP); pg.wait_for_selector(".nb-card")
        pg.click("button[aria-label='Ses stüdyosu']"); pg.wait_for_selector(".studio")
        ok("Sunucu kapalıyken ileti 'tools\\kur.bat'ı çalıştırın' der (baslat.bat yok)", wait_until(lambda: "kur.bat" in txt(".studio") and "baslat" not in txt(".studio"), 10), txt(".studio")[:140])
        close_studio()
        pg.evaluate("async (m) => { const d = await import('./js/db.js'); await d.setSetting('serverUrl', m); }", MOCK)

        # --- 0.8.0: Ayarlar sade; bulut anahtarları açılır bölümde; eski 'tarayıcı sesi' seçimi göç eder; kur.bat indirilebilir
        pg.goto(APP); pg.wait_for_selector(".nb-card")
        pg.evaluate("async () => { const d = await import('./js/db.js'); await d.setSetting('tts', { engine: 'browser', schema: 3 }); }")
        pg.reload(); pg.wait_for_selector(".nb-card")
        ok("Eski 'Tarayıcı sesi' seçimi otomatiğe göç etti", pg.evaluate("async () => (await (await import('./js/tts.js')).loadTTS()).engine") == "auto")
        pg.click("button[aria-label=Ayarlar]"); pg.wait_for_selector(".voice-settings")
        ok("Ayarlar: bulut anahtarları varsayılan kapalı tek açılır bölümde", pg.query_selector(".voice-settings details.cloud:not([open])") is not None and not pg.is_visible(".voice-settings input[type=password]"))
        pg.click(".voice-settings details.cloud summary")
        ok("Ayarlar: bulut bölümü açılınca tek satır anahtar alanları görünür", pg.is_visible(".voice-settings input[type=password]") and "OpenAI TTS" in txt(".voice-settings"))
        ok("Ayarlar: 'Ses stüdyosunu aç' düğmesi var", pg.query_selector(".voice-settings button:has-text('Ses stüdyosunu aç')") is not None)
        ok("Ayarlar: kur.bat indirme düğmesi ve tek satırlık komut", pg.query_selector(".settings button:has-text('kur.bat dosyasını indir')") is not None and pg.query_selector(".settings button:has-text('komutu kopyala')") is not None, "")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # --- Ses kilidi: bir podcast boyunca motor/ses sabit; kota ya da hata olursa başka motora (robot Piper) düşülmez
        api("/_log/clear", True)
        LOCK = """async ([n, k]) => { const t = await import('./js/tts.js');
          const lines = Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: 'Deneme satırı numara ' + i + ' ' + k }));
          const sp = [{ id: 'A', name: 'Deniz', gender: 'f' }, { id: 'B', name: 'Kaan', gender: 'm' }];
          try { const r = await t.synthesize('kilit-' + k, lines, sp, 'Türkçe', {}); return { ok: true, engine: r.engine }; }
          catch (e) { return { ok: false, msg: e.message, done: e.doneLines || 0, engine: e.engine }; } }"""
        piper_req = []
        pg.on("request", lambda r: piper_req.append(r.url) if re.search(r"piper|huggingface\.co/rhasspy", r.url) else None)
        r0 = pg.evaluate(LOCK, [4, "tam"])
        ok("Ses kilidi: sunucu motoru her satırda sabit gönderildi", r0["ok"] and all(x.get("engine") == "mock" for x in api("/_log")["log"]) and len(api("/_log")["log"]) == 4, str(api("/_log")["log"][:1]))
        api("/_log/clear", True); api("/_tts_fail?after=3", True)
        r1 = pg.evaluate(LOCK, [6, "yarim"])
        ok("Ses kilidi: motor 3. satırdan sonra çökünce başka motora düşülmedi", (not r1["ok"]) and r1["done"] == 3 and "geçilmedi" in r1["msg"] and "kalıcı saklandı" in r1["msg"] and not piper_req, str(r1)[:160])
        n_before = len(api("/_log")["log"])
        api("/_tts_fail", True); api("/_log/clear", True)
        r2 = pg.evaluate(LOCK, [6, "yarim"])
        ok("Kaldığı yerden devam: yalnız eksik 3 satır yeniden üretildi", r2["ok"] and len(api("/_log")["log"]) == 3, f"çökmeden önce {n_before} istek, devamda {len(api('/_log')['log'])}")

        # --- 0.6.0: kayıtlı ses önce (ağ/API kullanılmaz); yeniden üretim yalnız 'fresh' ile
        SAVED = """async ([n, k, fresh]) => { const t = await import('./js/tts.js');
          const lines = Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: 'Deneme satırı numara ' + i + ' ' + k }));
          const sp = [{ id: 'A', name: 'Deniz', gender: 'f' }, { id: 'B', name: 'Kaan', gender: 'm' }];
          const r = await t.synthesize('kilit-' + k, lines, sp, 'Türkçe', { fresh }); return { saved: !!r.saved, size: r.blob.size }; }"""
        api("/_log/clear", True)
        sv1 = pg.evaluate(SAVED, [6, "yarim", False])
        ok("Kayıtlı ses: bitmiş podcast yeniden açılınca ağa/API'ye hiç gidilmez", sv1["saved"] and sv1["size"] > 1000 and len(api("/_log")["log"]) == 0, str(sv1))
        pg.evaluate("async () => { const t = await import('./js/tts.js'); const c = await t.loadTTS(); await t.saveTTS({ ...c, serverF: 'baska-ses', serverM: 'baska-erkek' }); }")
        sv2 = pg.evaluate(SAVED, [6, "yarim", False])
        ok("Kayıtlı ses: ses/motor ayarı değişse de aynı metin kayıtlıdan çalar", sv2["saved"] and len(api("/_log")["log"]) == 0)
        sv3 = pg.evaluate(SAVED, [6, "yarim", True])
        ok("Sesi yeniden üret: yalnız 'fresh' ile sunucuya gidilir ve yeni dosya kaydedilir", (not sv3["saved"]) and len(api("/_log")["log"]) == 6, str(len(api("/_log")["log"])))
        sv4 = pg.evaluate(SAVED, [6, "yarim", False])
        ok("Yeniden üretilen ses de kayıtlı kalır (ikinci açılışta ağ yok)", sv4["saved"] and len(api("/_log")["log"]) == 6)
        pg.evaluate("async () => { const t = await import('./js/tts.js'); const c = await t.loadTTS(); await t.saveTTS({ ...c, serverF: '', serverM: '' }); }")

        # --- 0.6.0: Fish Audio istek biçimi (sahte fetch): Bearer + model başlığı, kadın/erkek ses kimliği sabit
        fish = pg.evaluate("""async () => {
          const t = await import('./js/tts.js'); const orig = window.fetch, calls = [], old = await t.loadTTS();
          const n = 4800, b = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, x) => [...x].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
          w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
          b.setUint32(24, 24000, true); b.setUint32(28, 48000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
          for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.sin(i / 10) * 8000, true);
          window.fetch = async (u, o) => {
            if (/api\\.fish\\.audio\\/v1\\/tts/.test(String(u))) { calls.push({ u: String(u), h: o.headers, body: JSON.parse(o.body) }); return new Response(new Blob([b.buffer], { type: 'audio/wav' }), { status: 200 }); }
            return orig(u, o);
          };
          try {
            await t.saveTTS({ ...old, fishKey: 'f-key', fishModel: 's2.1-pro-free', fishF: 'REF-KADIN', fishM: 'REF-ERKEK' });
            const lines = [{ speaker: 'A', text: 'Merhaba dünya' }, { speaker: 'B', text: 'Selam arkadaşlar' }, { speaker: 'A', text: 'Nasılsınız' }, { speaker: 'B', text: 'Teşekkürler' }];
            const sp = [{ id: 'A', name: 'Deniz', gender: 'f' }, { id: 'B', name: 'Kaan', gender: 'm' }];
            const r = await t.synthesize('fish-test', lines, sp, 'Türkçe', { engine: 'fish' });
            const ref = (re) => calls.find((c) => re.test(c.body.text))?.body.reference_id;
            const none = await t.saveTTS({ ...old, fishKey: 'f-key', fishF: '', fishM: '' }).then(async () => { try { await t.synthesize('fish-test2', lines, sp, 'Türkçe', { engine: 'fish' }); return ''; } catch (e) { return e.message; } });
            return { n: calls.length, first: calls[0], kadin: ref(/Merhaba/), erkek: ref(/Selam/), kadin2: ref(/Nas/), erkek2: ref(/Te/), size: r.blob.size, none };
          } finally { window.fetch = orig; await t.saveTTS(old); }
        }""")
        fh = fish["first"]
        ok("Fish Audio: istek biçimi (POST /v1/tts, Bearer, model başlığı, mp3)", fish["n"] == 4 and fh["u"] == "https://api.fish.audio/v1/tts" and fh["h"]["Authorization"] == "Bearer f-key" and fh["h"]["model"] == "s2.1-pro-free" and fh["body"]["format"] == "mp3", str(fh)[:200])
        ok("Fish Audio: kadın ve erkek konuşmacı hep aynı seçili ses kimliğiyle konuştu", (fish["kadin"], fish["kadin2"], fish["erkek"], fish["erkek2"]) == ("REF-KADIN", "REF-KADIN", "REF-ERKEK", "REF-ERKEK") and fish["size"] > 1000, str(fish)[:200])
        ok("Fish Audio: ses seçilmediyse net hata (her satırda farklı ses gelmez)", "kadın ve bir erkek ses seçin" in fish["none"], fish["none"][:120])
        # Gemini günlük kota: kota dolunca robot sese düşmeden net hata
        pg.route("https://generativelanguage.googleapis.com/**", lambda route: route.fulfill(status=429, headers={"access-control-allow-origin": "*", "content-type": "application/json"},
                 body=json.dumps({"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded", "details": [{"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}]}]}})))
        pg.evaluate("""async () => { const d = await import('./js/db.js'); await d.setSetting('serverUrl', ''); await d.setSetting('tts', { engine: 'auto', geminiKey: 'sahte', narrator: 'm', schema: 3 }); }""")
        pg.evaluate("async () => { await import('./js/server.js').then((m) => m.serverUrl(true)); }")
        r3 = pg.evaluate(LOCK, [4, "gemini"])
        ok("Gemini günlük kota doldu: net hata, robot Piper'a düşülmedi", (not r3["ok"]) and r3["engine"] == "gemini" and "günlük" in r3["msg"] and "geçilmedi" in r3["msg"] and not piper_req, str(r3)[:160])
        pg.unroute("https://generativelanguage.googleapis.com/**")
        # Hiç motor yokken Piper kendiliğinden devreye girmez
        pg.evaluate("""async () => { const d = await import('./js/db.js'); await d.setSetting('tts', { engine: 'auto', narrator: 'm', schema: 3 }); }""")
        eng_none = pg.evaluate("async () => (await import('./js/tts.js')).resolveEngine()")
        r4 = pg.evaluate(LOCK, [2, "yok"])
        ok("Motor yokken: 'Ses motoru yok' denir, Piper kendiliğinden kullanılmaz", eng_none == "none" and (not r4["ok"]) and "Ses motoru yok" in r4["msg"] and not piper_req, f"{eng_none} · {r4['msg'][:60]}")
        pg.evaluate("async (m) => { const d = await import('./js/db.js'); await d.setSetting('serverUrl', m); }", MOCK)

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
