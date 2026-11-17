# Quectel EC200U TLS/SSL Certificate Setup & Provisioning Guide
## Trusted Root CA Configuration for Render Cloud Production Endpoints

---

## 1. Executive Summary & Trust Model

The Quectel EC200U-CN modem incorporates a hardware-accelerated SSL/TLS cryptographic engine. To ensure absolute data confidentiality, integrity, and protection against Man-in-the-Middle (MitM) attacks across cellular 4G LTE networks, the modem **must strictly validate the server's X.509 digital certificate** during the TLS handshake.

### Production Trust Model (Render Cloud):
- **Remote Host:** `https://<service-name>.onrender.com`
- **Edge Proxy:** Render / Cloudflare Edge Reverse Proxy
- **Certificate Authority (CA):** **Let's Encrypt** (Internet Security Research Group)
- **Root CA Trust Anchor:** **`ISRG Root X1`**
- **Validity Window:** Valid through **June 4, 2035** (Over 8 years of operational lifecycle)
- **Modem Storage Location:** Non-volatile User Flash Storage (`UFS:cacert.pem`)

```mermaid
flowchart TD
    subgraph Modem ["Quectel EC200U Modem (Edge)"]
        UFS["UFS:cacert.pem<br/>(ISRG Root X1 Public CA)"]
        TLSEngine["TLS 1.2/1.3 Engine (Context 1)"]
        UFS -->|Trust Pinning| TLSEngine
    end

    subgraph Internet ["Cellular LTE / Public Internet"]
        TLSEngine -->|1. ClientHello (SNI: hostname)| RenderEdge["Render Cloudflare Edge Proxy"]
        RenderEdge -->|2. ServerHello + Cert Chain| TLSEngine
    end

    subgraph Validation ["On-Chip Cryptographic Validation"]
        TLSEngine -->|Verify Leaf Signature| Intermediate["R3 / E1 Intermediate CA"]
        Intermediate -->|Verify Intermediate Signature| UFS
        TLSEngine -->|Check SNI Hostname Match| HostCheck["Valid: Matches *.onrender.com"]
        TLSEngine -->|Validate Validity Window| DateCheck["Valid: Not Before / Not After"]
    end
```

---

## 2. Certificate Artifact Identification & Format

### 2.1 File Characteristics:
- **Canonical Filename:** `cacert.pem`
- **Format:** RFC 7468 PEM (Base64 ASCII encoded DER within `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----` delimiters)
- **Subject:** `C = US, O = Internet Security Research Group, CN = ISRG Root X1`
- **Issuer:** `C = US, O = Internet Security Research Group, CN = ISRG Root X1` (Self-signed Root CA)
- **Key Algorithm:** RSA 4096-bit
- **Signature Algorithm:** SHA-256 with RSA Encryption
- **SHA-256 Fingerprint:**
  `96:BC:EC:06:26:49:76:F6:29:48:D5:6A:E6:94:FB:7A:B4:42:C8:38:D6:EC:92:DF:D3:5D:80:BC:85:62:3F:80`
- **Byte Size:** Approximately 1,939 bytes

### 2.2 Strict Security Boundary Rules:
1. **NEVER Provision Private Keys (`server.key`):** The modem only requires the **public root certificate**. Uploading a private key to an IoT field unit compromises the entire server infrastructure.
2. **NEVER Disable Certificate Verification (`seclevel=0`):** Setting `seclevel=0` strips all cryptographic authenticity, making the unit vulnerable to rogue cellular IMSI-catchers and DNS hijacking.
3. **NEVER Upload Local Development Self-Signed Certs to Production Modems:** The development certificate generated in Phase 06 (`certificates/development/server.crt`) is valid only for `localhost` and `127.0.0.1` on bench test rigs. Field units talking to Render must trust `ISRG Root X1`.

---

## 3. Step-by-Step Certificate Provisioning via AT Commands

Provisioning can be performed during factory board flashing over USART or via a firmware first-boot routine.

### Step 1: Query Existing Files in Modem UFS Storage
Check if `cacert.pem` is already provisioned in non-volatile flash:
```text
TX >>> AT+QFLST="*"
RX <<< +QFLST: "cacert.pem",1939
       OK
```
If present with the expected size, proceed directly to Step 4. If an outdated certificate exists, delete it first:
```text
TX >>> AT+QFDEL="cacert.pem"
RX <<< OK
```

