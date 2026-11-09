# Panorama Water Tank Monitor — Local Development Setup Guide
## Complete Developer Prerequisites & Workstation Configuration

---

### 1. Prerequisites

Before setting up the repository, ensure the following developer runtimes are installed on your workstation:

- **Node.js:** `>= 20.0.0` (LTS recommended, tested on Node 20.x & 24.x)
- **npm:** `>= 10.0.0`
- **Python:** `>= 3.11.0` (Tested on Python 3.11 & 3.12 64-bit)
- **Git:** `>= 2.40.0`
- **C++ Compiler (Optional for Legacy Desktop):** MSVC 2022 (Windows) / GCC 12+ (Linux) with CMake 3.25+ and Qt 6.8

---

### 2. Repository Cloning & Workspace Initialization

```bash
# Clone the repository
git clone https://github.com/soumikbur/PanoramaWaterTank_NextGen.git
cd PanoramaWaterTank_NextGen

# Install root dependencies and frontend workspace packages
npm ci
```

---

### 3. Environment Configuration

Copy the example environment template:

```bash
cp config/.env.example backend/.env
```

Review `backend/.env` and adjust port bindings or database URLs as needed for your local setup.

---

### 4. Running the Complete Development Stack

#### Option A: Frontend Static Preview Server
```bash
# Starts local zero-cache preview server on http://127.0.0.1:3001/
npm run preview
```

#### Option B: Full Stack (FastAPI Backend + Vite HMI)
```bash
# Terminal 1: Backend Daemon
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend Dev Server
npm run dev
```

Visit `http://127.0.0.1:3001/` or `http://127.0.0.1:8000/` in your browser.
