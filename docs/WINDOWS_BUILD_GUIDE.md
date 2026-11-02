# Panorama Water Tank Monitor — Windows Desktop Build Guide

This guide describes how to build, compile, and package the NextGen **Panorama Water Tank Monitor** into a standalone, installable Windows desktop application (`.exe`).

---

## 1. Architecture Overview

The desktop distribution packages the entire NextGen SCADA stack into an integrated, self-contained Windows application:

```
+-------------------------------------------------------------------------+
|                  Panorama Water Tank Monitor (.exe)                    |
+-------------------------------------------------------------------------+
|  Native Windows Shell (Electron 45 / Chromium / Node.js Runtime)        |
|  - Preload IPC Bridge (Context Isolation: TRUE, Node Integration: FALSE)|
|  - Process Supervisor: Automated startup, health monitoring & shutdown  |
|                                                                         |
|  +-----------------------------------+  +----------------------------+  |
|  | Frontend: React Native Web + Vite |  | Backend: Standalone Daemon |  |
|  | - Single Page Application (TSX)   |  | - Python FastAPI (PyInstall) |
|  | - SCADA Tank Visualizer & HMI     |  | - SQLite / PostgreSQL ORM  |  |
|  | - Real-time WebSocket + REST API  |  | - MQTT TLS Ingestion Engine|  |
|  +-----------------------------------+  +----------------------------+  |
+-------------------------------------------------------------------------+
```

### Components

1. **Frontend**: React Native with TypeScript compiled to optimized web assets via Vite and `react-native-web`.
2. **Backend**: Python 3.12 FastAPI server compiled into a native Windows executable directory with PyInstaller (`panorama-backend.exe`).
3. **Desktop Shell**: Electron runner executing `main.cjs` to supervise the FastAPI child process, perform HTTP health checks, and serve the UI in a dedicated native window.
4. **Native Launcher**: A lightweight C# Win32 binary (`release\PanoramaWaterTank.exe`) that isolates runtime execution and launches the application cleanly.
5. **Installer**: NSIS-based standalone installer (`installer\PanoramaWaterTank-Setup.exe`).

---

## 2. Prerequisites & Environment Setup

Ensure the following prerequisites are installed on the Windows build machine:

| Tool | Minimum Version | Verified Version | Purpose |
| :--- | :--- | :--- | :--- |
| **OS** | Windows 10 x64 | Windows 11 Build 26300 | Host build environment |
| **Node.js** | 18.x LTS | 20.x+ | Frontend bundling & Electron packaging |
| **npm** | 9.x | 10.x+ | Dependency management |
| **Python** | 3.10 x64 | 3.12.0 x64 | Backend runtime & PyInstaller build |
| **.NET Framework** | 4.0+ | 4.8 / `csc.exe` v14.8 | Launcher compilation (Standard on Win 10/11) |

---

## 3. Automated One-Click Build

The simplest method to produce all deliverables is running the automated build script from the project root:

### Using Batch Script (cmd.exe)
```cmd
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
build-windows.bat
```

### Using PowerShell
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen
.\build-windows.ps1
```

Both scripts automatically:
1. Verify prerequisites.
2. Compile the FastAPI backend with PyInstaller (`backend\dist\panorama-backend\panorama-backend.exe`).
3. Bundle the React Native Web frontend with Vite (`apps\mobile\dist`).
4. Package the Electron desktop distribution and NSIS installer (`release\win-unpacked` and `release\PanoramaWaterTank-Setup.exe`).
5. Compile the standalone launcher (`release\PanoramaWaterTank.exe`).
6. Copy the installer to `installer\PanoramaWaterTank-Setup.exe`.

---

## 4. Manual Step-by-Step Build Instructions

For debugging or customized pipeline integrations, follow these individual steps:

### Step 1: Build the Standalone Python Backend
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\backend

# Activate backend virtual environment
.\venv\Scripts\Activate.ps1

# Run PyInstaller with all required dynamic database and uvicorn dependencies
pyinstaller --noconfirm --onedir --name panorama-backend --clean `
    --distpath dist --workpath build `
    --hidden-import aiosqlite `
    --hidden-import greenlet `
    --hidden-import asyncpg `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan.on `
    run_server.py
```
*Output*: `backend\dist\panorama-backend\panorama-backend.exe` (and associated `_internal` dependency tree).

---

### Step 2: Build the React Native Web Production Bundle
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile

# Install dependencies if not already installed
npm install

# Build production bundle with relative base paths
npm run build
```
*Output*: `apps\mobile\dist\` (`index.html`, `assets/index-*.js`, `assets/index-*.css`).

---

### Step 3: Package Desktop Application with electron-builder
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile

# Package Windows NSIS installer and unpacked folder
npx electron-builder --win
```
*Outputs*:
- `release\win-unpacked\` (Full unpacked desktop application containing `PanoramaWaterTank.exe` and `resources\backend\`)
- `release\PanoramaWaterTank-Setup.exe` (NSIS Installer)

---

### Step 4: Compile Standalone Root Launcher
```powershell
cd C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen

& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe `
    /win32icon:"apps\mobile\electron\assets\icon.ico" `
    /out:"release\PanoramaWaterTank.exe" `
    "release\launcher.cs"
```
*Output*: `release\PanoramaWaterTank.exe` (13 KB native Win32 executable).

---

### Step 5: Stage Installer
```powershell
if (!(Test-Path "installer")) { New-Item -ItemType Directory -Path "installer" }
Copy-Item "release\PanoramaWaterTank-Setup.exe" "installer\PanoramaWaterTank-Setup.exe" -Force
```

---

## 5. Output Deliverables Structure

Upon completion, the build artifacts are arranged as follows:

```
PanoramaWaterTank_NextGen\
+-- release\
|   +-- PanoramaWaterTank.exe           <-- Standalone root launcher with embedded icon
|   +-- PanoramaWaterTank-Setup.exe     <-- NSIS installer binary (134 MB)
|   +-- win-unpacked\                   <-- Full portable application folder (249 MB)
|       +-- PanoramaWaterTank.exe       <-- Native Electron executable
|       +-- resources\
|           +-- app.asar                <-- Packaged React Native Web UI & Electron main
|           +-- backend\                <-- Packaged FastAPI executable + dependencies
|               +-- panorama-backend.exe
|               +-- _internal\
+-- installer\
    +-- PanoramaWaterTank-Setup.exe     <-- Primary standalone installer deliverable
```

---

## 6. Critical Engineering Considerations

1. **`ELECTRON_RUN_AS_NODE` Environment Variable**:
   When launching Electron binaries from developer IDE terminals (such as VS Code or Antigravity), the host environment sets `ELECTRON_RUN_AS_NODE=1`. This flag forces Electron to execute as a headless Node.js CLI rather than a GUI window. The provided C# launcher (`release\launcher.cs`) strips this environment variable prior to spawning the child process, guaranteeing that the GUI opens properly in all launch scenarios.

2. **Vite Base Path (`base: './'`)**:
   Electron loads packaged frontend assets using the `file://` protocol. Assets referenced with absolute paths (`/assets/index.js`) will fail to resolve. `apps\mobile\vite.config.ts` explicitly sets `base: './'` to enforce relative resolution.

3. **PyInstaller Hidden Imports**:
   SQLAlchemy async engines (`aiosqlite`, `asyncpg`) and Uvicorn protocol workers are loaded dynamically at runtime. They must be explicitly passed to PyInstaller via `--hidden-import` to prevent `ModuleNotFoundError` in standalone distribution mode.

