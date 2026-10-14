# CLAUDE.md — Defter Studio giriş kartı

Kullanıcı yeni oturumda yalnız **"devam"** yazar. Sırayla: [DEVIR_TESLIM.md](DEVIR_TESLIM.md) → bu dosya → "Sıradaki iş"e başla.
Ayrıntı gerekince yalnız ilgili bölümü oku: [docs/EL_KITABI.md](docs/EL_KITABI.md), [PROJE_REHBERI.md](PROJE_REHBERI.md), [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (hatalar, grep).
Bu dosya her turda okunur: **600 kelimeyi geçmesin** (`tools/baglam-denetim.py` denetler). Kural eklemeden önce mevcutlarla karşılaştır.

## Değişmez kurallar
1. **Yerel = Pages.** Pages'teki her şey `kur.bat` kurulumunda birebir olmalı. `tools/esitlik.py` EŞİT demeden "bitti" deme.
2. **Kullanıcıya iş yükleme.** Tek giriş `kur.zip` (kur.bat); güncelleme ve açılışta başlatma otomatik. Teslimde yalnız kur.zip + token raporu bağlantısı.
3. **Bitti = doğrulandı.** Test + canlı kontrol + eşitlik; ajanın ya da testin "çalışıyor" sözü yetmez, canlı çıktıyı kendin oku. Donanımda denenmediyse "denenmedi" yaz. Her hata: NOT_DEFTERI'ne kök neden + önlem. Doküman kodla aynı commit'te.
4. **Token ekonomisi** (`docs/token/`). Harcamanın ~%90'ı konuşmanın her çağrıda yeniden okunması. Kısa yaz; dosyayı aralıkla oku (grep → aralık); çıktıyı kırp; bağımsız çağrıları tek turda yap; iş bitince yeni oturum öner. **Model değişimi** ya da 1 saatten uzun ara önbelleği baştan yazdırır → yeni oturum (`opusplan` yok). Effort değişimi 5.5'te önbelleği bozmaz. Yanlış yoldaysan `/rewind`.
5. **Effort ve model.** Varsayılan medium. Aynı sorun 2 denemede çözülmediyse bir üst effort öner (önbellek korunur); çözülünce medium'a dön. Sıfırdan mimari: high öner. Effort'u yalnız kullanıcı değiştirir. Rutin iş Sonnet, mimari/zor hata Opus, basit ajan işi Haiku.
6. **Takılınca:** resmi doküman → rakipler → forumlar (el kitabı §3). Yoksa tek soru: A'dan Z'ye seçenek + öneri (geçici kapat / kaldır dahil).
7. **Kalite:** best practice, tek seferde kalıcı çözüm, sade ve simetrik mimari, tek doğruluk kaynağı. Doğrulanmamışı "çalışıyor" yazma.
8. **Güncel bilgi:** tarihi saat aracından al; ürün/model/fiyatı ezberden ya da ikincil yazıdan değil resmi kaynaktan ver.
9. **Ajanlar:** bağımsız işleri `.claude/agents/` rol kartlarına paralel ver; sen mimari, entegrasyon, test, teslim. Brief: sonuç + dosyalar + "bitti" tanımı + test komutu. Ajan git çalıştırmaz, `server/manifest.json`'a dokunmaz, en çok 25 tur, rapor ≤120 kelime. Küçük işe ajan açma (~65k tokenla başlar).
10. **Kesintisiz devir:** her teslimde DEVIR_TESLIM (kısa) ve NOT_DEFTERI güncel.
11. **Çalışma biçimi (Opus 5.5):** işi tek seferde bitir; görev listesi tut, açık madde varken turu kapatma. Yalnız geri dönüşsüz iş, kamuya açık yayın ya da gerçek kullanıcı bilgisi gerekince dur; "istersen devam edeyim" deme. İstemde "adım adım düşün" yazma.
12. **Üstat ilkesi:** aynı sorunu iki kez çözme (kök neden + önlem + betik); elle tekrar eden iş otomatikleşir; karmaşıklaşan kodu yamama, yeniden yaz.

## Proje kuralları
- Türkçe arayüz ve yorumlar. Derleme adımı ve CDN yok; kütüphaneler `js/vendor/`.
- Büyük dosyalar (`js/app.js`, `css/app.css`, `js/studio/gen.js`, `js/tts.js`, `server/main.py`): önce `grep -n`.
- Yeni Studio aracı: `gen.js` `TOOLS.<ad>` + `views/<ad>.js` + `app.js` `VIEWS` + `.t-<ad>` rengi. Sayı seçeneği `type:'count'` + `generateExact`.
- Halüsinasyon: soru/kart üretiminde `EVIDENCE_RULE` + `verifyItem`; doğrulanamayan öğe gösterilmez.
- DB şeması değişirse `db.version(n+1)`; eskisini silme.
- Ses motoru: `js/tts.js` `ENGINES`, `ENGINE_SHORT`, `voicePool`, `LINE_FN`, `availableEngines`; kadın+erkek ses ya da `femaleOK:false`. Podcast sesi `kind:'mix'` + `textKey`; yalnız `fresh:true` yeniden üretir.
- Görsel: `illustrate.js` `plan`, sağlayıcı kodu yalnız `imagegen.js`; görselde yazı yok.
- Sunucu adresi yalnız `js/server.js`; kadro sunucuda `/cast`; `/health` asla yavaş işe bağlanmaz.
- Model istemi: sabit kısım (kural, kaynak) başta, değişken sonda.
- `.bat`/`.ps1` CRLF. `server/` ya da `tools/` değişince manifest teslimde yeniden üretilir; yeni paket `server/requirements.txt`'e.
- Tarayıcı, kullanıcı istemedikçe localhost'a istek atmaz.
- Word üretme. Gizli bilgi (anahtar, belirteç, ses kaydı) hiçbir dosyaya, commit'e, rapora yazılmaz.

## Test ve teslim
Adımlar `defter-teslim` becerisinde; limit/bağlam bakımı `defter-baglam-bakim`. Teslim: `bash tools/teslim.sh "açıklama"`. Süreç öldürme: `fuser -k 8098/tcp 8099/tcp` (`pkill -f` kabuğu öldürür).

## Compact instructions
Koru: DEVIR_TESLIM durumu, açık görevler, son test sayıları, değişen dosyalar, kullanıcının son isteği. At: eski araç çıktıları, okunmuş dosyalar.
