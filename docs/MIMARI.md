# Defter Studio — Mimari

Defter Studio, NotebookLM benzeri bir "kaynaklarla çalışan defter" uygulamasıdır. Üç katmandan oluşur ve
**üçüncüsü hariç hepsi zorunlu değildir**: uygulama tek başına GitHub Pages'ten açılır, model olarak ister
bilgisayarınızdaki Ollama'yı ister bir bulut API'sini kullanır.

```
┌───────────────────────────── Tarayıcı (GitHub Pages, statik) ─────────────────────────────┐
│  Arayüz (Vanilla JS, ES modülleri, derleme adımı yok)                                    │
│   Kaynaklar │ Sohbet (alıntılı) │ Studio: 9 araç + Notlar │ Görüntüleyici │ Ayarlar         │
│                                                                                           │
│  Kaynak işleme: pdf.js (PDF) · mammoth (DOCX) · DOMPurify+marked (Markdown)               │
│  RAG: parçalama → BM25 (Türkçe gövdeleme) + isteğe bağlı embedding vektörleri            │
│  Veritabanı: IndexedDB (Dexie) — defterler, kaynaklar, parçalar, sohbet, içerik, sürümler │
│  Tarayıcı sesi: Web Speech API  ·  Video: Canvas + MediaRecorder (WebM)                   │
└───────────────┬───────────────────────────────────────────┬───────────────────────────────┘
                │ fetch (CORS)                              │ fetch (CORS, isteğe bağlı)
┌───────────────▼──────────────────┐        ┌───────────────▼───────────────────────────────┐
│ Dil modeli (birini seçin)         │        │ Lokal yardımcı sunucu (server/, FastAPI)       │
│ • Ollama (lokal, RTX 5090)        │        │ • /tts  Piper · XTTS-v2 · Chatterbox · Edge    │
│ • LM Studio / llama.cpp / vLLM    │        │ • /transcribe  faster-whisper (GPU)            │
│ • Gemini · Groq · OpenRouter      │        │ • /fetch  trafilatura   • /youtube  altyazı    │
│ • OpenAI · Anthropic · özel uç    │        │ • /search DuckDuckGo                           │
└──────────────────────────────────┘        └────────────────────────────────────────────────┘
```

## Neden bu yapı?

| Karar | Gerekçe |
|---|---|
| **Statik site + tarayıcı veritabanı** | GitHub Pages ücretsiz; sunucu, hesap, sunucu tarafı veritabanı gerekmez. Her `git push` önizlemeyi günceller (Deck Cadet ile aynı model). |
| **Derleme adımı yok** | Kütüphaneler `js/vendor/` içinde. Dosyayı düzenleyip push etmek yeterli; Node kurulumu gerekmez. |
| **Model bağımsız (`js/llm.js`)** | Tek `chat()` arayüzü. Lokal Ollama ile tamamen ücretsiz; isteyen kendi API anahtarını girer. Anahtarlar yalnız o tarayıcıda kalır. |
| **Yapılandırılmış JSON üretimi** | Her Studio aracı modelden şemalı JSON ister (`js/studio/gen.js`); görüntüleyiciler bu veriyi çizer. Böylece slayt, test, kart vb. sonradan düzenlenebilir ve yeniden temalanabilir. |
| **Çok adımlı üretim** | Podcast önce bölüm planı, sonra her bölüm için diyalog yazar. Lokal modellerin çıktı sınırına takılmadan uzun ve tutarlı senaryo çıkar. |
| **İş kuyruğu** | Üretimler sırayla çalışır; tek GPU'yu boğmaz. Arka planda çalışırken sohbet edebilirsiniz. |
| **Yardımcı sunucu isteğe bağlı** | Tarayıcı kaliteli Türkçe ses üretemez, ses dosyası dökemez, başka sitelerin sayfasını okuyamaz (CORS). Bunlar için küçük bir Python sunucusu. |

## Veritabanı: nerede, nasıl saklanıyor?

Evet, bir veritabanı var: tarayıcının kendi **IndexedDB** veritabanı (Dexie ile). Sunucuya hiçbir şey gitmez.
Tablolar (`js/db.js`):

