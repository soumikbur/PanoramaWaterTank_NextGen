@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  PANORAMA WATER TANK MONITOR -- NextGen Qt 6.12 Desktop Build
echo =====================================================================
echo.

set "QT_DIR=C:\Qt\6.12.0\mingw_64"
set "COMPILER_DIR=C:\msys64\ucrt64\bin"
set "PATH=%QT_DIR%\bin;%COMPILER_DIR%;%PATH%"

set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%"

echo [1/3] Configuring CMake with Ninja...
cmake -B build -G "Ninja" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_PREFIX_PATH="%QT_DIR%" -DCMAKE_CXX_COMPILER="%COMPILER_DIR%\g++.exe" -DCMAKE_C_COMPILER="%COMPILER_DIR%\gcc.exe"
if errorlevel 1 (
    echo [ERROR] CMake configuration failed.
    popd
    exit /b 1
)

echo [2/3] Building NextGen Desktop application and tests...
cmake --build build --parallel
if errorlevel 1 (
    echo [ERROR] Build failed.
    popd
    exit /b 1
)

echo [3/3] Running automated unit test suite...
ctest --test-dir build --output-on-failure
if errorlevel 1 (
    echo [WARNING] One or more tests failed. Check ctest logs.
) else (
    echo [SUCCESS] All automated tests passed successfully!
)

popd
echo.
echo =====================================================================
echo  Build complete! Executable located at:
echo  %PROJECT_ROOT%\build\bin\PanoramaWaterTank.exe
echo =====================================================================
