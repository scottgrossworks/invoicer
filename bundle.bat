@echo off
setlocal

:: ==========================================
:: LEEDZ DESKTOP BUNDLE
:: ==========================================
:: Composes the single customer download from the two product zips:
::   client\leedz-chrome-ext.zip     (built by client\build.bat)
::   server\leedz-server-win-x64.zip (built by server\build.bat)
:: Output: leedz-desktop-win-x64.zip
::   chrome-extension\  the unpacked extension (Load unpacked in Chrome)
::   server\            TheLeedz.exe + everything else
::   START_HERE.txt
:: Upload the output to S3 (leedz-invoicer-bucket/dist/) for the
:: downloadLink Lambda to serve.

set "STAGE=%TEMP%\leedz_desktop_bundle"
set "OUT=leedz-desktop-win-x64.zip"

echo.
echo ==========================================
echo   LEEDZ DESKTOP BUNDLE
echo ==========================================
echo.

if not exist "client\leedz-chrome-ext.zip" (
    echo [ERROR] client\leedz-chrome-ext.zip not found - run client\build.bat first
    goto :ERROR
)
if not exist "server\leedz-server-win-x64.zip" (
    echo [ERROR] server\leedz-server-win-x64.zip not found - run server\build.bat first
    goto :ERROR
)

echo [1/3] Staging both products...
if exist "%STAGE%" rd /s /q "%STAGE%"
mkdir "%STAGE%\chrome-extension"
mkdir "%STAGE%\server"

powershell -NoProfile -command "Expand-Archive -Path '%CD%\client\leedz-chrome-ext.zip' -DestinationPath '%STAGE%\chrome-extension' -Force"
if errorlevel 1 (
    echo [ERROR] Failed to expand extension zip
    goto :ERROR
)
powershell -NoProfile -command "Expand-Archive -Path '%CD%\server\leedz-server-win-x64.zip' -DestinationPath '%STAGE%\server' -Force"
if errorlevel 1 (
    echo [ERROR] Failed to expand server zip
    goto :ERROR
)

echo [2/3] Writing START_HERE.txt...
(
echo ====================================================
echo LEEDZ DESKTOP - START HERE
echo ====================================================
echo.
echo STEP 1: Open the server folder and double-click
echo         TheLeedz.exe  ^(the green grass icon^)
echo         A Leedz icon appears in your system tray.
echo.
echo STEP 2: In Chrome, go to  chrome://extensions
echo         Turn ON "Developer mode" ^(top-right^)
echo         Click "Load unpacked" and select the
echo         chrome-extension folder from this zip.
echo.
echo STEP 3: Click the Leedz icon in your Chrome toolbar,
echo         enter your LLM API key on the Startup page,
echo         and Save.
echo.
echo Full instructions:
echo   server\INSTALL_INSTRUCTIONS.txt   ^(server + tray^)
echo   chrome-extension\INSTALL_INSTRUCTIONS.txt
echo   server\MCP_INSTRUCTIONS.txt       ^(connect Claude/AI^)
echo.
echo Questions?  theleedz.com@gmail.com
echo ====================================================
) > "%STAGE%\START_HERE.txt"

echo [3/3] Creating %OUT%...
if exist "%OUT%" del "%OUT%"
powershell -NoProfile -command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%CD%\%OUT%' -Force"
rd /s /q "%STAGE%"

if not exist "%OUT%" (
    echo [ERROR] Failed to create %OUT%
    goto :ERROR
)

echo.
echo ==========================================
echo   BUNDLE SUCCESSFUL
echo ==========================================
echo   Output: %CD%\%OUT%
echo   Upload to: s3://leedz-invoicer-bucket/dist/%OUT%
echo ==========================================
goto :EOF

:ERROR
echo.
echo   BUNDLE FAILED
echo.
exit /b 1
