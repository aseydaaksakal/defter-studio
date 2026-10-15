---
name: defter-teslim
description: Defter Studio'da işi bitirip teslim etme — testleri çalıştır, tools/teslim.sh ile yayınla, token raporunu güncelle, Pages eşitliğini doğrula, DEVIR_TESLIM ve NOT_DEFTERI'ni güncelle. "teslim et", "yayınla", "push", "bitir", "test et" denince ya da bir iş turu bitince kullan.
---

# Teslim

1. **Testler** (dördü de yeşil olmalı; hiçbiri sessizce atlanmaz):
   ```bash
   python3 -m http.server 8099 >/dev/null 2>&1 &  python3 tests/mock_llm.py >/dev/null 2>&1 &
   python3 tests/e2e.py /tmp/e2e  ;  server/.venv/bin/python tests/server_test.py  ;  node tests/srs_test.mjs  ;  node tests/llm_test.mjs  ;  fuser -k 8098/tcp 8099/tcp
   ```
   Çıktı yalnız ✗ satırları ve özet (token ekonomisi); her kontrolü görmek için `-v`. `server/.venv` yoksa teslim.sh `server/requirements.txt`'ten kurar.
   Yeni istem eklendiyse `tests/mock_llm.py`'ye o isteme özgü, kaynakta geçmeyen bir anahtar ifade ekle.
2. **Belgeler:** DEVIR_TESLIM.md'de "Durum" ve "Sıradaki iş"i güncelle (≤300 kelime). Düzeltilen hata varsa NOT_DEFTERI.md'ye belirti, kök neden ve önlem yaz. Biten iş için docs/TAMAMLANANLAR.md'ye bir satır ekle. Sürüm değiştiyse `server/main.py` `VERSION`.
3. **Yayın:** `TESLIM_EK=$'Co-Authored-By: ...' bash tools/teslim.sh "kısa açıklama"`. Betik sırayla: test (sunucu, FSRS, sağlayıcı, e2e; ortam eksikse ✗ ile durur) → bağlam ve istem denetimi (`tools/baglam-denetim.py`, FAIL durdurur) → manifest → kur.zip → token raporu (`docs/token/`) → gizli bilgi taraması → commit → push → Pages eşitliği (`tools/esitlik.py`).
4. **Doğrulama:** eşitlik ağ engeliyle doğrulanamadıysa Pages'teki `server/manifest.json`'u tarayıcıyla açıp yerel özetle karşılaştır. Konsolda hata yok mu bak.
5. **Kullanıcıya:** sonuç + kanıt (test sayıları) + denenemeyenler + tek net istek. Bağlantılar yalnız: kur.zip ve token raporu. Bir iş turu bittiyse yeni oturum öner (kullanıcı "devam" yazar).
