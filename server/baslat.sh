#!/usr/bin/env bash
# Defter Studio yardımcı sunucusunu Linux/macOS'ta kurar (ilk sefer) ve başlatır: http://localhost:8765
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && . .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
else
  . .venv/bin/activate
fi
python main.py
