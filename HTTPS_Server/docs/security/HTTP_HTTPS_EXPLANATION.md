# Technical Specification: HTTP, HTTPS, and TLS Fundamentals

## 1. Overview and Core Distinction

### 1.1. Hypertext Transfer Protocol (HTTP)
HTTP is an application-layer request-response protocol operating over plain TCP (default port 80). 
- **Cleartext Transmission:** Application data—including headers, payloads, URL paths, and credentials—is transmitted in unencrypted plaintext across the public network.
- **Vulnerabilities:** In transit across cellular gateways, ISPs, and public Wi-Fi networks, HTTP is exposed to passive eavesdropping (sniffing), data tampering (man-in-the-middle packet injection), and server impersonation (DNS spoofing).

### 1.2. Hypertext Transfer Protocol Secure (HTTPS)
HTTPS is HTTP encapsulated within a Transport Layer Security (TLS) session (default port 443/8443).
HTTPS guarantees three fundamental security properties:
1. **Confidentiality:** Symmetrical encryption ensures only the client and server can read payload contents.
2. **Integrity:** Message Authentication Codes (HMAC) or Authenticated Encryption with Associated Data (AEAD) ciphers guarantee that transmitted bytes cannot be modified or replayed undetected.
3. **Authentication:** Server identity is cryptographically validated using public-key cryptography and X.509 digital certificates.

---

## 2. Cryptographic Foundations

### 2.1. Public/Private Key Cryptography (Asymmetric)
Asymmetric cryptography uses a mathematically linked key pair:
- **Private Key:** Maintained strictly secret on the server. Used to sign data or decrypt key exchange parameters.
- **Public Key:** Published openly within the server's X.509 certificate. Used by clients to verify digital signatures or encrypt session secrets.
- In this project, an RSA 2048-bit (or 4096-bit) key pair is generated for local testing.

### 2.2. Symmetric Cryptography (Bulk Transport)
Because asymmetric operations are computationally expensive for cellular modems and embedded microcontrollers, TLS uses asymmetric cryptography only during the initial handshake. Once identity is verified, both peers derive shared symmetric keys (e.g., AES-GCM or ChaCha20-Poly1305) for high-speed, low-power bulk data encryption.

---

## 3. The TLS Handshake (TLS 1.2 & TLS 1.3)

```
Client (EC200U Modem / Browser)                     Server (FastAPI / Uvicorn)
      |                                                        |
      | 1. ClientHello (TLS version, ciphers, SNI, random)     |
      |------------------------------------------------------->|
      |                                                        |
      | 2. ServerHello (Selected cipher, server random)        |
      |    + Certificate (X.509 chain containing public key)   |
      |    + Key Exchange Params (ECDHE)                       |
      |    + ServerHelloDone                                   |
      |<-------------------------------------------------------|
      |                                                        |
      | 3. Client Verification:                                |
      |    - Validates signature against Root CA trust store   |
      |    - Checks validity dates & Subject Alternative Names |
      |    - Computes Pre-Master Secret & sends Key Exchange   |
      |------------------------------------------------------->|
      |                                                        |
      | 4. Finished (Encrypted Handshake Complete)             |
      |<======================================================>|
      |                                                        |
      | 5. Encrypted Application Data (HTTP POST JSON payload) |
      |<======================================================>|
```

In **TLS 1.3**, the round-trip count is reduced from 2 RTT to 1 RTT (or 0-RTT resumption), accelerating connection establishment for constrained cellular devices like the Quectel EC200U.

---

## 4. X.509 Digital Certificates & Verification

### 4.1. Structure of an X.509 Certificate
An X.509 certificate binds a public key to an authenticated identity (hostname or IP address). Standard attributes include:
- **Version & Serial Number:** Unique identifier assigned by the issuer.
- **Issuer:** Distinguished Name (DN) of the Certificate Authority that signed the certificate.
- **Validity Period:** `NotBefore` and `NotAfter` UTC timestamps.
- **Subject:** Distinguished Name of the entity being certified.
- **Subject Public Key Info:** Algorithm identifier (e.g. RSA) and public key bytes.
- **Subject Alternative Name (SAN):** Crucial modern extension specifying authorized domain names (e.g. `DNS:localhost`) and IP addresses (e.g. `IP:127.0.0.1`). Modern clients reject certificates that rely solely on Common Name (CN).
- **Key Usage & Extended Key Usage (EKU):** Defines permitted cryptographic applications (e.g. `digitalSignature`, `keyEncipherment`, `serverAuth`).
- **Signature Algorithm & Signature Value:** Cryptographic signature proving the CA signed this certificate.

### 4.2. Certificate Authority (CA) & The Chain of Trust
1. **Root CA:** A globally trusted, self-signed root authority whose certificate resides in the operating system, browser, or modem firmware trust store (e.g. `ISRG Root X1`).
2. **Intermediate CA:** Issued by the Root CA to sign end-entity certificates. This keeps the Root CA offline in secure air-gapped hardware.
3. **Leaf / End-Entity Certificate:** The certificate presented by the web server (e.g. `server.crt`).
4. **Validation Walk:** The client verifies the leaf's signature using the intermediate's public key, and verifies the intermediate's signature using the trusted Root CA public key.

### 4.3. Domain Validation (DV)
In production, Certificate Authorities issue Domain Validated certificates by verifying that the applicant controls the target DNS record or responds to an HTTP challenge at `http://<domain>/.well-known/acme-challenge/`.

### 4.4. Certificate Expiration & Revocation
Certificates must expire periodically (typically 90 days for Let's Encrypt, or up to 398 days for commercial CAs) to mitigate compromised private keys and outdated algorithms. Clients check expiration against the device's real-time clock (RTC).

---

## 5. Self-Signed vs. Publicly Trusted Certificates

| Characteristic | Self-Signed Certificate (Local Development) | Publicly Trusted Certificate (Production) |
|---|---|---|
| **Issuer** | The server itself (`Issuer == Subject`) | Publicly audited Certificate Authority |
| **Trust Establishment** | Must be explicitly installed in testing client | Pre-installed in OS, browser, & modem firmware |
| **Cost** | Free (generated via OpenSSL / Python) | Free (Let's Encrypt / hosting PaaS) |
| **Domain Validation** | None (can sign for `localhost` or LAN IP) | Strict automated DNS / HTTP ACME challenge |
| **Use Case** | Local TLS development, testing, CI/CD | Public IoT receiver, live fleet telemetry |

---

## 6. Relevance to the Panorama Water Tank Monitor Project

1. **Local Development (Phase 06):**
   - We generate a self-signed RSA 2048-bit certificate with SAN entries `DNS:localhost`, `IP:127.0.0.1`.
   - The certificate is provided to local testing clients (`curl --cacert`, `httpx.Client(verify=...)`) to test full TLS handshake verification without disabling security.

2. **Embedded Cellular Modem (Quectel EC200U-CN):**
   - The modem firmware validates server certificates during `AT+QHTTPPOST` using certificates stored in its non-volatile file system (`UFS:`).
   - In production, the public Root CA (e.g. `ISRG Root X1`) is flashed to the modem, allowing it to validate Render's automated TLS certificate seamlessly.
