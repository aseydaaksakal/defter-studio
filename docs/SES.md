# Ses modelleri: hangisi, nerede, ne kadar?

Son güncelleme: 2026-10-12. Kaynaklar: Artificial Analysis (AA) TTS/STT/Speech-to-Speech sıralamaları (kullanıcının ekran
görüntüleri), MiniMax, Google, ElevenLabs, Azure, Google Cloud resmî dokümanları, aşağıdaki bağlantılar.
Fiyatlar ve sıralamalar sık değişir; karar vermeden önce bağlantılardan kontrol edin.

## Kısa cevap

| Soru | Cevap |
|---|---|
| En kaliteli **ücretsiz, açık kaynak, lokal** Türkçe seslendirme | **Chatterbox Multilingual** (Resemble AI, MIT lisans, Türkçe var, 10 sn referansla ses klonlama, duygu ayarı). RTX 5090'da rahat çalışır. En doğal Türkçe olarak değerlendirilen alternatif **XTTS-v2** (6 sn klonlama) ama lisansı ticari olmayan (CPML). |
| Lokal **STT** (sesten yazıya) | **faster-whisper large-v3-turbo** (MIT, hızlı). En doğru Türkçe için Whisper large-v3 tabanlı Türkçe ince ayarlı **BuzzASR/turkish** (MIT; FLEURS'ta CER %2,0, WER %7,99). |
| Lokal **podcast seslendirme** | Lokal sunucu: Chatterbox (kendi kaydettiğiniz kadın + erkek referans sesle) → yoksa edge-tts (Emel/Ahmet) → yoksa Piper. |
| Lokal **speech-to-speech** (sesli sohbet) | Türkçe konuşan, iyi, açık ağırlıklı uçtan uca model yok. Pratik zincir: Whisper → Ollama (qwen3.8:27b) → Chatterbox. AA listesinin başındakiler (GPT-Live-1 Astra 83,2; Gemini 3.8 Live 82,6; Grok Voice Think Fast 2.0 81,3) ücretli bulut. |
| **Para verilecek en kaliteli ses** | **ElevenLabs Eleven v4** (`eleven_v4`). AA TTS Arena'da 1. ve 2. (v4 Turbo 1327, v4 1323). Türkçe destekli; çok konuşmacılı diyalog uç noktası var. |
| **Fiyat/performans** | **Gemini 3.8 Flash TTS** (AA 1272, ücretsiz katmanı var, tek istekte 2 konuşmacı, 130+ dil, Türkçe dahil). |
| **MiniMax** | Speech 2.8 HD (AA ~1173) sıralamada daha geride. Güçlü yanları ses klonlama ve metinle ses tasarımı. Hazır Türkçe sesleri `Turkish_CalmWoman` (kadın) ve `Turkish_Trustworthyman` (erkek). |
| **Ücretsiz kadın + erkek doğal Türkçe** | 1) Gemini anahtarı (AI Studio, ücretsiz katman). 2) Azure Speech F0: ayda 0,5 milyon karakter (Emel/Ahmet). 3) Google Cloud TTS: Chirp 3 HD ayda 1 milyon karakter ücretsiz (faturalandırma hesabı gerekir). 4) ElevenLabs Free: ayda 10.000 kredi. 5) Lokal sunucuda edge-tts (resmî değil). |

## Kotasız, ücretsiz, lokal kadın + erkek ses (0.3.2)

**Neden Gemini sesi bir dakika sonra Piper'a döndü?**
- Gemini'nin ücretsiz TTS katmanında dakikalık ve günlük istek sınırı çok düşük.
- Podcast parça parça seslendirildiği için birkaç istekten sonra 429 (kota) hatası geldi. Uygulama da birkaç saniye bekleyip sıradaki motora, yani erkek Piper'a geçti.
- 0.3.2'deki düzeltme:
  - Dakikalık sınırda Google'ın söylediği süre kadar bekleniyor ve kaldığı parçadan devam ediliyor.
  - Biten parçalar önbellekte tutuluyor; yeniden üretimde yeniden harcanmıyor.
  - Parçalar 2 kat büyütüldü, böylece daha az istek gidiyor.
  - Kadın konuşmacı varsa önce kadın sesi verebilen motorlar deneniyor.
  - Günlük kota bitince bu açıkça yazılıyor.

