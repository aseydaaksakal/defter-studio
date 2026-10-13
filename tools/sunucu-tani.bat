@echo off
chcp 65001 >nul
REM "Projeye erisemiyorum" icin tani: Python, sanal ortam, 8765 portu, sunucu, Ollama ve GPU durumunu yazar. Hicbir sey degistirmez.
echo.
echo [1] Python:
where py >nul 2>nul && ( py -0p ) || ( echo   "py" baslaticisi yok. python.org adresinden Python 3.12 kurun ^(Add to PATH + py launcher^). )
echo.
echo [2] Sunucu klasoru ve sanal ortam:
if exist "%~dp0..\server\main.py" ( echo   server\main.py var ) else ( echo   server\main.py YOK: bu betik deponun tools klasorunden calistirilmali ^(git clone yaptiniz mi?^) )
if exist "%~dp0..\server\.venv\Scripts\python.exe" ( echo   server\.venv kurulu ) else ( echo   server\.venv YOK: server\baslat.bat ilk kurulumu yapar ^(birkac dakika^) )
echo.
echo [3] 8765 portu:
netstat -ano | findstr ":8765" >nul && ( echo   Bir sey 8765'i dinliyor:& netstat -ano | findstr ":8765" ) || echo   8765 bos: sunucu su an calismiyor ^(server\baslat.bat ile baslatin^)
echo.
echo [4] Sunucu cevabi ^(http://localhost:8765/health^):
curl -s -m 3 http://localhost:8765/health && ( echo. ) || echo   Cevap yok.
echo.
echo [5] Ollama ^(http://localhost:11434^):
curl -s -m 3 http://localhost:11434/api/version && ( echo. ) || echo   Cevap yok: Ollama calismiyor olabilir.
echo.
echo [6] GPU:
where nvidia-smi >nul 2>nul && ( nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader ) || echo   nvidia-smi bulunamadi ^(NVIDIA surucusu kurulu mu?^)
echo.
echo Sunucuyu baslatmak icin:  server\baslat.bat   ^(tarayici http://localhost:8765 adresinde kendiliginden acilir^)
pause
