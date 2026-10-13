# Kurulum

## 1. Hiçbir şey kurmadan deneyin
Canlı adresi açın: https://aseydaaksakal.github.io/defter-studio/
- "Örnek: GMDSS" defterinde Studio içeriklerinin hepsi hazırdır.
- Model bağlamadan oynatıcıyı, slaytları, testi, kartları ve haritayı inceleyebilirsiniz.
- Yeni içerik üretmek için bir model bağlayın.

## 2. Lokal model: Ollama (ücretsiz, önerilen)

1. https://ollama.com adresinden Windows sürümünü kurun.
2. Modelleri indirin (PowerShell):
   ```powershell
   ollama pull qwen3.8:27b
   ollama pull bge-m3          # isteğe bağlı: Türkçe anlamsal arama
   ```
3. Uygulamayı Ollama'ya bağlayın. İki yol var:
   - **Yol A — ayarsız (önerilen):** depodaki `server/baslat.bat` dosyasını çalıştırın; ayrıntısı 5. bölümde.
     - Uygulama `http://localhost:8765` adresinde açılır.
     - Ollama localhost'a varsayılan olarak izin verdiği için ek ayar gerekmez.
     - Bu adresteki defterler GitHub Pages'tekilerden ayrıdır. Taşımak için ana sayfada **Yedekle** ve **İçe aktar** kullanın.
   - **Yol B — GitHub Pages'ten kullanmak:** sayfa başka bir adresten Ollama'ya bağlandığı için Ollama'nın bu siteye izin vermesi gerekir.
     - En kolayı: `tools/ollama-baglan.bat` dosyasını çift tıklayın.
     - Elle yapmak isterseniz:
       ```powershell
       $o = "https://aseydaaksakal.github.io"
       [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $o, "User")
       $env:OLLAMA_ORIGINS = $o
       Get-Process "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force
       Start-Sleep -Seconds 2
       Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
       ```
     - Hâlâ olmazsa Ollama'yı görev çubuğundan **Quit** ile kapatın. Sonra PowerShell'de
       `$env:OLLAMA_ORIGINS = "https://aseydaaksakal.github.io"; ollama serve` çalıştırın ve pencereyi açık bırakın.
4. Uygulamada ⚙ Ayarlar › Sağlayıcı: **Ollama**, Model: `qwen3.8:27b` › **Bağlantıyı test et** › Kaydet.
   - **Hızlı model:** isteğe bağlı, örneğin `llama3.1:8b`. **Embedding:** `bge-m3`.
5. Chrome "yerel ağdaki cihazlara erişim" izni sorarsa **İzin ver** deyin.

> Sorun mu var? `http://localhost:11434` adresini açın; "Ollama is running" yazmalı. "Failed to fetch" hatası çoğunlukla
> OLLAMA_ORIGINS ayarının yapılmadığını ya da Ollama'nın yeniden başlatılmadığını gösterir. Yol A bu sorunu tamamen ortadan kaldırır.

### LM Studio kullanmak isterseniz
Developer sekmesinde sunucuyu başlatın, **Enable CORS** açın. Ayarlar › Sağlayıcı: LM Studio, adres `http://localhost:1234/v1`.

## 3. Kendi API anahtarınızla (isteğe bağlı)
1. Ayarlar › Sağlayıcı'dan birini seçin: Gemini, Groq, OpenRouter, OpenAI, Anthropic, xAI Grok, DeepSeek, Qwen, Mistral, Together, Kimi ya da MiniMax.
2. Anahtarı yapıştırın.
3. **Listele** ile model seçin.

Anahtar yalnızca bu tarayıcıda saklanır; GitHub'a veya başka bir yere gönderilmez. Bulut modelinde her üretim token harcar.
Soru bankasını lokal modelle doldurursanız testler token harcamadan oluşur.

## 4. Doğal seslendirme (podcast, video, dinleyerek öğren)
⚙ Ayarlar › **Seslendirme** bölümünden motoru seçin ve **Sesi dene** ile kadın + erkek sesi dinleyin.
Otomatik modda anahtarı olan en iyi motor kullanılır; hata verirse sıradakine geçilir. Ayrıntılı karşılaştırma: [SES.md](SES.md).

