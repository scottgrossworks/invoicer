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
    :: /XF excludes dev files, /XD excludes dev directories
    robocopy "js" "%DIST_DIR%\js" /E /XD TMP /XF *.copy.js *.md *.txt /NFL /NDL /NJH /NJS
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

:: User-editable LLM key file - REQUIRED. Nothing (parsing, drafting) works
:: without the Anthropic API key. Hard-fail so a virgin install can't ship a
:: silently-broken extension (every LLM call would 401).
if not exist "LLM_KEY.json" (
    echo [ERROR] LLM_KEY.json not found.
    echo         Copy LLM_KEY.template.json to LLM_KEY.json and paste your Anthropic API key.
    goto :ERROR
)
copy /Y "LLM_KEY.json" "%DIST_DIR%\" >nul

:: DOCS/VALUE_PROP.md - runtime business identity source (fetched via chrome.runtime.getURL).
:: NOTE: the js robocopy above excludes *.md and never copies DOCS/, so copy it explicitly.
:: Auto-bootstrap: if the real file is missing, ship the blank template so the
:: build never silently produces a DOCS-less extension. The runtime shows a clear
:: "fill in VALUE_PROP" error until the user edits it.
if not exist "%DIST_DIR%\DOCS" mkdir "%DIST_DIR%\DOCS"
if exist "DOCS\VALUE_PROP.md" (
    copy /Y "DOCS\VALUE_PROP.md" "%DIST_DIR%\DOCS\VALUE_PROP.md" >nul
) else (
    echo [WARNING] DOCS\VALUE_PROP.md not found - shipping the blank template.
    echo           Edit dist\DOCS\VALUE_PROP.md ^(or DOCS\VALUE_PROP.md and rebuild^) with your business info.
    copy /Y "DOCS\VALUE_PROP.template.md" "%DIST_DIR%\DOCS\VALUE_PROP.md" >nul
)

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
:: -NoProfile + absolute path: the user's PowerShell profile must never affect
:: the build (a profile that errors or changes cwd made this fail spuriously).
powershell -NoProfile -command "$m = Get-Content '%CD%\%DIST_DIR%\manifest.json' -Raw | ConvertFrom-Json; if (-not $m.version -or -not $m.name) { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] manifest.json is invalid or missing required fields!
    goto :ERROR
)
echo     - Manifest validated (valid JSON with version and name).
echo     - Build directory ready at: client\%DIST_DIR%

:: 6. PACKAGING (ZIP for Distribution)
echo [6/6] Creating distribution ZIP package...
if exist "%ZIP_NAME%" del "%ZIP_NAME%"

:: SANITIZED STAGING: the ZIP is for DISTRIBUTION. The real Anthropic key
:: (LLM_KEY.json) and real business identity incl. bank info (VALUE_PROP.md)
:: must NEVER ship - stage a copy of dist with the blank templates swapped in.
:: dist\ itself keeps the real files (it is the LOCAL install).
set "STAGE=%TEMP%\leedz_zip_stage"
if exist "%STAGE%" rd /s /q "%STAGE%"
robocopy "%DIST_DIR%" "%STAGE%" /E /NFL /NDL /NJH /NJS >nul
copy /Y "LLM_KEY.template.json" "%STAGE%\LLM_KEY.json" >nul
copy /Y "DOCS\VALUE_PROP.template.md" "%STAGE%\DOCS\VALUE_PROP.md" >nul

:: Use PowerShell to zip the sanitized staging copy
:: -NoProfile + absolute paths: profile-proof (see validation note above).
powershell -NoProfile -command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%CD%\%ZIP_NAME%' -Force"
rd /s /q "%STAGE%"

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
