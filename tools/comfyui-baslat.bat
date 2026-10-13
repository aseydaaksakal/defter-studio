@echo off
setlocal
chcp 65001 >nul
REM ComfyUI'yi baslatir (yalniz bu bilgisayardan erisilir). Defter Studio sunucusu (server\baslat.bat) gorselleri buradan alir.
set "DIR=%USERPROFILE%\ComfyUI"
if not "%DEFTER_COMFY_DIR%"=="" set "DIR=%DEFTER_COMFY_DIR%"
if not exist "%DIR%\.venv\Scripts\activate.bat" ( echo Once tools\kur-comfyui.bat calistirin. & pause & exit /b 1 )
cd /d "%DIR%"
call ".venv\Scripts\activate.bat"
python main.py --listen 127.0.0.1 --port 8188
pause
