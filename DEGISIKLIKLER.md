# Değişiklikler

## 2026-10-15 — teslim
- 0.8.4a: PC denetimi (sunucu 0.8.1, güncelleme onay bekliyor), CLAUDE.md yerel-önce notu, NOT_DEFTERI

## 2026-10-15 — teslim
- Devir: PC sunucusu 0.8.1 süreçte takılı, bir kez yeniden başlatma gerekli (canlı doğrulama)

## 2026-10-15 — teslim
- 0.8.4: PC canlı doğrulama, eski kodla çalışan sunucunun yeniden başlaması, bulut Claude 400 düzeltmesi, VoxCPM/Edge, FSRS-6, defter-istem + istem denetimi, yola bağlı kurallar, sessiz testler

## 2026-10-14 — teslim
- Önbellek mimarisi: resmi doğrulama, bağlam denetimi, token raporu resmi fiyat, kural ve ajan güncellemesi

## 2026-10-14 — teslim
- 0.8.2: Windows açılışında otomatik başlatma, token ölçüm raporu (docs/token), CLAUDE.md giriş kartı + el kitabı + ajan rolleri + teslim becerisi

## 2026-10-14 — teslim
- Sunucu çalışırken 10 dk'da bir kendini günceller (boştaysa yeniden başlar): elle güncelleme yok

