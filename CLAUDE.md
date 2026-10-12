# CLAUDE.md — Defter Studio çalışma kuralları

Bu dosya projede çalışan bir sonraki Claude oturumu içindir. Diğer yapay zeka ajanları için aynı kurallar [AGENTS.md](AGENTS.md)'de.

## Ne bu?
NotebookLM benzeri statik web uygulaması, sınav hazırlık araçlarıyla.
- GitHub Pages'te `main` dalının kökünden yayınlanır: https://aseydaaksakal.github.io/defter-studio/
- Derleme adımı yoktur; her push 1-2 dakikada canlıya çıkar.
- Lokal sunucu (`server/`) isteğe bağlıdır ve uygulamayı `http://localhost:8765` adresinde de sunar.

## Oturuma başlarken (sırayla, yalnız gerekeni oku)
1. [DEVIR_TESLIM.md](DEVIR_TESLIM.md): şu anki durum, son yapılanlar, **sıradaki iş**.
2. [PROJE_REHBERI.md](PROJE_REHBERI.md): yalnız görevle ilgili bölüm. Bölüm başlıkları dosya → görev eşlemesidir.
3. Hata ya da tuhaf davranış varsa [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md): aynı sorun daha önce çözülmüş olabilir.
4. Büyük dosyaları baştan sona okuma:
   - `js/app.js` ~75 KB, `css/app.css` ~48 KB, `js/studio/gen.js` ~45 KB.
   - Önce `grep -n` ile bölümü bul, sonra yalnız o aralığı oku.

## Oturum değiştirme kuralı (5 saatlik ve haftalık limitleri korumak için)
- Bir özellik ya da bir tam tur (kodlama → test → yayın) bitince dur:
  - `DEVIR_TESLIM.md`'nin "Sıradaki iş" bölümünü güncelle.
  - `docs/NOT_DEFTERI.md`'ye bir kayıt ekle.
  - Kullanıcıya **yeni oturuma geçmeyi öner** ve kopyalanabilir başlangıç istemini ver. İstem `DEVIR_TESLIM.md`'nin sonundadır.
- Bağlam dolmaya yaklaşınca da aynısını yap. Yarım işi commit etmeden bırakma; yarımsa dalda ya da `TODO` notuyla bırak.

## Kurallar
- **Dil:** Arayüz dili Türkçe, kod yorumları Türkçe.
- **Bağımlılık:** Kütüphaneler `js/vendor/` içinde tutulur; CDN'e yeni bağımlılık ekleme. Tek istisna Piper'ın onnxruntime'ı.
- **Yeni Studio aracı** şu dört yere eklenir:
  - `js/studio/gen.js` içinde `TOOLS.<ad>` (`options` + `generate`). Model gerekmiyorsa `noLLM: true`.
  - `js/studio/views/<ad>.js` (`render`, `toText`).
  - `js/app.js` içindeki `VIEWS` haritası.
  - `css/app.css` içinde `.t-<ad>` rengi.
- **Tam sayı:** Sayı seçeneği `type: 'count'` olur, üretim `generateExact` (`js/studio/batch.js`) ile yapılır.
  - İstenen sayı kesin hedeftir.
  - Eksik kalırsa `content.note` açıklar.
- **Halüsinasyon:** Soru ve kart üretiminde `EVIDENCE_RULE` ve `verifyItem` kullanılır. Doğrulanamayan öğe kullanıcıya gösterilmez.
- **Görüntüleyici:** `api.save(content, not)` ile kaydeder; not verilirse önceki hâl `versions` tablosuna girer.
- **Veritabanı:** Şema değişirse `db.version(n+1)` ekle; eski sürümü silme. Şu an v2 (`questions` tablosu).
- **Ses:** Yeni motor `js/tts.js` içinde şuralara eklenir: `ENGINES`, `ENGINE_SHORT`, `voicePool`, `LINE_FN` (ya da parça fonksiyonu), `availableEngines`.
  - Her motor kadın ve erkek ses vermeli. Veremiyorsa `femaleOK` false dönmeli.
- **localhost:** Kullanıcı açıkça istemedikçe tarayıcı localhost'a istek atmaz (Chrome yerel ağ izni sorar).
  - Sunucu adresi boşsa `serverUrl()` yalnız uygulama zaten localhost'tan açılmışsa aynı kökene sorar.
- **Belge çıktısı:** Word (.docx) üretme; belge çıktıları PDF/Markdown/HTML olur. Kullanıcının kalıcı tercihi budur.
- **Gizli bilgiler:** API anahtarlarını, GitHub belirteçlerini ve kullanıcı ses kayıtlarını asla dosyaya, commit'e, dokümana ya da teste yazma.

## Test
```bash
python3 -m http.server 8099 &        # depo kökünde
python3 tests/mock_llm.py &          # sahte model (OpenAI uyumlu SSE) + sahte lokal sunucu (/health, /tts) — 8098
python3 tests/e2e.py [klasör]        # 36 uçtan uca kontrol, ekran görüntüleri klasöre
```
Sahte model istemdeki KAYNAKLAR bloğundan istenen sayıda, kaynaktan alıntılı öğe üretir.
- Yeni bir istem eklersen `tests/mock_llm.py`'ye o isteme özgü bir anahtar ifade ekle.
- Anahtar, kaynak metninde geçmeyecek bir ifade olmalı.

Kabuk notu: `pkill -f` ile süreç öldürürken desen komut satırının kendisinde geçmesin.
- Örnek: `pgrep -f "[m]ock_llm"`. Aksi hâlde kabuk kendini öldürür (çıkış kodu 144).

## Teslim
`bash tools/teslim.sh "kısa açıklama"` şunları yapar:
1. Testleri çalıştırır.
2. `DEGISIKLIKLER.md`'ye tarihli satır ekler.
3. `LINKLER.md`'yi tazeler.
4. Commit ve push eder.
5. Bütün bağlantıları yazdırır.

Push sonrası canlı siteyi Chrome'da açıp konsolu kontrol et. Kullanıcıya en sonda bütün bağlantıları ver.
