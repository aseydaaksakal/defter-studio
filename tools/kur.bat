@echo off
setlocal
chcp 65001 >nul
title Defter Studio - tek seferlik kurulum
REM TEK SEFERLIK KURULUM. Bir kez calistirin; sonrasi otomatik: sunucu bilgisayar acilinca kendiliginden baslar, siteyle karsilastirip
REM yalnizca degisen dosyalari gunceller. Bir daha zip indirmeniz ya da bat calistirmaniz gerekmez.
REM Konum: %LOCALAPPDATA%\DefterStudio   (silmek icin klasoru silin ve tools\otomatik-baslat-kaldir.bat calistirin)
set "SITE=https://aseydaaksakal.github.io/defter-studio"
set "HEDEF=%LOCALAPPDATA%\DefterStudio"
set "ADIM=Python arama"

echo.
echo === Defter Studio kurulumu ===
echo Konum: %HEDEF%
echo.

set "PY="
for %%V in (3.12 3.11 3.13) do if not defined PY py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
if not defined PY python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY goto :nopy

set "ADIM=klasor olusturma"
mkdir "%HEDEF%\server" 2>nul
mkdir "%HEDEF%\tools" 2>nul

set "ADIM=guncelleyiciyi indirme (internet gerekli)"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%SITE%/server/guncelle.py' -OutFile '%HEDEF%\server\guncelle.py'"
if errorlevel 1 goto :hata

set "ADIM=dosyalari indirme"
%PY% "%HEDEF%\server\guncelle.py" --sync --kabuk --nopip --root "%HEDEF%"
if errorlevel 1 goto :hata
if not exist "%HEDEF%\server\main.py" goto :hata

set "ADIM=sanal ortam ve paketler (birkac dakika surebilir)"
if not exist "%HEDEF%\server\.venv\Scripts\python.exe" %PY% -m venv "%HEDEF%\server\.venv"
if errorlevel 1 goto :hata
set "VPY=%HEDEF%\server\.venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip
"%VPY%" -m pip install -r "%HEDEF%\server\requirements.txt"
if errorlevel 1 goto :hata
"%VPY%" "%HEDEF%\server\guncelle.py" --sync --quiet --root "%HEDEF%"

echo.
choice /c EH /m "Pocket TTS Turkce kurulsun mu (3 kadin + 3 erkek hazir ses, internetsiz calisir, ~440 MB)"
if errorlevel 2 goto :pocketyok
set "ADIM=Pocket TTS Turkce"
"%VPY%" -m pip install -r "%HEDEF%\server\requirements-pocket.txt"
if errorlevel 1 goto :hata
"%VPY%" -c "from pocket_tts_turkish import TurkishTTS; TurkishTTS.from_pretrained(device='cpu'); print('Pocket TTS modeli hazir.')"
if errorlevel 1 goto :hata
:pocketyok

echo.
choice /c EH /m "Bilgisayar acilinca sunucu arka planda kendiliginden baslasin mi"
if errorlevel 2 goto :otoyok
set "ADIM=otomatik baslatma"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:APPDATA+'\Microsoft\Windows\Start Menu\Programs\Startup\Defter Studio.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments=[char]34+$env:HEDEF+'\server\gizli-baslat.vbs'+[char]34; $s.WorkingDirectory=$env:HEDEF+'\server'; $s.Save()"
if errorlevel 1 goto :hata
:otoyok

echo.
echo Sunucu baslatiliyor...
start "" wscript.exe "%HEDEF%\server\gizli-baslat.vbs"
timeout /t 6 >nul
echo.
echo TAMAM. Bundan sonra yapmaniz gereken tek sey:
echo   1) %SITE%/  adresini acin
echo   2) Ayarlar ^> Lokal yardimci sunucu kutusuna  http://localhost:8765  yazip Kontrol et deyin ^(bir kez^)
echo   3) Guncelleme gerekirse ayni yerde "Sunucuyu guncelle" dugmesi cikar; bat calistirmaniz gerekmez.
echo.
pause
exit /b 0

:nopy
echo Python 3.11 / 3.12 bulunamadi.
where winget >nul 2>&1 || goto :pyel
choice /c EH /m "Python 3.12 winget ile simdi kurulsun mu"
if errorlevel 2 goto :pyel
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
echo.
echo Python kuruldu. Bu pencereyi kapatip kur.bat dosyasini YENIDEN calistirin.
pause
exit /b 0
:pyel
echo python.org adresinden Python 3.12 kurun ^(kurulumda "Add python.exe to PATH" isaretli olsun^), sonra kur.bat dosyasini tekrar calistirin.
pause
exit /b 1

:hata
echo.
echo HATA: "%ADIM%" adiminda sorun cikti. Yukaridaki son satirlari bana yapistirin.
pause
exit /b 1