### Step 2: Initiate Certificate Upload (`AT+QFUPL`)
Transmit the upload command specifying the exact byte length (1,939 bytes) and a 30-second timeout:
```text
TX >>> AT+QFUPL="cacert.pem",1939,30\r\n
RX <<< CONNECT\r\n
```

### Step 3: Stream Certificate Bytes over UART
Immediately upon receiving `CONNECT`, transmit the raw ASCII PEM bytes:
```text
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
...
[1,939 bytes total]
...
-----END CERTIFICATE-----
```
The modem confirms receipt and validates checksum:
```text
RX <<< +QFUPL: 1939,598A
       OK
```

### Step 4: Configure the SSL/TLS Security Context (Context ID = 1)

Execute the full security initialization sequence:

```ini
; 1. Set TLS Protocol to TLS 1.2 / TLS 1.3 (Auto-negotiate)
AT+QSSLCFG="sslversion",1,4
; Expected response: OK

; 2. Enable modern secure cipher suites (AES-128/256 GCM, ChaCha20-Poly1305)
AT+QSSLCFG="ciphersuite",1,0xFFFF
; Expected response: OK

; 3. Enforce Server Authentication (Validates server cert against CA)
AT+QSSLCFG="seclevel",1,1
; Expected response: OK

; 4. Bind Trusted CA to uploaded cacert.pem
AT+QSSLCFG="cacert",1,"cacert.pem"
; Expected response: OK

; 5. Enforce Certificate Validity Dates (Strict NotBefore / NotAfter enforcement)
AT+QSSLCFG="checkcert",1,1
; Expected response: OK

; 6. Enable Server Name Indication (SNI) - MANDATORY for Render / Cloudflare
AT+QSSLCFG="sni",1,1
; Expected response: OK

; 7. Ignore Local RTC Time for Initial TLS Handshake
; Prevents handshake abort before NITZ network time sync has completed
AT+QSSLCFG="ignorelocaltime",1,1
; Expected response: OK
```

### Step 5: Bind SSL Security Context to Embedded HTTPS Client

```ini
; Bind HTTP client to active PDP Context 1
AT+QHTTPCFG="contextid",1
; Expected response: OK

; Bind HTTP client to configured SSL Context 1
AT+QHTTPCFG="sslctxid",1
; Expected response: OK

; Enable HTTP Response Header Output for diagnostic parsing
AT+QHTTPCFG="responseheader",1
; Expected response: OK

; Enable Custom Request Headers (Required for Authorization: Bearer <token>)
AT+QHTTPCFG="requestheader",1
; Expected response: OK
```

---

## 4. Automated Verification & Testing Sequence

To verify the TLS configuration prior to running full telemetry cycles, execute the following diagnostic test:

### Test Handshake to Public Endpoint (`GET /api/health`):
```text
TX >>> AT+QHTTPURL=52,30
RX <<< CONNECT
TX >>> https://panorama-wli-https-receiver.onrender.com/api/health
RX <<< OK

TX >>> AT+QHTTPGET=60
RX <<< OK
URC <<< +QHTTPGET: 0,200,88

TX >>> AT+QHTTPREAD=30
RX <<< CONNECT
HTTP/1.1 200 OK
Date: Tue, 17 Nov 2026 10:15:00 GMT
Content-Type: application/json
...
{"status":"online","application":"Panorama WLI HTTPS Receiver","version":"0.1.0"}
OK
+QHTTPREAD: 0
```

---

## 5. Troubleshooting & Error Diagnostic Matrix

| Observed Result | Root Cause | Remediation |
|---|---|---|
| `+QHTTPGET: 714,...` | **SSL Handshake Failure** | 1. Verify `cacert.pem` exists via `AT+QFLST`.<br/>2. Confirm SNI is enabled: `AT+QSSLCFG="sni",1,1`.<br/>3. Verify `ignorelocaltime` is set to `1`. |
| `+QHTTPGET: 702,...` | **HTTPS Request Timeout** | Server cold-start delay. Increase response timeout: `AT+QHTTPGET=60` or `AT+QHTTPPOST=...,60`. |
| `+QHTTPGET: 716,...` | **Socket Closed by Peer** | TLS cipher mismatch or unsupported TLS version. Verify `AT+QSSLCFG="sslversion",1,4` and `ciphersuite=0xFFFF`. |
| `+CME ERROR: 407` | **File Not Found** | Certificate has not been uploaded to UFS. Repeat `AT+QFUPL="cacert.pem",...`. |
| `+CME ERROR: 418` | **Flash Storage Full** | UFS full. Delete orphaned files via `AT+QFDEL="<file>"`. |
