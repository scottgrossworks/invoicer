@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: LEEDZ SERVER BUILD SCRIPT
:: ==========================================
:: Creates distribution package for Windows x64
:: Output: server/dist-pkg/leedz-server-win-x64/

echo.
echo ==========================================
echo   LEEDZ SERVER BUILD
echo ==========================================
echo.

:: Configuration
set "DIST_DIR=dist-pkg"
set "CANONICAL_DB=dist\leedz.sqlite"
set "TRAY_BUILD_SCRIPT=tray\build.bat"
set "TRAY_OUTPUT=tray\dist"
set "ARCHITECTURES=x64"

:: ==========================================
:: STEP 1: REGENERATE CANONICAL DATABASE
:: ==========================================
echo [1/6] Regenerating canonical empty database...
echo.

call node create_empty_db.js
if errorlevel 1 (
    echo [ERROR] Failed to create canonical database
    goto :ERROR
)

if not exist "%CANONICAL_DB%" (
    echo [ERROR] Canonical database not found: %CANONICAL_DB%
    goto :ERROR
)

echo     - Canonical DB created: %CANONICAL_DB%
echo.

:: ==========================================
:: STEP 2: BUILD TRAY APPLICATION
:: ==========================================
echo [2/6] Building tray application...
echo.

if not exist "%TRAY_BUILD_SCRIPT%" (
    echo [ERROR] Tray build script not found: %TRAY_BUILD_SCRIPT%
    goto :ERROR
)

pushd tray
call build.bat
set TRAY_BUILD_RESULT=%errorlevel%
popd

if %TRAY_BUILD_RESULT% neq 0 (
    echo [ERROR] Tray build failed!
    goto :ERROR
)

if not exist "%TRAY_OUTPUT%\TheLeedz.exe" (
    echo [ERROR] TheLeedz.exe not found after build!
    goto :ERROR
)

echo     - Tray build successful: %TRAY_OUTPUT%\TheLeedz.exe
echo.

:: ==========================================
:: STEP 3: CLEAN OUTPUT DIRECTORY
:: ==========================================
echo [3/6] Cleaning output directory...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"
    if exist "!PKG_DIR!" (
        echo     - Removing old build: !PKG_DIR!
        rmdir /S /Q "!PKG_DIR!"
    )
)

echo     - Output directory clean
echo.

:: ==========================================
:: STEP 4: PACKAGE WITH PKG
:: ==========================================
echo [4/6] Packaging with pkg (Node 18 + app + Prisma)...
echo.

where pkg >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pkg not found. Install with: npm install -g pkg
    goto :ERROR
)

echo     - Building node18-win-x64...
call pkg . --target node18-win-x64 --output "%DIST_DIR%\leedz-server-win-x64\leedz-server.exe" --no-bytecode --compress GZip
set PKG_EXIT=%errorlevel%
if %PKG_EXIT% neq 0 goto :PKG_ERROR

if not exist "%DIST_DIR%\leedz-server-win-x64\leedz-server.exe" (
    echo [ERROR] leedz-server.exe was not created by pkg
    goto :PKG_ERROR
)

echo       Success: leedz-server.exe
echo.

