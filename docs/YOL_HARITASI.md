# Yol haritası

## Tamamlananlar
| Sürüm | Öne çıkan |
|---|---|
| 0.1.0 | Defterler, kaynaklar, alıntılı sohbet, 9 Studio aracı, sürümler, Pages |
| 0.2.0 | Doğal Türkçe çok sesli podcast, öğrenme merkezi, hafıza, Feynman, hızlı okuma, klavye, deneme sınavı |
| 0.2.1–0.2.2 | Bağlantı yardımcısı, ElevenLabs, Türkçe OCR, Piper arka planda, Ollama teşhisi |
| 0.3.0 | Ses v3 (MiniMax klon, Azure, Google, kadın sesi çözümü), erkek anlatıcılı video, tam sayılar, kaynak doğrulama, soru bankası, dinleyerek öğren, yöntemler kütüphanesi, lokal sunucu v2, 36 kontrollü testler |

## Sıradaki (öncelik sırasıyla)

### Faz B — görsel kalite ve gerçek NotebookLM videosu
1. ✅ **Yapay zeka görselleri (0.5.0):** slayt, infografik ve video sahnelerine görsel. Gerçek anahtar/GPU ile doğrulama kullanıcıda.
   - Lokal: ComfyUI + FLUX.1-schnell (RTX 5090).
   - Bulut: Gemini/Imagen ya da MiniMax image API.
   - Her görsel kaynakla ilgili bir istemden üretilip önbelleğe alınır.
2. **Video v2:** Ken Burns yakınlaştırma, sahne geçişleri, şekil/ok animasyonları, kelime düzeyinde altyazı.
   - Kelime zamanlaması için MiniMax/ElevenLabs zaman damgaları kullanılır.
   - Lokal sunucuda ffmpeg ile hızlı (gerçek zamanlı olmayan) MP4 üretimi.
3. **Slayt v2:** Daha fazla tema, görselli düzenler, sunum modunda lazer imleç ve PDF'e notlarla basma.

### Faz C — öğrenme motoru
4. **FSRS-5 zamanlayıcı:** Kartlar, hata defteri ve soru bankasında ortak bellek modeli kullanılır; zorluk ve kararlılık tahmini yapılır.
5. **Sınav planlayıcı v2:**
   - Konu ağırlıkları (ÖSYM/UAB dağılımları).
   - Günlük takvim ve bildirim.
   - Haftalık deneme sınavı.
   - Hazırlık eğrisi.
6. **Sesli sözlü sınav:**
   - Mikrofonla cevap, Whisper (lokal) ya da MiniMax ASR ile döküm.
   - Model değerlendirmesi.
   - Speech-to-speech için gecikmesi düşük bulut seçeneği.
7. **Telaffuz puanı (gölgeleme):** Kayıt → döküm → hedef cümleyle kelime karşılaştırması.

### Faz D — kaynaklar ve doğruluk
8. **Görsel modelle OCR:** qwen3-vl:8b (kurulu) ya da PaddleOCR ile tablo, formül ve el yazısı okuma.
9. **Doğrulama v2:**
   - İsteğe bağlı ikinci model kontrolü: soru yalnız alıntıyla tekrar cevaplanır, cevap anahtarla karşılaştırılır. Lokal model kullanılır, ücretsizdir.
   - Sohbette cümle bazlı alıntı vurgusu.
10. **Embedding varsayılanı:** Türkçe için `bge-m3`. Kurulu `nomic-embed-text` İngilizce ağırlıklı.

### Faz E — senkron ve paylaşım
11. **Cihazlar arası eşitleme:** İsteğe bağlı GitHub Gist ya da kullanıcının kendi WebDAV/Drive alanı, uçtan uca şifreli.
12. **Paylaşılabilir salt okunur defter bağlantısı.**

## Bilinçli olarak yapılmayanlar
- **Word (.docx) çıktı:** Kullanıcı tercihi gereği yok; çıktılar PDF/Markdown/HTML.
- **Sunucu tarafı hesap ve veritabanı:** Gizlilik ve ücretsizlik için yok.
- **Kullanıcının izni olmayan ses klonlama:** Arayüz izni onaylatır.
