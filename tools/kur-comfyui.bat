@echo off
setlocal
chcp 65001 >nul
REM Lokal yapay zeka gorselleri icin ComfyUI + FLUX.1-schnell (fp8, Apache-2.0) kurulumu. RTX 50xx icin PyTorch CUDA 12.8.
REM Kurulum klasoru: %USERPROFILE%\ComfyUI (DEFTER_COMFY_DIR ortam degiskeniyle degistirilebilir). Model dosyasi yaklasik 17 GB.
REM Gereken: Git ve Python 3.10-3.13. Kurulumdan sonra tools\comfyui-baslat.bat ile ComfyUI'yi, server\baslat.bat ile sunucuyu calistirin.
REM Her adim ayri denetlenir; hata olursa hangi adimda oldugu yazilir.

set "DIR=%USERPROFILE%\ComfyUI"
if not "%DEFTER_COMFY_DIR%"=="" set "DIR=%DEFTER_COMFY_DIR%"

set "ADIM=Git denetimi"
where git >nul 2>nul
if errorlevel 1 ( echo Git bulunamadi: https://git-scm.com/download/win adresinden kurun. & goto :hata )

set "ADIM=ComfyUI indirme"
if exist "%DIR%\main.py" (
  echo [1/5] ComfyUI zaten var: %DIR%
) else (
  echo [1/5] ComfyUI indiriliyor: %DIR%
  git clone https://github.com/comfyanonymous/ComfyUI "%DIR%"
  if errorlevel 1 goto :hata
)

set "ADIM=Python sanal ortami"
if not exist "%DIR%\.venv\Scripts\activate.bat" (
  echo [2/5] Python sanal ortami olusturuluyor...
  py -3.12 -m venv "%DIR%\.venv" 2>nul
  if errorlevel 1 py -3.11 -m venv "%DIR%\.venv" 2>nul
  if errorlevel 1 python -m venv "%DIR%\.venv"
  if errorlevel 1 goto :hata
) else (
  echo [2/5] Sanal ortam hazir.
)
call "%DIR%\.venv\Scripts\activate.bat"
python --version

set "ADIM=PyTorch CUDA 12.8"
echo [3/5] PyTorch CUDA 12.8 kuruluyor (buyuk indirme, birkac dakika)...
python -m pip install --upgrade pip
python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 goto :hata

set "ADIM=ComfyUI bagimliliklari"
echo [4/5] ComfyUI bagimliliklari kuruluyor...
python -m pip install -r "%DIR%\requirements.txt"
if errorlevel 1 goto :hata
python -m pip install huggingface_hub
if errorlevel 1 goto :hata

set "ADIM=FLUX.1-schnell indirme"
if exist "%DIR%\models\checkpoints\flux1-schnell-fp8.safetensors" (
  echo [5/5] FLUX.1-schnell zaten indirilmis.
) else (
  echo [5/5] FLUX.1-schnell fp8 indiriliyor, yaklasik 17 GB. Kesilirse ayni komutu yeniden calistirin; kaldigi yerden devam eder.
  python -c "from huggingface_hub import hf_hub_download; import sys; p = hf_hub_download('Comfy-Org/flux1-schnell', 'flux1-schnell-fp8.safetensors', local_dir=sys.argv[1]); print('Indirildi:', p)" "%DIR%\models\checkpoints"
  if errorlevel 1 goto :hata
)

python -c "import torch; print('torch', torch.__version__, '| CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo.
echo Kuruldu. Simdi: 1) tools\comfyui-baslat.bat   2) server\baslat.bat   3) Uygulamada Ayarlar ^> Gorseller ^> Deneme gorseli uret.
pause
exit /b 0

:hata
echo.
echo KURULUM HATASI - adim: %ADIM%
echo Yukaridaki son hata satirlarini kopyalayip Claude a gonderin. Ayrica docs\GORSEL.md ye bakabilirsiniz.
pause
exit /b 1
