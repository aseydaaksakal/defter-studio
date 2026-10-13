#!/usr/bin/env bash
# Defter Studio yardımcı sunucusunu Linux/macOS'ta kurar (ilk sefer) ve başlatır: http://localhost:8765
# 0.7.0: kendini günceller (yalnız değişen dosyalar indirilir; paketler yalnız requirements.txt değişirse kurulur). Arayüzdeki "Sunucuyu güncelle" yeniden başlatmayı bu döngüyle yapar.
cd "$(dirname "$0")"
export DEFTER_LAUNCHER=1
if [ ! -d .venv ]; then
  python3 -m venv .venv && . .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
else
  . .venv/bin/activate
fi
while true; do
  python guncelle.py --sync --quiet
  python main.py >> sunucu.log 2>&1; kod=$?
  [ "$kod" = 75 ] || exit "$kod"
done
