
### Leedz Desktop 
### Leedz Chrome Browser Extension
### README 

## INTRODUCTION

Leedz Desktop (Leedz Chrome Extension + Leedz Server) is a lightweight system that uses AI to manage your Clients and Bookings. The Leedz Chrome Extension inputs data from the web and generates emails, calendar entries, and PDF invoices, and saves everything to your database. Leedz Server manages that database from your System Tray.


## INSTALL THE CHROME EXTENSION

### STEP 1: DOWNLOAD AND EXTRACT
--------------------------------------------------------------------
1. Download the Leedz Chrome Extension file: "leedz-chrome-ext.zip"
2. Right-click the ZIP file and select "Extract All..."
3. Choose a permanent location (e.g., C:\Program Files\Leedz/) – **IMPORTANT:** Do not delete this folder after installation - it's crucial for functionality!
4. Click "Extract"

### STEP 2: OPEN CHROME EXTENSIONS PAGE
--------------------------------------------------------------------
1. Open Google Chrome browser
2. In the address bar, type: `chrome://extensions`
3. Press Enter

### STEP 3: ENABLE DEVELOPER MODE
--------------------------------------------------------------------
Look for a toggle switch labeled "Developer mode" in the top-right corner. Click it to turn it ON (it should turn blue).

### STEP 4: LOAD THE EXTENSION
--------------------------------------------------------------------
1. Click the "Load unpacked" button (appears after Developer mode).
2. Browse to the folder you extracted in Step 1
3. Select the folder and click "Select Folder"
4. The Leedz extension will appear in your extension list.

### STEP 5: START USING LEEDZ
--------------------------------------------------------------------
Look for the white/green Leedz grass icon in your Chrome toolbar (top-right). Click it to open the sidebar on your next website.

### TROUBLESHOOTING
--------------------------------------------------------------------
(1) SECURITY WARNING: Chrome will show a warning that this extension is
not from the Chrome Web Store. This is normal for business software
that hasn't been published publicly. The extension is safe to use.

(2) You may need to Ctl-R reload the page once the sidebar is installed for it to open

(3) EXTENSION DISABLED: If Chrome disables the extension after an update,
simply return to chrome://extensions and re-enable it.

(4) SUPPORT: theleedz.com@gmail.com


## PAGES

The sidebar has four pages, switched from the hamburger menu (top-left):

1. **Startup** — Connect to your Leedz Server, set your LLM provider key, and authorize Gmail sending. See STARTUP below.
2. **Booker** — Save the Client(s) and the Booking parsed from the current page, add the Booking to your Calendar, and generate a PDF invoice.
3. **Share** — Share a Booking you don't want with the Leedz marketplace or with friends.
4. **Outreach** — Draft and send first-contact, response, or thank-you emails with your LLM.


## STARTUP

The Startup page is where you configure everything before using Leedz. It opens by default and has these sections:

- **Business Identity** — read-only, parsed automatically from `DOCS/VALUE_PROP.md` in your install folder. Edit that file (not the UI) to change your name, rates, and service area.
- **Leedz Config** (collapsed by default) — connects the extension to your Leedz Server and its Gmail MCP:
  - Server Host / Server Port — your Leedz Server (default `localhost` / `4000`). Once connected, Database Name appears here.
  - MCP Host / MCP Port — the Gmail MCP started by the Leedz Server (default `localhost` / `7000`), only needed for Gmail sending.
- **LLM Settings** — your LLM provider's API key, model, base URL, and other request settings. Can be a cloud provider like `https://api.anthropic.com` or a model running locally (e.g., LM Studio).
- **Authorize Gmail** — one-click Gmail sending authorization, valid for one hour. Requires the Leedz Server's Gmail MCP to be running (see the Leedz Server README).

Click **Save** at the bottom to persist your changes, or **Clear** to reset the form.


## BOOKER

Booker parses the Client(s) and Booking from the current page (an email thread, calendar event, or web page). If more than one client is found, page through them with the **◀ Client N of M ▶** carousel.

Exactly one client owns the Booking — check **"Booking attached to this client"** under the client you're viewing to assign it. Viewing a non-owner client shows the Booking table greyed out and read-only; switch back to the owner to edit it.

Buttons: **Calendar** (add to Google Calendar), **Save** (write all clients + the one Booking to your database), **PDF** (render an invoice).


## SHARE

When you get an email request for a Booking you *don't* want to work, Share it in a few clicks with the Leedz marketplace. Choose the correct trade (braiding, caricatures, dj...) and the LLM parser will fill in the rest. If you want to share privately with your group of friends, just click their names. The Client will send each their own email with the Booking and Client info. Optionally attach a price to request payment via Square before releasing full details.


## OUTREACH

Outreach drafts emails for first contact, responses, or thank-yous, all from one page. Type a hint in the **Draft** box (e.g., "thank her for the referral") describing what you want, press **Write**, and the LLM fills the box with a full draft using your Client/Booking facts and Business Identity. Edit the draft directly if needed, then press **Email** to open it in Gmail compose. **Clear** wipes just the Draft box, not the parsed Client/Booking data.


## LLM Prompting

Provide your LLM with actual email examples and the Leedz will follow your template for future drafts. Example outreach and response emails are configured in `leedz_config.json` under `outreachEmail` and `responderEmail`.


## CONFIGURATION

Primary Config role: `leedz_config.json`
* UI page definitions (Startup, Booker, Share, Outreach)
* LLM provider settings (API key, model, endpoints)
* Database connection (baseUrl, provider)
* MCP server settings (host, port)
* Parser configurations with system prompts
* Render settings (PDF output directory)

Most of the above is set through the Startup page UI, not by hand-editing this file.


## ARCHITECTURE

- **Technology**: Vanilla JavaScript ES6 modules, dynamic page loading
- **Configuration**: `leedz_config.json` (centralized configuration for UI, parsers, LLM, database)
- **Pages**: Startup, Booker, Share, Outreach (see PAGES above)
- **Content Scripts**: Gmail, Google Calendar, and generic web page parsing
- **PDF Generation**: html2pdf.js with Handlebars templates
- **LLM Integration**: Anthropic Claude API (configurable provider)


### QUESTIONS
theleedz.com@gmail.com
theleedz.com
