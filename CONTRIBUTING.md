# Contributing to Panorama Water Tank Monitor

Thank you for your interest in contributing to the **Panorama Water Tank Monitor (WLI NextGen SCADA)** project. We welcome code contributions, documentation improvements, issue reports, and engineering feedback.

---

### 1. Code of Conduct

We are committed to maintaining a professional, respectful, and welcoming collaborative environment. Please adhere to respectful communication in all pull requests, code reviews, and discussions.

---

### 2. Development Workflow & Branching Strategy

1. **Fork & Branch:**
   - Create a feature or bugfix branch off `main`:
     ```bash
     git checkout -b feat/your-feature-name
     # or
     git checkout -b fix/issue-description
     ```
2. **Coding Standards:**
   - **Frontend:** TypeScript with React 18 functional components and hooks. Maintain responsive design tokens (`--app-scale`). Never bypass types with `any` unless strictly required for third-party polyfills.
   - **Backend:** Python 3.11+ with FastAPI, Pydantic v2 schemas, and SQLAlchemy 2.0 type-safe expressions. Follow PEP 8 style conventions.
   - **Security:** Never commit secrets, credentials, API keys, or production database files (`.env`, `*.db`).
3. **Commit Messages:**
   - Follow Conventional Commits:
     - `feat(...)`: New operational capabilities or UI features.
     - `fix(...)`: Bug fixes and error handling.
     - `docs(...)`: Documentation additions or adjustments.
     - `refactor(...)`: Code cleanup and structural improvements.
     - `test(...)`: Unit, integration, or E2E tests.

---

### 3. Verification & Testing Requirements

Before opening a Pull Request, verify that all automated test suites and production builds pass cleanly:

```bash
# 1. Build frontend static bundle
npm run build

# 2. Run backend test suite (All 58 tests must pass)
cd backend
pytest tests/ -v
```

---

### 4. Submitting a Pull Request (PR)

- Provide a clear, descriptive summary of changes in the PR description.
- Reference any related issues or defect IDs (e.g., `Fixes #42`).
- Include screenshots for any UI or responsive layout alterations.
- Ensure no unexpected files (such as local `.venv/`, `.db`, or OS cache files) are committed.
