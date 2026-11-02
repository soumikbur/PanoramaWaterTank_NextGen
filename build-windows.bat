@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  PANORAMA WATER TANK MONITOR -- NextGen Windows Desktop Build Script
echo =====================================================================
echo.

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "FRONTEND_DIR=%PROJECT_ROOT%\apps\mobile"
set "RELEASE_DIR=%PROJECT_ROOT%\release"
set "INSTALLER_DIR=%PROJECT_ROOT%\installer"

:: Ensure output directories exist
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%INSTALLER_DIR%" mkdir "%INSTALLER_DIR%"

:: Locate CSC (C# Compiler)
set "CSC_EXE=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC_EXE%" (
    set "CSC_EXE=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

echo [1/5] Verifying toolchain prerequisites...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required but was not found in PATH.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is required but was not found in PATH.
    exit /b 1
)

if not exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment not found at %BACKEND_DIR%\venv.
    echo Please create it and install backend\requirements.txt first.
    exit /b 1
)

if not exist "%CSC_EXE%" (
    echo [WARNING] .NET Framework C# compiler csc.exe not found at standard path.
    echo Standalone launcher PanoramaWaterTank.exe will not be recompiled.
)

echo Prerequisite checks passed.
echo.

:: -------------------------------------------------------------------------
:: Step 2: Compile Python Backend via PyInstaller
:: -------------------------------------------------------------------------
echo [2/5] Compiling Python FastAPI backend into standalone binary...
pushd "%BACKEND_DIR%"
call "%BACKEND_DIR%\venv\Scripts\activate.bat"

python -m PyInstaller --noconfirm --onedir --name panorama-backend --clean ^
    --distpath dist --workpath build ^
    --hidden-import aiosqlite ^
    --hidden-import greenlet ^
    --hidden-import asyncpg ^
    --hidden-import uvicorn.logging ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.lifespan.on ^
    run_server.py

if errorlevel 1 (
    echo [ERROR] PyInstaller backend build failed.
    popd
    exit /b 1
)
popd
echo Backend compilation succeeded.
echo.

:: -------------------------------------------------------------------------
:: Step 3: Build React Native Web Frontend
:: -------------------------------------------------------------------------
echo [3/5] Building React Native Web production bundle...
pushd "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend production build failed.
    popd
    exit /b 1
)
popd
echo Frontend build succeeded.
echo.

:: -------------------------------------------------------------------------
:: Step 4: Package Windows Electron Desktop Shell and NSIS Installer
:: -------------------------------------------------------------------------
echo [4/5] Packaging desktop application and generating NSIS installer...
pushd "%FRONTEND_DIR%"
call npx electron-builder --win
if errorlevel 1 (
    echo [ERROR] electron-builder packaging failed.
    popd
    exit /b 1
)
popd
echo Desktop packaging succeeded.
echo.

:: -------------------------------------------------------------------------
:: Step 5: Compile Standalone Launcher & Sync Deliverables
:: -------------------------------------------------------------------------
echo [5/5] Finalizing deliverables and compiling standalone root launcher...

if exist "%CSC_EXE%" (
    "%CSC_EXE%" /target:winexe /win32icon:"%FRONTEND_DIR%\electron\assets\icon.ico" /out:"%RELEASE_DIR%\PanoramaWaterTank.exe" "%RELEASE_DIR%\launcher.cs"
    if errorlevel 1 (
        echo [WARNING] Root launcher compilation encountered an error; win-unpacked\PanoramaWaterTank.exe is still available.
    ) else (
        echo Root launcher PanoramaWaterTank.exe compiled successfully.
    )
)

if exist "%RELEASE_DIR%\PanoramaWaterTank-Setup.exe" (
    copy /y "%RELEASE_DIR%\PanoramaWaterTank-Setup.exe" "%INSTALLER_DIR%\PanoramaWaterTank-Setup.exe" >nul
    echo Installer copied to: %INSTALLER_DIR%\PanoramaWaterTank-Setup.exe
)

echo.
echo =====================================================================
echo  BUILD COMPLETE!
echo =====================================================================
echo Standalone Executable: %RELEASE_DIR%\PanoramaWaterTank.exe
echo Unpacked Desktop App:  %RELEASE_DIR%\win-unpacked\PanoramaWaterTank.exe
echo NSIS Installer:        %INSTALLER_DIR%\PanoramaWaterTank-Setup.exe
echo =====================================================================

