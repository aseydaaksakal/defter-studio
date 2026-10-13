@echo off
setlocal
chcp 65001 >nul
REM Ucretsiz, lokal, Turkce KADIN + ERKEK ses (anahtar ve kota yok):
REM   OmniVoice (k2-fsa, GPU): referans kayit gerekmeden kadin ve erkek ses tasarlar, sonra hep ayni sesle okur.
REM   Pocket TTS Turkce (MIT, CPU da hizli): OmniVoice in tasarladigi ya da sizin kaydettiginiz sesle konusur.
REM   VoxCPM (Trendyol-TTS / VoxCPM2): istege bagli; kurulamazsa digerleri yine calisir.
REM RTX 50xx (Blackwell) icin PyTorch CUDA 12.8 kurulur. Once server\baslat.bat bir kez calismis olmali.
REM Her adim ayri denetlenir; hata olursa hangi adimda oldugu yazilir.

cd /d "%~dp0..\server"
if errorlevel 1 ( echo Klasor bulunamadi: "%~dp0..\server" & pause & exit /b 1 )
if not exist ".venv\Scripts\activate.bat" ( echo Once server\baslat.bat calistirin. & pause & exit /b 1 )
call ".venv\Scripts\activate.bat"

echo.
echo [0/5] Python surumu:
python --version
python -c "import sys; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,13) else 1)"
if errorlevel 1 (
  echo UYARI: Python 3.10-3.13 disinda. Sorun cikarsa server\.venv klasorunu silip Python 3.12 ile server\baslat.bat i yeniden calistirin.
)

set "ADIM=pip guncelleme"
echo.
echo [1/5] pip guncelleniyor...
python -m pip install --upgrade pip
if errorlevel 1 goto :hata

set "ADIM=PyTorch CUDA 12.8"
echo.
echo [2/5] PyTorch CUDA 12.8 kuruluyor (buyuk indirme, birkac dakika)...
python -m pip install --upgrade torch torchaudio --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 goto :hata

set "ADIM=OmniVoice + Pocket TTS"
echo.
echo [3/5] OmniVoice, Pocket TTS ve huggingface_hub kuruluyor...
python -m pip install --upgrade omnivoice pocket-tts huggingface_hub
if errorlevel 1 goto :hata

REM Bagimliliklar torch u CPU surumuyle degistirmis olabilir; CUDA yoksa cu128 geri yuklenir.
python -c "import sys, torch; sys.exit(0 if torch.cuda.is_available() else 1)" 2>nul
if errorlevel 1 (
  echo CUDA gorunmuyor, PyTorch CUDA 12.8 yeniden yukleniyor...
  set "ADIM=PyTorch CUDA 12.8 geri yukleme"
  python -m pip install --force-reinstall --no-deps torch torchaudio --index-url https://download.pytorch.org/whl/cu128
  if errorlevel 1 goto :hata
)

echo.
echo [4/5] VoxCPM (istege bagli; Python 3.10-3.12 gerekir)...
python -m pip install voxcpm
if errorlevel 1 (
  echo VoxCPM kurulamadi; Trendyol-TTS ve VoxCPM2 kullanilamaz, diger sesler calisir. Devam ediliyor.
)

echo.
echo [5/5] Denetim:
python -c "import torch; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
python -c "import omnivoice; print('omnivoice: tamam')"
python -c "import pocket_tts; print('pocket_tts: tamam')"
python -c "import voxcpm; print('voxcpm: tamam')" 2>nul || echo voxcpm: yok (istege bagli)
echo.
echo Kuruldu. server\baslat.bat ile sunucuyu yeniden baslatin; ilk podcastte kadin ve erkek ses bir kez tasarlanir (model iner, birkac dakika).
pause
exit /b 0

:hata
echo.
echo KURULUM HATASI - adim: %ADIM%
echo Yukaridaki kirmizi/son hata satirlarini kopyalayip Claude a gonderin. Ayrica docs\NOT_DEFTERI.md ve docs\SES.md ye bakabilirsiniz.
pause
exit /b 1
