# Leedz Desktop

A lightweight Windows app that uses AI to manage your Clients and Bookings.
Free, open source, and private — your business data never leaves your machine.

Leedz Desktop is three pieces that ship together in one download:

| Component | What it does |
|---|---|
| **Chrome Extension** | Reads a Gmail thread and uses any LLM API key to generate invoices, schedule bookings to Google Calendar, draft outreach, and share leads to the Leedz marketplace |
| **Leedz Server** | Keeps your Clients and Bookings in a local SQLite database you control from the Windows system tray |
| **MCP plugin** | Turns Claude Desktop, Claude Code, or any MCP-compatible AI into a personal assistant and business analyst over your own data |

The extension never touches the database directly — it calls the server's REST
API on `localhost:4000`. The server is the single owner of the database, so
validation and business rules live in one place.

```
Chrome Extension ──HTTP──> Leedz Server ──Prisma──> SQLite
   (sidebar)               (:4000, tray)            (data/leedz.sqlite)
        │                       ▲
        │  Gmail send           │  HTTP
        └──> Gmail MCP (:7000)  └── Leedz MCP plugin <── Claude / Codex / LM Studio
```

---

## FOR USERS

Download the zip from [theleedz.com](https://theleedz.com/leedz_download.html),
extract it somewhere permanent (e.g. `C:\Program Files\Leedz`), then:

1. **Start the server** — open `server\` and double-click **TheLeedz.exe** (the
   green grass icon). A Leedz icon appears in your system tray; the server and
   Gmail support start hidden in the background. Right-click the tray icon for
   Start / Stop / Configure.
2. **Load the extension** — in Chrome go to `chrome://extensions`, turn on
   **Developer mode**, click **Load unpacked**, and select the
   `chrome-extension\` folder.
3. **Connect them** — click the Leedz icon in Chrome, enter your LLM API key on
   the **Startup** page, and Save. The Database Name appears once the extension
   finds your server.
4. *(optional)* **Connect your AI** — see `server\MCP_INSTRUCTIONS.txt` to let
   Claude query your database in plain English.

Full instructions ship inside the zip:

- `START_HERE.txt` — the 3-step version of the above
- `server\INSTALL_INSTRUCTIONS.txt` — server, tray, ports, databases, backups
- `server\MCP_INSTRUCTIONS.txt` — connect Claude Desktop / Claude Code / LM Studio
- `chrome-extension\INSTALL_INSTRUCTIONS.txt` — extension install and troubleshooting

**Requirements:** Windows 10+ (64-bit), an LLM subscription key (Claude, ChatGPT,
OpenRouter, …), Chrome, and Node.js 18+ *only* if you want Gmail sending or the
MCP plugin. Gmail recommended.

---

## THE FOUR PAGES

The extension sidebar has four pages, switched from the hamburger menu:

- **Startup** — connect to your server, set your LLM key, authorize Gmail.
  Business identity (name, rates, service area) is parsed at runtime from
  `DOCS/VALUE_PROP.md`; edit that file rather than the UI.
- **Booker** — page through the Clients parsed from the current page with the
  carousel; exactly one Client owns the Booking (the attach checkbox). Save
  writes all Clients plus the one Booking, and Calendar/PDF act on the owner.
- **Share** — post a Booking you don't want to the Leedz marketplace, or
  privately to friends; optionally price it and collect through Square.
- **Outreach** — type a hint, press **Write** to have the LLM draft the email
  from your Client/Booking facts, edit it, then **Email** to open it in Gmail.

---

## FOR DEVELOPERS

### Repository layout

```
client/           Chrome extension (vanilla ES6 modules, no build step)
  js/pages/       Startup, Booker, Share, Outreach (all extend Page/DataPage)
  js/db/          REST client for the Leedz Server
  DOCS/           VALUE_PROP.md - runtime business identity
server/           Node/Express + Prisma over SQLite
  src/            leedz_server.js and the DB layer
  tray/           TheLeedz.exe - .NET 8 system tray app (C#)
  mcp/            mcp_gmail.js (Gmail OAuth) + mcp_server.js (Leedz MCP plugin)
  prisma/         schema + migrations
```

### Architecture notes

**DataPage universal workflow.** Booker, Share, and Outreach all extend
`DataPage`, which runs the same sequence on every page: clear UI → load cached
state → preliminary identity parse → search the database by email → render and
**stop** if the Client is already known → otherwise run the full LLM parse.
Skipping the LLM on a database hit is what keeps repeat visits instant; Refresh
forces a re-parse.

**One booking, one owner.** `state.Clients[]` holds every Client parsed from a
page and `state.bookingOwnerIndex` marks which one owns the Booking. The
`state.Client` getter/setter transparently reads and writes
`Clients[bookingOwnerIndex]`, so every existing caller (PDF, Calendar, Save)
follows the checkbox with no extra code.

**The server owns the database.** Nothing else opens the SQLite file. The MCP
plugin deliberately goes over HTTP to the running server rather than importing
Prisma, so business rules are never duplicated and two processes never contend
for the same file.

**MCP plugins are dependency-free.** Both `mcp_gmail.js` and `mcp_server.js` use
built-in `fetch` (Node 18+) and ship as single files — a customer install has no
`node_modules`. `mcp_server.js` exposes 16 direct, self-describing tools so the
calling LLM picks the tool and arguments itself; there is no second LLM call.

### Building

```batch
build_all.bat
```

Builds the extension, builds the server (including the .NET tray), composes the
single customer download, and leaves it at **`dist/leedz-desktop-win-x64.zip`** —
that one file is what gets uploaded to S3. Stop the server and tray first;
Windows locks running executables, and the build checks for this up front.

See `BUILD_RULES.md` for the per-component detail, or run `bundle.bat` alone if
you only need to re-compose the zip from existing component builds.

**Secrets never ship.** The local install folders (`client/dist/`,
`server/dist-pkg/`) keep your real config so you can run the app, but every zip
step stages a sanitized copy first: `server_config.json`, `LLM_KEY.json`,
`VALUE_PROP.md`, and `mcp_server_config.json` are each swapped for their
`.template` version inside the archive.

---

## QUESTIONS

theleedz.com@gmail.com · [theleedz.com](https://theleedz.com)
