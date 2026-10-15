# Tamamlananlar ve kanıtları

DEVIR_TESLIM.md'den taşındı (her oturumda okunmasın diye). Yeni satırlar en alta eklenir.

## Tablo

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
| **0.8.2:** Windows açılışında otomatik başlatma (kur.bat her çalışmada kurar, sunucu her açılışta denetler, kapatma işareti), token ölçüm sistemi (`tools/token-rapor.py` → docs/token), kurallar el kitabına bölündü, ajan rol kartları | ✅ / ⚠️ Windows'ta denenmedi | server_test 164/164 |
| **0.8.3:** önbellek mimarisi (autoCompactWindow, okuma yasakları, `tools/baglam-denetim.py`), token raporu resmi fiyat + model/effort kırılımı, ajan modelleri sabit, beceri `defter-baglam-bakim`, EL_KITABI yenilendi | ✅ | resmi belgeyle doğrulandı (NOT_DEFTERI 0.8.3) |
| **0.8.4:** PC'de canlı doğrulama (Chrome: health, modeller, motor sınaması); eski kodla çalışan sunucunun kendini yeniden başlatması; VoxCPM `seed` ve Edge boş ses düzeltmesi; bulut Claude 400 (temperature) + effort/max_tokens/önbellek; Gemini varsayılanları; sohbet önbellek sırası; FSRS-6 (kart + hata defteri + banka); `defter-istem` becerisi, istem denetimi, yola bağlı kurallar, ajan ayarları, sessiz testler | ✅ | e2e 142/142, sunucu 178/178, FSRS 12/12, sağlayıcı 7/7 |
| **0.8.4a:** PC canlı denetim (sunucu hâlâ 0.8.1, güncelleme onay bekliyor); CLAUDE.md yerel-önce notu; önbellek/effort kuralları resmi belgeyle doğrulandı; Defter dışı AI Fabrika kiti (yerel Qwen + ücretsiz havuz + Claude merdiveni) | ✅ / ⚠️ kit PC'de denenmedi | NOT_DEFTERI 0.8.4a |
| **0.8.4b–c:** `teslim.sh` sunucu testlerini artık atlamıyor (`server/.venv` kendiliğinden kurulur; `node`/ortam eksikse ✗); e2e sunucuları yalnız e2e için açılır | ✅ | NOT_DEFTERI 0.8.4b |
