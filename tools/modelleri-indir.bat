@echo off
chcp 65001 >nul
REM Hugging Face TTS modellerini listeler / indirir / puanlar / siler (arayuz yerine komut satiri).
REM Ornekler:  modelleri-indir.bat liste     |  modelleri-indir.bat indir --onerilen  |  modelleri-indir.bat indir --hepsi
REM            modelleri-indir.bat puan Trendyol/Trendyol-TTS begen  |  modelleri-indir.bat sil Trendyol/Trendyol-TTS
cd /d %~dp0\..\server
if not exist .venv ( echo Once server\baslat.bat calistirin. & pause & exit /b 1 )
call .venv\Scripts\activate
if "%~1"=="" ( python modeller.py liste ) else ( python modeller.py %* )
pause
