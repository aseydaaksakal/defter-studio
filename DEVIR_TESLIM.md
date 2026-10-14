# Devir teslim

Son güncelleme: 2026-10-15 · sürüm **0.8.4** · canlı: https://aseydaaksakal.github.io/defter-studio/

Kısa tutulur (her oturum okur). Geçmiş: [docs/TAMAMLANANLAR.md](docs/TAMAMLANANLAR.md). Hatalar: [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (grep ile).

## 1. Durum
- NotebookLM benzeri Türkçe öğrenme defteri; GitHub Pages + kullanıcının PC'sindeki yardımcı sunucu (`localhost:8765`, RTX 5090). Kurulum ve güncelleme otomatik: kullanıcıdan zip/bat isteme.
- **PC canlı doğrulama (15.10.2026, Chrome):** sunucu 0.8.1'de takılıydı (diskte 0.8.2) → 0.8.4 eski kodu algılayıp kendini yeniden başlatır. Modeller kartları doğru. Motorlar: pockettr ✓, OmniVoice ✓, VoxCPM ✗ `seed` (düzeltildi), Edge erkek ✗ boş ses (yeniden deneme eklendi).
- 0.8.4: bulut Claude 400 (temperature) düzeltmesi, Gemini varsayılanları, sohbet önbellek sırası, FSRS-6, `defter-istem` + istem denetimi, `.claude/rules`, ajan ayarları, sessiz testler.
- Testler: e2e 142/142, sunucu 178/178, FSRS 12/12, sağlayıcı 7/7. Token: https://aseydaaksakal.github.io/defter-studio/docs/token/

## 2. Sıradaki iş (öncelik sırasıyla)
1. **PC:** oturum PC'ye bağlıysa (Claude in Chrome) kendin bak: `localhost:8765/health` sürümü 0.8.4 mü (`update.restart`), `/tts/selftest`'te VoxCPM ve Edge erkek ✓ mi, podcast'te Karakterlerim ile ses. Bağlı değilse kullanıcıdan yalnız hata çıktısını iste.
2. Bilgisayar yeniden başlayınca localhost:8765 kendiliğinden açılıyor mu (kullanıcıya tek soru).
3. **Sınav planlayıcı v2** (FSRS vadeleri + sınav tarihi → günlük yük).
4. **qwen3-vl ile OCR** (taranmış PDF, tablo).
5. İsteğe bağlı: tarayıcıda Kokoro, Pocket TR için HF Space, tek-anahtar bulut tasarımı (ertelendi), Studio araçlarında ortak kaynak öneki.
Ayrıntı: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 3. Bilinen eksikler
- Bulut LLM, ses ve görselleri gerçek anahtarla denenmedi (istek biçimi resmi geçiş rehberine göre düzeltildi).
- VoxCPM ve Edge düzeltmesi PC'de yeniden sınanmadı. Embedding varsayılanı boş (bge-m3 önerilir).

## 4. Kullanıcı ortamı
RTX 5090 dizüstü (24 GB), i9-275HX, 64 GB RAM, Windows + Chrome 155, torch 2.11+cu128, Ollama `qwen3.8:27b`. Pro plan. Yeni oturumda yalnız **"devam"** yazar.

## 5. Kullanıcıya kalan elle işler (hedef: sıfır)
kur.bat'ı ilk kez çalıştırmak · API anahtarını Ayarlar'a girmek · yeniden başlatma sonucunu bildirmek. Yeni elle iş çıkarsa yaz, sonra otomatikleştir.

## 6. Kullanıcı tercihleri
Türkçe; Word üretme (PDF/MD/HTML); yalnız gerekli bağlantı; PC'de sistem ayarını kendin değiştirme (uygulamanın kendi otomatik başlatması hariç); kamuya açık/geri dönülmez işlemden önce sor; API anahtarı sohbette gelirse kullanma, Ayarlar'a girilmesini söyle.
