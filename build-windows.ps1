# PowerShell build script for Panorama Water Tank Monitor (NextGen Windows Desktop)
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " PANORAMA WATER TANK MONITOR -- NextGen Windows Desktop Build Script" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "apps\mobile"
$ReleaseDir = Join-Path $ProjectRoot "release"
$InstallerDir = Join-Path $ProjectRoot "installer"

if (!(Test-Path $ReleaseDir)) { New-Item -ItemType Directory -Path $ReleaseDir | Out-Null }
if (!(Test-Path $InstallerDir)) { New-Item -ItemType Directory -Path $InstallerDir | Out-Null }

$CscExe = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (!(Test-Path $CscExe)) {
    $CscExe = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

Write-Host "[1/5] Verifying toolchain prerequisites..." -ForegroundColor Yellow
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"
if (!(Test-Path $PythonExe)) {
    throw "Backend virtual environment not found at $BackendDir\venv. Please initialize backend environment."
}

# 2. Compile Backend
Write-Host "[2/5] Compiling Python FastAPI backend into standalone binary..." -ForegroundColor Yellow
Push-Location $BackendDir
try {
    & $PythonExe -m PyInstaller --noconfirm --onedir --name panorama-backend --clean `
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
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "Backend compilation succeeded." -ForegroundColor Green
Write-Host ""

# 3. Build React Native Web Frontend
Write-Host "[3/5] Building React Native Web production bundle..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    & cmd.exe /c "npm run build"
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "Frontend build succeeded." -ForegroundColor Green
Write-Host ""

# 4. Package Electron Desktop App and NSIS Installer
Write-Host "[4/5] Packaging desktop application and generating NSIS installer..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    & cmd.exe /c "npx electron-builder --win"
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "Desktop packaging succeeded." -ForegroundColor Green
Write-Host ""

# 5. Compile Launcher & Sync Deliverables
Write-Host "[5/5] Finalizing deliverables and compiling standalone root launcher..." -ForegroundColor Yellow
if (Test-Path $CscExe) {
    $IconPath = Join-Path $FrontendDir "electron\assets\icon.ico"
    $LauncherCs = Join-Path $ReleaseDir "launcher.cs"
    $RootExe = Join-Path $ReleaseDir "PanoramaWaterTank.exe"
    & $CscExe /target:winexe /win32icon:"$IconPath" /out:"$RootExe" "$LauncherCs"
    Write-Host "Root launcher compiled successfully: $RootExe" -ForegroundColor Green
}

$SetupSource = Join-Path $ReleaseDir "PanoramaWaterTank-Setup.exe"
$SetupDest = Join-Path $InstallerDir "PanoramaWaterTank-Setup.exe"
if (Test-Path $SetupSource) {
    Copy-Item -Path $SetupSource -Destination $SetupDest -Force
    Write-Host "Installer copied to: $SetupDest" -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " BUILD COMPLETE!" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "Standalone Executable: $ReleaseDir\PanoramaWaterTank.exe" -ForegroundColor White
Write-Host "Unpacked Desktop App:  $ReleaseDir\win-unpacked\PanoramaWaterTank.exe" -ForegroundColor White
Write-Host "NSIS Installer:        $InstallerDir\PanoramaWaterTank-Setup.exe" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan

