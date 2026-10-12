@echo off
REM Defter Studio yardımcı sunucusunu Windows'ta başlatır (ilk çalıştırmada kurulum yapar)
cd /d %~dp0
if not exist .venv (
  py -3.11 -m venv .venv || python -m venv .venv
  call .venv\Scripts\activate
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
if "%DEFTER_TTS%"=="" set DEFTER_TTS=piper
python main.py
pause
