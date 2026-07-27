@echo off
setlocal

:: ==========================================
:: LEEDZ DESKTOP - MASTER BUILD
:: ==========================================
:: One command, one deployable artifact.
::
::   [1/3] client\build.bat   -> client\leedz-chrome-ext.zip
::   [2/3] server\build.bat   -> server\leedz-server-win-x64.zip (incl. .NET tray)
::   [3/3] bundle.bat         -> leedz-desktop-win-x64.zip   <-- upload this
::
:: Upload the result to s3://leedz-invoicer-bucket/dist/ ; the downloadLink
:: Lambda serves it through a presigned URL.
::
:: Windows locks running executables, so the server build fails if the server
:: or tray is running. We check up front rather than dying halfway through.

echo.
echo ==========================================
echo   LEEDZ DESKTOP - MASTER BUILD
echo ==========================================
echo.

:: ------------------------------------------
:: PRE-FLIGHT
:: ------------------------------------------
tasklist /FI "IMAGENAME eq leedz-server.exe" | find /I "leedz-server.exe" >nul
if not errorlevel 1 (
    echo [ERROR] leedz-server.exe is running - stop the server first.
    echo         No tray icon or console window? A hidden instance is running.
    echo         Kill it with:  taskkill /F /IM leedz-server.exe
    goto :ERROR
)
tasklist /FI "IMAGENAME eq TheLeedz.exe" | find /I "TheLeedz.exe" >nul
if not errorlevel 1 (
    echo [ERROR] TheLeedz.exe is running - exit the tray first.
    echo         No tray icon visible? Kill it with:  taskkill /F /IM TheLeedz.exe
    goto :ERROR
)

if not exist "client\build.bat" (
    echo [ERROR] client\build.bat not found - run this from the INVOICER root.
    goto :ERROR
)
if not exist "server\build.bat" (
    echo [ERROR] server\build.bat not found - run this from the INVOICER root.
    goto :ERROR
)
if not exist "bundle.bat" (
    echo [ERROR] bundle.bat not found - run this from the INVOICER root.
    goto :ERROR
)

:: ------------------------------------------
:: STEP 1: CHROME EXTENSION
:: ------------------------------------------
echo [1/3] Building the Chrome extension...
echo.
pushd client
call ".\build.bat" < NUL
set "STEP_RESULT=%errorlevel%"
popd
if not "%STEP_RESULT%"=="0" (
    echo.
    echo [ERROR] Client build failed - see the output above.
    goto :ERROR
)
if not exist "client\leedz-chrome-ext.zip" (
    echo [ERROR] client\leedz-chrome-ext.zip was not produced.
    goto :ERROR
)
echo.
echo     - Extension packaged
echo.

:: ------------------------------------------
:: STEP 2: SERVER + TRAY
:: ------------------------------------------
echo [2/3] Building the server and system tray...
echo.
pushd server
call ".\build.bat" < NUL
set "STEP_RESULT=%errorlevel%"
popd
if not "%STEP_RESULT%"=="0" (
    echo.
    echo [ERROR] Server build failed - see the output above.
    goto :ERROR
)
if not exist "server\leedz-server-win-x64.zip" (
    echo [ERROR] server\leedz-server-win-x64.zip was not produced.
    goto :ERROR
)
echo.
echo     - Server packaged
echo.

:: ------------------------------------------
:: STEP 3: MASTER BUNDLE
:: ------------------------------------------
echo [3/3] Composing the master download...
echo.
call ".\bundle.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Bundle step failed - see the output above.
    goto :ERROR
)
if not exist "leedz-desktop-win-x64.zip" (
    echo [ERROR] leedz-desktop-win-x64.zip was not produced.
    goto :ERROR
)

:: ------------------------------------------
:: DONE
:: ------------------------------------------
echo.
echo ==========================================
echo   MASTER BUILD SUCCESSFUL
echo ==========================================
echo.
echo   DEPLOY THIS FILE:
echo     %CD%\leedz-desktop-win-x64.zip
for %%F in ("leedz-desktop-win-x64.zip") do echo     Size: %%~zF bytes
echo.
echo   Next step - upload to S3:
echo     s3://leedz-invoicer-bucket/dist/leedz-desktop-win-x64.zip
echo.
echo   Components (kept for local use, not deployed separately):
echo     client\leedz-chrome-ext.zip
echo     server\leedz-server-win-x64.zip
echo.
echo ==========================================
goto :EOF

:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   MASTER BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
exit /b 1