**Kalıcı ve kotasız çözüm: lokal sunucu**

| Yol | Kurulum | Kadın / erkek | Lisans |
|---|---|---|---|
| edge-tts (Emel / Ahmet) | `server\baslat.bat` (GPU gerekmez) | ✅ / ✅ | Ücretsiz Microsoft çevrimiçi sesi; resmî API değil, internet gerekir |
| **OmniVoice** (k2-fsa, 600+ dil) | `tools\kur-gpu.bat` | ✅ / ✅ — referans kayıt gerekmeden "kadın, orta yaş" / "erkek, orta yaş" sesi bir kez tasarlanır, sonra hep aynı sesle okunur | Kod Apache-2.0, ağırlıklar ticari olmayan (kişisel kullanım serbest) |
| **Pocket TTS Türkçe** (alperiox, Kyutai tabanlı) | `tools\kur-gpu.bat` | Tasarlanan ya da kendi kaydınızla | MIT; CPU'da gerçek zamanın 5 katı |
| Chatterbox Multilingual | `tools\kur-chatterbox.bat` (ileri düzey) | Referans kayıtla | MIT |

Hugging Face'teki tarayıcıda çalışan Türkçe modeller (`antalia-mini-web-onnx`, `ema-lightning-web-onnx`) Apache-2.0 lisanslı ve
çok hafif (~50 MB). Ancak **tek erkek sesleri var** (kart: "one synthetic male voice"). Piper'ın yerine daha iyi bir tarayıcı erkek
sesi olarak yol haritasındalar.

`kugelaudio-0-open` (MIT, 7–9B, ~19 GB VRAM) Türkçeyi destekliyor. Ama hazır sesleri Almanca ve İngilizce, klonlaması yok;
Türkçede önerilmez.

## Ses kütüphanesi, klon ve model yöneticisi (0.4.0)

- **OmniVoice nerede çalışır?** Yalnız lokal sunucuda (PyTorch + GPU). Tarayıcıda çalışmaz. Pages üzerindeki uygulama lokal sunucuya (`localhost:8765`) bağlanınca aynı sesleri kullanır; Chrome yerel ağ izni sorar.
- **Çok ses:** Ayarlar → Lokal sunucu → "Ses kütüphanesi". 8 hazır tasarım (kadın/erkek, genç/orta yaş/derin/öğretmen…) tek tuşla üretilir. OmniVoice tasarımı yalnız zh/en ile eğitildi; Türkçede kararsız olabilir, klon en kararlı yoldur.
- **Klon (sınırsız):** Kayıt yükle, ad + cinsiyet + (varsa) transkript gir, izin kutusunu işaretle. Klon kütüphaneye girer; podcast kadrosunda (en fazla 6) ve video anlatıcısında seçilir. Sayı sınırı yoktur, disk yeter.
- **Kadro:** Podcast seçeneklerinde "Konuşmacı sayısı" (3/4/5) ve "Ses kadrom (Ayarlar)".
- **Model yöneticisi:** "Lokal modeller" bölümü; 25 MIT model + VoxCPM2 + OmniVoice. İndirmeden önce boyut sorulur. 👍 kalır, 👎 diskten silinir. Komut satırı: `tools/modelleri-indir.bat`.
- **Çalıştırılabilenler:** Trendyol-TTS, VoxCPM2, Pocket TTS, OmniVoice (+ Bark, KugelAudio dene-dinle). Diğerleri "yalnız indir"; MLX olanlar yalnız Apple.
- **Lisans/uyarı:** OmniVoice ağırlıkları ticari değil. Gerçek kişi sesi taklit eden modeller (`omersaidd/*`, `emirhanbilgic/*`) yalnız kendi sesiniz/izinli kullanım için.

