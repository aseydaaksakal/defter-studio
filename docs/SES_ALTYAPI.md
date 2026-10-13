# Ses modelleri, Pages sınırı ve "her modeli bedava çalıştırma" değerlendirmesi

Tarih: 2026-10-13 · sürüm 0.6.0 · Kaynak: Hugging Face model sayfaları ve API'si (o gün okundu). Sayfalar değişebilir; kritik karar öncesi kartı yeniden okuyun.

## 1. Model değerlendirmesi

| Model | Ne | Türkçe ve ses sayısı | Boyut | Lisans | Karar |
|---|---|---|---|---|---|
| **wite-tech/pocket-tts-turkish** | Kyutai Pocket TTS'in Türkçe, 6 katmanlı sürümü; ~110M parametre, 24 kHz | Türkçe, WER %1,9. **6 hazır ses: 3 kadın + 3 erkek** (parlak/sıcak/kendinden emin; sakin-derin/enerjik/keskin), kısa kayıtla klon, duygu etiketleri | 438 MB (F32). CPU'da ~5×, GPU'da ~20× gerçek zaman | CC-BY-4.0 (atıf) | ✅ **Eklendi** (`pockettr` motoru, `tools\kur-pocket-tr.bat`). İstenen "Google gibi 4-5 kadın/erkek ses" bu. |
| loom-ai-org/sanotts-loom | loom.cpp için GGUF, çok küçük (0,3–2,3M parametre), 28 dosya / 14 dil | Türkçe için yalnız 2 dosya (2,1 MB ve 6,3 MB), ikisi de **tek "dfki" ses** (Piper'ın erkek sesiyle aynı veri). Türkçe kalite ölçülmemiş; fonem için harici G2P öneriliyor | 2–6 MB (Türkçe) | **GPL-3.0** | ❌ Çok sesli değil, kadın yok, GPL, tarayıcı çalıştırıcısı yok (yalnız Python/C++). İzleme listesinde. |
| erkamk/qwen3-tts-tiny-tr | Qwen3-TTS'ten küçültülmüş; 199M konuşma modülü (~370M paket) | Türkçe (WER %1,28/%3,3). Sabit ses yok: **5-10 sn referans kayıtla** ses seçilir (4-5 farklı referansla 4-5 ses çıkar) | ~370M | Apache-2.0 | ⚠️ Olası. `qwen_tts` kütüphanesi gerekir; adaptör yazılmadı (Pocket TR hazır ses veriyor). İsteğe bağlı sonraki adım. |
| erkamk/qwen3-0.6b-tr | Qwen3-TTS-0.6B'nin Türkçe uyarlaması (LLM değil, **TTS**) | Referansla ses; ~2.300 saat Türkçe | ~1,1B paket | Apache-2.0 (veri: Kiraat, kapılı) | ⚠️ Daha doğal ama büyük; aynı gerekçeyle ertelendi. |
| Anilosan15/kani-tts-400m-0.3-tr | Kani-TTS 400M Türkçe ince ayar | **2 ses:** sıla (kadın), taha (erkek) | 0,4B, BF16 ~740 MB | Etiket Apache-2.0, kart ise "yalnız akademik/deneysel" diyor (çelişki) | ⚠️ Lisans belirsiz, çalıştırma yönergesi yok; eklenmedi. |
| Werea-co/Werea-TSS, GoktugD/Werea-TSS, girenit/girenit-TSS, freyavoice/Freya-TTS | FreyaTTS-small (183M) ince ayarları, 48 kHz | Türkçe öncelikli ama her biri **tek ses kimliği**; klonlama/duygu yok; beta | 733 MB (F32) | Apache-2.0 | ❌ Tek ses; yalnız tek anlatıcı için olur. Adaptör yok. |
| mlx-community/chatterbox-4bit / 5bit | Chatterbox'ın **Apple MLX** dönüşümü, 23 dil (tr dahil) | Klon | ~607 MB | Apache-2.0 | ❌ Apple Silicon içindir; Windows/RTX'te çalışmaz (Chatterbox'ın kendisi zaten desteklenir). |
| Bgeorge/OmniVoice, k2-fsa/OmniVoice | OmniVoice | Türkçe tasarım sesler | büyük | model CC-BY-NC | ✅ Zaten `omnivoice` motoru olarak var. |
| alpcansoydas/moss_tts_nano_turkish_azra_kamil_under15s | MOSS-TTS-Nano ince ayarı olabilir | Adlardan Azra (kadın) / Kamil (erkek) olabilir ama **model kartı boş**, doğrulanamadı | ? | ? | ⏸️ İzleme. |
| 99eren99/piper-turkish-tts | Piper ONNX | Cinsiyet belirtilmemiş | 63,5 MB | belirtilmemiş | ⏸️ Dinlenmedi. |
| dcx514ai/piper_tts_turkish_high | Piper ONNX (`last.onnx` 81 MB, **`last.q8.onnx` 29,4 MB**) | Cinsiyet belirtilmemiş | 29–81 MB | MIT | ⏸️ Dinlenmedi; Pages'e girer. |

**Not (Gemini'nin önerdiği adlar):** `piper-tts-turkish-cem`, `denizgil/turkish-tts`, `piper-turkish-fahir`, `f5-tts-turkish-onnx`, `vits-tr-female` adlı depolar Hugging Face'in "turkish tts" aramasında (ilk 40 sonuç) **çıkmadı**; uydurma olabilir. Ekran görüntüsündeki "Piper'ın kadın sesi var" iddiasına güvenmeyin: Piper'ın resmî Türkçe sesleri (dfki, fahrettin, fettah) üçü de erkek.

## 2. 100 MB altı modeller Pages'te çalışır mı?
- Pages model **çalıştırmaz**, yalnız dosya sunar; çalıştıran tarayıcıdır (WASM/WebGPU). Tek dosya sınırı 100 MB (Git), site sınırı ~1 GB.
- **Evet, çalışıyor:** Piper ONNX (~63 MB) + onnxruntime-web WASM. 0.6.0'dan itibaren onnxruntime ve fonemleştirici **depodan** sunulur (`js/vendor/piper/`, ~30 MB), CDN'e bağımlılık yok. Bu oturumda gerçek Chromium'da doğrulandı: ONNX çıkarımı çalıştı ve Türkçe fonemleştirme çalıştı, dış istek yok. Ses modelinin kendisi Hugging Face'ten ilk kullanımda iner (bu ortamda HF'ye erişim yok; tam uçtan uca ses denenemedi).
- **Sınır:** Türkçe Piper sesleri yalnız erkek → Pages'te kadın sesi yok. 6 sesli Pocket TR (438 MB) Pages'e sığmaz ve tarayıcı çalıştırıcısı yok.
- 100 MB altı adaylar (dinlenmeli): `dcx514ai/piper_tts_turkish_high` q8 (29 MB), `99eren99/piper-turkish-tts` (63 MB). Cinsiyetleri kartlarda yazmıyor.

## 3. "İstediğimiz her modeli web ortamında bedava çalıştıran yapı" mümkün mü?
Kısa cevap: **Tam bedava + sınırsız + her model + sunucusuz: hayır.** En iyi uyum: kendi GPU'nuz.

| Yer | Ücretsiz | Sınırsız | GPU | Değerlendirme |
|---|---|---|---|---|
| **Lokal sunucu (RTX 5090)** | Evet | Evet | Sizin VRAM'iniz | ✅ Ana yol. Ollama ↔ TTS sıralı: 0.6.0'da TTS öncesi VRAM yetmezse Ollama modeli otomatik boşaltılır (Gemini'nin önerdiği "sil, TTS'i yükle" akışı). |
| Hugging Face Spaces (ücretsiz CPU Basic) | Evet | Uyur, kalıcı disk yok | Yok (2 vCPU, 16 GB RAM) | Pocket TR CPU'da ~5× gerçek zamanlı: **uygun aday** (bir Space'e yalnız `/tts` ucu konur). Soğuk başlatma ve CORS gerekir; yapılmadı. ZeroGPU/GPU kotalıdır, "sınırsız" değil. |
| Google Colab / Kaggle | Evet (T4) | Hayır | T4 16 GB | Oturumlar geçici (saatler, boştayken kapanır), her seferinde kurulum + yeni tünel adresi (https) gerekir, Kaggle'da haftalık GPU saati sınırı vardır, kullanım koşulları sunucu barındırmayı kısıtlayabilir. Yedek/deneme içindir. |
| Bulut API (Gemini, MiniMax, Fish Audio, ElevenLabs…) | Kotalı | Hayır | — | Uygulamada var; kota bitince durur, ses kilidi ve kayıtlı ses sayesinde yarım iş kaybolmaz. |

Uygulama bu adreslere zaten bağlanabilir: **Ayarlar › Lokal yardımcı sunucu** alanına herhangi bir `https://…` adresi (Space, Colab tüneli, LAN) yazılır; sunucu tarafında `DEFTER_ORIGINS` ortam değişkeni sitenin kökenini içermelidir.

**Ucuz/Çinli LLM'ler:** DeepSeek, Qwen (DashScope), Kimi, MiniMax, Mistral, Together, Groq vb. Ayarlar'daki sağlayıcı listesinde hazır; listede olmayan her OpenAI uyumlu uç nokta "Özel OpenAI uyumlu" ile eklenir.

## 4. Podcast sesi neden her seferinde API'ye gidiyordu, nasıl çözüldü?
- Eski davranış: kayıt anahtarı motor + ses + model + metne bağlıydı. Sunucu yeniden başlayınca ya da ayar değişince anahtar tutmuyor, bitmiş podcast baştan seslendiriliyordu (kota yanıyordu).
- Yeni davranış (NotebookLM gibi): ses bir kez üretilir ve **IndexedDB'ye tek dosya olarak kaydedilir**; anahtar yalnız konuşmacı + metin + tona bağlıdır. Podcast açılınca kayıtlı dosya çalar; ağa/API'ye hiç gidilmez. Yeniden üretim yalnız **Sesi yeniden üret** düğmesiyle ya da metin düzenlenince olur. Sekme/tarayıcı yer açarken silmesin diye kalıcı depolama izni istenir (`navigator.storage.persist`).
- Piper (tarayıcı) her satırda yeniden yükleniyordu: kütüphane tek oturumu tüm seslere paylaştırıyor (ikinci ses ilk sesin modelini kullanıyordu) ve WASM dosyaları CDN'den geliyordu. Artık ses başına kalıcı oturum, yerel dosyalar ve servis çalışanında önbellek-öncelikli kural var; Ayarlar'da "Piper modelini indir ve sakla" düğmesi eklendi.

## 5. Edge-tts 403 (Sesi dene hatası)
- Hata URL'sinde `Sec-MS-GEC` yok: kullanıcının sanal ortamındaki **edge-tts eski** (Microsoft eski sürümleri 403 ile reddeder). `server\baslat.bat` paketleri yalnız ilk kurulumda kuruyordu.
- Çözüm: `baslat.bat/.sh` her açılışta `pip install -U edge-tts` yapar; 403'te sunucu bir kez kendiliğinden günceller ve yeniden dener; olmazsa net mesaj verir. Kalıcı çözüm: `tools\kur-pocket-tr.bat` (internetsiz, 6 ses).

## 6. Anahtarlar
Fish Audio ve ElevenLabs anahtarları sohbette paylaşıldı; **hiçbir dosyaya, teste ya da depoya yazılmadı ve kullanılmadı**. Paylaşılan anahtarları iptal edip yenisini oluşturmanız önerilir; yenilerini yalnız Ayarlar › Seslendirme'ye girin (bu tarayıcıda saklanır). Fish Audio için kadın/erkek ses kimlikleri (reference_id) Ayarlar'daki "Türkçe sesleri listele" ile seçilir.

## 0.8.0 kararları: Pages'e konabilecek modeller

- `hans00/MOSS-TTS-Nano-GGUF`: yalnız codec çevrilmiş (LLM yok) → konuşturamaz, kullanılmadı.
- `hexgrad/Kokoro-82M`: StyleTTS2 türevi, 82 M parametre; q8 ONNX ≈ 86–92 MB (≤100 MB). Türkçe resmî değil; Türkçe ince ayar için `duxx/kikiri-turkish-base` (CC-BY-SA) tarifi. Tarayıcı motoru henüz yazılmadı (HF'ye sandbox'ta erişilemedi, doğrulanamaz).
- Piper (VITS) ≈ 63 MB: şu an Pages'te tek ücretsiz çevrimdışı seçenek; Türkçe sesler erkek.
- Eğitim yolu ve veri hazırlama: `SES_EGITIMI.md`.

