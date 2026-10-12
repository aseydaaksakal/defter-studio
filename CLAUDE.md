# CLAUDE.md — Defter Studio çalışma notları

Bu dosya, projede çalışan bir sonraki oturum için kısa yönergedir.

## Ne bu?
NotebookLM benzeri statik web uygulaması. GitHub Pages'te `main` dalının kökünden yayınlanır
(https://aseydaaksakal.github.io/defter-studio/). Derleme adımı yoktur; her push önizlemeyi günceller.

## Kurallar
- Arayüz dili Türkçe. Kod yorumları Türkçe.
- Kütüphaneler `js/vendor/` içinde tutulur; CDN'e bağımlılık ekleme.
- Yeni Studio aracı = `js/studio/gen.js` içinde `TOOLS.<ad>` (options + generate) + `js/studio/views/<ad>.js` (render, toText)
  + `js/app.js` içindeki `VIEWS` haritasına ekleme + `css/app.css` içinde `.t-<ad>` rengi.
- Görüntüleyici `api.save(content, not)` ile kaydeder; not verilirse önceki hâl `versions` tablosuna girer.
- Veritabanı şeması değişirse `db.version(n+1)` ekle; eski sürümü silme.
- Kullanıcı açıkça istemedikçe tarayıcı localhost'a istek atmamalı (Chrome yerel ağ izni sorar). Sunucu adresi boşsa `serverUrl()` null döner.
- Word (.docx) çıktı üretme; belge çıktıları PDF/Markdown/HTML.

## Test
```bash
python3 -m http.server 8099           # depo kökünde
```
Playwright ile tıklama testi ve sahte model sunucusu (OpenAI uyumlu SSE) kullanıldı; her üründe 9 aracın
uçtan uca üretimi, sürüm geri yükleme, silme ve mobil düzen kontrol edilir.

## Teslim
Değişiklikleri `main`'e push et; `DEGISIKLIKLER.md`'ye tarihli bir satır ekle. Pages 1-2 dakikada güncellenir.
