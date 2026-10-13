# Yapay zeka görselleri (0.5.0)

Slayt, infografik ve video sahnelerine kaynakla ilgili görsel eklenir. Görselde **yazı olmaz** (modeller Türkçe harfleri bozar); metni uygulama basar.

## Nasıl çalışır
1. Dil modeli içerik üretirken her slayta, sahneye ve infografik kutusuna İngilizce, yazısız, tek cümlelik bir `visual` tarifi yazar (infografikte ayrıca `heroVisual`).
2. İçerik hazır olunca (Ayarlar › Görseller'de "otomatik" açıksa) tarifler görsel sağlayıcısına gider; dönen görselin önbellek anahtarı `imgKey` alanına yazılır.
3. Görsel `IndexedDB` `blobs` tablosunda `img:<özet>` anahtarıyla saklanır. Anahtar = istem + stil + oran özeti, bu yüzden aynı istem bir daha üretilmez.
4. Görüntüleyicilerde **Görselleri üret** (eksikleri tamamlar) ve **Görseli yenile** (yeni tarifle tek görsel) düğmeleri vardır.

| Çıktı | Görsel nerede |
|---|---|
| Slayt | Kapakta tam arka plan; madde, iki sütun, alıntı, sayı düzenlerinde sağda resim paneli. Grafik, tablo, zaman çizelgesi, adımlar görselsiz. |
| İnfografik | Başlık görseli (`ip-hero`) + ilk 6 kutu için küçük resim (`ip-ic`). PNG dışa aktarımında görseller gömülür. |
| Video | Her sahnede simgenin yerine yuvarlak köşeli panel, yavaş yakınlaşma. MP4/WebM kaydına dahildir. |

Bir sunuda en çok kaç görsel üretileceği Ayarlar'dan seçilir (varsayılan 12; kapak + eşit aralıklı seçim). Bu, ücretsiz kotayı ve süreyi korur.

## Sağlayıcılar (Ayarlar › Görseller, otomatik sıra)
| Sağlayıcı | Gerekenler | Not |
|---|---|---|
| **Gemini** | Seslendirme bölümündeki Gemini anahtarı (ya da dil modeli Gemini ise o anahtar) | Interactions API (`/v1beta/interactions`), varsayılan model `gemini-3.1-flash-lite-image` (en ucuz, 1K). Ayarlar'dan model değiştirilebilir. Eski `generateContent` uç noktasına otomatik düşer. Imagen kapatıldığı için kullanılmaz. |
| **MiniMax** | Seslendirme bölümündeki MiniMax anahtarı | `image-01`, `POST https://api.minimax.io/v1/image_generation`, `response_format: base64`. |
| **Lokal** | Lokal sunucu + ComfyUI + FLUX.1-schnell | Aşağıda. Anahtar ve kota yok. |

İstek biçimleri sahte `fetch` ile e2e'de doğrulandı; **gerçek anahtarla henüz denenmedi** (ilk denemede yanıt biçimi farkı çıkarsa düzeltilecek yer `js/imagegen.js` içindeki `geminiImage` / `minimaxImage`; yanıtı `findImage` şemadan bağımsız arar).

## Lokal: ComfyUI + FLUX.1-schnell (RTX 50xx dahil)
1. `tools\kur-comfyui.bat`: ComfyUI'yi `%USERPROFILE%\ComfyUI` içine kurar, PyTorch CUDA 12.8 yükler, `flux1-schnell-fp8.safetensors` (Comfy-Org/flux1-schnell, Apache-2.0, ~17 GB) indirir.
2. `tools\comfyui-baslat.bat`: ComfyUI'yi `127.0.0.1:8188`'de başlatır.
3. `server\baslat.bat`: Defter Studio sunucusu. `/health` yanıtındaki `image.ok` true olunca uygulama lokal sağlayıcıyı görür.
4. Uygulamada Ayarlar › Görseller › **Deneme görseli üret**.

Sunucu (`server/gorsel.py`) ComfyUI'ye API iş akışı gönderir, bitince görseli alır; GPU'da aynı anda tek iş çalışır. Model dosyasını `/object_info` yanıtından kendisi bulur:
- Tek dosyalı denetim noktası (`CheckpointLoaderSimple`, adında `schnell` ya da `flux` geçen ilk dosya), ya da
- ayrı dosyalar: `UNETLoader` + `DualCLIPLoader` (t5xxl + clip_l) + `VAELoader` (`ae.safetensors`).

Ortam değişkenleri: `DEFTER_COMFY` (adres), `DEFTER_COMFY_MODEL` (dosya adı), `DEFTER_COMFY_STEPS` (varsayılan 4).

## Sorun giderme
- **"ComfyUI çalışmıyor"**: `tools\comfyui-baslat.bat` açık mı? Adres `http://127.0.0.1:8188` mi?
- **"ComfyUI çalışıyor ama eksik: …"**: model dosyası `models/checkpoints` (ya da `unet`, `clip`, `vae`) içinde mi? ComfyUI'yi yeniden başlatın.
- **Gemini 400/404**: model adı değişmiş olabilir; Ayarlar › Görseller › Gemini görsel modeli. Güncel adlar: https://ai.google.dev/gemini-api/docs/image-generation
- **Gemini/MiniMax 429**: kota. İstek 3 kez, artan beklemeyle denenir; sonra bir sonraki sağlayıcıya geçilir.
- **Görseller sunuda yok**: sunu 0.5.0'dan önce üretildiyse `visual` tarifi yoktur; sunuyu yeniden üretin ya da slayt başına **Görseli yenile** ile tarif girin.
