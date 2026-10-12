# Defter Studio — Mimari (0.3.0)

Defter Studio, NotebookLM benzeri bir "kaynaklarla çalışan defter" ve sınav hazırlık uygulamasıdır.

- **Zorunlu olan tek şey tarayıcı.** Uygulama GitHub Pages'ten ya da lokal sunucudan açılır.
- **Model seçimi kullanıcıda.** Bilgisayardaki Ollama ya da kullanıcının kendi API anahtarı kullanılır.
- **Hiçbir veri bizim sunucumuza gitmez.** Her şey tarayıcının kendi veritabanında saklanır.

## 1. Katmanlar (yukarıdan aşağı)

```
┌──────────────────────────── Tarayıcı (GitHub Pages veya http://localhost:8765, statik) ───────────────────────────┐
│ ARAYÜZ  app.js (yönlendirme, paneller, ayarlar, iş kuyruğu) · ui.js (h(), modal, toast, markdown)                   │
│         voice-settings.js · bank-ui.js · pomodoro.js · learn.js (puan, rozet, hata defteri, yöntemler kütüphanesi)   │
│ STUDIO  studio/gen.js (14 aracın istemleri + JSON şemaları) · studio/batch.js (tam sayıda, parti parti üretim)      │
│         studio/views/*.js (her aracın görüntüleyicisi: render + toText)                                            │
│ DOĞRULAMA verify.js (alıntı kaynakta var mı, cevabı destekliyor mu; 0 token) · gen.grounding() (sohbet)            │
│ BİLGİ   sources.js (PDF/DOCX/HTML/metin → parça, BM25 + embedding arama, bağlam ve dilimler) · ocr.js (Tesseract)  │
│ SES     tts.js (8 motor, otomatik sıra + geri düşme, akışlı parçalar, karıştırma, WAV) · textnorm.js (Türkçe okunuş) │
│         piper-worker.js (Piper'ı arka plan iş parçacığında çalıştırır)                                               │
│ MODEL   llm.js (tek chat() arayüzü: Ollama, OpenAI uyumlu 12 sağlayıcı, Gemini, Anthropic)                          │
│ VERİ    db.js (IndexedDB/Dexie, şema v2) · bank.js (soru bankası, aralıklı tekrar, arka planda doldurma)             │
│ ÇEVRİMDIŞI  sw.js (önce ağ, yoksa önbellek)                                                                         │
└───────────────┬───────────────────────────────┬──────────────────────────────────┬──────────────────────────────────┘
                │ fetch (CORS)                  │ fetch (CORS)                      │ fetch (aynı köken ya da CORS)
┌───────────────▼──────────────┐ ┌──────────────▼─────────────────────────┐ ┌──────▼──────────────────────────────────┐
│ Dil modeli (birini seçin)     │ │ Ses API'leri (isteğe bağlı anahtar)     │ │ Lokal yardımcı sunucu (server/main.py)    │
│ Ollama · LM Studio · vLLM     │ │ ElevenLabs · Gemini TTS · MiniMax       │ │ uygulamayı sunar · /tts (Chatterbox klon, │
│ Gemini · Groq · OpenRouter    │ │ Google Cloud TTS · Azure · OpenAI       │ │ XTTS, edge-tts, Piper) · /voices · /trans-│
│ OpenAI · Anthropic · xAI      │ │ MiniMax klonlama/ses tasarımı           │ │ cribe (Whisper) · /fetch · /youtube ·     │
│ DeepSeek · Qwen · Mistral …   │ └─────────────────────────────────────────┘ │ /search · /ollama vekili · /proxy         │
└───────────────────────────────┘                                            └───────────────────────────────────────────┘
```

## 2. Temel kararlar

