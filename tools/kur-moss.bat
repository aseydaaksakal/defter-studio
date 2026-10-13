@echo off
setlocal
chcp 65001 >nul
REM MOSS-TTS Local Transformer v1.5 (Apache-2.0, yaklasik 4B, Turkce dahil 31 dil, ses klonlama, 48 kHz) icin AYRI sanal ortam kurar:
REM   server\.venv-moss   (ana ortamdaki OmniVoice / Pocket TTS / VoxCPM ile cakismasin diye ayri)
REM MOSS PyTorch 2.9.1 + transformers 5.0.0 + numpy 2.1.0 sabitler. RTX 50xx (Blackwell) icin CUDA 12.8 PyTorch kurulur.
REM Gereken: Python 3.10-3.12 ("py -3.12" onerilir). Her adim ayri denetlenir; hata olursa hangi adimda oldugu yazilir.
REM Model indirme (yaklasik 10 GB + ses kodlayici):  tools\modelleri-indir.bat indir OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5

cd /d "%~dp0..\server"
if errorlevel 1 ( echo Klasor bulunamadi: "%~dp0..\server" & pause & exit /b 1 )

set "ADIM=sanal ortam olusturma"
if not exist ".venv-moss\Scripts\python.exe" (
  echo [1/4] Sanal ortam olusturuluyor: server\.venv-moss
  py -3.12 -m venv .venv-moss 2>nul || py -3.11 -m venv .venv-moss 2>nul || py -3.10 -m venv .venv-moss 2>nul
)
if not exist ".venv-moss\Scripts\python.exe" (
  echo Python 3.10, 3.11 ya da 3.12 bulunamadi. python.org adresinden Python 3.12 kurun ^(Add to PATH + py launcher secili^) ve yeniden calistirin.
  pause & exit /b 1
)
set "PY=.venv-moss\Scripts\python.exe"
"%PY%" --version

set "ADIM=pip guncelleme"
echo.
echo [2/4] pip guncelleniyor...
"%PY%" -m pip install --upgrade pip
if errorlevel 1 goto :hata

set "ADIM=PyTorch 2.9.1 CUDA 12.8"
echo.
echo [3/4] PyTorch 2.9.1 CUDA 12.8 kuruluyor ^(buyuk indirme, birkac dakika^)...
"%PY%" -m pip install torch==2.9.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 goto :hata

set "ADIM=transformers 5.0.0 ve bagimliliklar"
echo.
echo [4/4] transformers 5.0.0 ve bagimliliklar kuruluyor...
"%PY%" -m pip install transformers==5.0.0 safetensors==0.6.2 numpy==2.1.0 einops==0.8.1 scipy librosa tiktoken orjson tqdm PyYAML accelerate soundfile huggingface_hub
if errorlevel 1 goto :hata

echo.
echo Denetim:
"%PY%" -c "import torch, transformers; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '', '| transformers', transformers.__version__)"
if errorlevel 1 ( set "ADIM=denetim" & goto :hata )
"%PY%" -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)"
if errorlevel 1 echo UYARI: CUDA gorunmuyor; MOSS CPU'da cok yavas calisir. NVIDIA surucusunu guncelleyin.

echo.
echo Kuruldu. Sirada:
echo   1^) tools\modelleri-indir.bat indir OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5
echo   2^) server\baslat.bat ile sunucuyu yeniden baslatin; Ayarlar ^> Seslendirme ^> Lokal modeller bolumunden "MOSS-TTS Local v1.5" secin.
echo   MOSS ses klonlamayla konusur: Ayarlar ^> Lokal sunucu bolumunden bir kadin ve bir erkek ses ekleyin ya da tasarlayin.
echo   Hepsini ayni cumlelerle dinleyip karsilastirmak icin: tools\ses-karsilastir.bat
pause
exit /b 0

:hata
echo.
echo KURULUM HATASI - adim: %ADIM%
echo Yukaridaki son hata satirlarini kopyalayip Claude a gonderin. Ayrica docs\NOT_DEFTERI.md ve docs\SES.md ye bakabilirsiniz.
pause
exit /b 1
