@echo off
REM =======================================================================
REM Launch Google Chrome with Remote Debugging Enabled for Antigravity & CDP
REM Port: 9222
REM User Data: Dedicated debugging profile in LocalAppData\PanoramaChromeDebug
REM =======================================================================

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    echo [ERROR] Google Chrome was not found in Program Files.
    exit /b 1
)

set DEBUG_DIR="%LOCALAPPDATA%\PanoramaChromeDebug"
if not exist %DEBUG_DIR% mkdir %DEBUG_DIR%

echo [STARTING] Launching Google Chrome with CDP Remote Debugging on port 9222...
echo Profile Dir: %DEBUG_DIR%

start "" %CHROME_PATH% --remote-debugging-port=9222 --user-data-dir=%DEBUG_DIR% --no-first-run --no-default-browser-check "https://soumikbur.github.io/PanoramaWaterTank_NextGen/"

echo [SUCCESS] Chrome launched on port 9222.
echo Antigravity can now attach directly via CDP to http://127.0.0.1:9222