:: ==========================================
:: STEP 5: ASSEMBLE DISTRIBUTION
:: ==========================================
echo [5/6] Assembling distribution...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"

    echo     - Assembling leedz-server-win-%%A...

    :: Create directories
    if not exist "!PKG_DIR!\data" mkdir "!PKG_DIR!\data"
    if not exist "!PKG_DIR!\prisma" mkdir "!PKG_DIR!\prisma"
    if not exist "!PKG_DIR!\img" mkdir "!PKG_DIR!\img"

    :: Copy canonical database to data/ (matches server_config.json)
    copy /Y "%CANONICAL_DB%" "!PKG_DIR!\data\leedz.sqlite" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy canonical DB for %%A
        goto :ERROR
    )

    :: Copy Prisma schema
    copy /Y "prisma\schema.prisma" "!PKG_DIR!\prisma\schema.prisma" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy schema.prisma for %%A
        goto :ERROR
    )

    :: Copy server config (always overwrite for clean build)
    copy /Y "server_config.json" "!PKG_DIR!\server_config.json" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy server_config.json for %%A
        goto :ERROR
    )

    :: Copy install instructions
    copy /Y "INSTALL_INSTRUCTIONS.txt" "!PKG_DIR!\INSTALL_INSTRUCTIONS.txt" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy INSTALL_INSTRUCTIONS.txt for %%A
        goto :ERROR
    )

    :: Copy README.md from parent directory
    copy /Y "..\README.md" "!PKG_DIR!\README.md" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy README.md for %%A
        goto :ERROR
    )

    :: Copy tray executable and dependencies
    copy /Y "%TRAY_OUTPUT%\TheLeedz.exe" "!PKG_DIR!\TheLeedz.exe" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy TheLeedz.exe for %%A
        goto :ERROR
    )

    copy /Y "%TRAY_OUTPUT%\TheLeedz.dll" "!PKG_DIR!\TheLeedz.dll" >nul 2>&1
    copy /Y "%TRAY_OUTPUT%\TheLeedz.runtimeconfig.json" "!PKG_DIR!\TheLeedz.runtimeconfig.json" >nul 2>&1

    :: Copy tray icons
    if exist "tray\img\icon.ico" (
        copy /Y "tray\img\icon.ico" "!PKG_DIR!\img\icon.ico" >nul
    )
    if exist "tray\img\*.png" (
        copy /Y "tray\img\*.png" "!PKG_DIR!\img\" >nul 2>&1
    )

    :: Create launch_leedz.bat
    echo @echo off > "!PKG_DIR!\launch_leedz.bat"
    echo :: Leedz Server Launcher >> "!PKG_DIR!\launch_leedz.bat"
    echo echo Starting Leedz... >> "!PKG_DIR!\launch_leedz.bat"
    echo start "" "TheLeedz.exe" >> "!PKG_DIR!\launch_leedz.bat"
    echo echo Server starting on port 3000... >> "!PKG_DIR!\launch_leedz.bat"
    echo leedz-server.exe >> "!PKG_DIR!\launch_leedz.bat"

    echo       Files assembled successfully
)

echo.
echo     - Distribution assembled
echo.

:: ==========================================
:: STEP 6: CREATE DISTRIBUTION ZIP
:: ==========================================
echo [6/6] Creating distribution ZIP...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"
    set "ZIP_NAME=leedz-server-win-%%A.zip"

    if exist "!ZIP_NAME!" del "!ZIP_NAME!"

    powershell -command "Compress-Archive -Path '!PKG_DIR!\*' -DestinationPath '!ZIP_NAME!' -Force"

    if exist "!ZIP_NAME!" (
        echo     - Created !ZIP_NAME!
    ) else (
        echo [WARNING] Failed to create !ZIP_NAME!
    )
)

echo.

:: ==========================================
:: BUILD COMPLETE
:: ==========================================
echo.
echo ==========================================
echo   BUILD SUCCESSFUL
echo ==========================================
echo.
echo   Output: %CD%\%DIST_DIR%\leedz-server-win-x64\
echo   ZIP:    %CD%\leedz-server-win-x64.zip
echo.
echo   Contents:
echo     leedz-server.exe     (Backend server)
echo     TheLeedz.exe         (System tray UI)
echo     data\leedz.sqlite    (Empty DB: 0 clients, 0 bookings, 1 config)
echo     prisma\schema.prisma
echo     server_config.json
echo     img\icon.ico
echo     launch_leedz.bat
echo     INSTALL_INSTRUCTIONS.txt
echo     README.md
echo.
echo ==========================================

goto :EOF

:PKG_ERROR
echo [ERROR] pkg build failed
goto :ERROR

:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
pause
exit /b 1
