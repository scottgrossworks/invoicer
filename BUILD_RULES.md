# BUILD_RULES.md

Build procedures and packaging guidelines for the Leedz Invoicer project.

---

## CLIENT BUILD PROCEDURE

### Overview
The Leedz Chrome extension does not require compilation (no TypeScript, JSX, or bundlers). The build process creates a clean distribution folder suitable for:
- Development testing ("Load unpacked")
- Local installation testing (.crx files)
- Chrome Web Store submission (.zip files)

### Build Script Location
`client/build.bat` (Windows)

### Build Process

#### 1. Run the Build Script
```batch
cd client
build.bat
```

#### 2. Build Steps Performed
1. **Cleanup**: Removes previous `dist/` directory
2. **Copy Static Assets**: css/, lib/, icons/, img/
3. **Copy JavaScript**: Excludes `*.copy.js` and `NOTES.md`
4. **Copy Root Files**: manifest.json, *.html, config files, README, LICENSE
5. **Validate Manifest**: Checks JSON syntax and required fields (version, name)
6. **Create ZIP**: Packages `dist/*` into `leedz_invoicer_extension.zip` for Chrome Web Store
7. **CRX Instructions**: Displays instructions for creating .crx packages

#### 3. Build Outputs

**Primary Output:**
- `client/dist/` - Clean extension directory ready for installation

**Package Files:**
- `client/dist/leedz_invoicer_extension.zip` - Chrome Web Store submission package

### Installation Testing

#### Option 1: Load Unpacked (Development)
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `client/dist/` folder

**Use for:** Active development, rapid iteration

#### Option 2: CRX Package (Pre-Production Testing)
Manual method (recommended):
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Pack extension"
4. Root directory: `<path-to-project>/client/dist/`
5. Chrome generates two files:
   - `dist.crx` - Installable extension package
   - `dist.pem` - Private key (KEEP SECURE for updates)

Command line method:
```batch
chrome --pack-extension=C:\path\to\client\dist
```

**Use for:** Testing install experience, sharing with beta testers

**IMPORTANT:** Store the `.pem` file securely. You need it to sign updates to the same extension.

#### Option 3: Chrome Web Store (Production)
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay $5 one-time developer fee (if first submission)
3. Upload `client/dist/leedz_invoicer_extension.zip`
4. Fill out store listing details
5. Submit for review (can take hours to days)

**Use for:** Public release only (NOT for frequent development iterations)

### Configuration Files

Both config files are required and referenced in `manifest.json`:
- `leedz_config.json` - Extension configuration
- `invoicer_config.json` - Invoice template settings

### Pre-Build Checklist

Before building for release:
- [ ] Update version in `manifest.json`
- [ ] Remove all debug/console.log statements
- [ ] Test with "Load unpacked" first
- [ ] Verify all features work in clean Chrome profile
- [ ] Review permissions in manifest.json (remove unused)
- [ ] Update README.md with version notes

### Version Management

**Development:** `1.0.0-dev`, `1.1.0-beta`
**Production:** `1.0.0`, `1.1.0`

Update in `client/manifest.json`:
```json
{
  "version": "1.0.0",
  ...
}
```

### Files Excluded from Build

Automatically excluded by `build.bat`:
- `*.copy.js` - Backup JavaScript files
- `NOTES.md` - Development notes
- `node_modules/` - Not used in extension
- `.git/` - Version control

---

## SERVER BUILD PROCEDURE

### Overview
The Leedz server is a Node.js/Express application written in JavaScript with Prisma database ORM. Production distribution uses `pkg` to bundle Node.js runtime + application code into single executables for each platform architecture.

### Build Script Location
`server/build.bat` (creates complete distribution package)

### Distribution Strategy

#### Target Platforms
Single architecture build:
- **Windows x64** (64-bit Intel/AMD processors)

**Rationale:** Traditional business users run modern Windows 10/11 on x64 hardware. 32-bit (x86) systems are obsolete in business environments. ARM64 support deferred until market demand emerges.

#### Packaging Tool: pkg

**Why pkg:**
- ✓ Guaranteed Prisma compatibility (proven in production)
- ✓ Bundles Node.js runtime (no external dependencies)
- ✓ Single executable per platform
- ✓ No TypeScript compilation needed (we use JavaScript)
- ✓ Well-documented with Prisma

**Installation:**
```batch
npm install -g pkg
```

### Build Process

#### 1. Run the Build Script
```batch
cd server
build.bat
```

#### 2. Build Steps Performed

**Step 1: Build Tray Application**
- Calls existing `server/tray/build.bat` (DO NOT MODIFY)
- Outputs: `server/tray/dist/TheLeedz.exe` + dependencies

**Step 2: Package with pkg**
- Bundles Node.js 18 + JavaScript code + Prisma binaries
- Creates executable: `leedz-server-win-x64.exe`

**Step 3: Copy Canonical Database**
- Copies `server/dist/leedz.sqlite` (empty DB with 1 default Config)
- No Prisma commands run during build (uses pre-created canonical DB)

**Step 4: Assemble Distribution Package**
- Creates `server/dist-pkg/leedz-server-win-{arch}/` for each platform
- Copies all required files into distribution structure

**Step 5: Create Startup Script**
- Generates `launch_leedz.bat` to start both tray and server

### Server Package Contents

Each distribution package (`dist-pkg/leedz-server-win-x64/`) includes:

