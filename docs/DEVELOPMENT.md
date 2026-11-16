# Development Guidelines & Local Engineering Runbook

This guide contains the development workflow, testing standards, and contribution practices for the **Panorama Water Tank Monitor — NextGen** repository.

---

## 1. Local Development Setup

### 1.1 Prerequisites
- **Node.js**: `>= 20.0.0 <= 24.x`
- **npm**: `>= 10.0.0`
- **Python**: `>= 3.11.0` (with `venv` and `pip`)
- **Git**: `>= 2.40.0`
- **Android Studio** (Optional, required only for native mobile testing)

### 1.2 Step-by-Step Installation
```bash
# 1. Clone repository
git clone https://github.com/soumikbur/PanoramaWaterTank_NextGen.git
cd PanoramaWaterTank_NextGen

# 2. Install monorepo dependencies
npm ci

# 3. Configure backend environment
cp config/.env.example backend/.env

# 4. Set up Python virtual environment
cd backend
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
cd ..
```

---

## 2. Running Local Services

### Running the Backend Daemon
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Running the Frontend Development Server
```bash
# In repository root:
npm run dev
# The frontend launches on http://127.0.0.1:3000 (or 3001)
```

### Running the Zero-Cache Static Preview Server
```bash
npm run build
npm run preview
```

---

## 3. Automated Verification & Testing

### 3.1 Backend Test Suite (86 Pytest Tests)
```bash
cd backend
pytest tests/ -v
```

### 3.2 Frontend Compilation & Typecheck
```bash
npm run build
```

### 3.3 End-to-End Playwright Browser Verification
```bash
node scripts/verify_raw_data_monitor.cjs
```

---

## 4. Git Branch Strategy & Commit Standards

- **Main Branch**: `main` (Production release branch with strict CI gating).
- **Feature Branches**: `feat/<feature-name>` (e.g. `feat/mqtt-raw-monitor`).
- **Fix Branches**: `fix/<bug-name>` (e.g. `fix/device-uid-alignment`).
- **Audit Branches**: `audit/<audit-focus>`.

### Conventional Commit Messages
Commits must follow the Conventional Commits format:
- `feat(scope): brief description`
- `fix(scope): brief description`
- `docs(scope): brief description`
- `test(scope): brief description`
