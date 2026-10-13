#!/usr/bin/env bash
# Defter Studio yardımcı sunucusunu Linux/macOS'ta kurar (ilk sefer) ve başlatır: http://localhost:8765
# 0.6.0: her açılışta edge-tts güncellenir (Microsoft eski sürümleri 403 ile reddediyor) ve eksik paketler tamamlanır.
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && . .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
else
  . .venv/bin/activate
  pip install -q -U edge-tts
  pip install -q -r requirements.txt
fi
python main.py
