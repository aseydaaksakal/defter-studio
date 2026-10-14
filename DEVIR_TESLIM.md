# Devir teslim

Son güncelleme: 2026-10-14 · sürüm **0.8.2** · canlı: https://aseydaaksakal.github.io/defter-studio/

Kısa tutulur (her oturum okur). Geçmiş ve kanıtlar: [docs/TAMAMLANANLAR.md](docs/TAMAMLANANLAR.md). Hatalar: [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (grep ile).

## 1. Durum
- NotebookLM benzeri Türkçe öğrenme defteri; GitHub Pages + kullanıcının PC'sindeki yardımcı sunucu (`localhost:8765`, RTX 5090).
- **Kurulum ve güncelleme çözüldü (2026-10-14, kullanıcıda doğrulandı):** `kur.bat` → `%LOCALAPPDATA%\DefterStudio`, Pages ile EŞİT (96 dosya). Sunucu 10 dk'da bir kendini günceller; 0.8.2'den itibaren Windows açılışında kendiliğinden başlar. Kullanıcıdan bir daha zip/bat isteme.
- Testler: `tests/e2e.py` 142/142, `tests/server_test.py` 164/164.
- Token ölçümü: https://aseydaaksakal.github.io/defter-studio/docs/token/ (her teslimde güncellenir).

## 2. Sıradaki iş (öncelik sırasıyla)
1. **0.8.2 doğrulaması (PC):** bilgisayar yeniden başlayınca localhost:8765 açılıyor mu; Ses stüdyosu › Modeller kartları "indirildi" mi (0.8.1e boyut düzeltmesi); "Motorları sına" çıktısı; podcast'te Karakterlerim ile ses üretimi. Hata varsa yalnız çıktıyı iste.
2. GPU motorları gerçek donanımda: OmniVoice tasarım/klon, VoxCPM/Trendyol, Pocket TR. Gerekirse adaptör düzeltmesi.
3. **FSRS-5** zamanlayıcı (kart + hata defteri + banka ortak) ve sınav planlayıcı v2.
4. **qwen3-vl ile OCR** (taranmış PDF, tablo).
5. İsteğe bağlı: tarayıcıda Kokoro motoru (kullanıcı eğitirse, `docs/SES_EGITIMI.md`), Pocket TR için HF Space, tek-anahtar bulut tasarımı (ertelendi).
Ayrıntı: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 3. Bilinen eksikler
- Bulut sesleri/görselleri gerçek anahtarla denenmedi (hata çıkarsa: `js/tts.js` `*Line`, `js/imagegen.js`).
- GPU motorları ve `kur.bat`/`kur-gpu.bat` yalnız statik testli; kullanıcı PC'sinde kısmen doğrulandı.
- Aralıklı tekrar basit aralıklarla (FSRS bekliyor); embedding varsayılanı boş (bge-m3 önerilir).

## 4. Kullanıcı ortamı
RTX 5090 dizüstü (24 GB), i9-275HX, 64 GB RAM, Windows + Chrome 155, Ollama `qwen3.8:27b`. Pro plan. Yeni oturumda yalnız **"devam"** yazar.

## 5. Kullanıcı tercihleri
Türkçe; Word üretme (PDF/MD/HTML); yalnız gerekli bağlantı; PC'de sistem ayarını kendin değiştirme (uygulamanın kendi kurduğu otomatik başlatma hariç, kullanıcı istedi); kamuya açık/geri dönülmez işlemden önce sor; API anahtarı sohbette gelirse kullanma, Ayarlar'a girilmesini söyle.
