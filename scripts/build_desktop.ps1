# build_desktop.ps1 - PowerShell script for building PanoramaWaterTank NextGen
$ErrorActionPreference = "Stop"

$QtDir = "C:\Qt\6.12.0\mingw_64"
$CompilerDir = "C:\msys64\ucrt64\bin"
$env:PATH = "$QtDir\bin;$CompilerDir;$env:PATH"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " PANORAMA WATER TANK MONITOR -- NextGen Qt 6.12 Desktop Build" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Configuring CMake with Ninja..." -ForegroundColor Yellow
cmake -B build -G "Ninja" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_PREFIX_PATH="$QtDir" -DCMAKE_CXX_COMPILER="$CompilerDir\g++.exe" -DCMAKE_C_COMPILER="$CompilerDir\gcc.exe"

Write-Host "`n[2/3] Building NextGen Desktop application and tests..." -ForegroundColor Yellow
cmake --build build --parallel

Write-Host "`n[3/3] Running automated unit test suite..." -ForegroundColor Yellow
ctest --test-dir build --output-on-failure

Write-Host "`n=====================================================================" -ForegroundColor Green
Write-Host " Build & Test Run Complete!" -ForegroundColor Green
Write-Host " Executable located at: $ProjectRoot\build\bin\PanoramaWaterTank.exe" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
