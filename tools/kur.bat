@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Defter Studio - kurulum / guncelleme
REM TEK BAT: ilk kurulum da guncelleme de bu dosyayi calistirmakla olur. Her calismada:
REM   1) Python bul  2) eski sunucuyu kapat (8765)  3) server + tools + UYGULAMA dosyalarini %LOCALAPPDATA%\DefterStudio ya esitle
REM   4) sanal ortam / paketler (yalniz requirements.txt degistiyse)  5) NVIDIA varsa PyTorch saglik denetimi (bozuksa otomatik onarim)
REM   6) sunucuyu baslat  7) /health bekle  8) yerel ile GitHub Pages esitligini dogrula  9) http://localhost:8765/ ac (Pages i DEGIL)
REM Sorular (Pocket TTS, otomatik baslatma, GPU) YALNIZ ilk kurulumda sorulur; sonraki calismalarda soru yoktur.
REM Sunucu, dosyalarini ezmeden once KAPATILIR: calisan baslat.bat uzerine yazilirsa cmd bozuk satirlar calistirabilir.
REM Konum: %LOCALAPPDATA%\DefterStudio   (silmek icin klasoru silin ve tools\otomatik-baslat-kaldir.bat calistirin)
set "SITE=https://aseydaaksakal.github.io/defter-studio"
REM KENDINI GUNCELLEME: indirdiginiz kur.bat eski kalmis olabilir. Once Pages teki guncel kur.bat alinir; farkliysa o calistirilir.
if /i "%~1"=="--guncel" goto :basla
set "YENI=%TEMP%\defter-kur-yeni.bat"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{Invoke-WebRequest -UseBasicParsing -Uri ('%SITE%/tools/kur.bat?t='+(Get-Date).Ticks) -OutFile '%YENI%' -TimeoutSec 20; exit 0}catch{exit 1}"
if errorlevel 1 goto :basla
if not exist "%YENI%" goto :basla
fc /b "%~f0" "%YENI%" >nul 2>&1
if not errorlevel 1 goto :basla
echo kur.bat yeni surum bulundu; guncel surumle devam ediliyor...
call "%YENI%" --guncel
exit /b %errorlevel%
:basla
set "HEDEF=%LOCALAPPDATA%\DefterStudio"
set "PORT=8765"
set "YEREL=http://localhost:%PORT%/"
set "VPY=%HEDEF%\server\.venv\Scripts\python.exe"
set "ADIM=baslangic"
set "ILK=0"
if not exist "%VPY%" set "ILK=1"

echo.
echo === Defter Studio kurulum / guncelleme ===
echo Konum: %HEDEF%
if "%ILK%"=="1" ( echo Durum: ILK KURULUM ) else ( echo Durum: GUNCELLEME ^(soru sorulmaz^) )
echo.

set "ADIM=1/9 Python arama"
set "PY="
for %%V in (3.12 3.11 3.13) do if not defined PY py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
if not defined PY python -c "import sys" >nul 2>&1 && set "PY=python"
if not defined PY if exist "%VPY%" set PY="%VPY%"
if not defined PY goto :nopy
echo [1/9] Python: %PY%

set "ADIM=2/9 eski sunucuyu kapatma (port %PORT%)"
echo [2/9] %PORT% numarali portu tutan eski sunucu kapatiliyor...
call :portkapat
if errorlevel 1 goto :hata

set "ADIM=3/9 klasor olusturma"
mkdir "%HEDEF%\server" 2>nul
mkdir "%HEDEF%\tools" 2>nul

set "ADIM=3/9 guncelleyiciyi indirme (internet gerekli)"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing '%SITE%/server/guncelle.py' -OutFile '%HEDEF%\server\guncelle.py'"
if errorlevel 1 goto :hata

set "ADIM=3/9 dosyalari esitleme (server, tools, uygulama)"
echo [3/9] Dosyalar GitHub Pages ile esitleniyor ^(sunucu + araclar + uygulama^)...
%PY% "%HEDEF%\server\guncelle.py" --sync --kabuk --nopip --root "%HEDEF%"
if errorlevel 1 goto :hata
if not exist "%HEDEF%\server\main.py" goto :hata
if not exist "%HEDEF%\index.html" goto :hata

