# Not defteri: mühendislik günlüğü

Her adım, karşılaşılan her hata ve çözümü. En yeni en üstte. Yeni kayıt biçimi:
`### Tarih — sürüm — konu` + **Belirti / Neden / Çözüm / Ders** (gereken kadarı).

---

## 2026-10-13 — 0.5.0 — yapay zeka görselleri + kur-gpu.bat onarımı

- **İstek:** (1) `tools/kur-gpu.bat` "Kurulum hatası" verdi. (2) Slayt, infografik, video sahnelerine yapay zeka görseli.
- **kur-gpu.bat — Belirti:** Kullanıcının PC'sinde kurulum hata verdi (hata metni gelmedi). **Bulunan nedenler (koddan):**
  - Dosyada LF ve CRLF satır sonları **karışıktı** (yalnız iki satır CRLF). Windows `cmd`, LF'li `.bat` dosyalarında `goto :hata` etiketlerini ve `( )` bloklarını bozabiliyor; `kur-chatterbox.bat` ve `server/baslat.bat` de LF'ydi.
  - `|| goto :hata` zinciri hangi adımda düştüğünü söylemiyordu; `voxcpm` hatası yutuluyordu ama `omnivoice` bağımlılıkları torch'u CPU sürümüne çevirirse bu fark edilmiyordu.
  - `omnivoice` `transformers>=5.3.0` ister; `kur-chatterbox.bat` `transformers==5.2.0`'a sabitler. **İkisi aynı sanal ortamda çakışır.**
