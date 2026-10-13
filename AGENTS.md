# AGENTS.md — Defter Studio için yapay zeka ajanı kuralları

Bu depo Codex, Gemini CLI, Cursor, Copilot ya da başka bir Claude oturumu tarafından devralınabilir. Kurallar
[CLAUDE.md](CLAUDE.md) ile aynıdır; burada ajandan bağımsız özet var.

Kullanıcı yeni oturumda yalnız "devam" yazar: DEVIR_TESLIM.md ve CLAUDE.md'deki **Değişmez kullanıcı kuralları**nı (yerel=Pages, tek bat, token ekonomisi, bitti=doğrulandı, ajanlara dağıt) uygula.

## 1. Önce oku (yalnız gerekeni)
| Sıra | Dosya | Ne için |
|---|---|---|
| 1 | `DEVIR_TESLIM.md` | Durum, son değişiklikler, sıradaki iş, başlangıç istemi |
| 2 | `PROJE_REHBERI.md` | Dosya → görev eşlemesi; yalnız ilgili bölüm |
| 3 | `docs/NOT_DEFTERI.md` | Daha önce görülen hatalar ve çözümleri |
| 4 | `docs/MIMARI.md` | Katmanlar, veri modeli, üretim ve ses hattı |

## 2. Çalıştır ve doğrula
```bash
python3 -m http.server 8099 &   # uygulama (derleme yok)
python3 tests/mock_llm.py &     # sahte model + sahte sunucu
python3 tests/e2e.py            # tümü geçmeden push etme
```

## 3. Değişmez kurallar
- Arayüz ve yorumlar Türkçe.
- Derleme adımı, framework ve CDN bağımlılığı ekleme. Kütüphaneler `js/vendor/`'da.
- IndexedDB şemasını değiştirirken yeni `db.version(n+1)` ekle, eskisini silme.
- Studio aracı = `gen.js` `TOOLS` + `views/<ad>.js` + `app.js` `VIEWS` + `.t-<ad>` rengi.
- Sayı isteyen her üretim tam sayıyı tutturmalı (`generateExact`); soru/kart üretimi kaynaktan alıntıyla doğrulanmalı (`verify.js`).
- Ses motorları kadın ve erkek ses sağlamalı; sağlayamıyorsa `femaleOK` false dönmeli ve kullanıcıya çözüm gösterilmeli.
- Kullanıcı istemedikçe tarayıcıdan localhost'a istek atma.
- Word (.docx) çıktı üretme; PDF/Markdown/HTML kullan.
- Gizli bilgileri (API anahtarı, belirteç, ses kaydı) asla depoya yazma. `server/voices/` git dışında.

## 4. Oturum/limit yönetimi
Her özellik bitince kendini durdur:
1. `DEVIR_TESLIM.md`'yi güncelle.
2. `docs/NOT_DEFTERI.md`'ye kayıt ekle.
3. Commit + push yap.
4. Kullanıcıya yeni oturum için hazır istemi ver.

Uzun dosyaları bölüm bölüm oku: önce `grep -n`, sonra satır aralığı.

## 5. Teslim
`bash tools/teslim.sh "açıklama"` testleri, değişiklik günlüğünü, LINKLER.md'yi, commit'i ve push'u tek seferde yapar.
Push'tan sonra canlı sitede tarayıcı konsolunda hata olmadığını kontrol et.
