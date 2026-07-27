# Extension Key Setup - Complete Guide

## Overview
This adds a permanent "key" to manifest.json so the extension has the same ID everywhere, fixing OAuth issues.

---

## STEP 1: Check Current Extension ID

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. If extension is not loaded, click **Load unpacked**
   - Browse to: `C:\Users\Scott\Desktop\WKG\INVOICER\client`
   - Click "Select Folder"
5. Find "The Leedz" extension in the list
6. **Copy the Extension ID** - it looks like: `abcdefghijklmnopqrstuvwxyz123456`
7. Write it down or paste in a text file temporarily

**Example Extension ID:**
```
abcdefghijklmnopqrstuvwxyz123456
```

---

## STEP 2: Pack Extension to Generate Private Key (.pem)

### 2a. Pack the Extension

1. Still in `chrome://extensions/` with Developer mode enabled
2. Click **Pack extension** button (near top of page)
3. A dialog appears with two fields:

   **Extension root directory:**
   - Click "Browse"
   - Navigate to: `C:\Users\Scott\Desktop\WKG\INVOICER\client`
   - Click "Select Folder"

   **Private key file:**
   - **Leave this EMPTY** (this is your first time packing)

4. Click **Pack Extension** button

### 2b. Files Created

Chrome creates TWO files in the parent directory:
- `C:\Users\Scott\Desktop\WKG\INVOICER\client.crx` - Packed extension (not needed)
- `C:\Users\Scott\Desktop\WKG\INVOICER\client.pem` - **PRIVATE KEY** (CRITICAL!)

### 2c. Move and Secure the .pem File

```bash
# Move .pem to client directory
cd C:\Users\Scott\Desktop\WKG\INVOICER
move client.pem client\client.pem

# Delete the .crx file (not needed)
del client.crx
```

**SECURITY WARNING:**
- `client.pem` is your PRIVATE KEY
- Anyone with this file can publish updates to your extension
- NEVER commit to git
- NEVER share publicly
- Store in password manager or encrypted backup

---

## STEP 3: Extract Public Key from .pem

The public key is what goes in manifest.json. You need OpenSSL to extract it.

### Option A: Using OpenSSL (Recommended)

**Install OpenSSL (if not installed):**
- Download from: https://slproweb.com/products/Win32OpenSSL.html
- Install "Win64 OpenSSL v3.x.x Light"
- Add to PATH: `C:\Program Files\OpenSSL-Win64\bin`

**Extract Public Key:**
```powershell
cd C:\Users\Scott\Desktop\WKG\INVOICER\client

# Extract public key
openssl rsa -in client.pem -pubout -outform DER | openssl base64 -A
```

This outputs a long string like:
```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefghijklmnopqrstuvwxyz...
```

**Copy this entire string** (it will be ~392 characters long)

### Option B: Using Node.js (Alternative)

If OpenSSL is not available, use Node.js:

```javascript
// Save as extract_key.js in client directory
const fs = require('fs');
const crypto = require('crypto');

const pemContent = fs.readFileSync('client.pem', 'utf8');
const key = crypto.createPublicKey(pemContent);
const publicKeyDer = key.export({ type: 'spki', format: 'der' });
const publicKeyBase64 = publicKeyDer.toString('base64');

console.log(publicKeyBase64);
```

Run:
```bash
cd C:\Users\Scott\Desktop\WKG\INVOICER\client
node extract_key.js
```

Copy the output.

### Option C: Manual Method (No Tools Required)

Use this online tool:
1. Go to: https://www.base64decode.org/
2. Open `client.pem` in a text editor
3. Copy the contents (excluding BEGIN/END lines)
4. Convert using online tool (search "PEM to DER converter")

---

## STEP 4: Add Public Key to manifest.json

Edit `C:\Users\Scott\Desktop\WKG\INVOICER\client\manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "The Leedz",
  "version": "1.0",
  "key": "PASTE_THE_LONG_BASE64_STRING_HERE",
  "description": "/DEV/INVOICER/client/",
  "oauth2": {
    "client_id": "1038137351261-u4crh8l3r09vhfrdrp68hmfq4ofop4ra.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/calendar.events"
    ]
  },
  ...rest of manifest...
}
```

