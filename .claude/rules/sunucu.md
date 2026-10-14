---
paths:
  - "server/**"
  - "tools/**"
  - "tests/server_test.py"
---

# Sunucu ve kurulum kuralları (yalnız bu dosyalarla çalışırken yüklenir)
- `server/main.py` büyük: önce `grep -n`. `/health` asla yavaş işe bağlanmaz; kadro sunucuda `/cast`.
- `.bat`/`.ps1` CRLF. `server/` ya da `tools/` değişince manifest teslimde yeniden üretilir; yeni paket `server/requirements.txt`'e. Sürüm `server/main.py` `VERSION`.
- Güncelleme: dosyalar yazılınca çalışan kod eskiyse (`kod_eski()`) boşta yeniden başlatılır; başlatıcı (`baslat.bat`) çıkış 75'i yeniden açar.
- Sürüm farkına dayanıklı model çağrısı `adaptorler.esnek_cagir`; tohum `tohumla`. Geçici ağ hatası kısa beklemeyle yeniden denenir, kalıcı hata hemen yukarı çıkar.
- Windows'ta denenemeyeni statik testle (server_test) doğrula ve "denenmedi" yaz. PC'de sistem ayarını değiştirme (uygulamanın kendi otomatik başlatması hariç).
