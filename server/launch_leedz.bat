@echo off
REM Launch Leedz Tray application (robust paths)

REM %~dp0 is the folder containing this .bat (ends with a backslash)
set "SCRIPT_DIR=%~dp0"
REM tray exe live in server\tray\bin\Release\net8.0-windows relative to server folder
set "EXE_DIR=%SCRIPT_DIR%tray\bin\Release\net8.0-windows"

REM Full absolute paths for icon and config (based on server folder)
set "ICON_FULL=%SCRIPT_DIR%tray\img\icon.ico"
set "CONFIG_FULL=%SCRIPT_DIR%server_config.json"

REM Go to exe folder and run
pushd "%EXE_DIR%" || (
  echo Failed to find exe folder: %EXE_DIR%
  pause
  exit /b 1
)

TheLeedz.exe ^
  --icon-path="%ICON_FULL%" ^
  --config-path="%CONFIG_FULL%"

popd