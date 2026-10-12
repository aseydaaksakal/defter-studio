@echo off
chcp 65001 >nul
REM Tamamen ücretsiz, lokal, Türkçe KADIN + ERKEK ses (anahtar ve kota yok):
REM   OmniVoice (k2-fsa, GPU) — referans kayıt gerekmeden kadın ve erkek ses tasarlar, sonra hep aynı sesle okur.
REM   Pocket TTS Türkçe (MIT, CPU'da da hızlı) — OmniVoice'un tasarladığı ya da sizin kaydettiğiniz sesle konuşur.
REM RTX 50xx (Blackwell) için PyTorch CUDA 12.8 kurulur. Önce server\baslat.bat bir kez çalışmış olmalı.
cd /d %~dp0\..\server
if not exist .venv ( echo Once server\baslat.bat calistirin. & pause & exit /b 1 )
call .venv\Scripts\activate
pip install --upgrade torch torchaudio --index-url https://download.pytorch.org/whl/cu128 || goto :hata
pip install omnivoice pocket-tts || goto :hata
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo.
echo Kuruldu. server\baslat.bat ile sunucuyu yeniden baslatin; ilk podcastte kadin ve erkek ses bir kez tasarlanir (model iner, birkac dakika).
pause
exit /b 0
:hata
echo Kurulum hatasi. docs/NOT_DEFTERI.md ve docs/SES.md'ye bakin.
pause
exit /b 1