**Example (with fake key):**
```json
{
  "manifest_version": 3,
  "name": "The Leedz",
  "version": "1.0",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdefg...",
  "description": "/DEV/INVOICER/client/",
```

---

## STEP 5: Verify the Key Works

### 5a. Reload Source Extension
1. Go to `chrome://extensions/`
2. Find "The Leedz" extension
3. Click the **Reload** button (circular arrow icon)
4. Check Extension ID - should be **THE SAME** as before

### 5b. Build and Test Dist Version
```bash
cd C:\Users\Scott\Desktop\WKG\INVOICER\client
build.bat
```

### 5c. Load Dist Version
1. In `chrome://extensions/`, **remove** the source version first
2. Click **Load unpacked**
3. Browse to: `C:\Users\Scott\Desktop\WKG\INVOICER\client\dist`
4. Click "Select Folder"
5. Check Extension ID - should be **IDENTICAL** to source version

### 5d. Test OAuth
1. Open a Gmail page
2. Open The Leedz sidebar
3. Try adding a booking to calendar
4. OAuth should work without "bad client id" error

---

## STEP 6: Secure the .pem File

### Add to .gitignore

Create or edit `C:\Users\Scott\Desktop\WKG\INVOICER\.gitignore`:

```gitignore
# Chrome extension private keys
client/client.pem
*.pem
*.crx

# Environment files
.env
.env.local

# Build artifacts
client/dist/
server/dist/
server/dist-pkg/
```

### Backup the .pem Securely
Store `client.pem` in:
- Password manager (1Password, Bitwarden, etc.)
- Encrypted USB drive
- Secure cloud storage (Google Drive with encryption)

**DO NOT:**
- Commit to GitHub
- Email to anyone
- Store in plain text on shared drives
- Include in distribution ZIP

---

## STEP 7: Verify Distribution Works

### Test on Clean Environment
1. Copy `client\dist\` to a new folder (simulate fresh download)
2. Zip the dist folder contents
3. Unzip in a different location
4. Load as unpacked extension
5. Verify Extension ID matches
6. Test OAuth features (Calendar, Gmail)

### If Everything Works:
✓ Extension ID is consistent
✓ OAuth works from any location
✓ Ready for distribution

---

## What This Achieves

**Before adding key:**
- Source directory → Extension ID: `abc123...`
- Dist directory → Extension ID: `xyz789...` (different!)
- User's machine → Extension ID: `random456...` (fails!)
- OAuth: ❌ Fails everywhere except source

**After adding key:**
- Source directory → Extension ID: `abc123...`
- Dist directory → Extension ID: `abc123...` (same!)
- User's machine → Extension ID: `abc123...` (same!)
- OAuth: ✓ Works everywhere

---

## Troubleshooting

### "Cannot read .pem file"
- Ensure file exists at `client/client.pem`
- Check file permissions (not read-only)
- Try running PowerShell as Administrator

### "Extension ID changed after adding key"
- You added the wrong key
- Re-extract the key using the EXACT .pem file
- Make sure no extra spaces/newlines in manifest.json

### "OAuth still fails"
- Verify Extension ID matches Google Cloud Console OAuth registration
- You may need to update OAuth client in Google Cloud Console
- Check OAuth redirect URI includes new Extension ID

### "OpenSSL not found"
- Install from: https://slproweb.com/products/Win32OpenSSL.html
- Add to PATH: `C:\Program Files\OpenSSL-Win64\bin`
- Restart PowerShell/Terminal
- Alternative: Use Node.js method (Option B)

---

## Summary Checklist

- [ ] Load source extension and note Extension ID
- [ ] Pack extension to generate client.pem
- [ ] Move client.pem to client/ directory
- [ ] Delete client.crx (not needed)
- [ ] Extract public key using OpenSSL/Node.js
- [ ] Add "key" field to manifest.json
- [ ] Test: Reload source extension (ID should stay same)
- [ ] Test: Build and load dist version (ID should match)
- [ ] Test: OAuth features work from dist version
- [ ] Add client.pem to .gitignore
- [ ] Backup client.pem securely
- [ ] Build final distribution ZIP
- [ ] Test ZIP on clean environment

Once complete, your extension will have a consistent ID everywhere and OAuth will work for all users!
