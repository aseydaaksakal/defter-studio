---
paths:
  - "js/**"
  - "css/**"
  - "index.html"
  - "sw.js"
  - "tests/e2e.py"
  - "tests/mock_llm.py"
  - "tests/srs_test.mjs"
  - "tests/llm_test.mjs"
---

# Uygulama kuralları (yalnız bu dosyalarla çalışırken yüklenir)
- Büyük dosyalar (`js/app.js`, `css/app.css`, `js/studio/gen.js`, `js/tts.js`): önce `grep -n`, sonra aralık oku.
- Yeni Studio aracı: `gen.js` `TOOLS.<ad>` + `views/<ad>.js` + `app.js` `VIEWS` + `.t-<ad>` rengi. Sayı seçeneği `type:'count'` + `generateExact`.
- Halüsinasyon: soru/kart üretiminde `EVIDENCE_RULE` + `verifyItem`; doğrulanamayan öğe gösterilmez.
- Aralıklı tekrar yalnız `js/srs.js` (FSRS-6): kart, hata defteri, banka; testi `node tests/srs_test.mjs` (py-fsrs altın değerleri).
- DB şeması değişirse `db.version(n+1)`; eskisini silme.
- Ses motoru: `js/tts.js` `ENGINES`, `ENGINE_SHORT`, `voicePool`, `LINE_FN`, `availableEngines`; kadın+erkek ses ya da `femaleOK:false`. Podcast sesi `kind:'mix'` + `textKey`; yalnız `fresh:true` yeniden üretir.
- Görsel: `illustrate.js` `plan`, sağlayıcı kodu yalnız `imagegen.js`; görselde yazı yok.
- Sunucu adresi yalnız `js/server.js`. Tarayıcı, kullanıcı istemedikçe localhost'a istek atmaz.
- Model istemi: sabit kısım (kural, kaynak) başta, değişken sonda; sağlayıcı ayrıntısı (Claude 5'te temperature yok, effort, önbellek) yalnız `js/llm.js`; biçim testi `node tests/llm_test.mjs`. Yeni istem: `tests/mock_llm.py`'ye isteme özgü anahtar ifade. Yazarken `defter-istem` becerisi.
