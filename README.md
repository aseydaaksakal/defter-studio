# Defter Studio

Kaynaklarınızı (PDF, Word, web, YouTube, ses) yükleyin. Onlarla sohbet edin ve **podcast, slayt sunusu, videolu özet, zihin
haritası, rapor, bilgi kartı, test, infografik, veri tablosu** üretin. Ayrıca **soru bankası, hafıza teknikleri, öğreterek öğren,
hızlı okuma ve dinleyerek öğren** araçlarıyla sınava hazırlanın.

- NotebookLM benzeridir, tamamen açık kaynaktır.
- Kendi bilgisayarınızdaki yapay zekayla (Ollama) ücretsiz çalışır.
- İsteyen kendi API anahtarını bağlar.

| | |
|---|---|
| **Canlı uygulama** | https://aseydaaksakal.github.io/defter-studio/ |
| **Lokal (Ollama ayarsız)** | `server/baslat.bat` → http://localhost:8765/ |
| **Tüm bağlantılar** | [LINKLER.md](LINKLER.md) |
| **Devir teslim** | [DEVIR_TESLIM.md](DEVIR_TESLIM.md) |

## Öne çıkanlar

- **Doğal Türkçe çok sesli podcast**
  - Kadın ve erkek ses, 9 biçim: ayrıntılı inceleme, özet, eleştiri, tartışma, hoca anlatımı, istişare, münazara, sözlü sınav, hikâye.
  - 9 ses motoru: ElevenLabs v4, Gemini TTS, MiniMax, Google Cloud, Azure, OpenAI, lokal sunucu (OmniVoice, Pocket, VoxCPM, MOSS-TTS), isteğe bağlı Piper.
  - "Ses kilidi": podcast boyunca tek motor, kadın/erkek sesi değişmez; kota bitince robota düşmez, durur ve kaldığı yerden devam eder.
  - Ses hazırlanırken hazır bölümler hemen çalar.
- **Ses klonlama**
  - MiniMax ile tarayıcıdan, hem GitHub Pages'te hem lokalde.
  - Ücretsiz olarak lokal sunucuda Chatterbox/XTTS ile. Kendi sesinizi kaydedip podcast ve videolarda kullanabilirsiniz.
- **Videolu özet**
  - Varsayılan erkek anlatıcı, sahneler sesle eşzamanlı.
  - MP4/WebM olarak sesli indirilir.
  - Slaytlarda "Anlatımlı oynat" var.
- **Tam sayılar:** 50 soruluk test 50 soru, 100 slaytlık sunu 100 slayt olur. Büyük sayılar kaynağın tamamına yayılarak üretilir.
- **Halüsinasyon denetimi**
  - Her soru ve kart kaynaktan birebir alıntı taşır.
  - Alıntısı kaynakta bulunmayan ya da cevabı desteklemeyen öğe atılır. Bu kontrol token harcamaz.
  - Sohbette uydurma kaynak numaraları silinir.
- **Soru bankası**
  - Sorular bir kez lokal modelle ücretsiz üretilir; sonra istediğiniz sayıda test 0 token ile anında hazırlanır.
  - Kaç sorunun çözülmediğini, zayıf olduğunuz konuları ve tekrar zamanını görürsünüz.
  - Sınav tarihine göre günlük plan çıkarır.
- **Öğrenme merkezi**
  - Bugün paneli, puan/seri/rozet, hata defteri, aralıklı tekrar, Pomodoro.
  - Deneme sınavı: TYT, AYT, LGS, KPSS, ALES, YDS, UAB GOC/ROC, STCW vardiya, COLREG…
  - Hafıza sarayı, Feynman, hızlı okuma, dikte ve gölgeleme, 10 parmak Türkçe Q klavye.
  - Kanıt düzeyli yöntemler kütüphanesi.
- **Alıntılı sohbet:** her bilgi kaynaktaki parçaya bağlanır; numaraya tıklayınca ilgili metin açılır.
- **Geçmiş ve sürümler:** her içerik saklanır; açın, düzenleyin, eski sürüme dönün, silin, indirin.
- **Model bağımsız:** Ollama, LM Studio, vLLM, Gemini, Groq, OpenRouter, OpenAI, Anthropic, xAI Grok, DeepSeek, Qwen, Mistral, Together, Kimi, MiniMax.
- **Gizlilik:** tüm veriler tarayıcınızdaki veritabanında kalır. Sunucu ve hesap yok. Anahtarlar yalnız sizin tarayıcınızda.
- **Taranmış PDF için Türkçe OCR.** Çevrimdışı çalışır (PWA), telefonda da kullanılır.