## 2026-10-14 — teslim
- kur.bat kendini günceller (Pages'teki sürümü alır)

## 2026-10-14 — teslim
- Model boyutu snapshots'tan sayılır (Windows symlinksiz), kur.bat bekle.ps1 300 sn, açılış gecikmeleri kaldırıldı

## 2026-10-14 — teslim
- Model indirme: alt süreç, XET kapalı, takılma tespiti, yeniden deneme, Türkçe hata

## 2026-10-14 — teslim
- /health motor denetimini beklemez (arka plan + kalıcı önbellek), sunucu.log, kur.bat 120 sn ve günlük gösterimi

## 2026-10-14 — teslim
- OmniVoice seslendirmede hazır sayılır: çalışma kanıtı (kayıtlı ses/başarılı üretim) boyut eşiğinden önce gelir

## 2026-10-14 — teslim
- kur.zip: kur.bat indirilebilir zip olarak Pages'te

## 2026-10-14 — teslim
- 0.8.1: tek kur.bat (yerel=Pages), torch onarımı, gerçek motor sağlığı, sunucuda kadro, podcast karakterleri, kurallar

## 2026-10-13 — teslim
- 0.8.0: Ses stüdyosu (yeni kadın/erkek ses, klonlama, karakterler, modeller), podcast satır başına konuşmacı, sade Ayarlar, kur.bat indirme/tek satır, güncelleyici uygulama dosyalarını da eşitler, ses eğitimi rehberi

## 2026-10-13 — teslim
- 0.7.0: kendini güncelleyen sunucu (tek seferlik kur.bat, değişen dosyaları indirme, otomatik başlatma, arayüzde Sunucuyu güncelle)

## 2026-10-13 — teslim
- 0.6.0: Edge 403 onarımı, Pocket TTS Türkçe, kayıtlı podcast sesi, Piper kalıcı oturum, Fish Audio, motor tanısı, Video v2

## 2026-10-13 — 0.6.0 — ses güvenilirliği, kayıtlı podcast sesi, Video v2
- Edge 403: edge-tts her açılışta güncellenir, 403'te bir kez kendiliğinden güncelleyip yeniden dener
- Pocket TTS Türkçe (3 kadın + 3 erkek hazır ses, referanssız) motoru ve `tools\kur-pocket-tr.bat`
- Kayıtlı podcast sesi: bitmiş ses tek dosya olarak saklanır, açılışta ağ/API kullanılmaz; yeniden üretim yalnız düğmeyle
- Piper: ses başına kalıcı oturum, onnxruntime ve fonemleştirici depodan (CDN yok), önbellek-öncelikli servis çalışanı, "Piper modelini indir ve sakla"
- Fish Audio motoru (kadın/erkek ses kimliği sabit), Motor tanısı (`/tts/selftest`) ve Ollama VRAM boşaltma
- Video v2: sahneler arası geçiş, kelime düzeyinde altyazı, lokal sunucuda ffmpeg ile Hızlı MP4

## 2026-10-13 — teslim
- 0.5.1: ses kilidi (motor değişmez, robota düşmez, kaldığı yerden devam), MOSS-TTS adaptörü, ses karşılaştırma ve sunucu tanı araçları

## 2026-10-13 — teslim
- 0.5.0: yapay zeka görselleri (slayt, infografik, video; Gemini/MiniMax/lokal ComfyUI+FLUX, önbellekli), kur-gpu.bat onarımı (CRLF, adım adım hata), kur-comfyui.bat

## 2026-10-13 — teslim
- 0.4.0: ses kütüphanesi, 3-5 konuşmacı, klon, TTS model yöneticisi

## 2026-10-12 — teslim
- 0.3.2: Gemini kota bekleme ve kaldığı yerden devam, kadın sesi öncelikli motor sırası, lokal OmniVoice + Pocket TTS Türkçe (kotasız kadın/erkek), ustalık sanatı bölümü

## 2026-10-12 — teslim
- 0.3.1: hafıza sarayı gerçek ses + durdur, sohbet ve içerik çöp kutuları, sohbet 'Durduruldu' hatası, hızlı sohbet, lokal sunucu kurulum yardımı

## 2026-10-12 — teslim
- 0.3.0 son tur: çoklu sekme güvenliği (iş sahibi sekme), sınav tarihi düzeltmesi, gerçek model denemesi (10/10 doğrulandı), DEVIR_TESLIM.md, önizleme betiği

## 2026-10-12 — 0.3.0
- Ses sistemi v3: ElevenLabs v4, Gemini 3.8 Flash TTS, **MiniMax** (Türkçe kadın/erkek hazır sesler, **ses klonlama** ve metinle
  ses tasarımı), Google Cloud TTS (Chirp 3 HD), Azure Speech (Emel/Ahmet), OpenAI, lokal sunucu, Piper. Otomatik modda bir motor
  hata verirse sıradakine geçilir; geçici hatalarda yeniden deneme.
- Kadın sesi: Piper'ın Türkçe seslerinin üçü de erkek olduğu için kadın konuşmacı varken ücretsiz çözüm kartı gösterilir. Türkçe
  tarayıcı sesi yoksa tarayıcı sesi hiç kullanılmaz (robot sesin kaynağı buydu). Ses hazırlanırken hazır bölümler sırayla çalar.
- Videolu Özet: tüm anlatım tek ses dosyası, varsayılan **erkek anlatıcı**, sahneler sesle eşzamanlı, MP4/WebM sesli indirme.
  Slaytlarda "Anlatımlı oynat" (konuşmacı notları seslendirilir, slaytlar kendiliğinden ilerler).
- **Tam sayılar:** test 1–200 soru, kart 1–300, slayt 1–150. Büyük sayılar kaynağın tamamına yayılarak parti parti üretilir.
- **Kaynak doğrulama:** her soru ve kart kaynaktan birebir alıntı taşır; alıntı kaynakta bulunamazsa ya da cevabı desteklemezse
  öğe elenir ve yerine yenisi üretilir. Sohbette olmayan kaynak numaraları silinir, "kaynaklı" rozeti gösterilir.
- **Soru bankası:** sorular bir kez (lokal modelle ücretsiz) üretilir; bankadan istenen sayıda test 0 token ile anında oluşur.
  Arka planda, kaldığı yerden devam eden doldurma; çözülmemiş/çözülmüş/zayıf/tekrar zamanı sayıları; sınav tarihine göre günlük plan.
- Yeni araç **Dinleyerek Öğren** (yapay zeka gerektirmez): dikte, gölgeleme, dinleme banyosu. Bilgi kartlarında boşluk doldurma
  ve terim–tanım türleri. Pomodoro zamanlayıcısı. Öğrenme bilimi sayfasında kanıt düzeyli **yöntemler kütüphanesi**.
- Slaytlarda yeni düzenler: zaman çizelgesi, adımlar, grafik, tablo.
- Yeni sağlayıcılar: xAI Grok, DeepSeek, Qwen (DashScope), Mistral, Together, Moonshot Kimi, MiniMax. Gemini anahtarı artık
  adres yerine başlıkta gönderiliyor. JSON görevlerinde düşük sıcaklık ve Ollama'da düşünme kapalı (daha hızlı).
- Lokal sunucu v2: uygulamayı `http://localhost:8765` adresinde sunar (Ollama izin ayarı gerekmez), Chatterbox/XTTS ile lokal ses
  klonlama, edge-tts kadın/erkek ses, Ollama ve API vekili, motorlar arası otomatik geçiş. RTX 50xx için `tools/kur-gpu.bat`.
- Testler depoda: `tests/mock_llm.py` (sahte model + sahte sunucu) ve `tests/e2e.py` (31 kontrol).
- Service worker modülleri sunucuya sorarak alıyor: yeni sürümde eski/yeni dosya karışmıyor.

## 2026-10-12 — 0.2.2
- Taranmış (resim) PDF'ler için Türkçe metin tanıma (OCR, Tesseract.js): arka planda sayfa sayfa, ilerleme göstergesi,
  duraklat/sürdür, sayfa yenilense de kaldığı yerden devam.
- Ücretsiz Piper sesi arka plan iş parçacığına taşındı: podcast açılırken sayfa donmuyor; ses hazırlanırken tarayıcı sesiyle dinlenebiliyor.
- Aynı podcast sesinin iki kez üretilmesi engellendi.
- Ollama bağlantı yardımcısı: "kapalı" ile "çalışıyor ama siteyi engelliyor" durumlarını ayırt ediyor; düzeltilmiş PowerShell komutu
  (yeni ayarı aynı oturuma da yükler) ve `ollama serve` ile kesin çözüm.

## 2026-10-12 — 0.2.1
- Model bağlantısı: üretimden önce bağlantı kontrolü; bağlantı yoksa iş açılmaz, kurulum yardımcısı açılır
  (Ollama izni için kopyalanabilir komut, tek tıkla `tools/ollama-baglan.bat`, tek tıkla Gemini'ye geçiş).
- Ağ hatasında kuyruk durur (art arda onlarca hata yerine tek uyarı); "Tümünü yeniden dene" ve "Hatalıları sil".
- ElevenLabs gerçek insan sesi (v3 diyalog modeli, duygu etiketleri, Türkçe dil kodu, kadın/erkek ses seçimi).
- Gemini TTS için Türkçe telaffuz/vurgu talimatı; tüm motorlarda Türkçe metin normalleştirme.

## 2026-10-12 — 0.2.0
- Seslendirme baştan yazıldı: Türkçe metin normalleştirme (sayılar, yüzdeler, birimler, kısaltmalar), Gemini TTS çok konuşmacılı,
  OpenAI TTS, tarayıcıda Piper (Türkçe 3 ses), lokal sunucu, Edge doğal sesleri. Tek parça WAV, ses dengeleme, doğal duraklamalar.
- Podcast: 2-3 konuşmacı, kadın/erkek ses seçimi, 5 yeni biçim (hoca anlatımı, istişare, münazara, sözlü sınav, hikâye), ton notları.
- Yeni Studio araçları: Hafıza Teknikleri, Öğreterek Öğren, Hızlı Okuma. Test aracına deneme sınavı modu ve sınav türleri.
- Öğrenme merkezi: Bugün paneli, puan/seri/rozet, hata defteri (aralıklı tekrar), hazırlık durumu, 10 parmak klavye, Öğrenme bilimi sayfası.

## 2026-10-12 — 0.1.1
- Varsayılan model qwen3.8:27b; isteğe bağlı "Hızlı model" rolü (özet, öneri, podcast planı).
- MIMARI.md model tablosu AgentPerf-Local sonuçlarına göre güncellendi.

## 2026-10-12 — 0.1.0 ilk sürüm
- Defterler, kaynak ekleme (PDF, DOCX, TXT/MD, HTML, web, YouTube ve ses lokal sunucu ile), alıntılı sohbet.
- Studio: Sesli Özet, Slayt Sunusu, Videolu Özet, Zihin Haritası, Rapor (etkileşimli gömme), Bilgi kartları,
  Test, İnfografik, Veri Tablosu, Notlar.
- Geçmiş listesi, sürüm geçmişi ve geri yükleme, yeniden üretme, düzenleme, silme, dışa aktarma.
- Sağlayıcılar: Ollama, LM Studio/llama.cpp/vLLM, Gemini, Groq, OpenRouter, OpenAI, Anthropic.
- Yardımcı sunucu: Piper/XTTS/Chatterbox/Edge TTS, faster-whisper, trafilatura, YouTube, DuckDuckGo.
- Örnek GMDSS defteri, çevrimdışı çalışma, mobil düzen, koyu/açık tema.
