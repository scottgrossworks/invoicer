@echo off
:: Leedz Server Launcher
echo Starting Leedz...
start "" "TheLeedz.exe"

:: %~dp0 is THIS script's own folder (wherever the customer extracted the ZIP).
:: --standalone makes the Gmail MCP exit if it loses the port bind and auto-exit
:: when the Leedz server goes down (watchdog) - no zombie node processes.
:: NOTE: no :: comments inside the if-block below - cmd cannot parse them there.
where node >nul 2>nul
if errorlevel 1 (
  echo [WARNING] Node.js not found - Gmail MCP will not start, Outreach Gmail auth will be unavailable.
) else if exist "%~dp0mcp\mcp_gmail.js" (
  start "Gmail MCP" cmd /c node "%~dp0mcp\mcp_gmail.js" --standalone
)

echo Server starting on port 4000...
leedz-server.exe
