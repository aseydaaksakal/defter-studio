# Not defteri: mühendislik günlüğü

Her adım, karşılaşılan her hata ve çözümü. En yeni en altta (grep ile ara). Yeni kayıt biçimi:
`### Tarih — sürüm — konu` + **Belirti / Neden / Çözüm / Ders** (gereken kadarı).

---

## 2026-10-13 — 0.7.0 — "zip indir, bat çalıştır" döngüsünü bitiren kendini güncelleyen sunucu

- **İstek:** Her sürümde zip indirip `baslat.bat`/`kur-pocket-tr.bat` çalıştırmak yorucu; değişmeyen yer için hiçbir şey indirilmesin/çalışmasın.
- **Çözüm (3 katman):**
  1. `tools/kur.bat`: **bir kez** çalışır (Python yoksa winget önerir). `%LOCALAPPDATA%\DefterStudio` altına kurar, sanal ortamı ve paketleri hazırlar, isteğe bağlı Pocket TR kurar, isteğe bağlı Windows oturum açılışında sunucuyu **gizli** başlatır (`gizli-baslat.vbs`, Başlangıç klasörü kısayolu).
  2. `server/guncelle.py` (yalnız standart kütüphane) + `server/manifest.json` (her dosyanın SHA-256 özeti; `tools/uret-manifest.py` üretir, `teslim.sh` her teslimde çalıştırır): yerel dosya özeti manifestle tutmuyorsa **yalnız o dosya** indirilir, özet doğrulanır, atomik yazılır. `requirements.txt` değişmediyse pip çalışmaz; edge-tts günde en çok bir kez yükseltilir. `baslat.bat/.sh` her açılışta `guncelle.py --sync` çağırır ve çıkış kodu 75 ile yeniden başlatma döngüsü kurar.
  3. Arayüz: Ayarlar › Lokal yardımcı sunucu › "Sunucuyu güncelle" (`/update/check`, `/update/apply`); açılışta `/health.update.available` varsa bildirim. Python dosyası değişince sunucu kendini `exit(75)` ile kapatır, döngü yeniden açar.
