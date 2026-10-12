# Değişiklikler

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
