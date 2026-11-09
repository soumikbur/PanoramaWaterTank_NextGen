# 03. Dependency Graph & Structural Analysis (Graphify Intelligence)
## Panorama Water Tank Monitor (WLI SCADA HMI)

**Audit Date:** November 9, 2026  
**Analysis Engine:** Graphify v0.9.99 (Code Knowledge Graph with AST Parsing)  
**Corpus Scope:** 738 files, ~999,139 words across C++, Python, TypeScript, and JavaScript  

---

### 1. Graph Metrics & Network Topology

| Metric | Measured Value | Architectural Interpretation |
|---|---|---|
| **Total Nodes** | **7,690** | Highly comprehensive extraction of classes, functions, routes, and modules |
| **Total Edges** | **14,936** | Rich dependency and invocation relationships |
| **Community Clusters** | **505** | Well-segregated functional domains across frontend, backend, and edge |
| **Extraction Confidence** | **88% Extracted, 12% Inferred** | Extremely high confidence AST-derived structure |
| **Centrality God Nodes** | `TankModel`, `MqttService`, `ApiClient`, `AppContext`, `main.py` | Key orchestration hubs coordinating data flow |

---

### 2. Module Call Chains & Dependency Paths

```mermaid
graph TD
    subgraph UI_Layer ["Frontend HMI Components"]
        Header[Header.tsx]
        Sidebar[Sidebar.tsx]
        EmployeeDash[EmployeeDashboard.tsx]
        WaterTankScr[WaterTankScreen.tsx]
        TrainMgmt[TrainManagementScreen.tsx]
        DeviceMap[DeviceMappingScreen.tsx]
    end

    subgraph State_And_Services ["State & Services Engine"]
        AppCtx[AppContext.tsx]
        TankStatus[tankStatusService.ts]
        MqttClient[mqttService.ts]
        DevRegistry[deviceRegistry.ts]
        ApiClient[api/client.ts]
    end

    subgraph Backend_Endpoints ["FastAPI Backend (app/api/v1/)"]
        AuthEp[auth.py]
        TanksEp[tanks.py]
        TrainsEp[trains.py]
        DevicesEp[devices.py]
        TelemEp[telemetry.py]
        ExportEp[export.py]
        AlarmsEp[alarms.py]
        SettingsEp[settings.py]
    end

    subgraph Backend_Core ["Backend Core & Data Access"]
        CalcEngine[calculator.py]
        AlarmEngine[alarm_service.py]
        Downsampler[downsampler.py]
        Security[core/security.py]
        DB[core/database.py]
        SQLModels[models/*.py]
    end

    Header --> AppCtx
    Sidebar --> AppCtx
    EmployeeDash --> AppCtx
    EmployeeDash --> TankStatus
    WaterTankScr --> AppCtx
    WaterTankScr --> TankStatus
    TrainMgmt --> AppCtx
    DeviceMap --> AppCtx
    DeviceMap --> DevRegistry

    AppCtx --> MqttClient
    AppCtx --> ApiClient
    AppCtx --> TankStatus

    ApiClient --> AuthEp
    ApiClient --> TanksEp
    ApiClient --> TrainsEp
    ApiClient --> DevicesEp
    ApiClient --> TelemEp
    ApiClient --> ExportEp
    ApiClient --> AlarmsEp
    ApiClient --> SettingsEp

    AuthEp --> Security
    AuthEp --> DB
    TanksEp --> CalcEngine
    TanksEp --> AlarmEngine
    TelemEp --> Downsampler
    TanksEp --> DB
    TrainsEp --> DB
    DevicesEp --> DB
    AlarmsEp --> AlarmEngine
```

---

### 3. Circular Dependency & Coupling Assessment

1. **Frontend Coupling:**
   - `tankStatusService.ts` is implemented as a pure mathematical and logical dependency with zero cyclic imports to React or DOM elements.
   - `AppContext.tsx` orchestrates data flow unidirectional down to presentation screens.
2. **Backend Coupling:**
   - Clean separation of concerns between Routers (`api/v1/`), Repositories (`repositories/`), Services (`services/`), and Models (`models/`).
   - Repositories encapsulate raw SQLAlchemy queries; routers do not directly construct ad-hoc raw SQL strings.
   - Pydantic models in `schemas/` prevent leaky abstraction of internal database entities.
