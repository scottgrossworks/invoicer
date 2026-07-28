@echo off
setlocal

:: ==========================================
:: LEEDZ DESKTOP - MASTER BUILD
:: ==========================================
:: One command, one deployable artifact.
::
::   [1/4] client\build.bat   -> client\leedz-chrome-ext.zip
::   [2/4] server\build.bat   -> server\leedz-server-win-x64.zip (incl. .NET tray)
::   [3/4] bundle.bat         -> leedz-desktop-win-x64.zip
::   [4/4] move to dist       -> dist\leedz-desktop-win-x64.zip
::
:: USAGE
::   build_all.bat            build only - nothing leaves this machine
::   build_all.bat deploy     build, then upload to S3 (customers get it
::                            immediately - the downloadLink Lambda serves
::                            whatever is sitting at that key)
::
:: The upload is opt-in on purpose: every build would otherwise go straight
:: to live customers, so a quick test build could publish a broken zip.
::
:: Windows locks running executables, so the server build fails if the server
:: or tray is running. We check up front rather than dying halfway through.

set "DEPLOY=0"
if /I "%~1"=="deploy" set "DEPLOY=1"

set "S3_BUCKET=leedz-invoicer-bucket"
set "S3_KEY=dist/leedz-desktop-win-x64.zip"
set "AWS_REGION=us-west-2"

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

REM Deploying? Check credentials NOW, not after a four-minute build.
if "%DEPLOY%"=="1" (
    where aws >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] aws CLI not found, but 'deploy' was requested.
        goto :ERROR
    )
    aws sts get-caller-identity >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] AWS credentials are not valid - run:  aws login
        echo         Then re-run:  build_all.bat deploy
        goto :ERROR
    )
    echo     - AWS credentials OK, will upload after the build
    echo.
)

:: ------------------------------------------
:: STEP 1: CHROME EXTENSION
:: ------------------------------------------
echo [1/4] Building the Chrome extension...
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
echo [2/4] Building the server and system tray...
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
echo [3/4] Composing the master download...
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
:: STEP 4: MOVE TO dist\
:: ------------------------------------------
:: One tidy home for the deployable artifact. dist\ is gitignored, so the
:: 100+ MB zip never lands in a commit.
echo [4/4] Moving the artifact to dist\...
echo.

if not exist "dist\" (
    echo     - dist\ not found, creating it
    mkdir "dist"
    if errorlevel 1 (
        echo [ERROR] Could not create dist\
        goto :ERROR
    )
)

move /Y "leedz-desktop-win-x64.zip" "dist\leedz-desktop-win-x64.zip" >nul
if errorlevel 1 (
    echo [ERROR] Could not move the zip into dist\
    goto :ERROR
)

if not exist "dist\leedz-desktop-win-x64.zip" (
    echo [ERROR] dist\leedz-desktop-win-x64.zip is missing after the move.
    goto :ERROR
)

echo     - leedz-desktop-win-x64.zip moved to dist\
echo.

REM ------------------------------------------
REM OPTIONAL: UPLOAD TO S3   (build_all.bat deploy)
REM ------------------------------------------
REM Runs as a subroutine, not an if-block: inside a parenthesized block
REM every %VAR% is expanded at parse time, so the size comparison below
REM would compare empty strings. A subroutine parses line by line.
if "%DEPLOY%"=="1" (
    call :DEPLOY_TO_S3
    if errorlevel 1 goto :ERROR
)

:: ------------------------------------------
:: DONE
:: ------------------------------------------
echo.
echo ==========================================
echo   MASTER BUILD SUCCESSFUL
echo ==========================================
echo.
echo   ARTIFACT:
echo     %CD%\dist\leedz-desktop-win-x64.zip
for %%F in ("dist\leedz-desktop-win-x64.zip") do echo     Size: %%~zF bytes
echo.
if "%DEPLOY%"=="1" (
    echo   PUBLISHED to s3://%S3_BUCKET%/%S3_KEY%
    echo   This build is live for downloads right now.
) else (
    echo   NOT published - this build stayed on your machine.
    echo   To build and publish in one go:   build_all.bat deploy
)
echo.
echo   Components (kept for local use, not deployed separately):
echo     client\leedz-chrome-ext.zip
echo     server\leedz-server-win-x64.zip
echo.
echo ==========================================
goto :EOF

:DEPLOY_TO_S3
echo [DEPLOY] Uploading to s3://%S3_BUCKET%/%S3_KEY% ...
echo.

aws s3 cp "dist\leedz-desktop-win-x64.zip" "s3://%S3_BUCKET%/%S3_KEY%" --region %AWS_REGION% --only-show-errors
if errorlevel 1 (
    echo [ERROR] Upload failed - dist\ still holds a good zip, S3 was NOT updated.
    exit /b 1
)

REM Confirm S3 now holds exactly what we just built
set "LOCAL_SIZE="
set "REMOTE_SIZE="
for %%F in ("dist\leedz-desktop-win-x64.zip") do set "LOCAL_SIZE=%%~zF"
for /f %%S in ('aws s3api head-object --bucket %S3_BUCKET% --key %S3_KEY% --region %AWS_REGION% --query ContentLength --output text') do set "REMOTE_SIZE=%%S"

if not "%LOCAL_SIZE%"=="%REMOTE_SIZE%" (
    echo [ERROR] Size mismatch after upload - local %LOCAL_SIZE%, S3 %REMOTE_SIZE%
    exit /b 1
)

echo     - Uploaded and verified: %REMOTE_SIZE% bytes
echo     - LIVE: anyone downloading now receives this build
echo.
exit /b 0


:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   MASTER BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
exit /b 1
