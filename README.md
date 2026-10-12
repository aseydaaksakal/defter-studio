# Defter Studio

Kaynaklarınızı yükleyin; onlarla sohbet edin ve **podcast, slayt sunusu, videolu özet, zihin haritası, rapor,
bilgi kartı, etkileşimli test, infografik ve veri tablosu** üretin. NotebookLM benzeri, tamamen açık kaynak,
kendi bilgisayarınızdaki yapay zekayla (Ollama) ücretsiz çalışır; isteyen kendi API anahtarını bağlar.

**Canlı önizleme:** https://aseydaaksakal.github.io/defter-studio/

## Öne çıkanlar
- **9 Studio aracı + notlar**, her biri NotebookLM'deki seçeneklerle (biçim, dil, uzunluk, zorluk, odak).
- **Alıntılı sohbet:** her bilgi kaynaktaki parçaya bağlanır; numaraya tıklayınca ilgili metin açılır.
- **Geçmiş ve sürümler:** üretilen her şey defterde saklanır; açın, düzenleyin, eski sürüme dönün, silin.
- **Model bağımsız:** Ollama, LM Studio, llama.cpp, vLLM, Gemini, Groq, OpenRouter, OpenAI, Anthropic.
- **Gizlilik:** tüm veriler tarayıcınızdaki veritabanında (IndexedDB); sunucu yok, hesap yok.
- **Derleme adımı yok:** dosyayı değiştirip `git push` etmek önizlemeyi günceller.
- **Çevrimdışı çalışır** (PWA), telefonda da kullanılır.

## Hızlı başlangıç
1. Canlı adresi açın ve "Örnek" defteri inceleyin (model gerekmez).
2. Ollama kurun, `ollama pull qwen3.8:27b`, `setx OLLAMA_ORIGINS "https://aseydaaksakal.github.io"`, Ollama'yı yeniden başlatın.
3. ⚙ Ayarlar › Ollama › Bağlantıyı test et. Yeni defter açın, PDF yükleyin, Studio'dan bir araç seçin.

Ayrıntılar: [docs/KURULUM.md](docs/KURULUM.md) · Mimari ve teknoloji seçimleri: [docs/MIMARI.md](docs/MIMARI.md)

## Klasörler
```
index.html, css/app.css      arayüz
js/app.js                    uygulama kabuğu (defter, kaynak, sohbet, Studio, görüntüleyici, ayarlar)
js/db.js                     IndexedDB şeması, sürümler, yedekleme
js/llm.js                    model sağlayıcıları (tek chat() arayüzü)
js/sources.js                PDF/DOCX/web okuma, parçalama, BM25 + vektör arama
js/studio/gen.js             9 aracın istemleri ve JSON şemaları
js/studio/views/*.js         her aracın görüntüleyicisi
js/tts.js                    tarayıcı sesi + sunucu sesi, WAV birleştirme
js/demo.js                   örnek defter
js/vendor/                   dexie, pdf.js, marked, DOMPurify, mammoth (CDN gerekmez)
server/                      isteğe bağlı Python yardımcı sunucu (TTS, Whisper, web, YouTube)
```

## Lisans
MIT. Üçüncü taraf kütüphaneler kendi lisanslarıyla (Apache-2.0, MIT, BSD) `js/vendor/` içindedir.