| Karar | Gerekçe |
|---|---|
| **Statik site + tarayıcı veritabanı** | GitHub Pages ücretsizdir; sunucu, hesap ya da sunucu tarafı veritabanı gerekmez. Her `git push` önizlemeyi günceller. |
| **Derleme adımı yok, kütüphaneler `js/vendor/`'da** | Dosyayı düzenleyip push etmek yeterli; CDN kesintisi uygulamayı bozmaz. Tek istisna: Piper'ın onnxruntime'ı jsdelivr'den yüklenir. Sebebi 25 MB'lık WASM dosyasıdır. |
| **Model bağımsız `chat()`** | Lokal Ollama ile tamamen ücretsiz kullanılır, isteyen kendi API anahtarını girer. Anahtarlar yalnız o tarayıcıda kalır. |
| **Yapılandırılmış JSON üretimi** | Her araç şemalı JSON ister. Görüntüleyiciler bu veriyi çizer; sonradan düzenleme ve yeniden temalama mümkün olur. |
| **Tam sayı = parti parti üretim** | Lokal modeller tek seferde 100 soru yazamaz. `batch.js` kaynağı dilimlere böler, her partiyi farklı dilimden besler ve tekrarları eler. |
| **Kanıtlı üretim (halüsinasyon denetimi)** | Her soru ve kart kaynaktan birebir alıntı (`evidence`) taşır. Doğrulama `verify.js`'te yapılır ve token harcamaz. Alıntı bulunamazsa ya da cevabı desteklemezse öğe atılır, yerine yenisi istenir. |
| **Soru bankası** | Sorular bir kez lokal modelle üretilir, sonra her test 0 token ile oluşur. Bulut kullanımı en aza iner. |
| **Ses: çok motor + geri düşme** | Hiçbir ücretsiz motor her şeyi yapmıyor. Piper yalnız erkek ses veriyor, Gemini anahtar istiyor. Otomatik mod anahtarı olan en iyi motoru seçer, hata olursa sıradakine geçer. |
| **Akışlı ses** | Uzun podcast'lerde kullanıcı beklemez: hazır olan bölümler hemen çalınır, sonunda tek parça WAV'a geçilir. |
| **İş kuyruğu** | Üretimler sırayla çalışır, tek GPU'yu boğmaz. Soru bankası ayrı bir arka plan döngüsüdür ve sayfa kapansa da kaldığı yerden devam eder. |
| **Yardımcı sunucu isteğe bağlı** | Tarayıcının tek başına yapamadıkları için kullanılır: klonlu ses, Whisper dökümü, başka sitelerin sayfaları, CORS kapalı API'ler. Uygulamayı da sunar; bu adresten açınca Ollama izin ayarı gerekmez. |

## 3. Diller ve kütüphaneler: hangisi, neden, gerekli mi?

| Bileşen | Dil / kütüphane | Boyut | Gerekli mi? | Neden bu |
|---|---|---|---|---|
| Arayüz | Vanilla JavaScript (ES modülleri) | — | Evet | Derleme yok, bağımlılık yok, her tarayıcıda çalışır. React/Vue eklemek derleme adımı ve yükseltme yükü getirirdi. |
| Stil | CSS (değişkenli temalar) | 45 KB | Evet | Koyu/açık tema, mobil düzen; framework gerekmez. |
| Veritabanı | Dexie 4 (IndexedDB) | 256 KB | Evet | Şema sürümleme, dizinler, toplu işlemler. Ham IndexedDB API'si çok hataya açık. |
| PDF | pdf.js | 1,7 MB | Evet | Metin katmanı ve sayfa numarası; taranmış PDF'i OCR için çizer. |
| DOCX okuma | mammoth | 400 KB | Evet (yalnız okuma) | Word kaynaklarını metne çevirir. Uygulama Word çıktısı **üretmez**. |
| Markdown | marked + DOMPurify | 155 KB | Evet | Rapor ve sohbet; DOMPurify XSS'e karşı zorunlu. |
| OCR | Tesseract.js 5 + Türkçe `best_int` | 9,8 MB | Taranmış PDF için | Çevrimdışı ve ücretsiz. Lokal sunucuya PaddleOCR / qwen3-vl eklenebilir (yol haritası). |
| Tarayıcı TTS | Piper (onnxruntime-web) | ~60 MB (ilk kullanım) | İsteğe bağlı | Tek ücretsiz ve çevrimdışı Türkçe ses. Türkçe sesleri yalnız erkek. |
| Lokal sunucu | Python 3.11+, FastAPI, uvicorn, httpx | — | İsteğe bağlı | Küçük, hızlı, yaygın; Windows'ta `baslat.bat` ile kurulur. |
| Lokal ses | edge-tts, piper-tts; GPU: Chatterbox Multilingual (MIT), XTTS-v2 | — | İsteğe bağlı | Chatterbox: açık kaynak, Türkçe, klonlama. XTTS: en doğal ama ticari olmayan lisans. |
| Lokal STT | faster-whisper (large-v3-turbo) | ~1,6 GB | İsteğe bağlı | Ses ve YouTube dökümü; GPU yoksa CPU'ya düşer. |
| Web okuma | trafilatura, youtube-transcript-api, yt-dlp, ddgs | — | İsteğe bağlı | CORS nedeniyle tarayıcı başka sitelerin sayfasını okuyamaz. |
| Testler | Python + Playwright, sahte model | — | Geliştirme | Gerçek model ve internet olmadan 36 uçtan uca kontrol. |