## Neden "sadece erkek sesi" çıkıyordu?
- Tarayıcıda çalışan ücretsiz **Piper**'ın üç Türkçe sesi var (dfki, fahrettin, fettah). Üçü de **erkek**; Türkçe kadın Piper sesi yok.
- Kullanıcının Chrome'unda (Windows) **hiç Türkçe tarayıcı sesi yok**: 22 ses var, hiçbiri Türkçe değil (2026-10-12 testi).
  Bu yüzden "tarayıcı sesiyle dinle" modu Türkçe metni yabancı bir sesle okuyordu ve robot gibi duyuluyordu.
- 0.3.0'daki çözüm:
  - Türkçe tarayıcı sesi yoksa tarayıcı sesi hiç kullanılmaz.
  - Piper ile üretilen satırlar hazır oldukça sırayla çalınır.
  - Kadın konuşmacı varsa ve yalnız Piper kullanılabiliyorsa uygulama ücretsiz kadın ses yollarını tek tıkla gösterir.

## MiniMax ses klonlama: Pages'e ve lokale eklenebilir mi?
**Evet, ikisine de eklendi.** github.io adresinden Chrome'da test edildi: `api.minimax.io` tarayıcıdan doğrudan
çağrılabiliyor (CORS açık). Uygulama hem GitHub Pages'te hem `localhost:8765`'te tarayıcıda çalıştığı için aynı kod iki yerde de çalışır.

Akış (Ayarlar › Seslendirme › MiniMax):
1. Kaydedin ya da dosya seçin (10 sn – 5 dk, mp3/m4a/wav, ≤20 MB). Kayıt WAV'a çevrilir.
2. `POST /v1/files/upload` (purpose=voice_clone) → `file_id`
3. `POST /v1/voice_clone` (`file_id`, `voice_id`, önizleme metni, `language_boost: "Turkish"`, gürültü azaltma) → önizleme sesi
4. Oluşan `voice_id` kadın ya da erkek sesi olarak kaydedilir ve `POST /v1/t2a_v2` ile kullanılır.

Bilmeniz gerekenler:
- Klonlanan ses 7 gün kullanılmazsa MiniMax tarafından silinir.
- Klonlama izni için hesap doğrulaması gerekebilir. Doğrulama yoksa API 2038 hatası verir.
- Önizleme metni karakter başına ücretlendirilir.
- **Yalnız kendi sesinizi ya da izin aldığınız birinin sesini klonlayın.** Uygulama klonlamadan önce bunu onaylatır.

Metinle ses tasarımı da mümkün. `POST /v1/voice_design` uç noktasına "sıcak, net diksiyonlu, orta yaşlı Türk erkek belgesel
anlatıcısı" gibi bir tarif gönderilir; yanıtta `voice_id` ve önizleme sesi döner. Önizleme 1 milyon karakter başına 30 $'dır.

**Lokal ve ücretsiz klonlama** için lokal sunucuya (Chatterbox ya da XTTS-v2) bir referans kayıt yüklenir. Ayarlar › Lokal ses
klonlama bölümünden yüklenen kayıt `server/voices/` klasörüne yazılır; podcast ve video bu sesle konuşur.

## Tarayıcıdan doğrudan erişim testi (github.io kökeninden, 2026-10-12)
Sahte anahtarla istek atıldı. Yanıtın gelmesi (401/400/422) CORS'un açık olduğunu gösterir.

| Servis | Sonuç |
|---|---|
| MiniMax (TTS, dosya yükleme, klonlama, ASR, sohbet) | Açık |
| ElevenLabs | Açık |
| Gemini (interactions) | Açık |
| Google Cloud TTS | Açık |
| Azure Speech TTS | Açık |
| OpenAI (TTS) | Açık |
| xAI Grok | Açık |
| Alibaba DashScope (Qwen) | Açık |
| DeepSeek | Açık |
| Groq | Açık |
| OpenRouter | Açık |
| Anthropic (doğrudan tarayıcı başlığıyla) | Açık |
| Mistral | Açık |
| Together | Açık |
| Moonshot (Kimi) | Açık |
| Cerebras | **Kapalı.** Lokal sunucunun `/proxy` ucu gerekir. |
| Ollama (localhost:11434) | Açık. Kullanıcının bilgisayarında OLLAMA_ORIGINS ayarı çalışıyor. |

