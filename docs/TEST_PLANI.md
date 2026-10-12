# Test planı

## 1. Otomatik (her push'tan önce)

```bash
python3 -m http.server 8099 &      # depo kökünde
python3 tests/mock_llm.py &        # sahte model + sahte sunucu (8098)
python3 tests/e2e.py ./shots       # 36 kontrol + ekran görüntüleri
```

| Alan | Kontrol |
|---|---|
| Ayarlar | Ses bölümü motorları; otomatik motorun lokal sunucuyu seçmesi |
| Kaynak | .md dosya yükleme, metin yapıştırma |
| Sohbet | "kaynaklı" rozeti; olmayan kaynak numarasının silinmesi |
| Test | Tam 20 soru, 1/20 sayaç, "doğrulandı" rozeti, cevapta kaynak alıntısı |
| Kartlar | Tam 15 kart |
| Slayt | 5 slayt (tek istek), 20 slayt (ana hat + partiler), grafik/tablo/zaman çizelgesi düzenleri |
| Podcast | Senaryo, ses dosyası (sahte TTS), WAV indirme |
| Video | Erkek anlatıcı hazır, MP4/WebM sesli indirme |
| Dinleyerek öğren | 10 cümle, dikte karşılaştırması |
| Soru bankası | 30 soruya doldurma, bankadan 10 soruluk test, çözülen sayısının artması |
| İçerik yönetimi | Yeniden adlandırma, JSON düzenleme, sürüm geçmişi + geri yükleme, silme |
| Defter | Yedek dışa aktarma (banka dahil), içe aktarma, defter silme |
| Diğer | Yöntemler kütüphanesi, mobil düzende yatay kaydırma yok, sayfa hatası yok |

## 2. Elle (gerçek model ve gerçek seslerle, sürüm başına bir kez)

### Model
- [ ] Ollama (qwen3.8:27b) ile 10 soruluk test. Doğrulanan oranı not edin; %90'ın altıysa istemi inceleyin.
- [ ] 50 soruluk test (lokal): süre, tekrar oranı, "İstenen/üretilen" notu.
- [ ] 100 slaytlık sunu: ana hat kaynağın tamamını kapsıyor mu, son slayt özet mi.
- [ ] Sohbet: kaynakta olmayan bir soru sorun. Cevap "Kaynaklarınızda bu bilgi yok" ile başlamalı.

### Ses
- [ ] Gemini anahtarıyla podcast: kadın + erkek ses, Türkçe vurgu, kısaltma okunuşu (GMDSS, VHF, %75).
- [ ] MiniMax:
  - [ ] Hazır Türkçe kadın/erkek ses.
  - [ ] 30 sn kendi kaydınızla klon: önizleme sesi çalmalı, ses listesine eklenmeli.
  - [ ] Metinle ses tasarımı.
- [ ] Azure F0 ve Google Cloud anahtarlarıyla "Sesi dene".
- [ ] Hiç anahtar yokken: Piper ile erkek ses, kadın konuşmacıda çözüm kartı görünmeli, ses parça parça çalmalı.

### Lokal sunucu ve video
- [ ] Lokal sunucu (`server/baslat.bat`):
  - [ ] Uygulama localhost:8765'te açılmalı.
  - [ ] Ollama ayarsız bağlanmalı.
  - [ ] edge-tts ile kadın/erkek ses gelmeli.
  - [ ] Kayıt yükleme sonrası Chatterbox klonu çalışmalı (`tools/kur-gpu.bat` sonrası).
- [ ] Video: erkek anlatıcı, sahne geçişlerinin sesle uyumu, MP4 indirme ve telefonda oynatma.

### Kaynaklar, banka ve cihazlar
- [ ] Taranmış PDF (ör. 697 sayfa): OCR ilerlemesi, sayfayı yenileyince kaldığı yerden devam.
- [ ] Soru bankası (lokal):
  - [ ] Hedef 200; sayfayı kapatıp açınca doldurma devam etmeli.
  - [ ] "Bankadan test" 0 token ile açılmalı.
  - [ ] Sınav tarihi planı görünmeli.
- [ ] Telefonda (Chrome/Safari): kaynak ekleme, test çözme, podcast dinleme.
- [ ] Koyu/açık tema, klavye ile gezinme, ekran okuyucu etiketleri.

## 3. Bilinen sınırlar
- **Sandbox'ta (bulut test ortamında) yapılamayanlar:** Piper sesleri (Hugging Face erişimi yok) ve gerçek bulut TTS. Bunlar elle test edilir.
- **Video kaydı gerçek zamanlıdır:** 5 dakikalık video 5 dakikada kaydedilir. Sekme arka plandayken kare düşebilir.