| Motor | Kalite | Gerekenler |
|---|---|---|
| ElevenLabs v4 | En gerçekçi, duygulu | elevenlabs.io anahtarı (ayda 10.000 ücretsiz kredi). Türkçe anadil sesleri "Sesleri listele" ile seçin. |
| Gemini TTS | Çok doğal, 2 konuşmacı tek istekte | **Ücretsiz** anahtar: https://aistudio.google.com/apikey |
| MiniMax | Türkçe kadın/erkek hazır ses, **ses klonlama**, metinle ses tasarımı | platform.minimax.io anahtarı (ücretli; klon için hesap doğrulaması gerekebilir) |
| Google Cloud TTS | Chirp 3 HD, çok doğal | Faturalandırma açık Google Cloud projesi + API anahtarı (ayda 1M karakter ücretsiz) |
| Azure Speech | Emel / Ahmet | Azure Speech kaynağı (F0: ayda 0,5M karakter ücretsiz) + bölge |
| OpenAI TTS | Doğal, Türkçe aksanı belirgin | OpenAI anahtarı (ücretli) |
| Lokal sunucu | Chatterbox klonu / edge-tts (Emel/Ahmet) / Piper | 5. bölüm |
| Tarayıcıda Piper | İyi, ücretsiz, çevrimdışı; **Türkçede yalnız erkek** | İlk kullanımda ~60 MB ses modeli iner |

**Ses klonlama (MiniMax):** Ayarlar › Seslendirme › MiniMax › Ses klonla.
1. 10 sn – 5 dk kayıt yapın ya da dosya seçin; okunacak örnek metin ekranda.
2. İzni onaylayın.
3. **Klonla** deyin. Klon kadın ya da erkek ses olarak seçilir.

Yalnız kendi sesinizi ya da izin aldığınız bir sesi klonlayın.

## 5. Yardımcı sunucu (uygulamayı sunar, kaliteli ses, klonlama, döküm, web)