| Tablo | İçerik |
|---|---|
| `notebooks` | Defterler (ad, simge, kaynak özeti) |
| `sources` | Kaynakların tam metni, türü, seçili olup olmadığı |
| `chunks` | Arama için ~1400 karakterlik parçalar, sayfa numarası, kelime listesi, varsa embedding vektörü |
| `messages` | Sohbet geçmişi ve her yanıtın kaynak listesi |
| `artifacts` | Studio çıktıları: tür, başlık, durum (sırada/çalışıyor/hazır/hata), seçenekler, içerik (JSON), puan |
| `versions` | Her düzenleme ve yeniden üretimden önceki hâl (geçmişe dönmek için) |
| `blobs` | Sunucuda üretilen ses parçaları (her satır önbelleğe alınır, tekrar üretilmez) |
| `settings` | Model ayarları, tema, son kullanılan seçenekler |

Yedek: her defter tek bir `.defter.json` dosyası olarak dışa aktarılır ve başka bir tarayıcıya / bilgisayara
içe aktarılır. Ayarlar > "Kalıcı depolama iste" tarayıcının verileri kendiliğinden silmesini engeller.

## Kaydedilen içerikler tek ekranda nasıl yönetiliyor?

- **Liste:** Sağdaki Studio panelinde, araç kutucuklarının altında defterin tüm geçmiş içerikleri en yeni üstte
  listelenir (podcast, video, slayt, kart, test, rapor, harita, infografik, tablo, not). Her satırda tür, kaynak sayısı ve zaman.
- **Açma:** Satıra tıklayınca içerik orta+sağ alanı kaplayan görüntüleyicide açılır ("Studio › Tür").
  Adres çubuğu `#/n/<defter>/a/<içerik>` olur; yer imi eklenebilir, geri tuşu çalışır.
- **Düzenleme:** Her görüntüleyicide yerinde düzenleme var: podcast dökümü, slayt metinleri, rapor Markdown'ı,
  tablo hücreleri; diğerlerinde "Düzenle" JSON düzenleyicisini açar. Başlık doğrudan tıklanıp değiştirilir.
- **Geçmişe dönme:** ⟲ "Sürüm geçmişi" her eski hâli tarihiyle listeler: önizle, geri yükle, sil.
- **Yeniden üretme:** Aynı ayarlarla yeniden üretilir; önceki hâl otomatik olarak sürüm geçmişine girer.
- **Silme:** ⋮ menüsü › Sil (onay ister). İçerik, tüm sürümleri ve ses dosyalarıyla birlikte silinir.
- **İndirme:** podcast → WAV (sunucu sesiyle), video → WebM, slayt → PDF/HTML, rapor → PDF/Markdown,
  kartlar → Anki CSV, tablo → CSV/Markdown, harita → SVG/PNG, infografik → PNG/PDF, hepsi → JSON/metin.

## Studio araçları

| Araç | Üretim | Görüntüleyici |
|---|---|---|
| Sesli Özet | 4 biçim (Ayrıntılı inceleme, Özet, Eleştiri, Tartışma), plan → bölüm bölüm diyalog | Oynatıcı, hız, ileri/geri, satır vurgusu, döküm düzenleme, WAV |
| Slayt Sunusu | Ayrıntılı / Sunucu slaytları; başlık, madde, iki sütun, sayı, alıntı düzenleri | 4 tema, küçük resimler, notlar, tam ekran sunum, PDF/HTML |
| Videolu Özet | Kısa (dikey 9:16) / Açıklayıcı (yatay 16:9) sahne senaryosu + seslendirme | Canvas animasyon, altyazı, WebM kayıt |
| Zihin Haritası | Hiyerarşik kavram ağacı + düğüm notları | Katlanır dallar, yakınlaştırma, sürükleme, "Sohbette sor", SVG/PNG |
| Rapor | 5 şablon (Öğrenmeye genel bakış, Brifing, Çalışma kılavuzu, Blog, Özel) | İçindekiler, kaynak rozetleri, **etkileşimli gömme** (rapora kart/test/harita gömülür) |
| Bilgi kartları | Sayı ve zorluk seçimi | Çevirme, Bildim/Bilemedim, Leitner aralıklı tekrar, Anki CSV |
| Test | Sayı ve zorluk, ipucu, gerekçeli açıklama | Tek tek sorular, puan ekranı, yanlışları tekrar, "yeni test oluştur", deneme geçmişi |
| İnfografik | Bilgi kutuları, sayılar, zaman çizelgesi, karşılaştırma tablosu | 5 tema × 3 yön, PNG/PDF |
| Veri Tablosu | İsteğe göre sütunlar, satır başına kaynak | Sıralama, arama, hücre düzenleme, CSV |

