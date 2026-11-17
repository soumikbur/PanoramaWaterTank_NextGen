# Certificate Management & TLS Architecture

## Purpose
This directory manages certificate documentation and trusted Root CA references for cellular edge modems (Quectel EC200U-CN) communicating with the Panorama Water Tank HTTPS Receiver.

---

## Architectural Decisions

1. **Render-Managed TLS Certificates:**
   - The production deployment on Render automatically provisions and renews TLS certificates (via Let's Encrypt or DigiCert) at the cloud edge.
   - We do **not** need to purchase an SSL/TLS certificate.
   - We do **not** need to generate or configure self-signed public certificates for production.

2. **Modem Trust Store Requirement:**
   - The Quectel EC200U modem requires a trusted Root CA certificate stored in its onboard non-volatile file system (`UFS:`) to validate the server's certificate chain during hardware-accelerated TLS handshakes (`AT+QSSLCFG="seclevel",1,1`).
   - The specific Root CA certificate (e.g. `ISRG Root X1` or `DigiCert Global Root CA`) will be determined upon production deployment in Phase 06 once Render assigns the public domain.

3. **Cryptographic Secret Hygiene:**
   - **Never commit server private keys** (`*.key`, `*.pem`) to this repository.
   - Certificates are strictly decoupled from public web assets.
   - Local development uses standard HTTP loopback (`http://127.0.0.1:8000`), whereas production enforces HTTPS (`https://...`).
