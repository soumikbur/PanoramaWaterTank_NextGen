# Panorama Water Tank Monitor — Build & Packaging Guide
## Production Compilation, Static Asset Sync & Desktop Packaging

---

### 1. Frontend Build Pipeline

The frontend build pipeline uses `esbuild` for ultra-fast bundling (< 250ms) followed by an automated synchronization hook:

```bash
# Execute production build from repository root
npm run build
```

What `npm run build` executes:
1. Bundles TypeScript and JSX modules from `apps/mobile/src/index.tsx` into standalone minified `assets/index.js` and `assets/index.css`.
2. Generates single-page routing shells (`index.html` and `404.html`) with query-hash redirect decoders for GitHub Pages.
3. Automatically synchronizes compiled assets to both `./dist` (for GitHub Pages deployment) and `./backend/static/` (for FastAPI local hosting).

---

### 2. Desktop Electron Packaging

To package the desktop application into a standalone installer or portable executable:

```bash
cd apps/mobile

# Package directory format for local testing
npm run package:dir

# Build Windows NSIS installer (.exe)
npm run package:all
```

The output installers are written to `release/`.

---

### 3. Continuous Integration Verification

Run the verification pipeline before committing changes:

```bash
# 1. Build frontend assets
npm run build

# 2. Run backend test suite
cd backend && pytest tests/ -v
```