Kullanılmayanlar ve gerekçeleri:
- **TypeScript ve derleyici yok.** Derleme adımı GitHub Pages akışını bozardı. Tip güvenliği JSDoc yorumlarıyla sağlanır.
- **Sunucu tarafı veritabanı yok.** Kişisel veriler tarayıcıda kalır; cihazlar arası taşıma JSON yedeğiyle yapılır.
- **CDN'e bağımlılık yok** (Piper'ın onnxruntime'ı hariç). Sandbox'larda ve şirket ağlarında CDN engellenebiliyor.

## 4. Veri modeli (IndexedDB, `js/db.js`)

| Tablo | İçerik |
|---|---|
| `notebooks` | Defterler |
| `sources` | Kaynakların tam metni, türü, seçimi, OCR durumu |
| `chunks` | ~1400 karakterlik parçalar (200 karakter bindirmeli), sayfa no, isteğe bağlı embedding |
| `messages` | Sohbet; her yanıtın kaynak listesi ve "kaynaklı" ölçümü |
| `artifacts` | Studio çıktıları: tür, durum, seçenekler, içerik (JSON), doğrulama özeti |
| `versions` | Her düzenleme/yeniden üretimden önceki hâl |
| `blobs` | Ses karışımları (`mix`), taranmış PDF dosyası (`src:<id>`); anahtar metin + motor + ses özetidir |
| `questions` (v2) | Soru bankası: soru, şıklar, cevap, alıntı, kaynak, konu, istatistik, sonraki tekrar zamanı |
| `settings` | Model, ses, tema, son seçenekler, banka işi (`bank:<defter>`), sınav tarihi |

Şema değişirse `db.version(n+1)` eklenir, eski sürüm silinmez. Yedek dosyası (`.defter.json`) soru bankasını da içerir;
ses dosyalarını içermez, onlar yeniden üretilir.

## 5. Üretim hattı

1. **Bağlam.** `buildContext` odak varsa BM25 ve embedding ile ilgili parçaları seçer; yoksa her kaynaktan eşit aralıklı parçalar alır. `sliceContexts` kaynağın tamamını ardışık dilimlere böler.
2. **İstem.** Ortak kurallar: yalnız kaynağa dayan, sayıları aynen aktar, yalnız JSON döndür. Alıntı kuralı: kanıtı kelimesi kelimesine kopyala.
3. **Model.** `chatJSON` bozuk JSON'u bir kez onarma isteğiyle düzeltir. Ollama'da `format: json`, `think: false` ve `keep_alive: 30m` kullanılır. Olgusal işlerde sıcaklık 0,2–0,35'tir.
4. **Doğrulama.** `verifyItem` alıntıyı parçada arar: birebir eşleşme ya da 4 kelimelik pencerelerin en az %60'ı. Doğru cevabın kelimeleri alıntıda geçmelidir. Geçmeyen öğe elenir.
5. **Birleştirme.** Partilerin parça numaraları tek listeye taşınır; tekrarlar elenir; şıklar karıştırılır.
6. **Kayıt.** Önceki hâl `versions`'a, yeni içerik `artifacts`'a yazılır. Podcast için ses hemen üretilip önbelleğe alınır.

