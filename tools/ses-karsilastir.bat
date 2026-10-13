@echo off
chcp 65001 >nul
REM Kurulu TTS motorlarini ve indirilmis modelleri AYNI Turkce cumlelerle kadin + erkek seslendirir; ses-ornekleri\<tarih>\index.html
REM sayfasinda yan yana dinlersiniz (sure, gercek zaman carpani ve GPU bellegi de yazar). Hicbir sey kendiliginden indirilmez.
REM Ornekler:  ses-karsilastir.bat            hepsi
REM            ses-karsilastir.bat --hizli    yalniz 2 cumle
REM            ses-karsilastir.bat --model OpenMOSS-Team/MOSS-TTS-Local-Transformer-v1.5 --motor edge
cd /d %~dp0\..\server
if not exist .venv ( echo Once server\baslat.bat calistirin. & pause & exit /b 1 )
call .venv\Scripts\activate
python karsilastir.py %*
pause
