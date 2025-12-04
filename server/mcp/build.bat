@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: LEEDZ MCP BUILD SCRIPT
:: ==========================================
:: Creates distribution package for MCP servers
:: Output: server/mcp/dist/

set "DIST_DIR=dist"
set "ZIP_NAME=leedz-mcp.zip"

echo.
echo ==========================================
echo   LEEDZ MCP BUILD
echo ==========================================
echo.

:: ==========================================
:: STEP 1: CLEANUP
:: ==========================================
echo [1/4] Cleaning previous build...
if exist "%DIST_DIR%" (
    rd /s /q "%DIST_DIR%"
)
mkdir "%DIST_DIR%"
echo     - Clean build directory created
echo.

:: ==========================================
:: STEP 2: COPY MCP SERVER FILES
:: ==========================================
echo [2/4] Copying MCP server files...

:: Copy main MCP server
copy /Y "mcp_server.js" "%DIST_DIR%\mcp_server.js" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy mcp_server.js
    goto :ERROR
)
echo     - mcp_server.js copied

:: Copy Gmail MCP server
copy /Y "mcp_gmail.js" "%DIST_DIR%\mcp_gmail.js" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy mcp_gmail.js
    goto :ERROR
)
echo     - mcp_gmail.js copied

:: Copy MCP server config
copy /Y "mcp_server_config.json" "%DIST_DIR%\mcp_server_config.json" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy mcp_server_config.json
    goto :ERROR
)
echo     - mcp_server_config.json copied

:: Copy Gmail MCP config
copy /Y "gmail_mcp_config.json" "%DIST_DIR%\gmail_mcp_config.json" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy gmail_mcp_config.json
    goto :ERROR
)
echo     - gmail_mcp_config.json copied

echo.

:: ==========================================
:: STEP 3: COPY DOCUMENTATION
:: ==========================================
echo [3/4] Copying documentation...

:: Copy install instructions
copy /Y "INSTALL_INSTRUCTIONS.txt" "%DIST_DIR%\INSTALL_INSTRUCTIONS.txt" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy INSTALL_INSTRUCTIONS.txt
    goto :ERROR
)
echo     - INSTALL_INSTRUCTIONS.txt copied

:: Copy README.md from root directory
copy /Y "..\..\README.md" "%DIST_DIR%\README.md" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy README.md
    goto :ERROR
)
echo     - README.md copied

echo.

:: ==========================================
:: STEP 4: CREATE DISTRIBUTION ZIP
:: ==========================================
echo [4/4] Creating distribution ZIP...

:: Delete existing ZIP if present
if exist "%ZIP_NAME%" del "%ZIP_NAME%"

:: Create ZIP using PowerShell
powershell -command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_NAME%' -Force"

if exist "%ZIP_NAME%" (
    echo     - %ZIP_NAME% created successfully
) else (
    echo [ERROR] Failed to create %ZIP_NAME%
    goto :ERROR
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
echo   Distribution ZIP: %CD%\%ZIP_NAME%
echo.
echo   Package Contents:
echo     - mcp_server.js
echo     - mcp_gmail.js
echo     - mcp_server_config.json
echo     - gmail_mcp_config.json
echo     - INSTALL_INSTRUCTIONS.txt
echo     - README.md
echo.
echo   Next Steps:
echo     1. Upload %ZIP_NAME% to theleedz.com
echo     2. Users extract and configure with Claude Desktop/LM Studio
echo     3. See INSTALL_INSTRUCTIONS.txt for setup guide
echo.
echo ==========================================

goto :EOF

:: ==========================================
:: ERROR HANDLER
:: ==========================================
:ERROR
echo.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   BUILD FAILED
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
pause
exit /b 1
