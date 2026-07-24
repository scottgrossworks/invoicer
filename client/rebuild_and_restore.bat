@echo off
:: ==========================================
:: REBUILD + RESTORE INFORMED CONFIG
:: ==========================================
:: build.bat produces a BLANK dist\ (safe to commit/share - see build.bat's
:: virgin-install guards). This script rebuilds, then copies your REAL,
:: gitignored config back in from TMP\, then re-zips so the ZIP matches too.

echo ==========================================
echo   REBUILD + RESTORE
echo ==========================================
echo.

echo [1/3] Running build.bat...
call ".\build.bat"
if errorlevel 1 (
    echo [ERROR] build.bat failed - stopping.
    pause
    exit /b 1
)

echo.
echo [2/3] Restoring informed config from TMP...

if not exist "TMP\VALUE_PROP.md" (
    echo [ERROR] TMP\VALUE_PROP.md not found - nothing to restore.
    pause
    exit /b 1
)

copy /Y "TMP\VALUE_PROP.md" "dist\DOCS\VALUE_PROP.md" >nul
copy /Y "TMP\leedz_config.json" "dist\" >nul
copy /Y "TMP\LLM_KEY.json" "dist\" >nul
echo     - Restored VALUE_PROP.md, leedz_config.json, LLM_KEY.json

echo.
echo [3/3] Re-zipping dist with restored files...
if exist "leedz-chrome-ext.zip" del "leedz-chrome-ext.zip"
powershell -NoProfile -command "Compress-Archive -Path '%CD%\dist\*' -DestinationPath '%CD%\leedz-chrome-ext.zip' -Force"

echo.
echo ==========================================
echo   DONE
echo ==========================================
echo   dist\ and leedz-chrome-ext.zip now hold your real config.
echo ==========================================
pause
