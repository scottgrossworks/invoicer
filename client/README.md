
### Leedz Desktop 
### Leedz Chrome Browser Extension
### README 

## INTRODUCTION

Leedz Desktop (Leedz Chrome Extension + Leedz Server) is a lightweight system that uses AI to manage your Clients and Bookings.  The Leedz Chrome Extension inputs data from the web and generates emails, calendar entries and saves data to a local DB.  Leedz Server manages that database from your System Tray.  The Leedz Server securely stores all data in a SQLite database and provides a REST API for accessing and manipulating your information.  The extension lets you scrape your INBOX and the Web for Bookings, record the data, and generate replies.


## INSTALL THE CHROME EXTENSION

### STEP 1: DOWNLOAD AND EXTRACT
--------------------------------------------------------------------
1. Download the Leedz Chrome Extension file: “leedz-chrome-ext.zip”
2. Right-click the ZIP file and select "Extract All..."
3. Choose a permanent location (e.g., C:\Program Files\Leedz/) – **IMPORTANT:** Do not delete this folder after installation - it's crucial for functionality!
4. Click “Extract”

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
1. Click the “Load unpacked” button (appears after Developer mode).
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

1. **Startup:** Configure your LLM provider and connect to your Leedz Server.  Specify server URL and port, and Database Name will appear in the settings.
2. **Outreach:** Use your LLM to quickly draft first contacts and send them in one click.
3. **Capture:** Perfect for web scraping and storing Clients to your database.
4. **Respond:** Quickly draft response emails that describe your service, rate, and answer Client questions.
5. **Book:** Create a Booking in your database, add it to your Calendar, and generate a PDF invoice.
6. **Share:** Share a Booking to the Leedz marketplace.
7. **Thank You:** Summarize an email thread into a thoughtful thank-you email.

## STARTUP

The Startup page enables the browser extension to find your Leedz server. Configure the server URL and port, and when connected, the Database Name will show in its own row.  The Chrome extension starts its own HTTP server to receive Gmail Oauth tokens. These credentials enable the Leedz to draft Gmails and create Calendar events. The server URL and port are configurable, and default to 'localhost' :3000/30001 but you can choose any open ports. For more information on MCP configuration, see MCP section below.

In the LLM section you enter your LLM url, provider and key. This can be a cloud provider like https://api.anthropic.com or a model running on your machine in LM Studio.

Once the extension has started the MCP server, you can one-click enable Gmail sending authorization for one hour in the 'Authorize Gmail' section.

## SHARE

When you get an email request for a Booking you *don't* want to work, Share it in a few clicks with the Leedz marketplace.  Choose the correct trade (braiding, caricatures, dj...) and the LLM parser will fill-in the rest.  If you want to share privately with your group of friends, just click their names.  The Client will send each their own email with the Booking and Client info.

## CONFIGURATION

Primary Config role: `client/leedz_config.json`
* UI page definitions (ClientCapture, Invoicer, Gmailer)
* LLM provider settings (API key, model, endpoints)
* Database connection (baseUrl, provider)
* MCP server settings (host, port)
* Parser configurations with system prompts
* Render settings (PDF output directory)


# LLM Prompting

Provide your LLM with actual email examples and the Leedz will follow your template for future drafts.

# Outreach Email
"Dear Mary,\n\n2026 is here!  Now is a perfect time to add a special gift to someone's life that they will cherish forever. That's exactly what my caricatures do at the next Little Caesar's event. Whether it's your staff or customers, my drawings make everyone feel like a star, for about 4 minutes each :)\n\nI bring everything I need for an authentic caricature booth. Lancaster is in my service area. My rates will fit anything you have planned, starting at just $175/hr.\n\nSend me a date, location and phone, and let's add you to the calendar."

# Responder Email
"Hi Debbie, I'd be delighted to draw caricatures for your birthday party March 4th. I'm a longtime Warner Bros. / DC Comics artist, able to draw everything from classic portraits to fun cartoons, themes, group shots, work from photos, even pets! Each face only takes about 4 minutes. 12-15 faces per hour. B/W with a color splash. I bring everything I need to create an authentic caricature booth, including my own chair and lighting. All drawings come on sturdy card stock in a clear plastic sleeve, and I can graphic design the paper with your party info to personalize each piece of art.\n\nMy rate would be $400 total. No deposit is required.\n\nWatch me draw @thatdrawingshow --\nscottgross.works/drawingshow\n\nThen send me an email with your address and the start time to scottgrossworks@gmail.com -- and let's book this date!"

# Thank You
The Thank-You emails are short and sweet, with any text you add to the Special Information section mixed into the draft.



## ARCHITECTURE

- **Technology**: Vanilla JavaScript ES6 modules, dynamic page loading
- **Configuration**: `client/leedz_config.json` (centralized configuration for UI, parsers, LLM, database)
- **Pages**:
  - **ClientCapture**: Multi-client batch capture from web pages
  - **Invoicer**: Single booking/invoice creation
  - **Gmailer**: Gmail OAuth integration and email sending
- **Content Scripts**: Gmail, Google Calendar, and generic web page parsing
- **PDF Generation**: html2pdf.js with Handlebars templates
- **LLM Integration**: Anthropic Claude API (configurable provider)



### QUESTIONS
theleedz.com@gmail.com
theleedz.com