- **Çözüm:** `kur-gpu.bat` yeniden yazıldı: adım adım (`[1/5]`…), her adımda `if errorlevel 1 goto :hata` ve `%ADIM%` adı, Python sürüm uyarısı, bağımlılıklardan sonra CUDA kaybolduysa `cu128` geri yükleme, VoxCPM isteğe bağlı, son denetimde `omnivoice/pocket_tts/voxcpm` içe aktarma. Bütün `.bat` dosyaları CRLF'e çevrildi ve `.gitattributes` (`*.bat -text`: CRLF olduğu gibi saklanır, raw ve ZIP indirmeleri de CRLF verir) eklendi.
- **Doğrulanmadı:** Gerçek hata metni bilinmiyor; bu ortamda Windows/GPU yok. Hata sürerse artık hangi adımda olduğunu yazıyor.
- **Ders:** Windows toplu iş dosyalarını her zaman CRLF yaz; Git ile gönderiyorsan `.gitattributes` koy.
- **Görseller — yapılan:**
  - `js/imagegen.js`: Gemini (Interactions API, `gemini-3.1-flash-lite-image`), MiniMax `image-01`, lokal sunucu `/image`; stil sözlüğü, oran, önbellek (`img:<özet>` anahtarlı blob), 2 eşzamanlı, 429'da yeniden deneme.
  - `js/studio/illustrate.js`: hangi öğeye görsel gideceğini planlar (slaytta kapak + eşit aralıklı en çok 12), üretir, `imgKey` yazar. `app.js` `doJob` içinde üretim sonrası otomatik çağırır.
  - `server/gorsel.py` + `POST /image`: ComfyUI + FLUX.1-schnell; tek dosyalı checkpoint ya da ayrı UNET/CLIP/VAE otomatik bulunur. `tools/kur-comfyui.bat`, `tools/comfyui-baslat.bat`.
  - Görüntüleyiciler: slayt (kapak arka planı, sağ panel, HTML dışa aktarımda gömülü), infografik (başlık + kutu, PNG'de gömülü), video (panel + Ken Burns benzeri yakınlaşma).
  - Ayarlar › Görseller (`js/image-settings.js`), `docs/GORSEL.md`.
- **Araştırma:** Gemini görsel API'si artık Interactions API; Imagen "kapatıldı" olarak listeleniyor; en ucuz model `gemini-3.1-flash-lite-image`. Yanıt yolu belgede örneksiz olduğundan `findImage` yanıtı özyinelemeli arar.
- **Hata (test):** Ayarlar'da "Görseller" bölümü kapalı `<details>` içindeydi, `inner_text` kapalı içeriği vermiyor. **Çözüm:** testte önce özete tıklanıyor.
- **Hata (tasarım):** Aynı istemle "yenile", önbellek anahtarı aynı olduğu için eski `blob:` adresini tutuyordu. **Çözüm:** `putBlob` eski nesne adresini iptal edip siliyor.
- **Doğrulanmadı:** Gemini ve MiniMax **gerçek anahtarla**, ComfyUI **gerçek GPU'da** denenmedi. İstek biçimleri sahte `fetch` ile, ComfyUI iş akışı sahte ComfyUI ile (iki iş akışı türü) sınandı.

## 2026-10-13 — 0.4.0 — ses kütüphanesi, 3-5 konuşmacı, klon, model yöneticisi

- **İstek:** Birden fazla Türkçe kadın/erkek ses, 3-5 kişilik podcast, 25 MIT TTS modelini seçilebilir yapı, sınırsız klon.
- **Yapılan:**
  - `server/model_katalog.json` (27 kayıt), `server/modeller.py` (indir/puan/sil + CLI), `server/adaptorler.py` (VoxCPM/Trendyol, Bark, KugelAudio).
  - Ses kütüphanesi: her ses = referans wav + json. Tasarlanan ses bir kez üretilip klon referansı olarak saklanır; bütün motorlar aynı sesi kullanır.
  - Ayarlar'da `js/voice-library.js` (kütüphane, tasarım, klon, kadro) ve `js/model-manager.js` (👍/👎, dene, indir).
  - Podcast: 3/4/5 konuşmacı, "Ses kadrom". Video: anlatıcı sesi seçilebilir.
- **Hata:** OmniVoice klonu transkript yoksa tasarlanan sese dönüyordu. **Çözüm:** `ref_text` yoksa gönderilmiyor.
- **Hata (test):** Liste her işlemden sonra yeniden çizildiği için eski düğüm tutamağı bozuluyordu. **Çözüm:** Satırlara `data-id`, açık "Dene" panelleri `tryBoxes` ile korunuyor; testte yerel `locator` kullanılıyor.
- **Ders:** Alt dize eşleşmesi `Trendyol/Trendyol-TTS` ile `niobures/Trendyol-TTS` satırlarını karıştırdı; kimlikle seç.
- **Doğrulanmadı:** GPU adaptörleri (OmniVoice Türkçe tasarım, VoxCPM, Bark, KugelAudio) bu ortamda GPU olmadığından yalnız sahte motorla sınandı.
- **Not:** OmniVoice ağırlıkları CC-BY-NC (ticari değil). `omersaidd/*` ve `emirhanbilgic/*` gerçek kişileri taklit edebilir. 5 model yalnız Apple MLX.

## 2026-10-12 — 0.3.2 — kotasız ses, Gemini kota davranışı, ustalık sanatı

- **Belirti:** Gemini kadın+erkek sesi geldi, bir dakika sonra yeniden Piper (erkek) sesine düştü.
  - **Neden:** Ücretsiz katmanda dakikalık/günlük TTS sınırına (429) takıldı. `withRetry` 1,5–9 sn bekleyip pes etti ve otomatik sıra Piper'a geçti.
  - **Çözüm:**
    - 429'da `retryDelay` kadar bekle (en fazla 6 deneme).
    - Günlük kotayı (PerDay) ayırt et ve açıkça yaz.
    - Parça önbelleği (`kind: 'piece'`) ile kaldığı yerden devam et.
    - Gemini parçalarını 3200 karaktere çıkar.
    - Kadın konuşmacıda önce `femaleOK` motorları dene.
- **Kullanıcı isteği:** Tamamen ücretsiz, lokal kadın+erkek ses.
  - Hugging Face incelemesi:
    - antalia/ema: tarayıcıda ONNX, ama tek erkek ses.
    - pocket-tts-turkish: MIT, klon.
    - OmniVoice: referanssız ses tasarımı.
    - kugelaudio: Türkçe sesi yok.
  - **Çözüm:**
    - Sunucuya OmniVoice (kadın/erkek sesi bir kez tasarlanıp kaydedilir, sonra klonlanır) ve Pocket TTS Türkçe eklendi.
    - `tools/kur-gpu.bat` artık bunları kuruyor; Chatterbox `tools/kur-chatterbox.bat`'a taşındı.
  - **Sınır:** GPU modelleri sandbox'ta çalıştırılamadı. Kod, model kartlarındaki API'ye göre yazıldı; ilk gerçek denemede doğrulanmalı.
- **Ustalık sanatı:** Öğrenme bilimi sayfasına eklenen bölümler:
  - Shu-Ha-Ri.
  - Hacker tutumu (E. S. Raymond).
  - 8 öğrenme kanalı.
  - Ustaların yolları: hafızlar, İbn Haldun, Mozart, Feynman, havruta…
  - Günlük ustalık döngüsü.

## 2026-10-12 — 0.3.1 — kullanıcı geri bildirimi (ekran görüntüleri)

- **Hafıza sarayında "Sesli dinle" robot sesi.**
  - Neden: Bu düğme hâlâ tarayıcı sesini (`speakBrowser`) kullanıyordu.
  - Çözüm: `tts.speakText` gerçek ses motoruyla okuyor. İkinci basış durduruyor, düğme "Durdur"a dönüşüyor, görüntüleyici kapanınca ses kesiliyor.
- **Sohbette art arda "Durduruldu."**
  - Neden: Yanıt beklenirken yeni soru göndermek (öneri tıklamak, Enter) önceki isteği iptal ediyordu. Lokal 27B modelde ilk kelime 10–30 sn sürebildiği için kullanıcı tekrar tıklıyordu.
  - Çözüm:
    - Yalnız ■ düğmesi durduruyor; meşgulken yeni soru uyarıyla reddediliyor.
    - "Yanıt hazırlanıyor" bilgisi gösteriliyor.
    - Sohbette Ollama düşünme modu kapatıldı (`think: false`); yanıtlar çok daha hızlı başlıyor.
- **Sohbetin çöp kutusu görünmüyordu.**
  - Neden: Düğme yalnız sayfa açılırken mesaj varsa çiziliyordu.
  - Çözüm: "Sohbet" başlığının yanında her zaman görünen çöp kutusu var; onayla tüm sohbet siliniyor.
- **Studio'da tüm içerikleri silme.** Soru bankası kartının altına içerik sayısı ve çöp kutusu eklendi. Kaynaklar, sohbet ve banka korunuyor.
- **Lokal sunucu "Ulaşılamadı".**
  - Neden: Kullanıcının bilgisayarında sunucu hiç başlatılmamıştı.
  - Çözüm:
    - Hata mesajı artık adım adım kurulum gösteriyor: Python, zip indirme, `baslat.bat`, izin.
    - Çalışırken motor listesi doğru yazılıyor; eskiden `[object Object]` yazıyordu.
    - Var olmayan `server/README.md` bağlantısı düzeltildi.
- **"Türkçe kadın sesi yok."**
  - Neden: Tarayıcıda çalışan ücretsiz ve açık Türkçe kadın sesi gerçekten yok.
  - Çözüm yolları: ücretsiz Gemini anahtarı ya da lokal sunucu (edge-tts Emel, Chatterbox klon).
- **Test:** e2e 38/38 (sohbet silme, tüm içerikleri silme eklendi).

## 2026-10-12 — 0.3.0 — ses v3, tam sayılar, doğrulama, soru bankası, lokal sunucu v2

### Gerçek model denemesi (kullanıcının Chrome'u, canlı site, Ollama qwen3.8:27b)
- **Deneme:** `makeQuestions` ile 10 soru, UAB GOC türü, kısa bir GMDSS metni.
- **Sonuç:** 41 saniyede 10/10 soru üretildi. Hepsi **birebir alıntıyla** doğrulandı, 0 soru elendi; sorular ve cevaplar kaynağa uygun.
- **Temizlik:** Deneme için açılan geçici defter silindi.
- **Çıkarım:** Lokal modelle saatte yüzlerce doğrulanmış soru üretilebilir. Banka penceresindeki tahmin buna göre güncellendi.

### Hata: ikinci sekme açılınca ilk sekmenin işleri "yarıda kaldı" oluyordu
- **Belirti:** Uygulama iki sekmede açıkken yeni sekmenin açılışı, diğer sekmede çalışan ya da sırada bekleyen üretimleri hata olarak işaretliyordu. Sıradakiler hiç çalışmıyordu.
- **Neden:** `boot()` tarayıcı veritabanındaki bütün `running/queued` kayıtları sahipsiz sayıyordu.
- **Çözüm:**
  - `js/tabs.js`: her sekme 10 sn'de bir `localStorage`'a sinyal yazar.
  - İşler, OCR ve soru bankası doldurma `owner` alanı taşır.
  - Sahibi açık başka bir sekmede olan işe dokunulmaz ve iş iki kez çalıştırılmaz.
  - Yavaş sahte modelle (`MOCK_DELAY=1.5`) denendi: ikinci sekmeden sonra işler `running/queued` kaldı ve sonunda `done` oldu.

### Hata: sınav tarihi bugünse "geçti" yazıyordu; tarih biçimi karışıklığı
- **Belirti:** Kullanıcının seçtiği 10/12/2026 için "Sınav tarihi geçti" yazıyordu.
- **Neden:**
  - Gün farkı saat 09:00'a göre hesaplanıyordu; akşam saatlerinde bugün eksi çıkıyordu.
  - Chrome tarih kutusu tarayıcı diline göre (en-US: ay/gün/yıl) gösteriliyor. Türkçe okuyan biri 10/12'yi 10 Aralık sanabilir; tarayıcı bunu 12 Ekim olarak alıyor.
- **Çözüm:**
  - Takvim günü farkı kullanılıyor.
  - "Sınav bugün" durumu eklendi.
  - Seçilen tarih yanında Türkçe yazılıyor ("12 Ekim 2026") ki yanlış anlaşılma hemen görülsün.

### Kullanıcının istediği
- **Ses ve klonlama**
  - AA ses sıralamaları ve MiniMax dokümanlarının analizi: en iyi ücretsiz/lokal ve en iyi ücretli ses.
  - MiniMax klonlamanın hem Pages'e hem lokale eklenmesi.
  - Kadın sesi.
  - NotebookLM gibi erkek anlatıcılı video.
- **Üretim kalitesi**
  - Tam sayılar: 50 soru = 50 soru, 100 slayt = 100 slayt.
  - Halüsinasyon ~%0.
  - Token tasarrufu: yüzlerce testi lokal modelle hazırlama ve kalanı görme.
- **Öğrenme ve sağlayıcılar**
  - Dünyadaki öğrenme yöntemleri.
  - Yeni sağlayıcılar: Grok, DeepSeek, Qwen, Claude, Gemini, ChatGPT yapısı.
- **Süreç**
  - Uçtan uca testler.
  - Devir teslim dokümanları.
  - Oturum değiştirme kuralı.

### Araştırma sonuçları (ayrıntı: docs/SES.md)
- **Ücretsiz/açık/lokal Türkçe TTS:** en iyisi Chatterbox Multilingual (MIT, Türkçe, klon). En doğal Türkçe XTTS-v2'de, ama lisansı ticari olmayan kullanımla sınırlı.
- **Ücretli:** ElevenLabs Eleven v4 (`eleven_v4`, AA Arena 1.). Fiyat/performans: Gemini 3.8 Flash TTS (ücretsiz katman var).
- **MiniMax:**
  - `speech-2.8-hd`, `language_boost: Turkish`.
  - Hazır sesler: `Turkish_CalmWoman` ve `Turkish_Trustworthyman`.
  - Klon akışı: `files/upload` → `voice_clone`. Kullanılmayan klon 7 gün sonra silinir.
- **Okunamayan kaynaklar:** YouTube videolarının dördü de okunamadı (3'ü 429, 1'i bağlantı hatası). Kullanıcıya bildirildi.

### Chrome'da CORS testi (github.io kökeninden, sahte anahtarla)
- **Tarayıcıdan doğrudan çağrılabilenler:** MiniMax (TTS, yükleme, ASR, sohbet), ElevenLabs, Gemini, Google Cloud TTS, Azure TTS, OpenAI, xAI, DashScope, DeepSeek, Groq, OpenRouter, Anthropic, Mistral, Together, Moonshot.
- **Kapalı:** yalnız Cerebras. Sunucunun `/proxy` ucu bunun için var.
- **Ders:** Yeni bir API eklemeden önce aynı testi yap: sahte anahtarla `fetch` at. Yanıt gelirse CORS açıktır; `TypeError: Failed to fetch` gelirse kapalıdır.

### "Sadece erkek sesi var" — kök neden
- **Belirti:** Podcast'te kadın konuşmacı da erkek sesle konuşuyor. Canlı modda ses robot gibi.
- **Neden 1:** Tarayıcı Piper'ının üç Türkçe sesi (dfki, fahrettin, fettah) de erkek.
- **Neden 2:** Kullanıcının Chrome'unda **hiç Türkçe tarayıcı sesi yok** (22 ses, 0 Türkçe). "Beklerken dinle" modu Türkçe metni yabancı sesle okuyordu.
- **Çözüm:**
  - Türkçe tarayıcı sesi yoksa `speakBrowser` hiç konuşmaz.
  - Ses parça parça üretilip hazır oldukça çalınır (`onPiece`).
  - Kadın konuşmacı + yalnız-erkek motor durumunda oynatıcı ücretsiz çözüm kartını gösterir: Gemini anahtarı, lokal sunucu, Azure, Google.
  - Yeni motorlar eklendi: MiniMax, Azure, Google.
  - `femaleOK(engine)` ile kontrol yapılıyor.

### Ollama bağlantısı
- **Durum:** 0.2.2'deki düzeltilmiş PowerShell komutundan sonra github.io'dan `localhost:11434/api/tags` 200 dönüyor. Kullanıcının bilgisayarında sorun çözüldü.
- **Kalıcı çözüm:** Lokal sunucu uygulamayı `localhost:8765`'te sunuyor. Ollama localhost kökenlerine varsayılan olarak izin verdiği için OLLAMA_ORIGINS gerekmez.
- **Kullanıcının kurulu modelleri:**
  - Sohbet ve üretim: qwen3.8:27b, llama3.1:8b, gemfable-agent:31b, qwen3.6 türevi 27B, DeepSeek-R1-Distill 32B, qwen3.8-9b-coder.
  - Görsel ve embedding: qwen3-vl:8b, nomic-embed-text.

### Hata: kabuk kendini öldürdü (çıkış kodu 144)
- **Belirti:** `pkill -f "python main.py"` ya da `pgrep -f "http.server 8099"` çalışınca komut 144 ile bitiyor.
- **Neden:** Desen, çalışan `bash -c` komut satırının kendisinde de geçiyor.
- **Çözüm:**
  - `pgrep -f "[m]ock_llm"` gibi köşeli parantez hilesini kullan.
  - Öldürme komutunu ayrı bir çağrıda, desenin düz yazılmadığı bir komut satırıyla çalıştır.

### Hata: lokal sunucuda kök adres 404
- **Belirti:** `GET /` 404 dönüyor.
- **Neden:** Statik dosya filtresi `path.startswith(".")` kök isteği (`"."`) de engelliyordu.
- **Çözüm:** `""` ve `"."` istisna tutuldu. `.git`, `server/`, `tools/` ve `tests/` hâlâ kapalı.

### Hata: e2e'de podcast boş çıktı
- **Belirti:** Oynatıcıda "Seslendirilecek metin yok" yazıyor.
- **Neden:**
  - Sahte model anahtar kelimeyi tüm istemde arıyordu.
  - Test kaynağındaki "sefer **planla**masında" kelimesi plan isteğiyle eşleşti.
  - Bölüm isteklerine de plan döndü ve senaryo boş kaldı.
- **Çözüm:**
  - Sahte modelde istemlere özgü ifadeler kullanılıyor ("bölümlük akış çıkar", "replik. Her replikte").
  - Uygulamada boş senaryo artık hata veriyor ("Senaryo üretilemedi…"); boş podcast kaydedilmiyor.

### Hata: bankadan çözülen soru sayısı güncellenmedi
- **Neden:** Banka kartı yalnız doldurma olaylarında yeniden çiziliyordu.
- **Çözüm:** `recordAnswer` olay yayıyor; kart dinleyip yeniden çiziliyor. Kart her defter için tek örnek; Studio sık çizildiği için önbellekte tutuluyor.

### Risk önlendi: yeni sürümde eski/yeni modül karışması
- **Neden:** GitHub Pages `max-age=600` ile önbelleğe alıyor. Yeni `podcast.js` eski `tts.js` ile yüklenirse içe aktarma hatası olurdu.
- **Çözüm:**
  - Service worker modülleri `cache: 'no-cache'` ile ETag sorarak alıyor.
  - Gezinme isteklerinde `RequestInit` verilmiyor; `mode: navigate` + init hata verir.
  - Önbellek adı `v3` oldu, eski önbellekler siliniyor.

### Tasarım kararları (bu sürüm)
- **Tam sayı:**
  - Kaynak `sliceContexts` ile ≤26 bin karakterlik dilimlere bölünür.
  - Partiler eşit aralıklı dilimlerden beslenir.
  - Tekrarlar elenir; 4 boş partiden sonra durulur ve "İstenen X, üretilen Y" notu yazılır.
- **Doğrulama:**
  - Alıntı birebir ya da 4 kelimelik pencerelerin en az %60'ı ile aranır.
  - Doğru şıkkın içerik kelimeleri alıntıda ya da parçada geçmelidir.
  - Token harcamaz.
- **Soru bankası:**
  - Dilim imleciyle bütün kaynak dolaşılır; ikinci turda zorluk artar.
  - Aralıklar 1-3-7-16-35-80 gün.
  - "Akıllı tekrar" sırası: vadesi gelen yanlışlar → çözülmeyenler → vadesi gelenler.
- **Ollama:**
  - JSON görevlerinde `think: false`; desteklemezse 400 alınır ve parametre olmadan yeniden denenir.
  - `keep_alive: 30m`.
- **Gemini anahtarı:** Adres yerine `x-goog-api-key` başlığıyla gönderiliyor; günlüklerde ve adres çubuğunda görünmez.
- **Chatterbox:** `chatterbox-tts` torch 2.6'ya sabit ve RTX 50xx (sm_120) bunu desteklemiyor. Bu yüzden `tools/kur-gpu.bat` torch cu128'i kuruyor, ardından `--no-deps` ile Chatterbox'ı ve bağımlılıklarını elle kuruyor.

### Test sonucu
`tests/e2e.py`: 36/36 kontrol geçti.

---

## 2026-10-12 — 0.2.2 — taranmış PDF, donan podcast, Ollama teşhisi

- **Belirti:** Dosya yüklerken "hata". **Neden:** 697 sayfalık PDF taranmıştı (8.253 karakter metin). **Çözüm:**
  - Tesseract.js ile Türkçe OCR eklendi: arka planda, 10 sayfada bir kayıt, kaldığı yerden devam.
  - PDF dosyası `blobs`'ta `src:<id>` olarak saklanıyor.
  - Eski kaynakta dosya olmadığından kullanıcının silip yeniden yüklemesi gerekiyor.
- **Belirti:** Podcast açılınca sayfa donuyor. **Neden:** Piper ana iş parçacığında çalışıyordu. **Çözüm:** Piper `piper-worker.js` Web Worker'ına taşındı; aynı sesin iki kez üretilmesi engellendi.
- **Belirti:** "Ollama açık ama bağlanmıyor". **Neden:** Kullanıcı ortam değişkenini kalıcı yaptı ama Ollama aynı oturumdan, değişken yüklenmeden başlatıldı. **Çözüm:**
  - Komuta `$env:OLLAMA_ORIGINS = ...` satırı eklendi.
  - Kesin yol olarak `ollama serve` gösterildi.
  - Teşhis: `no-cors` isteğiyle "kapalı" ile "açık ama siteyi engelliyor" ayrılıyor.

## 2026-10-12 — 0.2.1 — bağlantı yardımcısı, hata yığılması, ElevenLabs

- **Belirti:** Studio'da onlarca "Failed to fetch". **Neden:** Ollama sitenin kökenini engelliyordu (CORS). **Çözüm:**
  - Üretimden önce bağlantı kontrolü yapılıyor.
  - Ağ hatasında kuyruk durduruluyor.
  - "Tümünü yeniden dene" ve "Hatalıları sil" eklendi.
  - Kurulum yardımcısı penceresi ve `tools/ollama-baglan.bat` eklendi.
- ElevenLabs v3 diyalog uç noktası eklendi. Ton notları ses etiketlerine çevriliyor; Türkçe dil kodu gönderiliyor.

## 2026-10-12 — 0.2.0 — doğal Türkçe çok sesli seslendirme, öğrenme merkezi

- **Belirti:** "Sesler robot gibi." **Çözüm:**
  - Türkçe metin normalleştirme: sayı, yüzde, birim, kısaltma.
  - Gemini TTS çok konuşmacılı (`/v1beta/interactions`, en fazla 2 konuşmacı).
  - Konuşmacı değişiminde 0,3 sn duraklama; Google podcast'inde ölçülen ortanca 0,318 sn.
  - Ses seviyesi dengeleme; ölçülen Google sesi -16,4 LUFS.
- 5 yeni podcast biçimi; hafıza, öğreterek öğren, hızlı okuma, 10 parmak klavye, deneme sınavı türleri eklendi.

## 2026-10-12 — 0.1.x — ilk sürüm

- **Belirti:** DOM'da "null" yazıyor. **Çözüm:** `append` ve `replaceChildren` boş çocukları süzüyor; `put()` yardımcısı eklendi.
- **Belirti:** Sandbox'ta CDN engelli. **Çözüm:** Bütün kütüphaneler npm'den indirilip `js/vendor/`'a kondu.
- **Belirti:** Artifact yayınlanamıyor (ESC/kontrol karakteri). **Çözüm:** Paket ve vendor dosyalarındaki kontrol karakterleri kaçışlandı.
- **Belirti:** Depo oluşturma ve Pages API'si oturum vekilinde engelli. **Çözüm:** Kullanıcının onayıyla Chrome üzerinden yapıldı.
- **Güvenlik:** Kullanıcının sohbete yapıştırdığı GitHub belirteci yalnız geçici ortam değişkeni olarak kullanıldı; hiçbir dosyaya yazılmadı. Kullanıcıya iptal etmesi önerildi.

## 2026-10-13 — 0.5.1 — ses kilidi ve MOSS-TTS

- **Belirti:** Podcastte 10–12 satırdan sonra ses robota dönüyor, "kota bitti" deniyor. **Neden:** Gemini ücretsiz TTS günlük kotası çok küçük; kota bitince `synthesize` motor listesinde ilerleyip Piper'a (tarayıcıda, yalnız erkek, robot) düşüyordu; sunucu `/tts` de satır başına sessizce motor değiştiriyordu. **Çözüm:** "Ses kilidi": bir sentez tek motorla yapılır, geri düşme yok, Piper otomatik seçilmez; parçalar IndexedDB'de saklanır, hata olunca "Kaldığı yerden devam et" yalnız eksikleri üretir. Sunucu `engine` verilirse kilitler (409/500, geri düşmez).
- **Not:** GitHub Pages statiktir; 4–18 GB modeller orada çalışamaz (dosya sınırı 100 MB, GPU yok). Modeller yalnız lokal sunucuda (RTX 5090) çalışır. Sınırsız ses için: lokal motorlar (OmniVoice, Pocket, VoxCPM, MOSS).
- **MOSS-TTS Local v1.5:** transformers 5.0 / torch 2.9.1 sabitler, ana ortamla çakışır; bu yüzden ayrı venv + JSON satır protokollü çalışan süreç. Referans ses soundfile ile okunur (torchaudio/FFmpeg gerekmez). GPU'da denenmedi.
- **Süreç:** `pkill -f` desenini aynı komutta kullanma (kabuk ölür, 144).