- **Pages tarafı** zaten her push'ta kendiliğinden güncel: sekmeyi yenilemek yeterli. Zip artık yalnız yedek yoldur.
- **Güvenlik:** adres yalnız sunucu yapılandırmasından (`DEFTER_UPDATE_URL`, varsayılan resmî Pages); yollar `server/` ve `tools/` altında olmalı, `..`/mutlak yol reddedilir, özeti tutmayan dosya yazılmaz. Git deposu olan klasörde (geliştirme) otomatik güncelleme kapalıdır.
- **Kabuk dosyaları** (`baslat.bat`, `baslat.sh`, `gizli-baslat.vbs`) çalışırken ezilmesin diye otomatik yazılmaz; değişirlerse yalnız bildirilir, `kur.bat` yeniden çalıştırılınca (`--kabuk`) yenilenir. Bu dosyaları mümkün olduğunca sabit tut; mantığı `guncelle.py`/`main.py`'ye koy.
- **Doğrulama:** server_test 73/73 (yalnız değişen dosyanın indirilmesi, pip'in koşullu çalışması, bozuk/güvensiz yol, git koruması, uç noktalar, manifest özetleri), e2e 97/97 (düğme akışı). **Windows'ta `kur.bat` çalıştırılamadı** (yalnız Linux sandbox): ilk gerçek kurulum kullanıcının PC'sinde doğrulanacak.

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

## 2026-10-13 — 0.6.0 — ses güvenilirliği, kayıtlı podcast sesi, Video v2

- **Belirti:** "Sesi dene" → `edge çalışmadı: 403, Invalid response status … TrustedClientToken=…&ConnectionId=…`. **Neden:** URL'de `Sec-MS-GEC` yok → kurulu edge-tts eski (Microsoft eski sürümleri reddediyor); `baslat.bat` paketleri yalnız ilk kurulumda kuruyordu. **Çözüm:** her açılışta `pip install -U edge-tts`; sunucu 403'te bir kez güncelleyip yeniden dener (`_edge_try_upgrade`); `/health` `edgeVersion` bildirir. Sandbox'ta gerçek Microsoft uç noktası denenemedi (ağ yok); mantık sahte modülle test edildi.
- **Belirti:** Podcast her açılışta API/limit harcıyor. **Neden:** mix anahtarı motor+ses+model+metne bağlıydı; sunucu planı ya da ayar değişince tutmuyordu. **Çözüm:** `textKey` (yalnız konuşmacı+metin+ton); `savedMix` önce bakılır; `fresh` yalnız "Sesi yeniden üret". 0.6.0 öncesi kayıtlar satır sayısı tutuyorsa yükseltilir. Sekme verisi silinmesin diye `navigator.storage.persist()`.
- **Belirti:** Piper her seferinde yeniden yükleniyor, ikinci ses ilk sesin modelini kullanıyor. **Neden:** `piper-tts-web` `TtsSession` tek örnek (singleton); her oturumda onnxruntime/WASM CDN'den. **Çözüm:** singleton kaldırıldı, çalışan ses başına oturum tutar (`js/piper-worker.js`), ort + piper_phonemize `js/vendor/piper/` altında (SIMD wasm 10,6 MB, .data 18 MB), `sw.js` büyük dosyalarda önbellek-öncelikli. Gerçek Chromium'da ORT çıkarımı + Türkçe fonemleştirme doğrulandı; ses modeli HF'den indiği için tam uçtan uca ses sandbox'ta denenemedi.
- **Belirti:** GPU modelleri (Trendyol, OmniVoice…) "çalışmıyor". **Olası nedenler (kullanıcı hata metni göndermedi):** (1) Ollama `qwen3.8:27b` 24 GB VRAM'in çoğunu tutuyor → OOM; (2) PyTorch RTX 50xx (sm_120) için cu128 değil; (3) paket eksik. **Eklenen:** `vram_guard` (TTS öncesi boş VRAM yetmezse Ollama modelleri `keep_alive=0` ile boşaltılır, OOM'da bir kez yeniden dene; `DEFTER_UNLOAD_OLLAMA=0` kapatır), `GET /tts/selftest` + Ayarlar › "Motorları sına" (gerçek hata + Türkçe ipucu). **Sonraki oturum bu çıktıyı istemeli.**
- **Model araştırması:** `docs/SES_ALTYAPI.md`. Önemli bulgu: `wite-tech/pocket-tts-turkish` 3 kadın + 3 erkek hazır ses veriyor (CPU'da çalışır); sanotts-loom'da Türkçe tek erkek ses (GPL-3.0); Gemini'nin önerdiği bazı Piper kadın sesi depoları HF'de bulunamadı.
- **Bağımlılık çakışması riski:** `pocket-tts-turkish` `pocket-tts<3.4,>=3.1` ister; `kur-gpu.bat` `pocket-tts`'u son sürüme yükseltir. Çakışırsa Pocket TTS Türkçe'yi kullanın ya da eski `pocket` adaptörünü atlayın.
- **Fish Audio:** `POST https://api.fish.audio/v1/tts` (Bearer, `model` başlığı, `reference_id`). CORS belgelenmemiş: önce doğrudan, olmazsa lokal sunucu `/proxy` (api.fish.audio izin listesinde). Gerçek anahtarla denenmedi (kullanıcının anahtarı sohbette paylaşıldı, kullanılmadı).
- **Video v2:** `drawFrame` (geçiş 0,6 sn), `wordPlan/wordCaption` (kelime zamanı harf+noktalama ağırlığıyla yaklaşıktır), Hızlı MP4: tarayıcı kareleri 24 fps JPEG olarak 48'lik gruplarla `/video/frames/{id}`'ye yollar, ffmpeg `image2pipe`+ses → H.264/AAC (`DEFTER_FFMPEG_ENC=h264_nvenc` ile GPU kodlama). Gerçek ffmpeg ile sunucu testi geçti.
- **Süreç:** `pkill -f` ile mock sunucuyu öldürme (kabuk 144); `fuser -k 8098/tcp` kullan.

## 2026-10-13 — 0.8.0 — Ses stüdyosu, karakter sesleri, sade Ayarlar

- **Belirti:** Yerelde 'Tarayıcı sesi' seçilince 'Ses motoru yok'. **Neden:** IndexedDB'de kalıcı `engine:'browser'` ve Türkçe tarayıcı sesi yok. **Çözüm:** seçenek kaldırıldı, `loadTTS` eski değeri `auto`ya göçürür.
- **Belirti:** motor tanısında `pocket ✗`, `piper ✗`. **Neden:** eski `pocket` (alperiox) adaptörü ve Piper'ın alt süreçle `download_voices` indirmesi. **Çözüm:** `pocket` yalnız `DEFTER_POCKET_LEGACY` ile; Piper sesi doğrudan HF'den `urllib` ile iner (`_piper_fetch`); `/tts/selftest` varsayılanda Piper'ı denemez.
- **Belirti:** Ayarlar penceresi açılmıyor (`openaiSec is not defined`). **Neden:** bulut bölümü sadeleştirilirken OpenAI satırı tanımlanmamıştı; e2e yakaladı. **Ders:** arayüz değişince e2e'yi hemen çalıştır.
- **Tasarım:** Ses stüdyosu (`js/voice-studio.js`) değişiklikleri anında kaydeder (300 ms), yalnız kendi alanlarını (`cast`, `narratorVoice`, `serverF/M`, `serverModel`) yazar; Ayarlar'ın kirli-anahtar kaydıyla çakışmaz. `_engine_for_voice`: seçilen ses Pocket TR hazır sesiyse `pockettr`, kütüphane (klon/tasarım) sesiyse klonlayabilen motor.
- **Pocket TR kurulumu arayüzden:** `/kur/pockettr` (pip + model deneme, ilerleme `/kur/durum`).
- **Kullanılamayan model:** `hans00/MOSS-TTS-Nano-GGUF` yalnız codec içerir, LLM bölümü çevrilmemiş; Pages'e konmadı. Pages için gerçekçi yollar: ince ayarlı Kokoro q8 ONNX (~90 MB) ya da Piper (63 MB). Ayrıntı `docs/SES_EGITIMI.md`.
- **Güncelleme:** manifestte `app` grubu; yerelde `index.html` varsa (zip/depo) uygulama dosyaları da eşitlenir. kur.bat kurulumunda uygulama için Pages kullanılır.
- **Sandbox sınırı:** huggingface.co ve github.io kabuktan erişilemiyor; canlı kontrol Chrome ile. Windows kur.bat ve gerçek GPU motorları burada denenemedi.


## 0.8.1 (2026-10-14) — yerel güncellenmiyor, sahte "kurulu", torch DLL
- **Belirti:** kur.bat sonrası localhost eski; yalnız Pages açılıyor; "Entry Point Not Found c10_cuda.dll/torch_cuda.dll/libtorchaudio.pyd"; Ses stüdyosu "kurulu" derken motorlar çalışmıyor; podcast'te 2 karakter.
- **Kök neden:** (1) eski sunucu 8765'i tutuyordu, yeni kod çalışmıyordu; kur.bat uygulama dosyalarını indirmiyor, Pages'i açıyordu. (2) pip omnivoice/voxcpm ile torch'u değiştirip torchaudio'yu karışık bırakmıştı. (3) /health yalnız paket varlığına bakıyordu. (4) kadro tarayıcı köküne bağlıydı (Pages ≠ localhost).
- **Önlem:** kur.bat eski süreci kapatır, her şeyi eşitler, localhost açar; torch tek komutla çifti kurulur ve doğrulanır; motor sağlığı gerçek import ile; kadro `/cast`; teslimde `tools/esitlik.py`.

## 0.8.1b (2026-10-14) — OmniVoice ses üretiyor ama seslendirmede "indirilmemiş"
- **Kök neden:** 0.8.1'deki %50 boyut eşiği, motorun kendi HF önbelleğine indirdiği (modeller klasöründe ~1 MB görünen) çalışan modeli "hazır değil" saydı; `_tts_model` 409 verdi.
- **Çözüm/önlem:** `modeller.kanitli()`: motorla tasarlanmış/klonlanmış ses varsa ya da bir üretim başarılıysa (`models_kanit.json`) model hazır sayılır. Kural: hazırlık, disk boyutundan değil çalışma kanıtından gelir; boyut yalnız kanıt yokken kullanılır.

## 0.8.1c (2026-10-14) — kur.bat "Sunucu 90 sn içinde açılmadı"
- **Kök neden:** `/health` ilk çağrıda motor denetimini (torch/omnivoice/voxcpm importları, Windows'ta soğuk açılışta dakikalarca) BEKLİYORDU; kur.bat'ın 2 sn'lik isteği hep zaman aşımına düştü. Hata ayrıntısı da boştu (günlük yoktu).
- **Önlem:** `/health` asla beklemez: denetim arka planda, sonuç `server/veri/probe.json`'a yazılır (yeniden başlatmada anında), bekleyenler `tts.probing`; arayüz "kontrol ediliyor…" yazar. Sunucu çıktısı `server/sunucu.log`; kur.bat başarısızlıkta son 25 satırı gösterir, 120 sn bekler. Kural: sağlık ucu hiçbir zaman yavaş işe bağlanmaz.

## 0.8.1d (2026-10-14) — Hugging Face model indirme "yarım 4 MB"da kalıyor
- **Belirti:** Ses stüdyosu › Modeller: indirme başlamıyor/ilerlemiyor, kartlar "yarım · 4 MB", hata görünmüyor.
- **Muhtemel kök neden (Windows'ta gerçek hata görülmedi):** `snapshot_download` sunucu iş parçacığında ve hf_xet ile çalışıyordu; takılınca ne öldürülebiliyor ne de hata okunabiliyordu.
- **Önlem:** indirme alt süreçte (öldürülebilir), XET kapalı, 60 sn ağ zaman aşımı, 120 sn büyüme yoksa öldür + en çok 4 deneme (kaldığı yerden sürer), stderr'den Türkçe hata + ham ayrıntı kartta görünür. Gerçek ağda **denenmedi**; kullanıcıdan kart hata metni istenecek.

## 0.8.1e (2026-10-14) — "yarım 1 MB" gerçek kök neden + kur.bat 120 sn
- **Kök neden (indirme):** Windows'ta (symlink izni yok) Hugging Face dosyaları `blobs/` değil `snapshots/` içinde GERÇEK dosya olarak saklar. `local_size` yalnız `blobs/`'u saydığı için tam inmiş modeller "yarım 1–4 MB" göründü; OmniVoice de "indirildi · 1 MB" göstermesinin sebebi buydu (0.8.1 boyut eşiği de bu yüzden yanlış sonuç verdi).
- **Önlem:** boyut = snapshots (gerçek dosya ya da symlink hedefi, tekrarsız) + `.incomplete`; indirme bitince `is_ready` doğrulanır, değilse net hata. Test: symlinksiz/symlinkli düzenler.
- **kur.bat:** bekleme `tools\bekle.ps1` (127.0.0.1, 300 sn, 15 sn'de bir son günlük satırı). Sunucu açılışı yavaşlatan şeyler kaldırıldı: kur.bat eşitledikten sonra başlatıcı tekrar eşitlemez (`DEFTER_SKIP_SYNC`), edge-tts günlük yükseltmesi sunucu içinde arka planda (60 sn sonra), Pocket gereksinim güncellemesi `-U`suz (torch'u yükseltip CUDA'yı bozmasın).

## 0.8.1f (2026-10-14) — kullanıcıda eski kur.bat
- **Belirti:** düzeltmeler yayınlandığı halde ekranda hâlâ "Sunucu 120 sn içinde açılmadı". **Kök neden:** kur.bat kendini güncellemez (manifest dışı) ve eski sürümün sağlık denetimi `localhost` + 2 sn zaman aşımı kullanıyordu; Windows'ta ::1 reddi ~1-2 sn sürüp IPv4'e düşmeyi zaman aşımına uğrattığından sunucu ayakta olsa bile hep "açılmadı" dedi.
- **Önlem:** kur.bat her çalışmada Pages'teki sürümü alıp farklıysa onu çalıştırır; denetim 127.0.0.1 + 3 sn. Kural: kullanıcıya verilen betik kendini güncellemeli.

## 0.8.1g (2026-10-14) — elle güncelleme kökten bitti (çekme modeli)
- Kullanıcı kur.bat ile kurduktan sonra EŞİT doğrulandı (96 dosya). Kalan sorun: sunucu yalnız açılışta güncelleniyordu.
- **Çözüm:** sunucu 10 dk'da bir `manifest.json`'u yoklar (GitOps "pull agent" / Watchtower mantığı); fark varsa indirir, Python/paket değiştiyse ve GPU üretimi/model indirmesi yoksa kendini yeniden başlatır (baslat döngüsü, kod 75). Windows açılışında gizli başlatma zaten var. Sonuç: push → ≤10 dk içinde kullanıcıda, hiçbir eylem gerekmez.
- **Neden git/GitHub Desktop/Docker değil:** Desktop otomatik pull yapmaz; git kullanıcıya çakışma/yerel değişiklik riski getirir; Docker Windows'ta GPU için WSL2+CUDA katmanı ekler. Manifest+SHA-256 güncelleyici aynı işi kurulumsuz yapar.
- **Kural:** kullanıcıya bir daha zip/bat indirtme; masaüstündeki zip kopyası kullanılmaz (tek kurulum: %LOCALAPPDATA%\DefterStudio).

## 0.8.2 (2026-10-14) — otomatik başlatma + token ölçümü + kural mimarisi
- **Otomatik başlatma:** soru kaldırıldı; kur.bat her çalışmada Başlangıç kısayolunu kurar, sunucu her açılışta denetler (`oto_baslat_kur`). Kapatma: `tools\otomatik-baslat-kaldir.bat` → `veri/otobaslat-kapali` işareti (sunucu geri kurmaz; kur.bat yeniden açar).
- **Token ölçümü:** `tools/token-rapor.py` (oturum JSONL → docs/token). İlk bulgu: harcamanın ~%88'i bağlam okuma/yazma; düşünme %5, yazma %7. Model değişimi ve 1 saati aşan ara önbelleği baştan yazdırıyor (bu oturumda 640k token). Kural: iş bitince/model değişince yeni oturum.
- **Kural mimarisi:** CLAUDE.md 991 → 497 kelime (her çağrıda okunur); ayrıntı docs/EL_KITABI.md, teslim adımları `.claude/skills/defter-teslim`, roller `.claude/agents/`. DEVIR_TESLIM 1868 → 282 kelime (geçmiş docs/TAMAMLANANLAR.md).

## 0.8.3 (2026-10-14) — önbellek mimarisi, resmi doğrulama, yanlış kurallar düzeltildi
- **Belirti:** kullanıcı limitin hızlı bittiğini söyledi; ekli makalelerdeki öneriler (`.claudeignore`, 250 karakter, "effort önbelleği sıfırlar") kurala girmeden önce doğrulanmamıştı.
- **Kök neden:** CLAUDE.md kuralı ve rapor ikincil bilgiyle yazıldı: "model/effort değişimi önbelleği sıfırlar" (5.5'te effort sıfırlamaz) ve "Opus ≈ Sonnet 2,8x" (resmi fiyat 2x; rapor, cost-state'ten ağırlıkla kur türetiyordu ve 5.5'in %5'lik okuma fiyatını bilmiyordu). Ayrıca otomatik sıkıştırma varsayılan ~967k'daydı: bağlam 554k'ya çıkıp her çağrıda yeniden okundu.
- **Çözüm (kaynak: code.claude.com prompt-caching/costs/model-config/skills, platform.claude.com pricing/prompting-claude-opus-5-5, 14.10.2026):** `.claude/settings.json` (`autoCompactWindow` 200k + `Read` yasakları), `tools/baglam-denetim.py` (teslimde, FAIL durdurur; kendi CLAUDE.md'mizi 689 kelimede yakaladı), rapor resmi `FIYAT` tablosuna ve model+effort kırılımına geçti, ajan `model:` sabitlendi (tasarımcı artık Sonnet), beceri `defter-baglam-bakim`, EL_KITABI baştan (§1 önbellek, §2 Opus 5.5 istem yazımı, §4 üstat ilkeleri, §7 bakım).
- **Rapor koruması:** Claude Code bağlam sıkıştırınca oturum kaydını kısaltıyor; `yaz()` daha eksik ölçümü eski tam ölçümün üstüne yazmaz (yeni kayıt `oturum·SS:DD` adıyla eklenir).
- **Önlem:** kural yazmadan önce resmi belge + tarih; kural dosyası boyutu ve ayarı betik denetler ("yokluk başarı sayılmaz").

## 0.8.4 (2026-10-15) — PC'de canlı doğrulama, bulut Claude 400, FSRS-6, istem/önbellek mimarisi
- **Canlı doğrulama (kullanıcının PC'si, Chrome üzerinden, 15.10.2026 00:10):** `/health` sürüm **0.8.1**, `update.latest` 0.8.2, `n: 0`, `available: false`. `/models`: indirilen kartlar `hazir` + doğru boyut (0.8.1e düzeltmesi tuttu). `/tts/selftest` (RTX 5090 Laptop, sm_120, torch 2.11+cu128, 22,6/23,9 GB boş): pockettr ✓ (k+e, 27 sn), OmniVoice ✓ (k+e, 26 sn), **VoxCPM ✗** `VoxCPM._generate() got an unexpected keyword argument 'seed'`, **Edge erkek ✗** `NoAudioReceived` (kadın aynı anda ✓).
- **Eski kodla çalışan sunucu — belirti:** diskte 0.8.2, çalışan süreç 0.8.1, arayüz "güncel" diyor. **Kök neden:** yeniden başlatma kararı yalnız *o turda* yazılan `.py` dosyasına bakıyordu; yarım kalan tur (indirme özeti tutmadı → `hata`) sonrası kalan dosyalar başka turda yazılınca `.py` yok → yeniden başlatma yok; plan "fark yok" dediği için bir daha hiç denenmez. **Çözüm:** açılıştaki `server/*.py` özetleri (`_ACILIS_PY`, hızlı yol mtime) ile `kod_eski()`; tur, `/update/apply` ve `/health` buna bakar (dosya farkı olmasa da boştayken yeniden başlar; arayüz "Sunucuyu yeniden başlat" der). **Önlem:** 7 sunucu testi (eski kod, GPU meşgul, başlatıcısız, health/apply). Kullanıcıdaki 0.8.1 süreci yeni dosyaları yazınca `.py` değiştiği için yeniden başlar; olmazsa bilgisayarı yeniden başlatmak yeter (Başlangıç kısayolu).
- **VoxCPM — kök neden:** kurulu voxcpm `generate(**kw)` argümanları iç fonksiyona aktarıyor, `seed` almıyor; yedek çağrı da aynı `seed`'i gönderiyordu. **Çözüm:** `adaptorler.esnek_cagir` (yalnız "unexpected keyword argument 'x'" ise x'i atıp yeniden dener, başka TypeError gizlenmez) + `tohumla` (random/numpy/torch tohumu: aynı ses yine tekrarlanabilir).
- **Edge — kök neden:** Microsoft ara sıra boş akış döndürüyor; kod yalnız 403'te yeniden deniyordu. **Çözüm:** NoAudioReceived/boş seste 1 sn ve 2,5 sn bekleyip iki kez daha dene; kalıcı hata (403, geçersiz ses) beklemeden yukarı çıkar. Test: 3. denemede ses gelir; sürekli boşta 3 denemede hata.
- **Bulut Claude hiç çalışmazdı — kök neden:** `js/llm.js` her isteğe `temperature: 0.6` koyuyordu; Claude 5 kuşağı varsayılan dışı `temperature/top_p/top_k`'yı 400 ile reddeder (Sonnet/Opus 5.5 geçiş rehberleri). Ayrıca `max_tokens` 16k (düşünme + metin) uzun çıktıyı kesebilirdi, effort ayarlanmadığı için Sonnet 5.5 varsayılan high'da düşünüyordu. **Çözüm:** Claude 5'te temperature yok, `output_config.effort` (hızlı/JSON low, gerisi medium), `max_tokens` 64k; 400'de hata metnine göre yalnız sorunlu alan atılıp bir kez yeniden denenir (OpenAI akıl yürüten modelleri de temperature reddeder). **Ders:** gerçek anahtarla denenmeyen yol "çalışıyor" sayılmaz; geçiş rehberi her model kuşağında okunur.
- **Gemini varsayılanı:** `gemini-2.5-flash` yeni kullanıcılara kapalı, `text-embedding-004` listede yok → `gemini-3.8-flash`, `gemini-embedding-001` (ai.google.dev models, 15.10.2026).
- **Sohbet önbelleği:** kaynaklar her turda son mesajdaydı (önek her turda değişir, yerel Qwen kaynağı her turda yeniden işler). Kaynaklar sistem istemine taşındı; bütün kaynak sığdığında Claude'da `cache_control` (sistem + otomatik).
- **Test yalıtımı — belirti:** temiz klonda `server_test` 163/164 ("Pocket TTS Türkçe: kuruluysa ilk sırada"). **Kök neden:** test geliştiricinin gerçek `server/veri/probe.json`'unu okuyordu (önceki makinede dosya vardı, geçti). **Çözüm:** testler geçici `DEFTER_DATA` kullanır; o kontrol motor denetimini açıkça "geçti" sayar. Veri klasörü tek değişken (`DATA_DIR`; `DEFTER_VERI` eski ad).
- **Model kataloğu:** çalışan pockettr modeli (wite-tech/pocket-tts-turkish, hazır 6 ses) katalogda yoktu; kart eklendi. alperiox kartı doğru (eski, referanslı `pocket` adaptörü) — ilk düzeltme denemem yanlıştı, geri alındı: iki ayrı model.
- **FSRS-6:** kart, hata defteri ve soru bankası tek `js/srs.js`; py-fsrs 6 ile altın değer testi (12/12, 1e-4). Eski kutu/üst üste doğru aralıkları ilk tekrarda FSRS durumuna taşınır (ilerleme kaybolmaz); `box` alanı seviye olarak sürer (arayüz, ustalık, hata defterinden çıkma).
- **Token/istem:** testler varsayılan yalnız ✗ + özet (e2e 189 satır → 1); ajan kartları `tools/effort/maxTurns` ayarda; dosyaya özgü kurallar `.claude/rules` (`paths:`) ile yalnız gerekince; CLAUDE.md 586 → ~480 kelime; `promptCacheTtl: 1h`; `defter-istem` becerisi (kullanıcının `opus-5-5-prompt` eki, resmi rehberle doğrulanmış Türkçe uyarlama); `baglam-denetim.py` istem denetimi eskimiş kalıpta teslimi durdurur (ilk çalıştırmada CLAUDE.md'deki kendi örnek cümlemizi yakaladı).
