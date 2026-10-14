@echo off
REM Defter Studio sunucusunun bilgisayar acilisinda otomatik baslamasini kapatir (dosyalara dokunmaz).
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Defter Studio.lnk" 2>nul && echo Otomatik baslatma kaldirildi. || echo Otomatik baslatma zaten yok.
mkdir "%LOCALAPPDATA%\DefterStudio\server\veri" 2>nul
echo kapali> "%LOCALAPPDATA%\DefterStudio\server\veri\otobaslat-kapali"
REM Isaret: sunucu kisayolu kendiliginden yeniden kurmaz. Tekrar acmak icin kur.bat i calistirin.
taskkill /f /im wscript.exe >nul 2>&1
pause
