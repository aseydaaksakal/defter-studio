@echo off
chcp 65001 >nul
REM Defter Studio: Ollamanin bu siteye baglanmasina izin verir, Ollamayi yeniden baslatir ve modeli indirir.
set ORIGINS=https://aseydaaksakal.github.io,http://localhost:*,http://127.0.0.1:*
echo [1/4] OLLAMA_ORIGINS ayarlaniyor...
setx OLLAMA_ORIGINS "%ORIGINS%" >nul
setx OLLAMA_FLASH_ATTENTION 1 >nul
setx OLLAMA_KV_CACHE_TYPE q8_0 >nul
set OLLAMA_ORIGINS=%ORIGINS%
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0
echo [2/4] Ollama kapatiliyor...
taskkill /IM "ollama app.exe" /F >nul 2>&1
taskkill /IM ollama.exe /F >nul 2>&1
timeout /t 2 >nul
echo [3/4] Ollama yeniden baslatiliyor...
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe") else (start "" ollama serve)
timeout /t 6 >nul
echo [4/4] Model indiriliyor (ilk seferde ~18 GB)...
ollama pull qwen3.8:27b
echo.
echo Tamam! Tarayicida Defter Studio sayfasini yenileyin.
pause
