@echo off
chcp 65001 >nul
REM Defter Studio yardimci sunucusu. 0.7.0: kendini gunceller. Her acilista siteyle karsilastirir, YALNIZ degisen dosyalari indirir;
REM paketler yalniz requirements.txt degistiyse kurulur. Arayuzdeki "Sunucuyu guncelle" dugmesi sunucuyu kapatip bu dongu ile yeniden acar.
REM "baslat.bat sessiz" = tarayici acmaz, pencere kapaninca beklemez (otomatik baslatma icin).
cd /d %~dp0
set DEFTER_LAUNCHER=1
if /i "%~1"=="sessiz" set DEFTER_OPEN=0
if not exist .venv (
  echo Ilk kurulum yapiliyor, birkac dakika surebilir...
  py -3.12 -m venv .venv 2>nul || py -3.11 -m venv .venv 2>nul || python -m venv .venv
  call .venv\Scripts\activate
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
:dongu
python guncelle.py --sync --quiet
python main.py
if errorlevel 75 goto dongu
if /i not "%~1"=="sessiz" pause
