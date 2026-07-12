# SmartMaint-Tex — Desktop Build Guide (.exe)

## Overview

This document explains how to convert the SmartMaint-Tex web application into a
native Windows desktop application (.exe) with the official branding logo as the
application icon.

---

## Logo Asset Location

The official logo file is located at:

```
public/logo.png
```

For Windows .exe builds, you will need to convert this PNG to `.ico` format.

### Converting PNG → ICO

Use one of these methods:

1. **Online**: Upload `logo.png` to [https://convertico.com](https://convertico.com) or [https://icoconvert.com](https://icoconvert.com)
2. **ImageMagick CLI**:
   ```bash
   magick convert public/logo.png -resize 256x256 public/icon.ico
   ```
3. **Sharp (Node.js)**:
   ```bash
   npx sharp-cli -i public/logo.png -o public/icon.ico --resize 256
   ```

The `.ico` file should include multiple resolutions for best display:
- 16×16 (taskbar, small icons)
- 32×32 (desktop)
- 48×48 (Explorer)
- 256×256 (high-DPI displays)

---

## Option A: Electron

### 1. Install Electron Dependencies

```bash
npm install --save-dev electron electron-builder concurrently wait-on
```

### 2. Create `electron/main.js`

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // ============================================
    // DESKTOP ICON CONFIGURATION
    // The 'icon' property sets the icon that appears:
    //   - In the Windows taskbar
    //   - In the application title bar
    //   - In Alt+Tab window switcher
    // Path must point to the .ico file (Windows) or .png (Linux/macOS)
    // ============================================
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'SmartMaint-Tex — GMAO Intelligente',
  });

  // In development, load from Next.js dev server
  // In production, load from the built files
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:3001');
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### 3. Add to `package.json`

```jsonc
{
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3001 && electron .\"",
    "electron:build": "next build && next export && electron-builder"
  },
  // ============================================
  // ELECTRON-BUILDER CONFIGURATION
  // This section controls the .exe generation
  // ============================================
  "build": {
    "appId": "com.smartmaint-tex.gmao",
    "productName": "SmartMaint-Tex",
    // ============================================
    // ICON PATHS FOR EACH PLATFORM
    // Windows: Must be .ico format (256x256 recommended)
    // macOS: Must be .icns format
    // Linux: Must be .png format (512x512 recommended)
    // ============================================
    "win": {
      "target": "nsis",
      "icon": "public/icon.ico"  // ← YOUR CONVERTED .ICO FILE
    },
    "mac": {
      "icon": "public/icon.icns"
    },
    "linux": {
      "icon": "public/logo.png"
    },
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron/**/*",
      "out/**/*",
      "public/**/*"
    ]
  }
}
```

### 4. Build the .exe

```bash
# Export static site first
npx next build
npx next export

# Build the Windows executable
npx electron-builder --win
```

The `.exe` installer will be generated in `dist-electron/`.

---

## Option B: Tauri (Recommended — Smaller bundle size)

### 1. Install Tauri CLI

```bash
npm install --save-dev @tauri-apps/cli
npx tauri init
```

### 2. Configure `src-tauri/tauri.conf.json`

```jsonc
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:3001",
    "distDir": "../out"
  },
  "package": {
    "productName": "SmartMaint-Tex",
    "version": "1.0.0"
  },
  "tauri": {
    "bundle": {
      "active": true,
      "targets": "all",
      // ============================================
      // ICON CONFIGURATION FOR TAURI
      // Place your icon files in src-tauri/icons/
      // Required formats:
      //   - icon.ico     → Windows .exe icon
      //   - icon.png     → Linux app icon
      //   - icon.icns    → macOS app icon
      //   - 32x32.png    → Windows small icon
      //   - 128x128.png  → Linux standard
      //   - 128x128@2x.png → Linux HiDPI
      //
      // Use: npx tauri icon public/logo.png
      // This auto-generates ALL required sizes
      // ============================================
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.smartmaint-tex.gmao",
      "shortDescription": "GMAO Intelligente pour l'Industrie Textile"
    },
    "windows": [
      {
        "title": "SmartMaint-Tex — GMAO Intelligente",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

### 3. Generate All Icon Sizes

```bash
# This command auto-generates all required icon formats
# from your single logo.png source file
npx tauri icon public/logo.png
```

### 4. Build the .exe

```bash
npx tauri build
```

Output: `src-tauri/target/release/bundle/msi/SmartMaint-Tex_1.0.0_x64_en-US.msi`

---

## Option C: Simple Launcher (.bat → .exe wrapper)

For a quick solution without Electron/Tauri overhead, use the existing
`launcher.bat` approach and convert it to `.exe`:

### Using `SmartMaintLauncher.cs` (already in project)

```bash
# Compile the C# launcher to .exe
csc /target:winexe /out:SmartMaint-Tex.exe /win32icon:public/icon.ico SmartMaintLauncher.cs
```

This creates a lightweight `.exe` that starts the Next.js server and opens the
browser automatically.

---

## Checklist

| Step | Action | Status |
|------|--------|--------|
| 1 | Convert `public/logo.png` → `public/icon.ico` (256×256) | ☐ |
| 2 | Choose build method (Electron / Tauri / Launcher) | ☐ |
| 3 | Install required dependencies | ☐ |
| 4 | Configure icon paths in build config | ☐ |
| 5 | Run build command | ☐ |
| 6 | Test .exe on Windows | ☐ |
