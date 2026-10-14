# CLAUDE.md — Defter Studio giriş kartı

Kullanıcı yeni oturumda yalnız **"devam"** yazar. Sırayla: [DEVIR_TESLIM.md](DEVIR_TESLIM.md) → bu dosya → "Sıradaki iş"e başla.
Ayrıntı gerekince yalnız ilgili bölümü oku: [docs/EL_KITABI.md](docs/EL_KITABI.md) (kurallar, kaynaklar, ajanlar, token), [PROJE_REHBERI.md](PROJE_REHBERI.md) (dosya → görev), [docs/NOT_DEFTERI.md](docs/NOT_DEFTERI.md) (geçmiş hatalar, grep ile).
Bu dosya her çağrıda okunur: **600 kelimeyi geçmesin**; yeni ayrıntı el kitabına yazılır.

## Değişmez kurallar
1. **Yerel = Pages.** Pages'teki her şey `kur.bat` kurulumunda birebir olmalı. `tools/esitlik.py` EŞİT demeden "bitti" deme.
2. **Kullanıcıya iş yükleme.** Tek giriş `kur.zip` (kur.bat); güncelleme ve açılışta başlatma otomatik. Teslimde yalnız gerekli bağlantılar: kur.zip + token raporu.
3. **Bitti = doğrulandı.** Test + canlı kontrol + eşitlik. Gerçek donanımda denenmediyse "denenmedi" yaz. Düzeltilen her hata: NOT_DEFTERI'ne kök neden + önlem.
4. **Token ekonomisi** (ölçüm: `docs/token/`). Kısa ve sonuç odaklı yaz; büyük dosyayı baştan okuma (grep → aralık); çıktıları kırp; bağımsız araç çağrılarını tek turda yap; iş bitince yeni oturum öner. Model/effort değişimi ya da 1 saatten uzun ara = önbellek baştan yazılır → yeni oturum.
5. **Effort ve model.** Varsayılan medium. Aynı sorun 2 denemede çözülmediyse kullanıcıya bir üst effort'u öner; "tamam" ya da yeni iş gelince medium'a dönmeyi öner (effort'u yalnız kullanıcı değiştirebilir). Sıfırdan mimari: başta high öner. Rutin iş Sonnet, mimari/zor hata Opus, basit ajan işi Haiku.
6. **Takılınca:** resmi doküman → rakip dokümanları → forumlar (kaynak listesi: el kitabı §3). Hâlâ yoksa tek soru: A planından Z'ye seçenek + öneri (geçici kapat / kaldır dahil).
7. **Kalite:** best practice, tek seferde kalıcı çözüm, sade ve simetrik mimari, tek doğruluk kaynağı. Hızlı ama kalitesiz çözüm yok. Doğrulanmamış "kurulu/çalışıyor" yazma.
8. **Güncel bilgi:** tarihi saat aracından al; ürün/model/fiyat bilgisini ezberden değil resmi kaynaktan ver.
9. **Ajanlar:** bağımsız işleri `.claude/agents/` rol kartlarına paralel ver; sen mimari, entegrasyon, test, teslim. Ajan git çalıştırmaz, `server/manifest.json`'a dokunmaz, rapor ≤120 kelime. Küçük iş için ajan açma (her ajan ~65k tokenla başlar).
10. **Kesintisiz devir:** her teslimde DEVIR_TESLIM (kısa) ve NOT_DEFTERI güncel.

## Proje kuralları
- Türkçe arayüz ve yorumlar. Derleme adımı ve CDN yok; kütüphaneler `js/vendor/`.
- Büyük dosyalar (`js/app.js`, `css/app.css`, `js/studio/gen.js`, `js/tts.js`, `server/main.py`): önce `grep -n`.
- Yeni Studio aracı: `gen.js` `TOOLS.<ad>` + `views/<ad>.js` + `app.js` `VIEWS` + `.t-<ad>` rengi. Sayı seçeneği `type:'count'` + `generateExact`.
- Halüsinasyon: soru/kart üretiminde `EVIDENCE_RULE` + `verifyItem`; doğrulanamayan öğe gösterilmez.
- DB şeması değişirse `db.version(n+1)`; eskisini silme.
- Ses motoru: `js/tts.js` `ENGINES`, `ENGINE_SHORT`, `voicePool`, `LINE_FN`, `availableEngines`; kadın+erkek ses ya da `femaleOK:false`. Podcast sesi `kind:'mix'` + `textKey`; yalnız `fresh:true` yeniden üretir.
- Görsel: `illustrate.js` `plan`, sağlayıcı kodu yalnız `imagegen.js`; görselde yazı yok.
- Sunucu adresi yalnız `js/server.js`; kadro sunucuda `/cast`; `/health` asla yavaş işe bağlanmaz.
- `.bat`/`.ps1` CRLF. `server/` ya da `tools/` değişince manifest teslimde yeniden üretilir; yeni paket `server/requirements.txt`'e.
- Tarayıcı, kullanıcı istemedikçe localhost'a istek atmaz.
- Word üretme. Gizli bilgi (anahtar, belirteç, ses kaydı) hiçbir dosyaya, commit'e, rapora yazılmaz.

## Test ve teslim
Ayrıntı `defter-teslim` becerisinde (`.claude/skills/defter-teslim/SKILL.md`). Kısaca:
`python3 -m http.server 8099 & python3 tests/mock_llm.py & python3 tests/e2e.py` · `python3 tests/server_test.py` · `bash tools/teslim.sh "açıklama"` (test → manifest → kur.zip → token raporu → commit → push → eşitlik).
Kabuk notu: süreç öldürmek için `fuser -k 8098/tcp 8099/tcp` (`pkill -f` kabuğu öldürür).
