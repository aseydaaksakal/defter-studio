#!/usr/bin/env bash
# Defter Studio yardımcı sunucusunu Linux/macOS'ta başlatır (ilk çalıştırmada kurulum yapar)
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && . .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
else
  . .venv/bin/activate
fi
export DEFTER_TTS="${DEFTER_TTS:-piper}"
python main.py
