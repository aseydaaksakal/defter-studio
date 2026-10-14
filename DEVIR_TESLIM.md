# Devir teslim

Son güncelleme: 2026-10-14 · sürüm **0.8.1**

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
| **0.6.0 Edge 403 onarımı:** `baslat` her açılışta `edge-tts` günceller; 403'te sunucu kendini günceller ve yeniden dener | ✅ Kod hazır | server_test; **gerçek Microsoft ucu sandbox'ta denenemedi** |
| **Pocket TTS Türkçe (6 ses: 3 kadın + 3 erkek):** `pockettr` motoru, `tools\kur-pocket-tr.bat` | ⚠️ Kod hazır | Sahte modelle test; **gerçek model kullanıcının PC'sinde denenecek** |
| **Kayıtlı podcast sesi (NotebookLM gibi):** ses bir kez üretilir, IndexedDB'de saklanır, açılınca ağsız çalar; yalnız "Sesi yeniden üret" yeniden üretir | ✅ | e2e |
| **Piper kalıcı oturum:** ses başına model bir kez yüklenir, ORT/fonemleştirici depoda, SW önbellek, "Piper modelini indir ve sakla" | ✅ (HF'den ses indirme denenemedi) | Gerçek Chromium'da ORT + Türkçe fonem |
| Fish Audio motoru (`fish`) | ⚠️ Kod hazır | **Gerçek anahtarla denenmedi** (sohbette paylaşılan anahtarlar kullanılmadı) |
| Motor tanısı: `/tts/selftest` + Ayarlar › "Motorları sına", VRAM koruması | ✅ Kod hazır | server_test; gerçek GPU'da denenecek |
| **Video v2:** sahneler arası geçiş, kelime altyazısı, ffmpeg ile hızlı MP4 | ✅ | Piksel testleri, gerçek ffmpeg sunucu testi, arayüz indirme testi |
| **Kendini güncelleyen sunucu (0.7.0):** `tools/kur.bat` bir kez; sonra siteyle özet karşılaştırması, yalnız değişen dosyalar iner, pip yalnız requirements değişince, Windows açılışında gizli başlatma, arayüzde "Sunucuyu güncelle" | ⚠️ Kod hazır | server_test (yerel HTTP sunucusuyla gerçek indirme/özet/pip koşulu), e2e düğme akışı. **`kur.bat` Windows'ta denenmedi** |
| **Ses stüdyosu (0.8.0):** üst çubuk/Ayarlar'dan açılan pencere: Seslerim (dinle/adlandır/sil), tek tıkla yeni kadın/erkek ses, klonlama (yerel, ücretsiz), Podcast karakterleri (Ayşe/Fatma/Hasan/Hüseyin + ses atama + ▶ dene), Modeller (klonlayan/klonlamayan ayrı gruplar), Pocket TR arayüzden kurulum | ✅ | e2e 111/111 (sahte sunucu); **gerçek GPU motorları denenmedi** |
| **Podcast satır başına konuşmacı (0.8.0):** her satırda 'bu satırı kim okusun' seçici + karakter paneli; kayıtlı ses yalnız değişen satırı yeniden üretir | ✅ | e2e |
| **Sade Ayarlar (0.8.0):** Bilgisayarım (bağlan, kur.bat indir / tek satır komut), dil modeli, Seslendirme (bulut anahtarları tek açılır bölümde, tek satır), 'Tarayıcı sesi' kaldırıldı (eski seçim otomatiğe göç eder → 'Ses motoru yok' hatası giderildi) | ✅ | e2e |
| **Güncelleme 0.8.0:** zip/depo kopyası olanlarda uygulama dosyaları da (index.html, js/, css/) eşitlenir; kur.bat sonunda siteyi `?bagla=1` ile açar | ✅ | server_test; **Windows'ta kur.bat denenmedi** |
| **0.8.1 onarımı:** tek `kur.bat` (eski sunucuyu kapatır, server+tools+uygulamayı eşitler, yerel adresi açar, Pages ile eşitliği doğrular); torch/torchaudio DLL hatası için `kur-gpu.bat` yeniden yazıldı (+ `tools/torch-denetim.py`); `/health` yalnız gerçekten import edilen motorları listeler (`engineErrors`), model 'hazir' %50 boyut eşiği; karakter kadrosu sunucuda (`/cast`) → podcast'te Karakterlerim, satır konuşmacısı tüm kadro; çift ses simgesi giderildi ('Alıştırma sesleri'); ortak sunucu çözücüsü | ⚠️ | e2e 142/142, server_test 139/139; **Windows/GPU'da denenmedi**, Pages eşitliği `tools/esitlik.py` ile teslimde doğrulanır |
| Eğitim rehberi + `tools/veri-seti-hazirla.py` (ses/mp4/YouTube → 24 kHz parçalar + metadata.csv, Whisper ipucuyla 'ee' korunur) | ✅ rehber / ⚠️ eğitim kullanıcıda | `docs/SES_EGITIMI.md`; sahte dökümle test; **GPU eğitimi çalıştırılmadı** |
| Testler | ✅ | `tests/e2e.py` 111/111, `tests/server_test.py` 85/85 |
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
3. **Video indirme:** lokal sunucu + ffmpeg varsa hızlı MP4 (gerçek zamandan hızlı); yoksa eski gerçek zamanlı kayıt. Kelime altyazısı kelime uzunluğuna göre **yaklaşık** zamanlanır (gerçek zaman damgası yok).
4. **Aralıklı tekrar basit aralıklarla çalışıyor** (1-3-7-16-35-80 gün). FSRS yol haritasında.
5. **Embedding varsayılanı boş.** Yalnız BM25 kullanılıyor; Türkçe anlamsal arama için bge-m3 önerilir.
6. **Taranmış PDF OCR** Tesseract'la tarayıcıda yapılıyor; tablo ve el yazısında zayıf. Yol haritasında qwen3-vl ile OCR var.

## 6. Sıradaki iş (Faz B, öncelik sırasıyla)

000y. ✅ 2026-10-14: kullanıcıda kur.bat ile kurulum + EŞİT (96 dosya) doğrulandı; sunucu artık 10 dk'da bir kendini günceller (elle indirme yok).
000z. **0.8.1 kullanıcı doğrulaması:** `kur.bat`ı bir kez çalıştır → localhost açılmalı, Ses stüdyosu › Motorları sına; çıktıyı iste. Hata varsa son satırlar.
000a. **0.8.0 sonrası kullanıcı doğrulaması (PC):** sunucu penceresini kapatıp aç (ya da Ayarlar › Sunucuyu güncelle) → Ses stüdyosu › 'Pocket TR kur' → 6 hazır ses; 'Yeni kadın/erkek sesi üret' (OmniVoice/VoxCPM kurulu olmalı); 'Hazır kadro' ile Ayşe/Fatma/Hasan/Hüseyin → podcast 'Karakterlerim'. Hata olursa Ses stüdyosu › 'Motorları sına' çıktısı iste.
000b. **Kendi modelini eğitme (isteğe bağlı):** `docs/SES_EGITIMI.md`. Kullanıcı Kokoro ince ayarını denerse ≤100 MB q8 ONNX gelince `js/tts.js`'e tarayıcıda çalışan `kokoro` motoru (ONNX Runtime Web, depoda) eklenecek; o zamana dek Pages'te Piper + RTX sunucusu.
000c. Bulut tarafı sade tek-anahtar tasarımı (OpenRouter benzeri) — kullanıcı istedi ama 'şimdilik tam yerel' dedi; ertelendi.
000. **`tools\\kur.bat`'ı kullanıcı bir kez çalıştırsın** (indirme bağlantısı LINKLER.md'de); hata verirse son satırları iste. Sonra sunucunun kendiliğinden başladığını ve "Sunucuyu güncelle" akışını doğrulat. Bundan sonra kullanıcıdan ZIP indirmesini/bat çalıştırmasını isteme.
00. **Önce kullanıcıdan iste:** Ayarlar › Seslendirme › "Motorları sına" çıktısı + `tools\kur-pocket-tr.bat` sonucu (Edge 403 düzeldi mi, Pocket TR sesleri, Trendyol/VoxCPM/OmniVoice gerçek hata metni). Podcast'te kayıtlı sesin ağsız çaldığını doğrulat.
0. **Kullanıcının PC'sinde doğrulanacaklar (ben yapamam: Windows/GPU yok):**
   - `tools/kur-gpu.bat` (0.5.0'da yeniden yazıldı; hata verirse artık adım adını yazar, o satırları yapıştır) ve `tools/modelleri-indir.bat indir --onerilen`.
   - Ayarlar'da sesleri dinle, beğenmediğini 👎 ile sil. GPU adaptörleri (OmniVoice Türkçe tasarım, VoxCPM/Trendyol, Bark, KugelAudio) gerçek donanımda denenmedi; gerekirse düzelt.
   - Görseller: önce Gemini/MiniMax anahtarıyla Ayarlar › Görseller › Deneme görseli; sonra istenirse `tools/kur-comfyui.bat` → `tools/comfyui-baslat.bat` → `server/baslat.bat`.
   - Depoyu private yapma ertelendi (Pages için GitHub Pro gerekir).

1. **Lokal sesleri kullanıcının bilgisayarında doğrula** (OmniVoice/Pocket TTS; gerekirse API düzeltmesi). Ardından **NotebookLM ile birebir eşleşme**: video seslendirmeli sunum, arayüz ayrıntıları.
   **Gerçek seslerle doğrulama:** Kullanıcı ücretsiz Gemini anahtarı ekleyince podcast ve video ses kalitesi dinlenir. Varsa MiniMax klonu denenir.
2. ✅ **Yapay zeka görselleri (0.5.0, gerçek anahtar/GPU doğrulaması bekliyor).** Sonraki adım: görseli olan slaytlara "görsel düzenleri" (tam sayfa, yan yana), infografikte görselli şablonlar.
3. ✅ **Video v2 (0.6.0 bitti).** Kalan: gerçek Ken Burns kaydırması, Whisper ile gerçek kelime zamanı.
3b. İsteğe bağlı: Pocket TR için ücretsiz HF Space (`/tts` ucu), `erkamk/qwen3-tts-tiny-tr` adaptörü (4-5 referans sesle). Ayrıntı: `docs/SES_ALTYAPI.md`.
4. **FSRS-5 zamanlayıcı** (kart + hata defteri + banka ortak) ve sınav planlayıcı v2.
5. **qwen3-vl ile OCR** ve isteğe bağlı ikinci-model doğrulaması.

Ayrıntı: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 7. Çalıştırma ve teslim

```bash
python3 -m http.server 8099 & python3 tests/mock_llm.py & python3 tests/e2e.py   # 111 kontrol + python3 tests/server_test.py (85)
bash tools/teslim.sh "kısa açıklama"                                              # test + günlük + commit + push + bağlantılar
```

## 8. Yeni oturum
Kullanıcı yalnız **"devam"** yazar. Bu dosya + CLAUDE.md okunur, "Sıradaki iş" başlar. İstem yapıştırma gerekmez (kurallar: CLAUDE.md "Değişmez kullanıcı kuralları").