set "ADIM=4/9 sanal ortam ve paketler (ilk kurulumda birkac dakika surebilir)"
if not exist "%VPY%" %PY% -m venv "%HEDEF%\server\.venv"
if errorlevel 1 goto :hata
set "STAMP=%HEDEF%\server\.venv\req.stamp"
set "REQH="
for /f %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 '%HEDEF%\server\requirements.txt').Hash"') do set "REQH=%%H"
set "ESKI=-"
if exist "%STAMP%" set /p ESKI=<"%STAMP%"
if /i "%ESKI%"=="%REQH%" (
  echo [4/9] Paketler guncel ^(requirements.txt degismedi^).
) else (
  echo [4/9] Paketler kuruluyor...
  "%VPY%" -m pip install --upgrade pip
  "%VPY%" -m pip install -r "%HEDEF%\server\requirements.txt"
  if errorlevel 1 goto :hata
  >"%STAMP%" echo %REQH%
)
"%VPY%" "%HEDEF%\server\guncelle.py" --sync --quiet --root "%HEDEF%"

if "%ILK%"=="1" goto :ilksorular
:ilkdevam

set "ADIM=5/9 PyTorch saglik denetimi"
where nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo [5/9] NVIDIA ekran karti yok: GPU adimi atlandi.
  goto :gpubitti
)
if not exist "%HEDEF%\tools\torch-denetim.py" (
  echo [5/9] torch-denetim.py henuz yayinlanmamis: GPU denetimi atlandi.
  goto :gpubitti
)
"%VPY%" "%HEDEF%\tools\torch-denetim.py"
set "TD=%errorlevel%"
if "%TD%"=="0" (
  echo [5/9] PyTorch + CUDA saglam.
  goto :gpubitti
)
if "%TD%"=="3" if "%ILK%"=="0" (
  echo [5/9] PyTorch kurulu degil ^(GPU sesleri istemediniz^): atlandi. Isterseniz tools\kur-gpu.bat calistirin.
  goto :gpubitti
)
if "%ILK%"=="1" (
  choice /c EH /m "NVIDIA GPU bulundu. GPU sesleri ^(OmniVoice, VoxCPM^) icin PyTorch CUDA kurulsun mu ^(buyuk indirme^)"
  if errorlevel 2 goto :gpubitti
) else (
  echo [5/9] PyTorch/CUDA bozuk ^(kod %TD%^): otomatik onarim baslatiliyor...
)
set "ADIM=5/9 GPU onarimi (tools\kur-gpu.bat)"
call "%HEDEF%\tools\kur-gpu.bat" /otomatik
if errorlevel 1 (
  echo.
  echo UYARI: GPU kurulumu tamamlanamadi; sunucu yine de baslatilacak ^(CPU sesleri calisir^). Yukaridaki hatayi gonderin.
)
:gpubitti

set "ADIM=6/9 sunucuyu baslatma"
echo [6/9] Sunucu baslatiliyor...
set "DEFTER_SKIP_SYNC=1"
start "" wscript.exe "%HEDEF%\server\gizli-baslat.vbs"
set "DEFTER_SKIP_SYNC="

