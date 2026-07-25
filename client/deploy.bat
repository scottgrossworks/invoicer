@echo off
:: run this after build.bat
:: copies informed config files from ./TMP into dist/ deployment dir

set "CLIENT=C:\Users\Scott\Desktop\WKG\INVOICER\client" 


if /I "%CD%"=="%CLIENT%" (
    echo CWD OK
) else (
    echo [ERROR] Wrong directory. Expected:
    echo  %CLIENT%
    echo Got:
    echo  %CD%
    echo.
    echo FAIL.
    pause
    exit /b 1
)



echo Copying files...
echo.

set "TMPDIR=%CLIENT%\TMP"
echo TMPDIR = %TMPDIR%
echo.


copy /Y "%TMPDIR%\VALUE_PROP.md" ".\dist\DOCS\VALUE_PROP.md"
copy /Y "%TMPDIR%\leedz_config.json" ".\dist\leedz_config.json"
copy /Y "%TMPDIR%\LLM_KEY.json" ".\dist\LLM_KEY.json"


echo SUCCESS!