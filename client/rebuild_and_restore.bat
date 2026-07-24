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

echo [1/2] Running build.bat...
call ".\build.bat"
if errorlevel 1 (
    echo [ERROR] build.bat failed - stopping.
    pause
    exit /b 1
)

echo.
echo [2/2] Restoring informed config from TMP...

if not exist "TMP\VALUE_PROP.md" (
    echo [ERROR] TMP\VALUE_PROP.md not found - nothing to restore.
    pause
    exit /b 1
)

copy /Y "TMP\VALUE_PROP.md" "dist\DOCS\VALUE_PROP.md" >nul
copy /Y "TMP\leedz_config.json" "dist\" >nul
copy /Y "TMP\LLM_KEY.json" "dist\" >nul
echo     - Restored VALUE_PROP.md, leedz_config.json, LLM_KEY.json

:: NO re-zip here: build.bat already produced the DISTRIBUTION zip from a
:: sanitized staging copy (blank templates - never the real key/bank info).
:: Only dist\ (the LOCAL install) gets the real files above.

echo.
echo ==========================================
echo   DONE
echo ==========================================
echo   dist\ holds your real config. ZIP stays sanitized for distribution.
echo ==========================================
pause
