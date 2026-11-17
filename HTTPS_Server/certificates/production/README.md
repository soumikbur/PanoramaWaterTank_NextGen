# Production TLS Certificates & Strategy

## 1. Production Architecture Overview
In production deployment (e.g. Render, Cloudflare, AWS), TLS/HTTPS is managed by the cloud platform or reverse proxy terminating at the infrastructure edge.
- Automated certificate provisioning: Automated Let's Encrypt / DigiCert issuance and renewal.
- Zero manual certificate purchasing: Public hosting providers manage trusted root CA chains at no additional cost.
- Application layer: FastAPI runs behind the reverse proxy, receiving decrypted traffic with appropriate `X-Forwarded-Proto: https` headers.

## 2. Security Boundaries
- Never commit private keys (`*.key`) or production server certificates to Git.
- Cellular edge modems (Quectel EC200U-CN) only need the public Root CA (e.g. `ISRG Root X1` for Let's Encrypt) stored in modem non-volatile flash (`UFS:`).
