# Tooling Setup & Persistent Verification Guide

**Project**: Panorama Water Tank NextGen Rebuild  
**Generated**: October 30, 2026  
**Environment**: Windows 11 (x64) | Google Antigravity Agentic Environment  

---

## 1. Toolchain Verification & Locations

### 1.1 Graphify Architecture Intelligence
- **Status**: Verified Installed & Operational
- **Executable**: `C:\Users\User\AppData\Roaming\npm\graphify.cmd`
- **Engine**: Node.js AST extraction engine (`@graphify/cli`)
- **Supported Commands**:
  - `graphify extract <dir> [--code-only]`: Extracts AST symbols from C++, CMake, QML, Python, JS, etc.
  - `graphify cluster-only <dir> [--no-label]`: Clusters node graph and generates modular partition reports.
  - `graphify explain "<Node>"`: Inspects inbound/outbound references, callers, and class members.
  - `graphify path "<Source>" "<Target>"`: Traces shortest dependency path between components.
  - `graphify query "<Question>"`: Breadth-first / Depth-first query traversal across architecture.
  - `graphify export wiki <dir>`: Generates architectural wiki articles.
  - `graphify export callflow-html <dir>`: Generates interactive Mermaid call-flow visualization.
- **Persistent Antigravity Integration**:
  - Global Rule: `C:\Users\User\.gemini\config\rules\graphify.md`
  - Workspace Rule: `C:\Users\User\Documents\Antigravity_soumik\.agents\rules\graphify.md`
  - Workspace Workflow: `C:\Users\User\Documents\Antigravity_soumik\.agents\workflows\graphify.md`
  - Knowledge Base: `PanoramaWaterTank_NextGen/WLI_DOCS/graphify/graph.json`

### 1.2 Ponytail Senior Dev Mode Plugin
- **Status**: Verified Active (v5.3.3)
- **Plugin Directory**: `C:\Users\User\.gemini\config\plugins\ponytail`
- **System Rules**: `C:\Users\User\.gemini\config\plugins\ponytail\rules\AGENTS.md`
- **Capabilities & Skills**:
  - `/ponytail [lite|full|ultra|off]`: Lazy senior dev mode switch enforcing the prompt ladder (does it need to exist -> already in codebase -> stdlib -> installed dependency -> one-liner -> minimum code).
  - `/ponytail-review`: Quality review assessing logic correctness, safety, load limits, and necessity.
  - `/ponytail-audit`: Whole repo audit identifying bloat, dead code, circular paths, and unvalidated logic.
  - `/ponytail-debt`: Ledger scan of all `shortcut:` debt tags.
  - `/ponytail-gain`: Efficiency measurement reporting code savings.
  - `/ponytail-help`: Reference manual.

### 1.3 C++ Compiler & Build Toolchain
- **CMake**: `4.4.4` (`C:\Program Files\CMake\bin\cmake.exe` or Qt Tools)
- **Ninja**: `1.13.2` (`C:\Qt\Tools\Ninja\ninja.exe`)
- **Qt Framework**: `Qt 6.12.0` (MinGW 64-bit) at `C:\Qt\6.12.0\mingw_64`
- **Compiler**: MinGW GCC/G++ `16.2.0` (`C:\msys64\ucrt64\bin\g++.exe`) / `C:\Qt\Tools\mingw1310_64\bin\g++.exe`
- **Qt Modules Required**:
  - `Qt6::Core`, `Qt6::Quick`, `Qt6::QuickControls2`, `Qt6::Svg`, `Qt6::Network`, `Qt6::Sql`, `Qt6::Mqtt` (verified built at `C:\Qt\6.12.0\mingw_64\include\QtMqtt`)

---

## 2. Invocation Procedures in Future Sessions

### Running Graphify Code Extraction
To refresh the architectural graph on the NextGen codebase:
```powershell
graphify extract . --code-only
graphify cluster-only . --no-label
graphify export callflow-html .
```

### Building the NextGen Desktop Application
```powershell
$env:PATH = "C:\Qt\6.12.0\mingw_64\bin;C:\msys64\ucrt64\bin;C:\Windows\system32;C:\Windows"
cmake -B build -G "Ninja" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_PREFIX_PATH="C:/Qt/6.12.0/mingw_64"
cmake --build build
```

### Running Test Suite
```powershell
$env:PATH = "C:\Qt\6.12.0\mingw_64\bin;C:\msys64\ucrt64\bin;C:\Windows\system32;C:\Windows"
ctest --test-dir build --output-on-failure
```