## Uygulamadaki motorlar ve otomatik sıra
Otomatik modda, anahtarı olan ilk motor kullanılır. Hiçbiri yoksa lokal sunucu, o da yoksa Piper seçilir.

| Sıra | Motor | Kadın / erkek varsayılan sesler | Not |
|---|---|---|---|
| 1 | ElevenLabs `eleven_v4` | Hesaptaki ya da kütüphanedeki sesler | Diyalog uç noktası |
| 2 | Gemini 3.8 Flash TTS | Kore, Aoede, Leda… / Puck, Charon, Orus… | 2 konuşmacı tek istekte |
| 3 | MiniMax `speech-2.8-hd` | `Turkish_CalmWoman` / `Turkish_Trustworthyman` + klonlar | `language_boost: Turkish` |
| 4 | Google Cloud TTS | Türkçe ses listesinden (öncelik Chirp 3 HD) | Aylık ücretsiz kota |
| 5 | Azure Speech | `tr-TR-EmelNeural` / `tr-TR-AhmetNeural` | F0: ayda 0,5M karakter |
| 6 | OpenAI `gpt-4o-mini-tts` | nova, shimmer… / onyx, echo… | Türkçe aksanı belirgin |
| 7 | Lokal sunucu | Chatterbox (klon) / edge-tts (Emel, Ahmet) / Piper | Ücretsiz |
| 8 | Tarayıcıda Piper | Yalnız erkek | Ücretsiz, çevrimdışı |

## Lokal kurulum önerisi (RTX 5090, 24 GB)

| İş | Model | VRAM (yaklaşık) |
|---|---|---|
| Sohbet ve üretim | qwen3.8:27b (Ollama, Q4_K_M) | ~18 GB |
| Seslendirme | Chatterbox Multilingual | ~3–5 GB |
| Sesten yazıya | faster-whisper large-v3-turbo | ~2–3 GB |

Üçü birlikte belleğe sığmayabilir. Ollama boştaki modeli boşaltır (`OLLAMA_KEEP_ALIVE`); ses üretimi sohbetten sonra çalıştığı
için pratikte sorun olmaz.

## Bağlantılar
- AA: https://artificialanalysis.ai/text-to-speech · https://artificialanalysis.ai/speech-to-text · https://artificialanalysis.ai/speech-to-speech
- Chatterbox Multilingual: https://resemble.ai/learn/models/chatterbox-multilingual
- Açık kaynak Türkçe TTS karşılaştırması (Mayıs 2026): https://www.ablt.dev/blog/turkish-tts/
- OmniVoice (600+ dil, model CC-BY-NC): https://huggingface.co/k2-fsa/OmniVoice
- BuzzASR Türkçe: https://huggingface.co/BuzzASR/turkish
- Gemini TTS: https://ai.google.dev/gemini-api/docs/speech-generation · fiyat: https://ai.google.dev/gemini-api/docs/pricing
- ElevenLabs modeller: https://elevenlabs.io/docs/overview/models · v4: https://elevenlabs.io/v4
- MiniMax: T2A https://platform.minimax.io/docs/api-reference/speech-t2a-http · klonlama https://platform.minimax.io/docs/api-reference/voice-cloning-clone · ses tasarımı https://platform.minimax.io/docs/api-reference/voice-design-design · sistem sesleri https://platform.minimax.io/docs/faq/system-voice-id
- Azure fiyat: https://azure.microsoft.com/pricing/details/speech/ · Google Cloud TTS fiyat: https://cloud.google.com/text-to-speech/pricing

## Ses kilidi (0.5.1)
- Bir podcast tek motorla seslendirilir; kadın/erkek ses sabit kalır. Motor hata verirse (ör. Gemini günlük kota) otomatik başka motora **geçilmez**, Piper'a hiç düşülmez.
- Hazır parçalar saklanır; "Kaldığı yerden devam et" yalnız eksik satırları üretir (kota yenilenince ya da başka motor seçilerek).
- Sınırsız/ücretsiz yol: lokal sunucu motorları (OmniVoice, Pocket TTS, VoxCPM, MOSS-TTS). Tümünü dinlemek için `tools\ses-karsilastir.bat`; sunucu sorunları için `tools\sunucu-tani.bat`.
