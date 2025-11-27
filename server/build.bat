@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: LEEDZ SERVER BUILD SCRIPT
:: ==========================================
:: Creates distribution packages for Windows x64, x86, and ARM64
:: Output: server/dist-pkg/leedz-server-win-{arch}/

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

:: Architectures to build
:: x64 only - targeting traditional business users on modern Windows systems
set "ARCHITECTURES=x64"

:: ==========================================
:: STEP 1: BUILD TRAY APPLICATION
:: ==========================================
echo [1/5] Building tray application...
echo.

if not exist "%TRAY_BUILD_SCRIPT%" (
    echo [ERROR] Tray build script not found: %TRAY_BUILD_SCRIPT%
    goto :ERROR
)

:: Change to tray directory, run build, then return
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
:: STEP 2: VERIFY CANONICAL DATABASE
:: ==========================================
echo [2/5] Verifying canonical database...
echo.

if not exist "%CANONICAL_DB%" (
    echo [ERROR] Canonical database not found: %CANONICAL_DB%
    echo [ERROR] Run: node create_empty_db.js
    goto :ERROR
)

echo     - Canonical DB verified: %CANONICAL_DB%
echo.

:: ==========================================
:: STEP 3: PACKAGE WITH PKG
:: ==========================================
echo [3/5] Packaging with pkg (Node 18 + app + Prisma)...
echo.

:: Check if pkg is installed
where pkg >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pkg not found. Install with: npm install -g pkg
    goto :ERROR
)

:: Build for all architectures
echo     Building executables for: %ARCHITECTURES%
echo.

:: Build x64
echo     - Building node18-win-x64...
call pkg . --target node18-win-x64 --output "%DIST_DIR%\leedz-server-win-x64\leedz-server.exe" --no-bytecode --compress GZip
set PKG_EXIT=%errorlevel%
echo [DEBUG] pkg returned errorlevel: %PKG_EXIT%
if %PKG_EXIT% neq 0 goto :PKG_ERROR

echo [DEBUG] Checking if exe exists...
:: Verify exe was actually created
if not exist "%DIST_DIR%\leedz-server-win-x64\leedz-server.exe" (
    echo [ERROR] leedz-server.exe was not created by pkg
    goto :PKG_ERROR
)

echo [DEBUG] File exists, continuing...
echo       Success: leedz-server-win-x64.exe

echo.
echo     - All pkg builds successful
echo.

:: ==========================================
:: STEP 4: ASSEMBLE DISTRIBUTION PACKAGES
:: ==========================================
echo [4/5] Assembling distribution packages...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"

    echo     - Assembling leedz-server-win-%%A...

    :: Create directories
    if not exist "!PKG_DIR!\prisma" mkdir "!PKG_DIR!\prisma"
    if not exist "!PKG_DIR!\img" mkdir "!PKG_DIR!\img"

    :: Copy canonical database
    copy /Y "%CANONICAL_DB%" "!PKG_DIR!\prisma\leedz.sqlite" >nul
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

    :: Copy server config
    copy /Y "server_config.json" "!PKG_DIR!\server_config.json" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy server_config.json for %%A
        goto :ERROR
    )

    :: Copy tray executable and dependencies
    copy /Y "%TRAY_OUTPUT%\TheLeedz.exe" "!PKG_DIR!\TheLeedz.exe" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy TheLeedz.exe for %%A
        goto :ERROR
    )

    :: Copy tray dependencies
    copy /Y "%TRAY_OUTPUT%\TheLeedz.dll" "!PKG_DIR!\TheLeedz.dll" >nul 2>&1
    copy /Y "%TRAY_OUTPUT%\TheLeedz.runtimeconfig.json" "!PKG_DIR!\TheLeedz.runtimeconfig.json" >nul 2>&1

    :: Copy tray icons
    if exist "tray\img\icon.ico" (
        copy /Y "tray\img\icon.ico" "!PKG_DIR!\img\icon.ico" >nul
    )
    if exist "tray\img\*.png" (
        copy /Y "tray\img\*.png" "!PKG_DIR!\img\" >nul 2>&1
    )

    echo       Files copied successfully
)

echo.
echo     - All distribution packages assembled
echo.

:: ==========================================
:: STEP 5: CREATE STARTUP SCRIPTS
:: ==========================================
echo [5/6] Creating startup scripts...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"

    :: Create launch_leedz.bat
    (
        echo @echo off
        echo :: Leedz Server Launcher
        echo :: Starts TheLeedz application and backend server
        echo.
        echo echo Starting Leedz...
        echo.
        echo :: Start TheLeedz UI in background
        echo start "" "TheLeedz.exe"
        echo.
        echo :: Start backend server in current window
        echo echo Server starting on port 3000...
        echo leedz-server.exe
    ) > "!PKG_DIR!\launch_leedz.bat"

    echo     - Created launch_leedz.bat for win-%%A
)

echo.
echo     - All startup scripts created
echo.

:: ==========================================
:: STEP 6: CREATE DISTRIBUTION ZIPS
:: ==========================================
echo [6/6] Creating distribution ZIP files...
echo.

for %%A in (%ARCHITECTURES%) do (
    set "PKG_DIR=%DIST_DIR%\leedz-server-win-%%A"
    set "ZIP_NAME=leedz-server-win-%%A.zip"

    :: Delete existing ZIP if present
    if exist "!ZIP_NAME!" del "!ZIP_NAME!"

    :: Create ZIP using PowerShell
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
echo   Output Directory: %CD%\%DIST_DIR%
echo.
echo   Packages Created:
for %%A in (%ARCHITECTURES%) do (
    echo     - leedz-server-win-%%A\
    echo     - leedz-server-win-%%A.zip
)
echo.
echo   Each package contains:
echo     - TheLeedz.exe         (System tray UI - .NET 8^)
echo     - leedz-server.exe     (Backend server - Node 18 + Prisma^)
echo     - prisma/leedz.sqlite  (Canonical empty DB: 0,0,1^)
echo     - prisma/schema.prisma
echo     - server_config.json
echo     - img/icon.ico
echo     - launch_leedz.bat
echo.
echo   Distribution Files:
for %%A in (%ARCHITECTURES%) do (
    if exist "leedz-server-win-%%A.zip" (
        echo     - leedz-server-win-%%A.zip (ready for download^)
    )
)
echo.
echo   Next Steps:
echo     1. Upload ZIP files to theleedz.com
echo     2. Provide INSTALL_INSTRUCTIONS.txt to users
echo.
echo   Quick Test:
echo     cd %DIST_DIR%\leedz-server-win-x64
echo     launch_leedz.bat
echo.
echo ==========================================

goto :EOF

:: ==========================================
:: ERROR HANDLERS
:: ==========================================
:PKG_ERROR
echo [ERROR] pkg build failed
echo [ERROR] Run build.bat again without output redirection to see details
goto :ERROR

:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
pause
exit /b 1
