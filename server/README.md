### Leedz Desktop
### Leedz Server
### README

## INTRODUCTION

Leedz Desktop (Leedz Chrome Extension + Leedz Server) is a lightweight system that uses AI to manage your Clients and Bookings. The Leedz Server runs from your System Tray and securely stores all data in a local SQLite database. The Chrome Extension inputs data from the web and generates emails, calendar entries, PDF invoices, and saves everything to your database.

This README covers the **Leedz Server** — how to install it, configure it, and manage your databases.


## INSTALL THE LEEDZ SERVER

### STEP 1: DOWNLOAD AND EXTRACT
--------------------------------------------------------------------
1. Download "leedz-server-win-x64.zip" from theleedz.com
2. Right-click the ZIP file and select "Extract All..."
3. Choose a permanent location (e.g., C:\Program Files\Leedz\) — **IMPORTANT:** Do not delete this folder after installation — your database and settings live here!
4. Click "Extract"

You should see:
```
  TheLeedz.exe           (System tray application)
  leedz-server.exe       (Backend server)
  launch_leedz.bat       (Startup script)
  server_config.json     (Server settings)
  prisma/                (Database schema)
  data/                  (Your database files)
  mcp/                   (Gmail sending support)
  img/                   (Icons)
```

### STEP 2 (OPTIONAL): INSTALL NODE.JS FOR GMAIL SENDING
--------------------------------------------------------------------
Skip this if you don't need the Chrome Extension's Outreach page to send email through your Gmail account — everything else works without it.

