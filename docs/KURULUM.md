# Kurulum

## 1. Hiçbir şey kurmadan deneyin
Canlı adresi açın. "Örnek: GMDSS" defterinde dokuz Studio içeriğinin hepsi hazırdır; model bağlamadan
oynatıcıyı, slaytları, testi, kartları, haritayı inceleyebilirsiniz. Yeni içerik üretmek için bir model bağlayın.

## 2. Lokal model: Ollama (ücretsiz, önerilen)

1. https://ollama.com adresinden Windows sürümünü kurun.
2. Modelleri indirin (PowerShell):
   ```powershell
   ollama pull qwen3.8:27b
   ollama pull bge-m3          # isteğe bağlı: anlamsal arama
   ```
3. **Siteye izin verin (zorunlu).** En kolayı: depodaki `tools/ollama-baglan.bat` dosyasını çift tıklayın. Elle yapmak isterseniz: Tarayıcıdaki sayfa başka bir adresten Ollama'ya bağlandığı için
   Ollama'nın bu siteye izin vermesi gerekir:
   ```powershell
   setx OLLAMA_ORIGINS "https://aseydaaksakal.github.io"
   setx OLLAMA_FLASH_ATTENTION 1
   setx OLLAMA_KV_CACHE_TYPE q8_0
   ```
   Ardından görev çubuğundaki Ollama simgesinden **Quit** deyip Ollama'yı yeniden açın.
4. Uygulamada ⚙ Ayarlar › Sağlayıcı: **Ollama**, Model: `qwen3.8:27b` › **Bağlantıyı test et** › Kaydet.
5. Chrome "yerel ağdaki cihazlara erişim" izni sorarsa **İzin ver** deyin.

> Sorun mu var? `http://localhost:11434` adresini tarayıcıda açın; "Ollama is running" yazmalı.
> "Failed to fetch" hatası çoğunlukla OLLAMA_ORIGINS ayarının yapılmadığını veya Ollama'nın yeniden başlatılmadığını gösterir.

### LM Studio kullanmak isterseniz
Developer sekmesinde sunucuyu başlatın, **Enable CORS** açın. Ayarlar › Sağlayıcı: LM Studio, adres `http://localhost:1234/v1`.

## 3. Kendi API anahtarınızla (isteğe bağlı)
Ayarlar › Sağlayıcı: Gemini, Groq, OpenRouter, OpenAI veya Anthropic seçin, anahtarı yapıştırın, **Listele** ile model seçin.
Anahtar yalnızca bu tarayıcıda saklanır; GitHub'a veya başka bir yere gönderilmez.

## 4. Doğal seslendirme (podcast ve video)
⚙ Ayarlar › **Seslendirme** bölümünden motoru seçin ve **Sesi dene** ile kadın + erkek sesi dinleyin.

| Motor | Kalite | Gerekenler |
|---|---|---|
| ElevenLabs | Gerçek insan sesi, duygulu (v3 diyalog modeli) | elevenlabs.io API anahtarı (ücretsiz aylık kota). En iyi sonuç için Ses Kütüphanesi'nden Türkçe anadil kadın ve erkek ses ekleyip Ayarlar'da seçin |
| Gemini TTS | Çok doğal, çok konuşmacılı, Türkçe destekli | aistudio.google.com'dan Gemini API anahtarı |
| OpenAI TTS | Çok doğal | OpenAI API anahtarı (ücretli) |
| Lokal sunucu | XTTS-v2 / Chatterbox ile çok doğal | Aşağıdaki yardımcı sunucu + GPU |
| Tarayıcıda Piper | İyi, ücretsiz, çevrimdışı | İlk kullanımda ~60 MB ses modeli iner |
| Tarayıcı sesi | Edge'de doğal (Emel/Ahmet), Chrome'da robotik | Hiçbir şey |

Otomatik modda sırasıyla ElevenLabs anahtarı → Gemini anahtarı → OpenAI anahtarı → lokal sunucu → tarayıcıda Piper seçilir.

## 5. Yardımcı sunucu (kaliteli ses, video sesi, ses/YouTube dökümü, web araması)

Gerekenler: Python 3.11, (GPU için) güncel NVIDIA sürücüsü.

```powershell
cd server
baslat.bat
```
İlk çalıştırmada sanal ortam kurulur ve paketler yüklenir. Ardından uygulamada ⚙ Ayarlar › Lokal yardımcı sunucu
kutusuna `http://localhost:8765` yazıp **Kontrol et** deyin.

Seslendirme motorunu ortam değişkeniyle seçin:

| `DEFTER_TTS` | Kalite | Kurulum |
|---|---|---|
| `piper` (varsayılan) | İyi, çok hızlı, CPU yeter | `pip install piper-tts` (requirements'ta var). Sesler ilk kullanımda iner. |
| `xtts` | Çok doğal, ses klonlama | `pip install coqui-tts` + PyTorch CUDA. `server/voices/A.wav`, `B.wav` koyarsanız o seslerle konuşur. Lisans: ticari olmayan. |
| `chatterbox` | Çok doğal, duygu kontrollü | `pip install chatterbox-tts` + PyTorch CUDA |
| `edge` | Çok doğal Türkçe (Emel/Ahmet) | `pip install edge-tts` — ücretsiz ama çevrimiçi, açık kaynak değil |

RTX 5090 (Blackwell) için PyTorch'un CUDA 12.8+ sürümünü kurun:
```powershell
pip install torch --index-url https://download.pytorch.org/whl/cu128
```

## 6. Kendi bilgisayarınızda geliştirme
```powershell
cd defter-studio
python -m http.server 8080
```
`http://localhost:8080` adresini açın. Bu adres de yardımcı sunucunun izin listesinde vardır.