## 6. Ses hattı

1. **Metin.** `normalizeTR` Türkçe okunuşa çevirir: sayılar, yüzdeler, birimler, kısaltmalar (GMDSS → "ge me de se se").
2. **Motor seçimi.** Otomatik sıra: ElevenLabs → Gemini → MiniMax → Google → Azure → OpenAI → lokal sunucu → Piper. Hata olursa sıradakine geçilir. 429 ve 5xx hatalarında 3 kez yeniden denenir.
3. **Üretim.** Gemini ve ElevenLabs çok konuşmacılı parçalarla, diğerleri satır satır üretir (bulutta 3 eşzamanlı). Hazır parçalar sırayla `onPiece` ile oynatıcıya gelir.
4. **Karıştırma.** Konuşmacı değişiminde ~0,3 sn, aynı konuşmacıda ~0,18 sn ara verilir. Ses seviyesi ~-18 dBFS'e dengelenir, yumuşak sınırlayıcı uygulanır, 44,1 kHz WAV üretilir ve satır zamanlamaları çıkarılır.
5. **Kadın sesi.** Piper'da Türkçe kadın ses yok. Kadın konuşmacı varken Piper seçilirse oynatıcı ücretsiz çözümleri gösterir: Gemini anahtarı, lokal sunucu, Azure, Google.
6. **Klonlama.** MiniMax'ta kayıt yüklenir, klonlanır ve `voice_id` alınır; tarayıcıdan doğrudan çalışır. Lokal sunucuda kayıt `voices/<ad>.wav` olarak saklanır ve Chatterbox/XTTS referansı olur.

## 7. RTX 5090 dizüstü (24 GB) için model seçimi

| Rol | Model | 4-bit boyut | Not |
|---|---|---|---|
| Ana model | `qwen3.8:27b` (kullanıcıda kurulu) | ~18 GB | Türkçe iyi, JSON güvenilir |
| Hızlı yardımcı | `llama3.1:8b` (kurulu) ya da Qwen 8–9B | ~5–6 GB | Öneri, özet, podcast planı |
| Embedding | `bge-m3` (önerilir) | ~1,2 GB | Kurulu `nomic-embed-text` İngilizce ağırlıklıdır; Türkçe için bge-m3 daha iyi sonuç verir |
| Görsel / OCR | `qwen3-vl:8b` (kurulu) | ~6 GB | Yol haritası: taranmış sayfaları görsel modelle okumak |
| Seslendirme | Chatterbox Multilingual | ~3–5 GB | `tools/kur-gpu.bat` |
| Döküm | faster-whisper large-v3-turbo | ~2–3 GB | Lokal sunucu |

Modeller aynı anda belleğe sığmaz; Ollama boştaki modeli boşaltır. Üretimler kuyrukta sırayla çalışır.

## 8. Güvenlik ve gizlilik

- **API anahtarları** yalnız tarayıcının IndexedDB'sinde durur. GitHub'a, dokümanlara ve test dosyalarına asla yazılmaz.
  Gemini ve Google anahtarı adreste değil, başlıkta gönderilir.
- **Lokal sunucu** yalnız `127.0.0.1`'de dinler. `/proxy` yalnız izin listesindeki alan adlarına gider. Statik dosya sunucusu
  `.git`, `server/`, `tools/` ve `tests/` klasörlerini dışarı vermez.
- **Kullanıcı ses kayıtları** (`server/voices/`) `.gitignore`'dadır.
- **Klonlama** yalnız kendi sesiniz ya da izin aldığınız bir ses için yapılır; arayüz bunu onaylatır.
- **Tarayıcı localhost'a kendiliğinden istek atmaz.** Ollama ancak kullanıcı seçince çağrılır, sunucu ancak adres girilince ya da uygulama zaten lokal sunucudan açılmışsa.