1. **TheLeedz.exe** - System tray UI application (.NET 8)
2. **TheLeedz.dll** - .NET runtime dependency
3. **TheLeedz.runtimeconfig.json** - .NET runtime configuration
4. **leedz-server.exe** - Backend server (Node 18 + app + Prisma)
5. **prisma/schema.prisma** - Database schema
6. **prisma/leedz.sqlite** - Canonical empty database (0 Clients, 0 Bookings, 1 Config)
7. **server_config.json** - Default configuration template
8. **img/icon.ico** - System tray icon
9. **launch_leedz.bat** - Startup script

### Final Package Structure
```
leedz-server-win-x64/
├── TheLeedz.exe                    # System tray UI (.NET 8)
├── TheLeedz.dll                    # .NET runtime dependency
├── TheLeedz.runtimeconfig.json     # .NET runtime config
├── leedz-server.exe                # Backend server (Node 18 + Prisma)
├── launch_leedz.bat                # Startup script (launches both)
├── server_config.json              # Server configuration
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── leedz.sqlite                # Canonical empty DB (0,0,1)
└── img/
    └── icon.ico                    # System tray icon
```

### pkg Configuration

**server/package.json** must include:
```json
{
  "name": "leedz-server",
  "version": "1.0.0",
  "main": "src/leedz_server.js",
  "pkg": {
    "assets": [
      "node_modules/.prisma/**/*",
      "node_modules/@prisma/client/**/*",
      "prisma/schema.prisma"
    ],
    "targets": [
      "node18-win-x64"
    ],
    "outputPath": "dist-pkg"
  }
}
```

### Canonical Database Creation (ONE-TIME SETUP)

The canonical empty database was created **once** using:

```batch
cd server
node create_empty_db.js
```

This creates `server/dist/leedz.sqlite` with:
- All tables (Client, Booking, Config) from Prisma schema
- 0 Clients
- 0 Bookings
- 1 Config record with default values

**DO NOT re-run** unless schema changes require a new canonical DB.

**Every build copies this file** - no Prisma commands run during builds.

### Production Build Checklist

Before running `server/build.bat`:

- [ ] Install pkg globally (`npm install -g pkg`)
- [ ] Verify `server/package.json` has pkg configuration
- [ ] Test server locally (`node src/leedz_server.js`)
- [ ] Verify tray builds (`cd tray && build.bat`)
- [ ] Confirm canonical DB exists (`server/dist/leedz.sqlite`)
- [ ] Update version in `package.json`
- [ ] Remove debug/console.log statements
- [ ] Test server with canonical empty DB

After building:

- [ ] Test x64 executable
- [ ] Verify TheLeedz.exe launches and connects to server
- [ ] Test with fresh database (0 clients, 0 bookings)
- [ ] Verify all API endpoints work
- [ ] Test CSV export functionality
- [ ] Create installer (NSIS, Inno Setup, or MSI)
- [ ] Test installation on clean Windows machine
- [ ] Verify auto-start functionality (if implemented)

### Build Outputs

After successful build, `server/dist-pkg/` contains:

```
dist-pkg/
└── leedz-server-win-x64/           # Windows 64-bit distribution (ZIP THIS FOR WEBSITE)
    ├── TheLeedz.exe                # System tray UI
    ├── TheLeedz.dll                # .NET dependency
    ├── TheLeedz.runtimeconfig.json # .NET config
    ├── leedz-server.exe            # Backend server
    ├── launch_leedz.bat            # Startup script
    ├── server_config.json          # Configuration
    ├── prisma/
    │   ├── schema.prisma
    │   └── leedz.sqlite
    └── img/
        └── icon.ico
```

### Testing Distribution Package

**Quick Test (without installer):**
1. Navigate to `dist-pkg/leedz-server-win-x64/`
2. Run `launch_leedz.bat`
3. Verify tray icon appears
4. Verify server starts on port 3000
5. Test API: `http://localhost:3000/api/clients`

**Database Location:**
On first run, server creates `data/leedz_invoicer.sqlite` from the canonical template.

### Installation Strategy (Future)

**Recommended Installer Tools:**
- **NSIS** (Nullsoft Scriptable Install System) - Free, scriptable
- **Inno Setup** - Free, simple
- **WiX Toolset** - Creates MSI files (Windows standard)

**Installer Actions:**
1. Extract files to `C:\Program Files\Leedz Invoicer\`
2. Create desktop shortcut to `launch_leedz.bat`
3. Add TheLeedz.exe to Windows Startup (optional)
4. Create data directory for user databases
5. Sign executables (avoid SmartScreen warnings)

---

## VERSION CONTROL

### Semantic Versioning
Follow semver: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Tagging Releases
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

---

## DISTRIBUTION CHECKLIST

### Pre-Release Testing
- [ ] Test client extension in fresh Chrome profile
- [ ] Test server on clean Windows installation
- [ ] Verify database migrations work correctly
- [ ] Test fresh install (no existing data)
- [ ] Test upgrade path (existing data preserved)
- [ ] Verify all API endpoints functional
- [ ] Test PDF generation
- [ ] Test CSV export

### Release Artifacts
- [ ] Client ZIP for Chrome Web Store
- [ ] Server installer (x64)
- [ ] Release notes document
- [ ] User installation guide

---

## NOTES

### Chrome Extension Limitations
- Cannot use Node.js modules (browser environment only)
- Must use Manifest V3 (V2 deprecated)
- Extensions auto-update from Chrome Web Store
- Self-hosted .crx files show security warnings

### Server Distribution
- Include Visual C++ Redistributable if using native modules
- Test on Windows 10 and Windows 11
- Provide uninstaller
- Sign executables for production (avoid SmartScreen warnings)