## Hızlı başlangıç

1. Canlı adresi açın ve "Örnek: GMDSS" defterini inceleyin; model gerekmez.
2. **Ücretsiz lokal model:**
   1. [Ollama](https://ollama.com) kurun ve `ollama pull qwen3.8:27b` çalıştırın.
   2. Ardından ya `tools/ollama-baglan.bat` dosyasını çalıştırın (GitHub Pages için) ya da `server/baslat.bat` ile uygulamayı localhost'tan açın.
3. **Ücretsiz doğal kadın + erkek ses:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) adresinden Gemini anahtarı alın ve ⚙ Ayarlar › Seslendirme'ye yapıştırın.
4. Yeni defter açın, kaynak yükleyin, Studio'dan bir araç seçin.

Ayrıntılar:
- Kurulum: [docs/KURULUM.md](docs/KURULUM.md)
- Ses modelleri: [docs/SES.md](docs/SES.md)
- Mimari: [docs/MIMARI.md](docs/MIMARI.md)
- Test planı: [docs/TEST_PLANI.md](docs/TEST_PLANI.md)
- Yol haritası: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md)
- Mühendislik günlüğü: [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md)

## Klasörler

```
index.html, css/app.css, sw.js     arayüz, stil, çevrimdışı önbellek
js/app.js                          uygulama kabuğu: defter, kaynak, sohbet, Studio, görüntüleyici, ayarlar, iş kuyruğu
js/db.js                           IndexedDB şeması (v2), sürümler, yedekleme
js/llm.js                          model sağlayıcıları (tek chat() arayüzü)
js/sources.js                      PDF/DOCX/web okuma, parçalama, BM25 + vektör arama, bağlam dilimleri
js/verify.js                       kaynak alıntısı doğrulaması (halüsinasyon denetimi)
js/bank.js, js/bank-ui.js          soru bankası, aralıklı tekrar, arka planda doldurma
js/tts.js, js/textnorm.js          8 ses motoru, Türkçe okunuş, akışlı parçalar, WAV
js/voice-settings.js               ses ayarları, MiniMax ve lokal ses klonlama
js/learn.js, js/typing.js          öğrenme merkezi, yöntemler kütüphanesi, 10 parmak klavye
js/studio/gen.js, batch.js         14 aracın istemleri ve şemaları, tam sayılı toplu üretim
js/studio/views/*.js               her aracın görüntüleyicisi
js/vendor/                         dexie, pdf.js, marked, DOMPurify, mammoth, Tesseract, Piper (CDN gerekmez)
server/                            isteğe bağlı Python yardımcı sunucu (uygulamayı sunar, TTS, klon, Whisper, web, vekil)
tools/                             ollama-baglan.bat, kur-gpu.bat, kur-comfyui.bat, comfyui-baslat.bat, teslim.sh
tests/                             sahte model + Playwright uçtan uca testleri
```

## Geliştirme

```bash
python3 -m http.server 8099 &      # depo kökünde
python3 tests/mock_llm.py &        # sahte model + sahte lokal sunucu
python3 tests/e2e.py               # 36 kontrol
bash tools/teslim.sh "kısa not"    # test + değişiklik günlüğü + commit + push + bağlantılar
```

Derleme adımı yoktur; `main`'e push edilen her şey 1-2 dakikada canlı sitede görünür. Çalışma kuralları:
[CLAUDE.md](CLAUDE.md) (Claude) · [AGENTS.md](AGENTS.md) (diğer yapay zeka ajanları).

## Lisans

MIT. Üçüncü taraf kütüphaneler kendi lisanslarıyla (Apache-2.0, MIT, BSD) `js/vendor/` içindedir. Chatterbox MIT, XTTS-v2 CPML
(ticari olmayan), Piper sesleri ses kartlarındaki lisanslarla dağıtılır.
