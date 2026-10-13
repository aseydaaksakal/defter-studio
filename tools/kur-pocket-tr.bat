@echo off
setlocal
chcp 65001 >nul
REM Pocket TTS Turkce (wite-tech/pocket-tts-turkish, CC-BY-4.0, ~110M parametre) kurar: 3 kadin + 3 erkek hazir ses, CPU'da gercek zamanin ~5 kati,
REM GPU'da ~20 kati. Referans kaydi gerekmez. Ana sunucu ortamina (server\.venv) kurulur; ilk konusmada model (~440 MB) indirilir.
REM NOT: pocket-tts 3.1-3.3 surumune sabitlenir. Her adim ayri denetlenir; hata olursa hangi adimda oldugu yazilir.

cd /d "%~dp0..\server"
if errorlevel 1 ( echo Klasor bulunamadi: "%~dp0..\server" & pause & exit /b 1 )
if not exist ".venv\Scripts\python.exe" (
  echo server\.venv yok. Once server\baslat.bat ile ilk kurulumu yapin ^(sunucuyu acip kapatabilirsiniz^), sonra bunu calistirin.
  pause & exit /b 1
)
set "PY=.venv\Scripts\python.exe"

set "ADIM=pocket-tts-turkish kurulumu"
echo [1/2] pocket-tts-turkish kuruluyor...
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install pocket-tts-turkish
if errorlevel 1 goto :hata

set "ADIM=model indirme ve deneme"
echo.
echo [2/2] Model indiriliyor ve deneme sesi uretiliyor ^(ilk sefer ~440 MB^)...
"%PY%" -c "from pocket_tts_turkish import TurkishTTS, save_wav; m=TurkishTTS.from_pretrained(device='cpu'); print('Sesler:', m.voices); [save_wav(f'deneme-{v}.wav', m.generate('Merhaba, ben Defter Studio. Bugun hayat kurtaran detaylara bakiyoruz.', voice=v), m.sample_rate) for v in m.voices]"
if errorlevel 1 goto :hata

echo.
echo TAMAM. 6 deneme dosyasi server klasorunde: deneme-female_1.wav ... deneme-male_3.wav
echo Simdi server\baslat.bat ile sunucuyu acin; Ayarlar ^> Seslendirme ^> Sesi dene ^(kadin + erkek^).
pause
exit /b 0

:hata
echo.
echo HATA: "%ADIM%" adiminda sorun cikti. Yukaridaki son satirlari bana yapistirin.
pause
exit /b 1
