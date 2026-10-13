@echo off
chcp 65001 >nul
REM Defter Studio: yardımcı sunucuyu kurar (ilk sefer) ve başlatır; uygulama http://localhost:8765 adresinde açılır.
REM Bu adresten açınca Ollama için OLLAMA_ORIGINS ayarı gerekmez.
cd /d %~dp0
if not exist .venv (
  echo Ilk kurulum yapiliyor, birkac dakika surebilir...
  py -3.12 -m venv .venv 2>nul || py -3.11 -m venv .venv 2>nul || python -m venv .venv
  call .venv\Scripts\activate
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
python main.py
pause
