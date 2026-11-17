# TLS / SSL Security & HTTPS Configuration Specification

## 1. Executive Summary

This document specifies the Transport Layer Security (TLS) configuration, X.509 certificate management, and encryption architecture for the **Panorama Water Tank Monitor HTTPS Receiver**.

The system implements a dual-environment security strategy:
1. **Local Development & Testing Environment:** Uses an automated, locally generated self-signed RSA 2048-bit certificate with strict Subject Alternative Name (SAN) bindings.
2. **Production Environment:** Uses platform-managed certificates (e.g. Render/Cloudflare) terminated at the infrastructure edge with zero manual certificate purchasing.

---

## 2. TLS Architecture & Threat Model

```
+-------------------------------------------------------------------------+
|                  CELLULAR / CLIENT APPLICATION LAYER                    |
|                                                                         |
|   +-----------------------+              +--------------------------+   |
|   |  Quectel EC200U-CN    |              | Local Laboratory Client  |   |
|   |  Embedded 4G Modem    |              | (cURL / Python / Web UI) |   |
|   +-----------+-----------+              +------------+-------------+   |
|               |                                       |                 |
|               | TLS 1.2 / 1.3 Handshake               |                 |
|               | Validates Root CA                     |                 |
+---------------|---------------------------------------|-----------------+
                | (Encrypted TLS Tunnel)                |
                v                                       v
+-------------------------------------------------------------------------+
|                    TRANSPORT SECURITY GATEWAY                           |
|                                                                         |
|   LOCAL DEVELOPMENT:                      PRODUCTION DEPLOYMENT:        |
|   - Uvicorn Direct TLS                    - Cloud Reverse Proxy         |
|   - Port 8443                             - Port 443                    |
|   - Self-Signed server.crt                - Managed Let's Encrypt Cert  |
|   - Strong AEAD Ciphers                   - HTTP-to-HTTPS Auto-Redirect |
|   - TLS 1.2 / TLS 1.3 Only                - X-Forwarded-Proto Aware     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       APPLICATION REST API                              |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                   FastAPI Subsystem Layer                       |   |
|   |  - Constant-Time Bearer Token Authentication                    |   |
|   |  - Dynamic Telemetry Extraction & Bounded Storage               |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

---

## 3. Local Self-Signed Certificate Generation

Local certificates are generated using the standard-library / Python `cryptography` engine via:
```powershell
python scripts/generate_certificate.py
```

### 3.1. Certificate Cryptographic Attributes
- **Format:** X.509 Version 3 (RFC 5280)
- **Key Algorithm:** RSA 2048-bit (65537 public exponent)
- **Signature Algorithm:** `sha256WithRSAEncryption` (SHA-256 digest)
- **Key Usage (Critical):**
  - `digitalSignature` (for entity authentication and handshake key exchange signing)
  - `keyEncipherment` (for RSA key exchange protection)
- **Extended Key Usage (EKU):**
  - `serverAuth` (TLS Web Server Authentication, OID `1.3.6.1.5.5.7.3.1`)
  - `clientAuth` (TLS Web Client Authentication, OID `1.3.6.1.5.5.7.3.2`)
- **Subject & Issuer:**
  - `CN=localhost, OU=IoT Engineering Lab, O=Panorama Water Tank Monitor, L=Kolkata, ST=West Bengal, C=IN`
- **Validity Window:** 365 Days (with 5-minute backdating to avoid clock-skew rejection).

### 3.2. Subject Alternative Name (SAN) Configuration
Modern TLS implementations (including Chrome, Safari, Python `ssl`, and embedded modem stacks) strictly reject certificates relying solely on Common Name (CN). The generator includes:
- `DNSName: localhost`
- `IPAddress: 127.0.0.1`
- Optional `--lan-ip <address>` for local Wi-Fi / Ethernet hardware bench testing.

---

## 4. Private Key Protection & Git Hygiene

- **Private Key Path:** `certificates/development/server.key`
- **Permissions:** Restricted read-only permissions (`0600` on POSIX systems).
- **Git Exclusion:** Explicitly ignored in `.gitignore`:
  ```gitignore
  certificates/development/server.key
  certificates/production/*
  *.key
  *.pem
  .env
  ```
- **Verification:** Automated tests verify that `server.key` exists locally for server startup but is untracked by Git.

---

## 5. Server Startup Configuration

The application supports dual-mode operation via [scripts/run_server.py](file:///C:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/HTTPS_Server/scripts/run_server.py):

### Mode A: Development HTTP (Port 8000)
```powershell
python scripts/run_server.py --mode http --port 8000
```
or standard Uvicorn:
```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Mode B: Development HTTPS (Port 8443)
```powershell
python scripts/run_server.py --mode https --port 8443
```
or direct Uvicorn:
```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8443 --ssl-certfile certificates/development/server.crt --ssl-keyfile certificates/development/server.key
```

### 5.1. TLS Protocol Version & Cipher Enforcement
To prevent downgrade attacks, the server explicitly configures:
- **Protocol Versions:** Enforces `ssl.PROTOCOL_TLS_SERVER`. Disables obsolete SSLv2, SSLv3, TLS 1.0, and TLS 1.1.
- **Modern Cipher Suites:**
  - `ECDHE-ECDSA-AES128-GCM-SHA256`
  - `ECDHE-RSA-AES128-GCM-SHA256`
  - `ECDHE-ECDSA-AES256-GCM-SHA384`
  - `ECDHE-RSA-AES256-GCM-SHA384`
  - `DHE-RSA-AES128-GCM-SHA256`
  - `DHE-RSA-AES256-GCM-SHA384`
- Weak ciphers (RC4, 3DES, MD5, export ciphers, and unauthenticated null ciphers) are disabled.

---

## 6. Certificate Trust & Testing Procedures

### 6.1. Trust Store Hierarchy Comparison

| Trust Store Entity | Scope & Usage | Behavior with Self-Signed Certificate |
|---|---|---|
| **Local Client (cURL / Python)** | Specific CLI or test script | Trust established via `--cacert server.crt` or `httpx.Client(verify="server.crt")` |
| **Operating System (Windows)** | System-wide (CertMgr.msc) | Untrusted by default; produces security prompt unless manually imported into "Trusted Root Certification Authorities" |
| **Web Browser (Chrome/Edge)** | User browsing sessions | Warns `NET::ERR_CERT_AUTHORITY_INVALID` until user accepts test certificate |
| **Embedded Modem (Quectel EC200U)** | Non-volatile flash (`UFS:cacert.pem`) | Firmware validates server cert against the exact PEM uploaded to modem NVRAM |

### 6.2. Local cURL Testing (Windows Syntax)
```powershell
# 1. Health check over HTTPS
curl --cacert certificates/development/server.crt https://127.0.0.1:8443/api/health

# 2. Authenticated telemetry POST over HTTPS
curl --cacert certificates/development/server.crt `
  -H "Authorization: Bearer dev_secret_token_123" `
  -H "Content-Type: application/json" `
  -X POST `
  -d "{\"device_id\":\"WLI_TEST_001\",\"water_level_cm\":125.5,\"raw_voltage\":1.25}" `
  https://127.0.0.1:8443/api/telemetry

# 3. Query latest telemetry over HTTPS
curl --cacert certificates/development/server.crt `
  -H "Authorization: Bearer dev_secret_token_123" `
  https://127.0.0.1:8443/api/telemetry/latest?device_id=WLI_TEST_001

# 4. Upload telemetry file over HTTPS
curl --cacert certificates/development/server.crt `
  -H "Authorization: Bearer dev_secret_token_123" `
  -F "file=@telemetry_sample.json;type=application/json" `
  https://127.0.0.1:8443/api/telemetry/file
```

---

## 7. HTTP to HTTPS Redirection Strategy

1. **Development Policy:**
   - Redirection is **NOT** forced locally.
   - Developers and test suites can independently query plain HTTP (port 8000) and secure HTTPS (port 8443) without unexpected redirect loops.

2. **Production Policy:**
   - In production (e.g. Render/Cloudflare), TLS terminates at the edge reverse proxy.
   - The edge proxy automatically redirects all incoming port 80 traffic to port 443 before reaching the container.
   - FastAPI inspects the trusted `X-Forwarded-Proto: https` header.

---

## 8. Production Certificate Strategy

- **Zero-Cost Automated Issuance:** Production platforms (Render, Cloudflare, AWS) provide automated, zero-cost TLS certificates backed by trusted root CAs (Let's Encrypt / DigiCert).
- **No Manual Purchasing:** No external SSL certificates need to be purchased.
- **Hosting Boundary:** GitHub Pages serves static files only and cannot execute the Python FastAPI backend. The backend will deploy to a Python-capable PaaS (e.g. Render).
- **Modem Trust Alignment:** The Quectel EC200U-CN only requires the public root certificate (`ISRG Root X1`) stored in its flash memory (`UFS:`), which remains valid through 2035.