**Önerilen (0.7.0): tek seferlik kurulum.** [kur.bat](https://github.com/aseydaaksakal/defter-studio/raw/main/tools/kur.bat) dosyasını indirip bir kez çalıştırın.
Python'u (yoksa), sunucuyu, paketleri ve isteğe bağlı Pocket TTS Türkçe'yi kurar; isterseniz bilgisayar açılınca arka planda başlatır.
Sonrasında zip indirmeniz ya da bat çalıştırmanız gerekmez: sunucu her açılışta siteyle karşılaştırıp **yalnız değişen dosyaları** indirir, paketleri yalnız gereksinimler değişirse kurar.
Ayarlar › Lokal yardımcı sunucu'ya bir kez `http://localhost:8765` yazın. Güncelleme olunca aynı yerde **Sunucuyu güncelle** düğmesi çıkar. Kaldırmak için `tools\otomatik-baslat-kaldir.bat` ve `%LOCALAPPDATA%\DefterStudio` klasörünü silin.
Aşağıdaki zip yöntemi yedek yoldur.


Gerekenler: Python 3.11 ya da 3.12. GPU özellikleri için güncel NVIDIA sürücüsü.

```powershell
cd defter-studio\server
baslat.bat
```
İlk çalıştırmada sanal ortam kurulur ve paketler yüklenir. Ardından tarayıcıda `http://localhost:8765/` kendiliğinden açılır;
sunucu adresi ayarı gerekmez. GitHub Pages'ten kullanırken sunucuyu bağlamak için Ayarlar › Lokal yardımcı sunucu kutusuna
`http://localhost:8765` yazıp **Kontrol et** deyin.

**Kotasız, ücretsiz kadın + erkek ses:**
- `server\baslat.bat` çalışınca edge-tts ile Emel (kadın) ve Ahmet (erkek) hemen gelir. GPU gerekmez, internet gerekir.
- **Tamamen lokal sesler için:**
  ```powershell
  tools\kur-gpu.bat
  ```
  - Kurulanlar: RTX 50xx için PyTorch CUDA 12.8, **OmniVoice** ve **Pocket TTS Türkçe**.
  - İlk podcastte kadın ve erkek ses bir kez tasarlanıp `server\voices\` klasörüne kaydedilir; sonra hep aynı seslerle okunur. Kayıt gerekmez.
  - Kendi sesinizi kullanmak isterseniz Ayarlar › Seslendirme › Lokal sunucu bölümünden kaydedin.
  - Chatterbox isteyenler için: `tools\kur-chatterbox.bat`.
  - Kurulum hata verirse betik hangi adımda düştüğünü yazar (`[1/5]`…); son hata satırlarını paylaşın. Chatterbox ile OmniVoice aynı sanal ortamda `transformers` sürümü yüzünden çakışır; ikisini birlikte kurmayın.

**Yapay zeka görselleri (slayt, infografik, video):**
- Gemini ya da MiniMax anahtarı varsa ek kurulum gerekmez (Ayarlar › Görseller).
- Anahtarsız, lokal: `tools\kur-comfyui.bat` (ComfyUI + FLUX.1-schnell, ~17 GB), sonra `tools\comfyui-baslat.bat` ve `server\baslat.bat`. Ayrıntı: [GORSEL.md](GORSEL.md).

Seslendirme sırası (`DEFTER_TTS=auto`): OmniVoice → Chatterbox (referansla) → Pocket TTS → XTTS-v2 → edge-tts → Piper. Belirli bir motoru
zorlamak için `DEFTER_TTS` ortam değişkenini ayarlayın:

| `DEFTER_TTS` | Ne yapar |
|---|---|
| `auto` (varsayılan) | Kurulu ve çalışan ilk motor |
| `chatterbox` | Klon (referans ses gerekir), duygu ayarı |
| `xtts` | Klon, çok doğal (`pip install coqui-tts`; lisans ticari olmayan) |
| `edge` | Emel (kadın) / Ahmet (erkek); ücretsiz ama çevrimiçi ve resmî API değil |
| `piper` | Çevrimdışı, hızlı; Türkçede yalnız erkek |

Diğer ayarlar:
- `DEFTER_WHISPER` (döküm modeli, varsayılan `large-v3-turbo`)
- `DEFTER_DEVICE` (`cuda`/`cpu`)
- `OLLAMA_HOST`
- `DEFTER_PROXY_HOSTS` (vekil izin listesi)
- `DEFTER_OPEN=0` (tarayıcıyı açma)

## 6. Kendi bilgisayarınızda geliştirme
```powershell
cd defter-studio
python -m http.server 8099
python tests\mock_llm.py      # ayrı pencerede: sahte model
python tests\e2e.py           # uçtan uca testler (pip install playwright; playwright install chromium)
```

## MOSS-TTS (isteğe bağlı, ~10 GB GPU belleği)
`tools\kur-moss.bat` ayrı bir sanal ortam (`server\.venv-moss`) kurar; ardından Ayarlar › Modeller'den "MOSS-TTS-Local-Transformer-v1.5"i indirin. Ses klonlama ile çalışır (ses kütüphanesinde kadın ve erkek referans gerekir). GPU'da henüz denenmedi.

## 7. Sunucuyu kolayca kurma ve güncelleme (0.8.0)
- Sitede **Ayarlar › Bilgisayarım › İlk kurulum**: `kur.bat dosyasını indir` düğmesi ya da **Tek satır komutu kopyala** (PowerShell'e yapıştırın). Bir kez yeter; bundan sonra sunucu Windows açılışında kendiliğinden başlar ve kendini siteyle eşitler (yalnız değişen dosyalar iner).
- kur.bat bitince siteyi `?bagla=1` ile açar: sunucuya kendiliğinden bağlanır.
- Pages'ten açılan site RTX sunucunuza bağlanır (Chrome "yerel ağ izni" sorarsa İzin ver).
- Sesler: **Ses stüdyosu** (üst çubuktaki hoparlör düğmesi) › "Pocket TR kur" ile 6 hazır ses; "Yeni kadın/erkek sesi üret"; kendi sesinizi klonlama (RTX'inizde, bulutsuz).
- Kendi model eğitimi: `docs/SES_EGITIMI.md`.
