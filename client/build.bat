@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: LEEDZ CLIENT BUILD SCRIPT
:: ==========================================
:: Context: /DEV/INVOICER/client/
:: output:  /dist/

set "DIST_DIR=dist"
set "ZIP_NAME=leedz-chrome-ext.zip"

echo.
echo ==========================================
echo   STARTING BUILD PROCESS
echo ==========================================

:: 1. CLEANUP
echo [1/6] Cleaning previous build...
if exist "%DIST_DIR%" (
    rd /s /q "%DIST_DIR%"
)
mkdir "%DIST_DIR%"

:: 2. COPY DIRECTORIES (CSS, LIB, ICONS)
echo [2/6] Copying static assets...

:: Copy CSS
if exist "css" (
    mkdir "%DIST_DIR%\css"
    robocopy "css" "%DIST_DIR%\css" /E /NFL /NDL /NJH /NJS
)

:: Copy LIB
if exist "lib" (
    mkdir "%DIST_DIR%\lib"
    robocopy "lib" "%DIST_DIR%\lib" /E /NFL /NDL /NJH /NJS
)

:: Copy ICONS (Your file list shows 'icons', prompt mentioned 'img')
if exist "icons" (
    mkdir "%DIST_DIR%\icons"
    robocopy "icons" "%DIST_DIR%\icons" /E /NFL /NDL /NJH /NJS
)
:: Safety check if 'img' exists as well (based on prompt requirements)
if exist "img" (
    mkdir "%DIST_DIR%\img"
    robocopy "img" "%DIST_DIR%\img" /E /NFL /NDL /NJH /NJS
)

:: 3. COPY JAVASCRIPT (WITH EXCLUSIONS)
echo [3/6] Copying JavaScript (excluding dev files)...
if exist "js" (
    mkdir "%DIST_DIR%\js"
    :: /XF excludes specific files
    robocopy "js" "%DIST_DIR%\js" /E /XF *.copy.js NOTES.md /NFL /NDL /NJH /NJS
)

:: 4. COPY ROOT FILES
echo [4/6] Copying manifest and configuration...

:: Manifest
copy /Y "manifest.json" "%DIST_DIR%\" >nul

:: HTML Files (sidebar.html, pdf_settings.html, etc)
:: We exclude the 'html' FOLDER (marketing assets) by only copying .html files from ROOT
if exist "*.html" copy /Y "*.html" "%DIST_DIR%\" >nul

:: JSON Configs (Both required - referenced in manifest.json web_accessible_resources)
if exist "leedz_config.json" copy /Y "leedz_config.json" "%DIST_DIR%\" >nul
if exist "invoicer_config.json" copy /Y "invoicer_config.json" "%DIST_DIR%\" >nul

:: Docs
if exist "LICENSE" copy /Y "LICENSE" "%DIST_DIR%\" >nul

:: Install Instructions
if exist "INSTALL_INSTRUCTIONS.txt" copy /Y "INSTALL_INSTRUCTIONS.txt" "%DIST_DIR%\" >nul

:: README.md from parent directory
if exist "..\README.md" copy /Y "..\README.md" "%DIST_DIR%\" >nul

:: 5. MANIFEST VALIDATION (JSON Syntax + Version Check)
echo [5/6] Validating build...
if not exist "%DIST_DIR%\manifest.json" (
    echo [ERROR] manifest.json missing from build!
    goto :ERROR
)

:: Validate manifest.json is valid JSON and has required fields
powershell -command "$m = Get-Content '%DIST_DIR%\manifest.json' -Raw | ConvertFrom-Json; if (-not $m.version -or -not $m.name) { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] manifest.json is invalid or missing required fields!
    goto :ERROR
)
echo     - Manifest validated (valid JSON with version and name).
echo     - Build directory ready at: client\%DIST_DIR%

:: 6. PACKAGING (ZIP for Distribution)
echo [6/6] Creating distribution ZIP package...
if exist "%ZIP_NAME%" del "%ZIP_NAME%"

:: Use PowerShell to zip the contents of DIST (not including the dist folder itself)
powershell -command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_NAME%' -Force"

if exist "%ZIP_NAME%" (
    echo     - Distribution ZIP created: %ZIP_NAME%
) else (
    echo [ERROR] ZIP creation failed. PowerShell might be restricted.
    goto :ERROR
)

echo.
echo ==========================================
echo   BUILD SUCCESSFUL
echo ==========================================
echo   Unpacked Extension: %CD%\%DIST_DIR%
echo   Distribution ZIP:   %CD%\%ZIP_NAME%
echo.
echo   NEXT STEPS:
echo   1. Share %ZIP_NAME% with users
echo   2. INSTALL_INSTRUCTIONS.txt included in ZIP
echo   3. ZIP installs as unpacked extension
echo ==========================================

goto :EOF

:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
pause
exit /b 1
