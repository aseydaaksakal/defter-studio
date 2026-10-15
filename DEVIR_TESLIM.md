# Devir teslim

Son güncelleme: 2026-10-15 · sürüm **0.8.4** · canlı: https://aseydaaksakal.github.io/defter-studio/

Kısa tutulur (her oturum okur). Geçmiş: [docs/TAMAMLANANLAR.md](docs/TAMAMLANANLAR.md). Hatalar: [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (grep ile).

## 1. Durum
- NotebookLM benzeri Türkçe öğrenme defteri: GitHub Pages + kullanıcının PC'sindeki yardımcı sunucu (`localhost:8765`). Kurulum ve güncelleme otomatik; kullanıcıdan zip/bat isteme.
- **PC (Chrome, 15.10 12:00):** `/health` hâlâ **0.8.1** (`update.latest` 0.8.4, n=14). 0.8.1'de güncelleme döngüsü yok: bir kez "Sunucuyu güncelle" ya da yeniden başlatma gerekir, sonrası otomatik. Onaysız tetiklemedim. Motorlar: pockettr ✓, OmniVoice ✓. qwen3.8:27b: 71,5 tok/sn, 64k bağlam 17,8 GB VRAM.
- Defter dışı (aynı oturum): **AI Fabrika** kiti (yerel Qwen + ücretsiz havuz + Claude merdiveni) sohbette teslim, PC'de denenmedi; Defter ayarı kitte `ornekler/defter-studio.toml`. CLAUDE.md kural 5'e yerel-önce notu.
- Testler (teslimde dördü zorunlu; `server/.venv` yoksa kendisi kurar): e2e 142/142, sunucu 178/178, FSRS 12/12, sağlayıcı 7/7. Token: https://aseydaaksakal.github.io/defter-studio/docs/token/

## 2. Sıradaki iş (öncelik sırasıyla)
1. **PC:** Chrome bağlıysa `localhost:8765/health` 0.8.4 mü bak; öyleyse `/tts/selftest`'te VoxCPM ve Edge erkek ✓ mi, podcast'te Karakterlerim ile ses. Hâlâ 0.8.1 ise kullanıcı onay verdiyse Ayarlar › Lokal sunucu › Sunucuyu güncelle (`POST /update/apply`), vermediyse bir kez sor. Bağlı değilse yalnız hata çıktısını iste.
2. **Sınav planlayıcı v2** (FSRS vadeleri + sınav tarihi → günlük yük).
3. **qwen3-vl ile OCR** (taranmış PDF, tablo).
4. İsteğe bağlı: tarayıcıda Kokoro, Pocket TR için HF Space, tek-anahtar bulut tasarımı (ertelendi), Studio araçlarında ortak kaynak öneki.
Ayrıntı: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md).

## 3. Bilinen eksikler
- Bulut LLM, ses ve görseller gerçek anahtarla denenmedi (istek biçimi resmi geçiş rehberine göre düzeltildi).
- VoxCPM (`seed`) ve Edge erkek (boş ses) düzeltmesi PC'de sınanmadı. Embedding varsayılanı boş (bge-m3 önerilir).

## 4. Kullanıcı ortamı
RTX 5090 dizüstü (24 GB), i9-275HX, 64 GB RAM, Windows + Chrome 155, torch 2.11+cu128, Ollama `qwen3.8:27b`. Pro plan. Yeni oturumda yalnız **"devam"** yazar.

## 5. Kullanıcıya kalan elle işler (hedef: sıfır)
kur.bat'ı ilk kez çalıştırmak · API anahtarını Ayarlar'a girmek · 0.8.1'den bir kez "Sunucuyu güncelle". Yeni elle iş çıkarsa yaz, sonra otomatikleştir.

## 6. Kullanıcı tercihleri
Türkçe; Word üretme (PDF/MD/HTML); yalnız gerekli bağlantı; PC'de sistem ayarını kendin değiştirme (uygulamanın kendi otomatik başlatması hariç); kamuya açık/geri dönülmez işlemden önce sor; API anahtarı sohbette gelirse kullanma, Ayarlar'a girilmesini söyle.
