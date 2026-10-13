# Kendi Türkçe ses modelini eğitmek (RTX 5090) ve Pages'e koymak

Bu belge 0.8.0'da sorulan soruların dürüst cevabıdır. Buradaki sayılar araştırmaya dayanır; **bu ortamda GPU eğitimi çalıştırılmadı**, süreler tahmindir ve ilk denemede ölçülmelidir.

## Kısa cevaplar

| Soru | Cevap |
|---|---|
| RTX 5090 ile kendim eğitebilir miyim? | Evet. 32 GB VRAM, StyleTTS2/Kokoro ince ayarı ve VITS (Piper) eğitimi için fazlasıyla yeter. Süre: saatler–günler (veriye bağlı). |
| 100 MB altına inip Pages'te çalışır mı? | Evet, ama yalnız küçük mimarilerle: **Kokoro-82M (q8 ONNX ≈ 86–92 MB)** ya da **Piper/VITS (≈ 60–65 MB)**. Büyük (500 MB+) klonlayan modeller Pages'e konamaz; onlar RTX'inizde sunucuda çalışır. |
| RAG ya da "fine-tune"? | RAG metin arama içindir, sese hiçbir etkisi yoktur. Ses için **ince ayar (fine-tune)** gerekir. |
| YouTube / mp3 / mp4 atıp eğitebilir miyim? | Teknik olarak evet (`tools/veri-seti-hazirla.py`). Hukuken: yalnız **kendi sesiniz ya da yazılı izinli** kayıtlar. Başkasının sesini izinsiz eğitmek telif/kişilik hakkı ve çoğu platform kuralı açısından risklidir. |
| Tamamen ücretsiz / açık kaynak mı? | Evet: Kokoro (Apache-2.0), StyleTTS2 (MIT), Piper (MIT, depo arşivlendi), Whisper (MIT), yt-dlp, ffmpeg. Maliyet yalnız elektrik ve zamandır. |
| Piper'dan (63 MB) iyi olur mu? | Kokoro tabanı bu boyda genelde Piper'dan daha doğal ve vurgulu konuşur; **Türkçede** bunu ancak yeterli Türkçe veriyle ince ayar yaparak elde edersiniz (Kokoro'nun Türkçesi resmî olarak yok). Garanti vermiyoruz; önce 1 saatlik deneme eğitimiyle dinleyip karar verin. |
| "ee" demek, nefes, vurgu | Model **eğitim verisinde ne varsa onu** öğrenir. "Ee"/nefes istiyorsanız veri **sohbet/podcast tarzı doğal konuşma** olmalı ve dökümde "ee" gibi dolgular yazılı kalmalı (araç Whisper'a bunu hatırlatan bir ipucu verir). Okuma/haber sesi verisiyle "ee" çıkmaz. |
| `hans00/MOSS-TTS-Nano-GGUF` | **Kullanılamaz**: depoda yalnız codec (ses kodlayıcı) çevrilmiş, dil modeli kısmı yok. Pages'e konsa da konuşturamaz. |
| `hexgrad/Kokoro-82M` indirip eğitebilir miyiz? | Evet, mantıklı yol bu. Kokoro, sesleri "stil vektörü" ile tutar: birden fazla kadın/erkek ses = tek model + çok konuşmacılı veri. |
| Sıfırdan mı, ince ayar mı? | **İnce ayar.** Sıfırdan Türkçe model yüzlerce saat veri ve haftalar ister. Hazır bir Türkçe temel (örn. `duxx/kikiri-turkish-base`, ~53 saat, CC-BY-SA) üstüne ince ayar çok daha ucuzdur; lisans şartına (atıf + aynı lisans) uyun. |

## Önerilen yol (sırayla)

1. **Önce sunucu tarafını kullanın.** Bu uygulamanın RTX'inizdeki sunucusu (Ses stüdyosu) bugün çoklu kadın/erkek ses üretir, klonlar ve podcast/videoda kullanır. Pages'e küçük bir modeli koymak ikinci adımdır.
2. **Veri toplayın** (kendi/izinli kayıtlar). Hedef: ses başına en az 30 dk (deneme), iyi sonuç için 2–10 saat temiz kayıt; gürültüsüz, tek konuşmacılı, tutarlı mikrofon.
   ```bash
   pip install faster-whisper yt-dlp
   python tools/veri-seti-hazirla.py --cikis veri/hasan kayit1.mp3 klip.mp4 https://youtu.be/...
   ```
   Çıktı: `veri/hasan/wavs/*.wav` (24 kHz mono, 2–15 sn) + `metadata.csv` (`dosya|metin`). Dökümü **elle gözden geçirin**: yanlış yazılmış metin en büyük kalite düşmanıdır.
3. **İnce ayar.** Kokoro/StyleTTS2 için topluluk tarifi: `kikiri-tts` deposundaki eğitim betikleri (veri `metadata.csv` biçimine çevrilir, fonemleştirme espeak-ng ile Türkçe). Önce küçük (≈1 saat veri, birkaç yüz adım) deneme yapın, çıkan sesi dinleyin, sonra uzatın. 5090'da bu ölçek saatler sürer; tam çok konuşmacılı eğitim günler.
4. **Boyut.** Eğitilen ağırlıkları ONNX'e aktarıp `q8` (8 bit) nicemleyin: Kokoro ≈ 86–92 MB. Çok konuşmacı için her ses ~0,5 KB'lık stil vektörüdür; yani 10 ses eklemek boyutu neredeyse değiştirmez.
5. **Pages'e koyma (sonraki iş).** Model dosyası `js/vendor/` ya da depo içinde ≤100 MB tek dosya olmalı (GitHub dosya sınırı 100 MB); tarayıcıda ONNX Runtime Web ile çalışır (CLAUDE.md: CDN yok, kütüphane depoda). Bu motor henüz yazılmadı: modeli eğittiğinizde `js/tts.js`'e `kokoro` motoru olarak eklenecek (yeni motor kuralı CLAUDE.md'de).

## Süre ve donanım beklentisi (tahmin)

- Veri hazırlama: 10 saat kayıt için Whisper large-v3 5090'da ~20–40 dk.
- Küçük deneme ince ayar: ~1–3 saat. Kaliteli çok sesli model: 1–3 gün.
- VRAM sorunu olursa toplu iş boyutunu düşürün; Ollama modeli VRAM'i tutuyorsa eğitim öncesi boşaltın (`ollama stop ...`).

## Piper yolu (alternatif)

Piper'ın eğitim deposu arşivlendi ama çalışır: VITS, ~63 MB, çok hızlı; ses karakteri ve vurgu Kokoro'dan daha düz kalır. Tek ses = bir model dosyası (çok ses = çok dosya ya da çok konuşmacılı eğitim). Kokoro denemesi başarısız olursa yedek yoldur.

## Hukuki / etik not

Bir kişinin sesinin eğitim verisi olarak kullanılması için **açık izin** gerekir; YouTube videosunun herkese açık olması izin anlamına gelmez. Ürettiğiniz sesi gerçek biri gibi yayınlamayın. Bu depodaki araçlar yalnız izinli veriyle kullanım içindir.
