@echo off
:: Starts the Gmail MCP server (token broker between the Chrome extension,
:: Gmail, and the Leedz server). Listens on the port in gmail_mcp_config.json
:: (http.port = 4001) - must match mcp.defaultPort in client/leedz_config.json.
:: Run this alongside launch_leedz.bat - nothing else starts it.

cd /d "%~dp0"
echo Starting Gmail MCP server...
node mcp_gmail.js
pause
