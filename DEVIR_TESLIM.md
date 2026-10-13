# Devir teslim

Son güncelleme: 2026-10-13 · sürüm **0.5.1** · canlı: https://aseydaaksakal.github.io/defter-studio/

Bu belge projeyi devralan kişi ya da yapay zeka içindir: durum, kanıtlar, eksikler, sıradaki iş ve hazır başlangıç istemi.
Ayrıntı gerektikçe [PROJE_REHBERI.md](PROJE_REHBERI.md) (dosya → görev) ve [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md)
(hatalar ve çözümler) okunur.

## 1. Bir bakışta

Defter Studio, NotebookLM benzeri, Türkçe, açık kaynak bir öğrenme defteridir.
- **Çalıştığı yer:** GitHub Pages (statik, derleme yok). İsteğe bağlı olarak `localhost:8765`'teki Python yardımcı sunucusuyla.
- **Model:** Kullanıcının RTX 5090 dizüstüsündeki Ollama (`qwen3.8:27b`) ya da kendi API anahtarları.
- **Veri:** Tamamen tarayıcıda (IndexedDB).

## 2. Ne tamamlandı, nasıl kanıtlandı

| Alan | Durum | Kanıt |
|---|---|---|
| 14 Studio aracı (podcast, slayt, video, harita, rapor, kart, test, hafıza, öğret, dinle, hızlı okuma, infografik, tablo, not) | ✅ | e2e + canlı site |
| Tam sayılar (test 1–200, kart 1–300, slayt 1–150) | ✅ | e2e: 20 soru, 15 kart, 5 ve 20 slayt tam |
| Kaynak doğrulama (halüsinasyon denetimi) | ✅ | **Gerçek model:** qwen3.8:27b, 10/10 soru birebir alıntıyla doğrulandı, 0 elenen, 41 sn (2026-10-12, kullanıcının Chrome'u) |
| Soru bankası (0 token test, arka planda doldurma, kalan/çözülen, sınav tarihi planı) | ✅ | e2e + kullanıcı kendi defterinde 80 soruluk banka kurup 16'sını çözmüş |
| Ses v3: motorlar, akışlı çalma | ✅ | e2e (sahte sunucu TTS) |
| **Ses kilidi (0.5.1):** podcast boyunca tek motor, kadın/erkek sesi değişmez, motorlar arası geri düşme YOK (Piper yalnız elle seçilirse); parçalar IndexedDB'de saklanır, kota bitince durur ve "Kaldığı yerden devam et" yalnız eksik satırları üretir. Sunucu `/tts` `engine` ile kilitlenir; `/health` `tts.plan` | ✅ | e2e 5 yeni test (78/78) + `tests/server_test.py` 26/26 |
| **MOSS-TTS Local v1.5 (0.5.1):** ayrı sanal ortam (`server/.venv-moss`) + ayrı çalışan süreç (`server/moss_worker.py`), ses klonlama, `tools/kur-moss.bat`; katalog 31 model; `tools/ses-karsilastir.bat` ile tüm sesleri dinleme; `tools/sunucu-tani.bat` | ⚠️ Kod hazır | Kaynak koddan doğrulandı, **GPU'da denenmedi**. MOSS-TTS-v1.5 (8B), MOSS-TTSD, Orpheus TR: yalnız indirme (adaptör yok) |
| Kadın sesi | ⚠️ Anahtar/sunucu gerekir | Piper'ın Türkçe sesleri yalnız erkek. Oynatıcı ücretsiz çözümleri gösteriyor. Kullanıcıda henüz ses anahtarı yok. |
| MiniMax TTS + ses klonlama + ses tasarımı (Pages ve lokal) | ✅ Kod hazır | CORS testi geçti (github.io kökeni). **Gerçek anahtarla denenmedi.** |
| Azure, Google Cloud, ElevenLabs v4, Gemini TTS | ✅ Kod hazır | CORS geçti; gerçek anahtarla denenmedi |
| Video: erkek anlatıcı, sesle eşzamanlı sahneler, MP4/WebM indirme | ✅ | e2e (MP4 indirildi) |
| Slayt "anlatımlı oynat", yeni düzenler (grafik, tablo, zaman çizelgesi, adımlar) | ✅ | e2e |
| Lokal sunucu v2 (uygulamayı sunar, Ollama ayarsız, klon, edge-tts, vekil) | ✅ | Sandbox'ta uçlar test edildi |
| Lokal ücretsiz kadın+erkek ses: edge-tts, OmniVoice (referanssız tasarım), Pocket TTS Türkçe, Chatterbox | ⚠️ Kod hazır | GPU modelleri sandbox'ta çalıştırılamadı; kullanıcı `server/baslat.bat` + `tools/kur-gpu.bat` ile kuracak. **İlk iş: kullanıcının bilgisayarında doğrula.** |
| Yeni sağlayıcılar (Grok, DeepSeek, Qwen, Mistral, Together, Kimi, MiniMax) | ✅ | CORS geçti; gerçek anahtarla denenmedi |
| Öğrenme: yöntemler kütüphanesi, Pomodoro, boşluk doldurma, dikte/gölgeleme | ✅ | e2e |
| Çoklu sekme güvenliği | ✅ | İkinci sekme açılınca ilk sekmenin işleri bozulmuyor (yavaş sahte modelle test) |
| **Yapay zeka görselleri (0.5.0):** slayt (kapak arka planı + sağ panel), infografik (başlık + kutu), video sahneleri (panel + yakınlaşma); önbellekli; Ayarlar › Görseller | ✅ Kod hazır | e2e: lokal sunucu `/image` ile 5 slayt = 5 istek, video 9:16, infografik hero, **Gemini ve MiniMax istek biçimi sahte `fetch` ile**, önbellek; ComfyUI istemcisi sahte ComfyUI ile (tek dosyalı ve ayrı UNET türü). **Gerçek anahtar ve gerçek GPU ile denenmedi.** |
| Lokal görsel: ComfyUI + FLUX.1-schnell (`tools/kur-comfyui.bat`, `tools/comfyui-baslat.bat`, `server/gorsel.py`) | ⚠️ Kod hazır | Kullanıcı kuracak; `docs/GORSEL.md` |
| `tools/kur-gpu.bat` onarımı | ⚠️ Kullanıcıda doğrulanacak | LF/CRLF karışıklığı ve adımsız hata giderildi; kullanıcının hata metni gelmedi (bkz. NOT_DEFTERI 0.5.0) |
| Testler | ✅ | `tests/e2e.py` 78/78 |
| Dokümanlar | ✅ | README, CLAUDE.md, AGENTS.md, bu belge, PROJE_REHBERI, LINKLER, docs/* |

## 3. Kullanıcının ortamı (2026-10-12)

- **Donanım:** RTX 5090 dizüstü (24 GB), i9-275HX, 64 GB RAM.
- **Tarayıcı:** Windows'ta Chrome 155.
- **Ollama 0.40.3:**
  - GitHub Pages'ten erişim çalışıyor (OLLAMA_ORIGINS ayarlı).
  - Kurulu modeller: `qwen3.8:27b` (ana), `llama3.1:8b`, `qwen3-vl:8b`, `nomic-embed-text`, birkaç 27–32B türev.
  - **Öneri:** Türkçe arama için `ollama pull bge-m3` ve Ayarlar'da embedding olarak seçmek.
- **Ses:**
  - Hiç ses API anahtarı girilmemiş; otomatik motor Piper (yalnız erkek).
  - Chrome'da **hiç Türkçe tarayıcı sesi yok**.
- **Lokal sunucu:** henüz başlatılmamış.

## 4. Kullanıcı tercihleri (uyulması zorunlu)

- **Dil ve çıktı biçimi:**
  - Arayüz ve iletişim Türkçe.
  - **Word (.docx) üretilmez**; belgeler PDF/Markdown/HTML olur. Kullanıcının kalıcı kuralıdır.
- **Oturum ve teslim:**
  - Her özellik ya da tam tur sonunda yeni oturuma geçmeyi öner (5 saatlik ve haftalık limitler).
  - Sonda bütün bağlantıları ver.
- **Yetki gerektirenler:**
  - Kullanıcının bilgisayarında sistem ayarlarını kendin değiştirme; komutu ver, kullanıcı çalıştırsın.
  - Kamuya açık ya da geri alınamaz işlemlerden önce sor.
- **Güvenlik:** Sohbette paylaşılan GitHub belirteci hiçbir dosyaya yazılmadı. Kullanıcıya belirteci iptal edip yenisini oluşturması önerildi.

## 5. Bilinen eksikler ve riskler

1. **Gerçek bulut sesleri** (Gemini, MiniMax, ElevenLabs, Azure, Google) gerçek anahtarla uçtan uca denenmedi. API biçimleri resmî dokümanlara göre yazıldı ve CORS doğrulandı. İlk gerçek denemede yanıt biçimi farkı çıkarsa düzeltilecek kısım ilgili `*Line`/`*Chunk` fonksiyonudur.
2. **Yapay zeka görselleri gerçek anahtar/GPU ile denenmedi.** İlk gerçek denemede yanıt biçimi farkı çıkarsa düzeltilecek yer `js/imagegen.js` (`geminiImage`, `minimaxImage`) ya da `server/gorsel.py` (iş akışı). 0.5.0'dan önce üretilmiş sunularda `visual` tarifi yoktur; yeniden üretin ya da **Görseli yenile** ile tarif girin.
3. **Video indirme gerçek zamanlı.** 5 dakikalık video 5 dakikada kaydedilir; sekme açık kalmalı.
4. **Aralıklı tekrar basit aralıklarla çalışıyor** (1-3-7-16-35-80 gün). FSRS yol haritasında.
5. **Embedding varsayılanı boş.** Yalnız BM25 kullanılıyor; Türkçe anlamsal arama için bge-m3 önerilir.
6. **Taranmış PDF OCR** Tesseract'la tarayıcıda yapılıyor; tablo ve el yazısında zayıf. Yol haritasında qwen3-vl ile OCR var.

## 6. Sıradaki iş (Faz B, öncelik sırasıyla)

0. **Kullanıcının PC'sinde doğrulanacaklar (ben yapamam: Windows/GPU yok):**
   - `tools/kur-gpu.bat` (0.5.0'da yeniden yazıldı; hata verirse artık adım adını yazar, o satırları yapıştır) ve `tools/modelleri-indir.bat indir --onerilen`.
   - Ayarlar'da sesleri dinle, beğenmediğini 👎 ile sil. GPU adaptörleri (OmniVoice Türkçe tasarım, VoxCPM/Trendyol, Bark, KugelAudio) gerçek donanımda denenmedi; gerekirse düzelt.
   - Görseller: önce Gemini/MiniMax anahtarıyla Ayarlar › Görseller › Deneme görseli; sonra istenirse `tools/kur-comfyui.bat` → `tools/comfyui-baslat.bat` → `server/baslat.bat`.
   - Depoyu private yapma ertelendi (Pages için GitHub Pro gerekir).

1. **Lokal sesleri kullanıcının bilgisayarında doğrula** (OmniVoice/Pocket TTS; gerekirse API düzeltmesi). Ardından **NotebookLM ile birebir eşleşme**: video seslendirmeli sunum, arayüz ayrıntıları.
   **Gerçek seslerle doğrulama:** Kullanıcı ücretsiz Gemini anahtarı ekleyince podcast ve video ses kalitesi dinlenir. Varsa MiniMax klonu denenir.
2. ✅ **Yapay zeka görselleri (0.5.0, gerçek anahtar/GPU doğrulaması bekliyor).** Sonraki adım: görseli olan slaytlara "görsel düzenleri" (tam sayfa, yan yana), infografikte görselli şablonlar.
3. **Video v2:** geçişler (çapraz solma), kelime düzeyinde altyazı, lokal sunucuda ffmpeg ile hızlı MP4. (Görselli sahnelerde yavaş yakınlaşma 0.5.0'da var; gerçek Ken Burns kaydırması yok.)
4. **FSRS-5 zamanlayıcı** (kart + hata defteri + banka ortak) ve sınav planlayıcı v2.
5. **qwen3-vl ile OCR** ve isteğe bağlı ikinci-model doğrulaması.

Ayrıntı: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 7. Çalıştırma ve teslim

```bash
python3 -m http.server 8099 & python3 tests/mock_llm.py & python3 tests/e2e.py   # 78 kontrol + python3 tests/server_test.py (26)
bash tools/teslim.sh "kısa açıklama"                                              # test + günlük + commit + push + bağlantılar
```

## 8. Yeni oturum için başlangıç istemi (kopyalayıp yapıştırın)

```
Defter Studio projesine devam ediyoruz (GitHub: aseydaaksakal/defter-studio, canlı: https://aseydaaksakal.github.io/defter-studio/).
Önce depodaki DEVIR_TESLIM.md'yi, sonra CLAUDE.md'yi oku; PROJE_REHBERI.md'den yalnız gereken bölümü oku.
Büyük dosyaları (js/app.js, css/app.css, js/studio/gen.js) baştan sona okuma, grep ile bölüm bul.
Bu oturumun işi: önce kullanıcının PC sonuçları: [BURAYA YAZ: tools\sunucu-tani.bat çıktısı, tools\kur-moss.bat sonucu, tools\ses-karsilastir.bat ile hangi sesler iyi/kötü, kur-gpu.bat hatası varsa son satırlar]; gerekli düzeltmeleri yap (özellikle MOSS adaptörü GPU'da denenmedi). İsteğe bağlı: MOSS-TTSD (diyalog) adaptörü. Sonra 3. madde (Video v2: sahneler arası geçiş, kelime düzeyinde altyazı, lokal sunucuda ffmpeg ile hızlı MP4).
Bitince testleri çalıştır (tests/e2e.py), tools/teslim.sh ile teslim et, DEVIR_TESLIM.md ve docs/NOT_DEFTERI.md'yi güncelle,
canlı siteyi Chrome'da kontrol et, bana bütün bağlantıları ver ve bir sonraki oturum için yeni başlangıç istemini yaz.
Word dosyası üretme; arayüz ve iletişim Türkçe.
```
