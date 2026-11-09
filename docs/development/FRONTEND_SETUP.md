# Panorama Water Tank Monitor — Frontend Development Guide
## React 18, React Native Web & Vite HMI Architecture

---

### 1. Structure of Frontend Workspace (`apps/mobile/`)

```
apps/mobile/
├── package.json               # Frontend package manifest & build scripts
├── tsconfig.json              # TypeScript compilation options
├── electron/                  # Standalone desktop shell (Electron 30)
│   ├── main.cjs               # Main process lifecycle & supervisor
│   └── preload.cjs            # Context-isolated secure preload bridge
├── scripts/
│   ├── build.cjs              # Standalone esbuild production bundler
│   ├── dev.cjs                # Vite HMI development server
│   └── preview.cjs            # Zero-cache preview static server
└── src/
    ├── index.tsx              # Application entrypoint
    ├── App.tsx                # Layout wrapper & ErrorBoundary
    ├── theme/                 # SCADA design tokens & CSS custom properties
    ├── state/AppContext.tsx   # Centralized telemetry store
    ├── services/              # tankStatusService, mqttService, deviceRegistry
    ├── api/client.ts          # REST client with JWT interceptor
    └── screens/               # SCADA operational views
```

---

### 2. Available Frontend Commands

Execute from repository root:

```bash
# Start development server with Hot Module Replacement (HMR)
npm run dev

# Compile optimized production bundle into dist/ and backend/static/
npm run build

# Launch zero-cache local preview server
npm run preview

# Run Electron desktop native shell
npm run electron --workspace=apps/mobile
```

---

### 3. Responsive Breakpoint Matrix

The frontend uses CSS variables and media queries to adapt to any viewport:

- **Mobile Viewports (< 768px):** Desktop sidebar is suppressed; hamburger button triggers a slide-in drawer. High-density SCADA tables convert to touch cards.
- **Tablet Viewports (768px – 1024px):** 2-column auto-fit grids with momentum touch scrolling.
- **Desktop Workstations (> 1024px):** Full-width industrial dashboard with persistent navigation sidebar and multi-column tabular consoles.
