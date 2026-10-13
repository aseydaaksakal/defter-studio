@echo off
chcp 65001 >nul
REM Defter Studio: yardimci sunucuyu kurar (ilk sefer) ve baslatir; uygulama http://localhost:8765 adresinde acilir.
REM Bu adresten acinca Ollama icin OLLAMA_ORIGINS ayari gerekmez.
REM 0.6.0: Her acilista edge-tts guncellenir (Microsoft eski surumleri 403 ile reddediyor) ve eksik paketler tamamlanir.
cd /d %~dp0
if not exist .venv (
  echo Ilk kurulum yapiliyor, birkac dakika surebilir...
  py -3.12 -m venv .venv 2>nul || py -3.11 -m venv .venv 2>nul || python -m venv .venv
  call .venv\Scripts\activate
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
  echo Paketler denetleniyor ^(edge-tts guncelleniyor^)...
  pip install -q -U edge-tts
  pip install -q -r requirements.txt
)
python main.py
pause
