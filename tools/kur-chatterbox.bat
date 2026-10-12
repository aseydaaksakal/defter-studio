@echo off
chcp 65001 >nul
REM (İsteğe bağlı, ileri düzey) RTX 50xx için PyTorch CUDA 12.8 + Chatterbox Multilingual (MIT, Türkçe, ses klonlama) kurulumu.
REM chatterbox-tts paketi torch 2.6'ya sabitlenmiştir; 2.6 RTX 5090'da çalışmaz. Bu yüzden bağımlılıklar elle kurulur.
cd /d %~dp0\..\server
if not exist .venv ( echo Once server\baslat.bat calistirin. & pause & exit /b 1 )
call .venv\Scripts\activate
pip install --upgrade torch torchaudio --index-url https://download.pytorch.org/whl/cu128 || goto :hata
pip install chatterbox-tts --no-deps || goto :hata
pip install "librosa==0.11.0" s3tokenizer "transformers==5.2.0" "diffusers==0.29.0" "resemble-perth>=1.0.0" "conformer==0.3.2" "safetensors==0.5.3" pyloudnorm omegaconf pykakasi || goto :hata
pip install spacy-pkuseg 2>nul
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
echo.
echo Kuruldu. Uygulamada Ayarlar ^> Seslendirme ^> Lokal sunucu bolumunden kadin ve erkek referans sesinizi kaydedin.
pause
exit /b 0
:hata
echo Kurulum hatasi. Yukaridaki mesaji docs/NOT_DEFTERI.md ile karsilastirin.
pause
exit /b 1