set "ADIM=7/9 sunucunun acilmasini bekleme (/health)"
echo [7/9] Sunucunun acilmasi bekleniyor ^(en cok 300 sn^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%HEDEF%\tools\bekle.ps1" -Url "http://127.0.0.1:%PORT%/health" -Log "%HEDEF%\server\sunucu.log" -Sn 300
if errorlevel 1 (
  echo.
  echo Sunucu 300 sn icinde acilmadi. Hata ayrintisi:
  pushd "%HEDEF%\server"
  if exist "%HEDEF%\server\sunucu.log" powershell -NoProfile -Command "Get-Content -Tail 25 '%HEDEF%\server\sunucu.log'"
  "%VPY%" -c "import ctypes; ctypes.windll.kernel32.SetErrorMode(0x8003); import main"
  popd
  goto :hata
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=Invoke-RestMethod '%YEREL%health'; $m=Get-Content -Raw '%HEDEF%\server\manifest.json' | ConvertFrom-Json; Write-Host ('Calisan sunucu surumu: '+$h.version+'  |  dosya surumu: '+$m.version); if($h.version -ne $m.version){exit 1}"
if errorlevel 1 echo UYARI: calisan sunucu surumu dosyalardakinden farkli; eski bir surec 8765 u tutuyor olabilir. Bilgisayari yeniden baslatip bu bat i tekrar calistirin.

set "ADIM=8/9 Pages esitligini dogrulama"
echo [8/9] Yerel kopya GitHub Pages ile karsilastiriliyor...
"%VPY%" "%HEDEF%\server\guncelle.py" --dogrula --root "%HEDEF%"
set "EQ=%errorlevel%"
if "%EQ%"=="0" echo SONUC: localhost:%PORT% ile Pages AYNI.
if "%EQ%"=="1" echo SONUC: FARK VAR ^(yukaridaki liste^). Pages yeni yayinlanmis olabilir: 2 dakika sonra bu bat i tekrar calistirin.
if "%EQ%"=="2" echo SONUC: Pages'e ulasilamadi, esitlik dogrulanamadi ^(internet?^). Yerel uygulama yine de calisir.

REM Eski zip/depo kopyasi uyarisi (silinmez)
for /d %%D in ("%USERPROFILE%\Downloads\defter-studio*") do (
  echo.
  echo UYARI: "%%D" eski bir kopya. Bu klasoru artik kullanmayin; uygulama %HEDEF% konumundan %YEREL% adresinde calisir. ^(Silinmedi; isterseniz kendiniz silin.^)
)

echo.
REM Windows acilisinda otomatik baslatma: HER calismada kurulur (soru yok). Kapatmak icin tools\otomatik-baslat-kaldir.bat;
REM kur.bat yeniden calistirilirsa tekrar acilir. Sunucu da her acilista kisayolu denetler (main.py oto_baslat_kur).
del "%HEDEF%\server\veri\otobaslat-kapali" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:APPDATA+'\Microsoft\Windows\Start Menu\Programs\Startup\Defter Studio.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments=[char]34+$env:HEDEF+'\server\gizli-baslat.vbs'+[char]34; $s.WorkingDirectory=$env:HEDEF+'\server'; $s.Save()"
if errorlevel 1 ( echo UYARI: otomatik baslatma kisayolu olusturulamadi. ) else ( echo Otomatik baslatma: acik ^(bilgisayar acilinca sunucu kendiliginden baslar^). )

echo [9/9] Tarayicida %YEREL% aciliyor ^(Chrome yerel ag izni sorarsa "Izin ver" deyin^)...
start "" "%YEREL%"
echo.
echo TAMAM. Bu bat i istediginiz zaman tekrar calistirabilirsiniz: eski sunucuyu kapatir, her seyi siteyle esitler, yeniden acar.
echo.
pause
exit /b 0

:ilksorular
echo.
choice /c EH /m "Pocket TTS Turkce kurulsun mu (3 kadin + 3 erkek hazir ses, internetsiz calisir, ~440 MB)"
if errorlevel 2 goto :pocketyok
set "ADIM=Pocket TTS Turkce"
"%VPY%" -m pip install -r "%HEDEF%\server\requirements-pocket.txt"
if errorlevel 1 goto :hata
"%VPY%" -c "from pocket_tts_turkish import TurkishTTS; TurkishTTS.from_pretrained(device='cpu'); print('Pocket TTS modeli hazir.')"
if errorlevel 1 goto :hata
:pocketyok
goto :ilkdevam

:portkapat
REM Port bos olana dek (en cok ~12 sn) dinleyen surecleri kapatir. Bos degilse 1 doner.
set "DENEME=0"
:portdon
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 >nul
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if errorlevel 1 exit /b 0
set /a DENEME+=1
if %DENEME% GEQ 6 (
  echo %PORT% hala dolu: surec kapatilamadi ^(yonetici izni gerekebilir^).
  exit /b 1
)
goto :portdon

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
