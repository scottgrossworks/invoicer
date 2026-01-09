@echo off
REM Build and deploy tray application

echo Building tray application...
dotnet build -c Release
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

echo Creating dist directory structure...
if not exist "dist" mkdir dist
if not exist "dist\img" mkdir dist\img

echo Copying executable and runtime files...
copy /Y "bin\Release\net8.0-windows\TheLeedz.exe" "dist\" >nul
copy /Y "bin\Release\net8.0-windows\TheLeedz.dll" "dist\" >nul
copy /Y "bin\Release\net8.0-windows\TheLeedz.runtimeconfig.json" "dist\" >nul

echo Copying resources...
copy /Y "img\icon.ico" "dist\img\" >nul

echo.
echo ============================================
echo Build complete
echo ============================================
echo Executable: server\tray\dist\TheLeedz.exe
echo Icon: server\tray\dist\img\icon.ico
echo.
echo To run: server\tray\dist\TheLeedz.exe
echo ============================================
echo.