Download and install Node.js (LTS) from [nodejs.org](https://nodejs.org), using the default install options.

### STEP 3: START THE SERVER
--------------------------------------------------------------------
1. Double-click `launch_leedz.bat` in the extracted folder
2. A small icon will appear in your Windows system tray (bottom-right)
3. A command window will open showing "Server starting on port 4000..."
4. When you see "Server listening on port 4000", the server is ready!

If Node.js is installed (Step 2), a second window titled "Gmail MCP" also opens — this powers Gmail sending from the Outreach page. If Node.js isn't installed, you'll see a warning in the console and the server still starts normally.

### STEP 4: VERIFY IT'S WORKING
--------------------------------------------------------------------
- Check the system tray for the Leedz icon
- The command window shows "Server listening on port 4000"
- Leave the command window(s) open while using Leedz — closing the main server window stops the server

### STEP 5: CONNECT YOUR CHROME EXTENSION
--------------------------------------------------------------------
Install the Leedz Chrome Extension (see the Chrome Extension README). On the Startup page, open the **Leedz Config** section and enter `localhost` / port `4000` for the server, and `localhost` / port `7000` for MCP. When connected, the Database Name will appear.


## SYSTEM TRAY

Right-click the Leedz system tray icon (bottom-right of your Windows taskbar) for these options:

- **Open Server** — Opens the server command window
- **Settings** — Configure auto-start and other preferences
- **Exit** — Stops the server

### AUTO-START ON WINDOWS BOOT (Recommended)
1. Right-click the Leedz tray icon
2. Select "Settings"
3. Check "Start TheLeedz automatically when Windows starts"
4. Click "Save"


## CONFIGURATION

### Changing the Server Port
--------------------------------------------------------------------
If port 4000 is already in use by another program, you can change it:

1. Open `server_config.json` in any text editor
2. Change the `"port"` value to any available port number:
```json
{
  "port": 4001
}
```
3. Save the file and restart the server
4. Update your Chrome Extension's Startup page to use the new port

### Server Configuration File
--------------------------------------------------------------------
`server_config.json` controls the server's behavior:

- **port** — The port number the server listens on (default: 4000)
- **database.type** — The database provider (default: "prisma_sqlite")
- **database.url** — Path to the database file (default: "file:./data/leedz.sqlite")
- **logging.level** — How much detail to log: "debug", "info", or "error"
- **logging.file** — Where to write the log file (default: "./server.log")
- **square** — Square API credentials, used by the extension's Share page to accept payment for a shared lead


## DATABASES

Your data is stored in a SQLite database file. By default, the database is at `data/leedz.sqlite` inside your Leedz folder.

### Switching Databases
--------------------------------------------------------------------
You can maintain multiple databases (e.g., one per business, or a test database):

1. Open `server_config.json`
2. Change the `"database.url"` path to point to a different `.sqlite` file:
```json
{
  "database": {
    "type": "prisma_sqlite",
    "url": "file:./data/my_other_business.sqlite"
  }
}
```
3. Save the file and restart the server
4. The Chrome Extension Startup page will show the new database name when connected

### Backing Up Your Database
--------------------------------------------------------------------
To back up your data, simply copy the `.sqlite` file from the `data/` folder to a safe location. You can restore a backup by copying it back.

### Starting Fresh
--------------------------------------------------------------------
The server ships with an empty database. To start over:
1. Stop the server
2. Delete (or rename) the current `.sqlite` file in `data/`
3. Copy the original `leedz.sqlite` from a backup or re-extract from the ZIP
4. Restart the server

### Exporting Data
--------------------------------------------------------------------
The server can export your data to JSON files for archiving or transfer:
- Clients export: `http://localhost:4000/api/dump/clients`
- Bookings export: `http://localhost:4000/api/dump/bookings`
- Config export: `http://localhost:4000/api/dump/config`

Exported files are saved to an `exports/` folder inside your Leedz directory with timestamps.


## STOPPING AND RESTARTING

**TO STOP:** Close the command window(s), or right-click the tray icon and select "Exit"

**TO RESTART:** Double-click `launch_leedz.bat` again


## GMAIL MCP (Extension Gmail Sending)

`mcp/mcp_gmail.js` is a small local server that handles the OAuth token exchange so the Chrome Extension's Outreach page can send email through your Gmail account. It requires Node.js (see Step 2 above) and is started automatically by `launch_leedz.bat` alongside the main server — you never run it directly.

### Configuration
`mcp/gmail_mcp_config.json` controls its host and port (default `127.0.0.1:7000`). If you change the port here, update the MCP Port on the Chrome Extension's Startup page to match.

### Troubleshooting
If the "Authorize Gmail" button on the Outreach page stays disabled, confirm Node.js is installed and that a "Gmail MCP" command window opened when you ran `launch_leedz.bat`.


## CLAUDE DESKTOP MCP (Optional — Database Queries)

Separately, `mcp/mcp_server.js` lets Claude Desktop query your database directly. You can ask Claude questions like "show me all bookings in January" or "find clients in Los Angeles" and it will read your data. This is unrelated to Gmail sending and entirely optional.

### Setup
1. Open Claude Desktop Settings
2. Go to MCP Servers configuration
3. Add the Leedz MCP server:
```json
{
  "mcpServers": {
    "leedz-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\server\\mcp\\mcp_server.js"]
    }
  }
}
```
4. Replace the paths with your actual Node.js and Leedz server locations
5. Restart Claude Desktop

The MCP server connects to your running Leedz Server, so make sure the server is started first.


## TROUBLESHOOTING

**PORT ALREADY IN USE:** If you see "Port 4000 is already in use", another program is using that port. Either stop that program or edit `server_config.json` to change the port.

**FIREWALL WARNING:** Windows may ask to allow network access. Click "Allow access" — the server only runs locally on your computer.

**SERVER WON'T START:** Make sure you extracted ALL files from the ZIP. Try running as Administrator (right-click `launch_leedz.bat`, select "Run as administrator").

**GMAIL AUTH BUTTON STAYS DISABLED:** See "Gmail MCP" troubleshooting above.

**EXTENSION CAN'T CONNECT:** Verify the server is running (check for the tray icon and command window). Make sure the port in the Chrome Extension's Startup page matches `server_config.json`.

**DATABASE ISSUES:** Your database is stored in `data/leedz.sqlite`. To back up your data, copy this file to a safe location.


## SYSTEM REQUIREMENTS

- Windows 10 or later (64-bit)
- .NET 8 Runtime (usually pre-installed on modern Windows)
- Node.js LTS (only required for Gmail sending — see Step 2)
- Port 4000 available (or configure a different port)
- Port 7000 available (only required for Gmail sending)
- 50 MB disk space


### QUESTIONS
theleedz.com@gmail.com
theleedz.com
