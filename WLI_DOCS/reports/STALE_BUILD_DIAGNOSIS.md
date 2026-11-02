# Stale Desktop Application Diagnosis Report

**Date**: October 30, 2026  
**Investigator**: Antigravity Autonomous Agent  
**Host**: Windows 11 (x64)  

---

## 1. Problem Statement

When launching the **Panorama Water Tank Monitor** from the Windows desktop, the application was opening an obsolete or stale interface rather than the newly re-engineered NextGen desktop application.

---

## 2. Root Cause Analysis

A thorough diagnostic inspection of active processes, filesystem paths, and Windows desktop shortcuts revealed three distinct contributing factors:

### Factor 1: Desktop Shortcut Targeted an Obsolete C# Launcher
- **Shortcut Path**: `C:\Users\User\Desktop\Panorama Water Tank Monitor.lnk`
- **Target Path**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\release\PanoramaWaterTank.exe`
- **Working Directory**: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\release`
- **Analysis**:
  The executable targeted by the desktop shortcut was a 13 KB C# launcher application compiled on October 29 (`release\launcher.cs`). Its internal logic explicitly executed:
  ```csharp
  string exePath = Path.Combine(baseDir, "win-unpacked", "PanoramaWaterTank.exe");
  Process.Start(psi);
  ```
  This launcher bypassed the Qt 6.12 C++ application entirely and booted an obsolete electron prototype packaged inside `release\win-unpacked\`.

### Factor 2: Active Background Instance Running From an Unrelated Milestone2 Directory
- **Process ID**: `17488`
- **Executable Path**: `C:\Users\User\Documents\copy\PanoramaWaterTank-Milestone2\PanoramaWaterTank\build\Desktop_Qt_6_12_0_MinGW_64_bit_Debug\bin\PanoramaWaterTank.exe`
- **Launch Time**: October 30, 2026, at 13:17:37 (prior to the current session)
- **Analysis**:
  An instance of the legacy Qt application had been running continuously in the background from a separate `copy\` directory (`C:\Users\User\Documents\copy\PanoramaWaterTank-Milestone2\...`), consuming system resources and preventing new builds from cleanly taking over desktop focus.

### Factor 3: NextGen Rebuild Was Not Packaged into a Standalone Distribution Directory
- While the NextGen C++20 / Qt 6.12 rebuild was successfully compiled into `PanoramaWaterTank_NextGen\build\bin\PanoramaWaterTank.exe`, it had not yet been deployed with `windeployqt` into a standalone, self-contained distribution folder (`PanoramaWaterTank_NextGen\dist\`), nor had the desktop shortcut been repointed to this new binary.

---

## 3. Resolution Plan

1. **Terminate Stale Process**: Forcefully close PID 17488 running from the `copy\` directory. (Completed)
2. **Deploy Standalone NextGen Distribution**:
   - Establish dedicated deployment directory: `C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\dist`.
   - Copy `PanoramaWaterTank.exe` and `qt.conf`.
   - Run `windeployqt` with `--qmldir` scanning all NextGen QML components.
   - Include MinGW runtime DLLs (`libgcc_s_seh-1.dll`, `libstdc++-6.dll`, `libwinpthread-1.dll`).
3. **Clean Up Obsolete Deployment Files**: Remove the outdated `release\` directory contents to eliminate conflicting launchers.
4. **Repoint Windows Desktop Shortcut**:
   - Update `C:\Users\User\Desktop\Panorama Water Tank Monitor.lnk` to point directly to `PanoramaWaterTank_NextGen\dist\PanoramaWaterTank.exe`.
   - Set working directory to `PanoramaWaterTank_NextGen\dist`.
   - Set icon to the NextGen application icon.
5. **Runtime Verification**: Launch the newly deployed application from `dist\`, verify MQTT TLS handshakes and dashboard rendering, and confirm the new NextGen interface is actively presented.

