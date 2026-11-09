# 09. Backend Security & Runtime Hardening
## Panorama Water Tank Monitor (FastAPI SCADA Daemon)

**Audit Date:** November 9, 2026  
**Target Codebase:** `backend/app/`  

---

### 1. HTTP Security Headers Configuration

The backend HTTP middleware (`backend/app/main.py:add_security_headers`) injects a comprehensive suite of defensive headers:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' ws: wss: https://broker.hivemq.com:8884 https://industrial.api.ubidots.com;
```

#### Remediation Note on Content Security Policy:
- Removed `'unsafe-eval'` from `script-src` to eliminate arbitrary string-to-code execution in browser contexts.
- Explicitly restricted `connect-src` to whitelisted WebSocket, MQTT broker, and cloud telemetry endpoints.

---

### 2. Path Traversal & Static Asset Sandboxing

#### Initial Vulnerability:
The SPA fallback route originally executed:
```python
candidate = os.path.join(_static_dir, full_path)
if os.path.isfile(candidate):
    return FileResponse(candidate)
```
This allowed requests such as `GET /../../.env` to resolve outside `_static_dir` and return raw backend configuration secrets.

#### Verified Remediation Applied:
```python
clean_path = os.path.normpath(full_path).lstrip("/\\")
candidate = os.path.realpath(os.path.join(_static_dir, clean_path))
static_real = os.path.realpath(_static_dir)

try:
    common = os.path.commonpath([static_real, candidate])
except ValueError:
    return JSONResponse(status_code=404, content={"detail": "Not Found"})

if common == static_real and os.path.isfile(candidate):
    base_name = os.path.basename(candidate)
    if not base_name.startswith("."):
        return FileResponse(candidate)
```
This guarantees that:
1. `candidate` is strictly canonicalized using `os.path.realpath()`.
2. `os.path.commonpath()` enforces that the target resides inside `_static_dir`.
3. Dotfiles / hidden files (`.env`, `.git`, etc.) are blocked.
4. Non-matching paths gracefully return the SPA `index.html` shell.

---

### 3. Cross-Origin Resource Sharing (CORS) Restriction

#### Initial Vulnerability:
`allow_origin_regex` previously matched `^https://.*\.github\.io$`, allowing any external third party hosting pages on GitHub Pages to send authenticated cross-origin requests.

#### Verified Remediation Applied:
- Restricted allowed origin regex strictly to loopback addresses and the verified repository origin:
  `r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://soumikbur\.github\.io$"`
- Removed wildcard `*` from configured origins list.
- Automated regression test `test_cors_tenant_isolation` verifies that rogue GitHub Pages tenants are rejected with no CORS reflection.