## RTX 5090 (24 GB) dizüstü için model seçimi

Artificial Analysis AgentPerf-Local testinde (4-bit, masaüstü RTX 5090 32 GB) aynı iş için Qwen3.6-35B-A3B
(3B aktif) en hızlı, yoğun Qwen3.8-27B ise daha yavaş ama daha akıllı çıktı. Dizüstü 5090'ın 24 GB belleği ve
daha düşük bant genişliği nedeniyle hızlar bunun altında kalır; model seçimi aynı mantıkla yapılır.

| Rol | Model (Ollama) | 4-bit boyut | 24 GB'a sığar mı | Not |
|---|---|---|---|---|
| **Ana model (kalite)** | `qwen3.8:27b` | ~18 GB | Evet, 32K bağlamla rahat | Apache 2.0, metin+görsel, 256K bağlam etiketi |
| **Ana model (hız)** | `qwen3.6:35b-a3b` | ~21 GB | Sıkışık, ~16-32K bağlam | MoE, testte 27B'den 2,5-3,3 kat hızlı |
| Hızlı yardımcı | `qwen3.5:9b` | ~6 GB | Evet | "Hızlı model" rolü: özet, öneri, podcast planı |
| Embedding | `bge-m3` | ~1,2 GB | Evet | Türkçe dahil çok dilli anlamsal arama |
| Ses dökümü | faster-whisper `large-v3-turbo` | ~1,6 GB | Evet | Yardımcı sunucuda |
| Seslendirme | Piper (CPU) / XTTS-v2 / Chatterbox | 0–6 GB | Evet | Yardımcı sunucuda |

**Birden fazla model aynı anda belleğe sığmaz.** 27B + 35B-A3B toplamı 24 GB'ı aşar; Ollama modeller arasında
geçerken her seferinde yeniden yükler. Bu yüzden üretimler kuyrukta sırayla çalışır ve "Hızlı model" rolü
isteğe bağlıdır. 1T parametreli MiMo-V2.6-Pro, 753B GLM-5.3, 2,8T Kimi K3 gibi en zeki açık modeller bu
bilgisayarda çalışmaz; onlar API üzerinden kullanılır.

## Maliyet

| Yol | Maliyet |
|---|---|
| GitHub Pages + Ollama + Piper + Whisper | **0 TL**, tamamen açık kaynak, internetsiz çalışır (ilk indirmeler hariç) |
| Gemini / Groq / OpenRouter ücretsiz katmanı | 0 TL; istek sınırı vardır, veriler sağlayıcıya gider |
| OpenAI / Anthropic | Kullandıkça öde |
| Edge-TTS sesleri | Ücretsiz ama çevrimiçi ve açık kaynak değil |

## Bilinen sınırlar ve yol haritası

- Tarayıcı sesiyle (Web Speech) podcast dinlenir ama dosyaya kaydedilemez; WAV ve sesli video için yardımcı sunucu gerekir.
- İnfografik ve video görselleri şablon + emoji ile çizilir; yapay zeka görsel üretimi (ComfyUI + FLUX.1-schnell) yol haritasında.
- Taranmış (resim) PDF'lerde metin yoksa OCR gerekir; yol haritasında (Tesseract/PaddleOCR sunucu ucu).
- Veriler tarayıcıya bağlıdır; cihazlar arası eşitleme için JSON yedeği kullanılır.
