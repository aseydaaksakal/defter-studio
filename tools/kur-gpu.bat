@echo off
setlocal
chcp 65001 >nul
REM Ucretsiz, lokal, Turkce KADIN + ERKEK ses (anahtar ve kota yok):
REM   OmniVoice (k2-fsa, GPU): referans kayit gerekmeden kadin ve erkek ses tasarlar, sonra hep ayni sesle okur.
REM   Pocket TTS Turkce (MIT, CPU da hizli): OmniVoice in tasarladigi ya da sizin kaydettiginiz sesle konusur.
REM   VoxCPM (Trendyol-TTS / VoxCPM2): istege bagli; kurulamazsa digerleri yine calisir.
REM RTX 50xx (Blackwell) icin PyTorch CUDA 12.8 (cu128).
REM
REM NEDEN BU SIRA: omnivoice / pocket-tts / voxcpm kurulurken pip torch u kendi bildigi surumle degistirip torchaudio yu eski birakabilir;
REM sonuc "c10_cuda.dll / torch_cuda.dll / libtorchaudio.pyd" hatalaridir. Bu yuzden torch ailesi once TAMAMEN kaldirilir, diger paketler kurulur,
REM torch + torchaudio EN SON, TEK pip komutuyla (ayni surum cifti) cu128 dizininden kurulur ve dogrulanir.
REM "kur-gpu.bat /otomatik" = soru ve pause yok (kur.bat bunu cagirir). Her adim ayri denetlenir; hata olursa hangi adimda oldugu yazilir.
set "OTO=0"
if /i "%~1"=="/otomatik" set "OTO=1"
set "ADIM=baslangic"

cd /d "%~dp0..\server"
if errorlevel 1 ( echo Klasor bulunamadi: "%~dp0..\server" & goto :hata )
if not exist ".venv\Scripts\python.exe" ( echo Sanal ortam yok: once tools\kur.bat ^(ya da server\baslat.bat^) calistirin. & goto :hata )
set "PY=%CD%\.venv\Scripts\python.exe"
set "DEN=%~dp0torch-denetim.py"

echo.
echo [0/6] Python surumu:
"%PY%" --version
"%PY%" -c "import sys; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,13) else 1)"
if errorlevel 1 echo UYARI: Python 3.10-3.13 disinda. Sorun cikarsa server\.venv klasorunu silip Python 3.12 ile tools\kur.bat i yeniden calistirin.

set "ADIM=sunucuyu kapatma (DLL dosyalari kilitli kalmasin)"
echo.
echo [1/6] Calisan sunucu kapatiliyor ^(varsa^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 >nul

set "ADIM=pip guncelleme"
echo.
echo [2/6] pip guncelleniyor...
"%PY%" -m pip install --upgrade pip
if errorlevel 1 goto :hata

set "ADIM=eski torch / torchaudio / torchvision kaldirma"
echo.
echo [3/6] Eski PyTorch ailesi tamamen kaldiriliyor ^(surum karisikligini onler^)...
"%PY%" -m pip uninstall -y torch torchaudio torchvision
if errorlevel 1 goto :hata

set "ADIM=OmniVoice + Pocket TTS"
echo.
echo [4/6] OmniVoice, Pocket TTS, huggingface_hub ve VoxCPM kuruluyor ^(torch u degistirebilirler; en sonda yeniden sabitlenecek^)...
"%PY%" -m pip install --upgrade omnivoice pocket-tts huggingface_hub
if errorlevel 1 goto :hata
"%PY%" -m pip install voxcpm
if errorlevel 1 echo VoxCPM kurulamadi; Trendyol-TTS ve VoxCPM2 kullanilamaz, diger sesler calisir. Devam ediliyor.

set "ADIM=PyTorch CUDA 12.8 (torch + torchaudio tek komut)"
echo.
echo [5/6] PyTorch CUDA 12.8 SON adim olarak kuruluyor ^(buyuk indirme, birkac dakika^)...
"%PY%" -m pip uninstall -y torch torchaudio torchvision
"%PY%" -m pip install "torch>=2.7" "torchaudio>=2.7" --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 goto :hata

set "ADIM=PyTorch dogrulama"
echo.
echo [6/6] Dogrulama:
"%PY%" "%DEN%"
if errorlevel 1 goto :hata
"%PY%" -c "import ctypes; ctypes.windll.kernel32.SetErrorMode(0x8003); import omnivoice; print('omnivoice: tamam')"
if errorlevel 1 echo UYARI: omnivoice import edilemedi ^(yukaridaki hatayi gonderin^); diger motorlar calisabilir.
"%PY%" -c "import ctypes; ctypes.windll.kernel32.SetErrorMode(0x8003); import pocket_tts; print('pocket_tts: tamam')"
if errorlevel 1 echo UYARI: pocket_tts import edilemedi.
"%PY%" -c "import ctypes; ctypes.windll.kernel32.SetErrorMode(0x8003); import voxcpm; print('voxcpm: tamam')" 2>nul || echo voxcpm: yok ^(istege bagli^)
echo.
echo Kuruldu. tools\kur.bat ile sunucuyu yeniden baslatin; ilk podcastte kadin ve erkek ses bir kez tasarlanir ^(model iner, birkac dakika^).
if "%OTO%"=="0" pause
exit /b 0

:hata
echo.
echo KURULUM HATASI - adim: %ADIM%
echo Yukaridaki son hata satirlarini kopyalayip Claude a gonderin. Ayrica docs\NOT_DEFTERI.md ve docs\SES.md ye bakabilirsiniz.
if "%OTO%"=="0" pause
exit /b 1
