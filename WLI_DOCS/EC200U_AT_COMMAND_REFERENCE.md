# Quectel EC200U AT Command Reference Manual
## Firmware Revision: EC200UCNAAR03A03M08 (Series: EC200U-CN / EC200U-CNAA-N05-SGNSA)

---

## 1. Document Scope & Hardware Profile
This document provides an authoritative AT command specification for the **Quectel EC200U-CN LTE Cat-1** wireless cellular communication module. All commands, parameter formats, timeouts, and response codes documented herein are verified against **Quectel EC200U Firmware Revision `EC200UCNAAR03A03M08`** operating on the **Panorama Water Tank Monitor (WLI)** edge hardware platform.

### Hardware Interfaces:
- **Primary Host Interface:** High-speed Universal Asynchronous Receiver-Transmitter (UART)
- **Default Baud Rate:** 115200 bps
- **Data Framing:** 8 Data Bits, No Parity, 1 Stop Bit (8-N-1)
- **Flow Control:** None (Hardware RTS/CTS disabled by default)
- **Electrical Levels:** 3.3V CMOS Logic
- **Primary Carrier Profile:** Airtel India (MCC: 404, MNC: 31, APN: `airtelgprs.com`) / Dedicated Railway Private APN

---

## 2. Basic Modem Control & Diagnostic Commands

### 2.1 AT — Modem Attention & Synchronization
- **Syntax:** `AT\r\n`
- **Response:** `OK\r\n`
- **Timeout:** 300 ms
- **Purpose:** Synchronizes host UART autobaud rate and confirms the AT command parser is active.
- **Example:**
  ```text
  TX >>> AT\r\n
  RX <<< OK\r\n
  ```

### 2.2 ATE — Command Echo Configuration
- **Syntax:** `ATE<value>\r\n`
  - `0`: Echo disabled (Recommended for microcontroller firmware to eliminate UART buffer overhead).
  - `1`: Echo enabled (Default, recommended for interactive terminal debugging).
- **Response:** `OK\r\n`
- **Timeout:** 300 ms

### 2.3 AT+CMEE — Extended Error Report Configuration
- **Syntax:** `AT+CMEE=<mode>\r\n`
  - `0`: Disable error reporting (Outputs plain `ERROR`).
  - `1`: Enable numeric error codes (`+CME ERROR: <err>`).
  - `2`: Enable verbose text error strings (`+CME ERROR: <description>`). *(Recommended)*
- **Response:** `OK\r\n`
- **Timeout:** 300 ms

### 2.4 ATI — Product Information & Firmware Identification
- **Syntax:** `ATI\r\n`
- **Response:**
  ```text
  Quectel
  EC200U
  Revision: EC200UCNAAR03A03M08
  OK
  ```
- **Timeout:** 500 ms

### 2.5 AT+GSN — Read International Mobile Equipment Identity (IMEI)
- **Syntax:** `AT+GSN\r\n`
- **Response:** `<15-digit IMEI>\r\n\r\nOK\r\n`
- **Timeout:** 500 ms

---

## 3. SIM Interface & Authentication Commands

### 3.1 AT+CPIN — Query Subscriber Identity Module (SIM) Status
- **Syntax:** `AT+CPIN?\r\n`
- **Response:** `+CPIN: <code>\r\n\r\nOK\r\n`
- **Common Response Codes:**
  - `READY`: SIM is present, PIN unlocked, and operational.
  - `SIM PIN`: SIM requires 4-to-8 digit PIN code (`AT+CPIN="<pin>"`).
  - `SIM PUK`: SIM blocked; requires Personal Unblocking Key.
  - `SIM NOT INSERTED`: No physical SIM detected in carrier tray.
- **Timeout:** 5,000 ms (Allow initial SIM power-up and ATR read cycle).

### 3.2 AT+QCCID — Read USIM Integrated Circuit Card Identifier (ICCID)
- **Syntax:** `AT+QCCID\r\n`
- **Response:** `+QCCID: <20-digit ICCID>\r\n\r\nOK\r\n`
- **Timeout:** 500 ms

---

## 4. Radio Metrics & Network Registration Commands

### 4.1 AT+CSQ — Signal Quality Report
- **Syntax:** `AT+CSQ\r\n`
- **Response:** `+CSQ: <rssi>,<ber>\r\n\r\nOK\r\n`
- **Parameters:**
  - `<rssi>`: Received Signal Strength Indication (0 to 31, or 99 if unknown).
    - `0`: $-113\text{ dBm}$ or less (Marginal / Unusable)
    - `1`: $-111\text{ dBm}$
    - `2`–`9`: Marginal ($-109$ to $-95\text{ dBm}$)
    - `10`–`14`: OK ($-93$ to $-85\text{ dBm}$)
    - `15`–`19`: Good ($-83$ to $-75\text{ dBm}$)
    - `20`–`31`: Excellent ($-73$ to $-51\text{ dBm}$)
    - `99`: Not detectable or no signal
  - `<ber>`: Bit Error Rate (0–7 percentage scale, 99 = unknown).
- **Timeout:** 300 ms

### 4.2 AT+CEREG — EPS Network Registration Status (LTE)
- **Syntax:** `AT+CEREG?\r\n`
- **Response:** `+CEREG: <n>,<stat>\r\n\r\nOK\r\n`
- **Parameters:**
  - `<stat>`:
    - `0`: Not registered; MT is not currently searching an operator.
    - `1`: **Registered, home network.**
    - `2`: Not registered, but MT is currently searching a new operator.
    - `3`: Registration denied.
    - `4`: Unknown (e.g. out of E-UTRAN coverage).
    - `5`: **Registered, roaming.**
- **Timeout:** 500 ms

### 4.3 AT+CGATT — Packet Domain Service Attachment
- **Syntax Query:** `AT+CGATT?\r\n`
- **Response:** `+CGATT: <state>\r\n\r\nOK\r\n` (`1` = Attached, `0` = Detached)
- **Syntax Execution:** `AT+CGATT=1\r\n` (Attach to packet services)
- **Timeout:** 15,000 ms

### 4.4 AT+COPS — Operator Selection & Identification
- **Syntax Query:** `AT+COPS?\r\n`
- **Response:** `+COPS: <mode>,<format>,"<oper>",<act>\r\n\r\nOK\r\n`
- **Parameters:**
  - `<mode>`: `0` (Automatic), `1` (Manual), `2` (Deregister).
  - `<oper>`: Current serving operator name string (e.g. `"IND airtel"`).
  - `<act>`: Radio Access Technology (`7` = E-UTRAN / LTE).
- **Timeout:** 1,000 ms

---

## 5. Packet Data Protocol (PDP) & Cellular Data Connection

### 5.1 AT+QICSGP — Configure TCP/IP Context APN Profile
- **Syntax:** `AT+QICSGP=<contextID>,<context_type>,"<APN>","<username>","<password>",<auth_type>\r\n`
- **Parameters:**
  - `<contextID>`: `1` (Primary user context ID, range 1–7).
  - `<context_type>`: `1` (IPv4), `2` (IPv4v6), `3` (IPv6).
  - `<APN>`: Access Point Name string (e.g. `"airtelgprs.com"`).
  - `<username>`: Carrier authentication username (empty string `""` for Airtel).
  - `<password>`: Carrier authentication password (empty string `""` for Airtel).
  - `<auth_type>`: `0` (None), `1` (PAP), `2` (CHAP), `3` (PAP or CHAP).
- **Response:** `OK\r\n`
- **Timeout:** 1,000 ms

### 5.2 AT+QIACT — Activate Embedded TCP/IP PDP Context
- **Syntax:** `AT+QIACT=<contextID>\r\n`
- **Response:** `OK\r\n` (on success) or `ERROR\r\n` / `+CME ERROR: <err>`
- **Timeout:** 30,000 ms
- **Example:**
  ```text
  TX >>> AT+QIACT=1\r\n
  RX <<< OK\r\n (Elapsed: 420ms)
  ```

### 5.3 AT+QIACT? — Query Active PDP Contexts & Assigned IP Addresses
- **Syntax:** `AT+QIACT?\r\n`
- **Response:** `+QIACT: <contextID>,<context_state>,<context_type>,"<IP_address>"\r\n\r\nOK\r\n`
- **Parameters:**
  - `<context_state>`: `1` (Active), `0` (Inactive).
  - `<IP_address>`: Dotted-decimal IPv4 string (e.g. `"100.85.63.225"`).
- **Timeout:** 1,000 ms

### 5.4 AT+QIDEACT — Deactivate TCP/IP Context
- **Syntax:** `AT+QIDEACT=<contextID>\r\n`
- **Response:** `OK\r\n`
- **Timeout:** 15,000 ms

---

## 6. SSL / TLS Configuration & Security Engine

### 6.1 AT+QSSLCFG — Configure TLS Context Parameters
The EC200U provides hardware-accelerated TLS engines configured via Context IDs (`sslctxid`).

#### A. TLS Protocol Version:
- **Syntax:** `AT+QSSLCFG="sslversion",<sslctxid>,<version>\r\n`
- **Parameters:**
  - `<version>`:
    - `1`: TLS 1.0 (Insecure, deprecated)
    - `2`: TLS 1.1 (Insecure, deprecated)
    - `3`: TLS 1.2 *(Standard Industrial)*
    - `4`: All supported versions (TLS 1.2 / TLS 1.3 negotiated automatically) *(Recommended)*
- **Response:** `OK\r\n`

#### B. Cipher Suite Selection:
- **Syntax:** `AT+QSSLCFG="ciphersuite",<sslctxid>,<ciphersuite>\r\n`
- **Parameters:**
  - `0xFFFF`: All supported modern secure cipher suites (AES-GCM, ChaCha20).
- **Response:** `OK\r\n`

#### C. Certificate Authentication Security Level (`seclevel`):
- **Syntax:** `AT+QSSLCFG="seclevel",<sslctxid>,<seclevel>\r\n`
- **Parameters:**
  - `0`: No authentication (Insecure; transmits over unverified TLS tunnel).
  - `1`: **Server Authentication** (Modem validates remote server X.509 certificate against provisioned CA certificate). *(MANDATORY FOR PRODUCTION)*
  - `2`: Mutual Authentication (Server validates client certificate, modem validates server certificate).
- **Response:** `OK\r\n`

#### D. Trusted Root CA Certificate Binding:
- **Syntax:** `AT+QSSLCFG="cacert",<sslctxid>,"<cert_filename>"\r\n`
- **Parameters:**
  - `<cert_filename>`: Exact filename stored in UFS storage (e.g. `"cacert.pem"` representing Let's Encrypt ISRG Root X1).
- **Response:** `OK\r\n`

#### E. Strict Certificate Expiration Checking:
- **Syntax:** `AT+QSSLCFG="checkcert",<sslctxid>,<check>\r\n`
- **Parameters:** `1` (Enable validity date window enforcement), `0` (Ignore expiration).
- **Response:** `OK\r\n`

#### F. Server Name Indication (SNI):
- **Syntax:** `AT+QSSLCFG="sni",<sslctxid>,<enable>\r\n`
- **Parameters:** `1` (Transmit hostname in ClientHello for Cloudflare/Render virtual hosting). *(MANDATORY)*
- **Response:** `OK\r\n`

#### G. Ignore RTC Local Time for Initial Handshake:
- **Syntax:** `AT+QSSLCFG="ignorelocaltime",<sslctxid>,<enable>\r\n`
- **Parameters:** `1` (Prevents TLS abort before NITZ network time has synchronized the RTC).
- **Response:** `OK\r\n`

---

## 7. Embedded HTTPS Application Commands

### 7.1 AT+QHTTPCFG — Configure HTTP Client Parameters

#### A. Bind to Active PDP Context:
- **Syntax:** `AT+QHTTPCFG="contextid",<contextID>\r\n` (e.g. `AT+QHTTPCFG="contextid",1`)
- **Response:** `OK\r\n`

#### B. Bind to TLS Security Profile:
- **Syntax:** `AT+QHTTPCFG="sslctxid",<sslctxid>\r\n` (e.g. `AT+QHTTPCFG="sslctxid",1`)
- **Response:** `OK\r\n`

#### C. Enable Response Header Output:
- **Syntax:** `AT+QHTTPCFG="responseheader",<enable>\r\n` (`1` = Return HTTP status line and response headers).
- **Response:** `OK\r\n`

#### D. Configure Custom Request Headers:
- **Syntax:** `AT+QHTTPCFG="requestheader",<enable>\r\n`
  - `0`: Standard default headers only.
  - `1`: Custom HTTP request headers supplied during POST transaction (Required for `Authorization: Bearer <token>`).
- **Response:** `OK\r\n`

### 7.2 AT+QHTTPURL — Specify Remote Server URL
- **Syntax:** `AT+QHTTPURL=<url_length>,<input_timeout>\r\n`
- **Procedure:**
  1. Host sends `AT+QHTTPURL=52,30\r\n`
  2. Modem responds with: `CONNECT\r\n`
  3. Host transmits exact URL characters: `https://panorama-wli-https-receiver.onrender.com\r\n`
  4. Modem responds with: `OK\r\n`
- **Timeout:** `<input_timeout>` seconds.

### 7.3 AT+QHTTPPOST — Execute Authenticated HTTP POST
- **Syntax:** `AT+QHTTPPOST=<data_length>,<input_timeout>,<response_timeout>\r\n`
- **Parameters:**
  - `<data_length>`: Exact byte length of the body (or headers + body if custom headers enabled).
  - `<input_timeout>`: Maximum seconds modem waits for host UART transmission (e.g. `20`).
  - `<response_timeout>`: Maximum seconds modem waits for remote server HTTP response (e.g. `60`).
- **Procedure:**
  1. Host sends `AT+QHTTPPOST=256,20,60\r\n`
  2. Modem responds with: `CONNECT\r\n`
  3. Host transmits headers and JSON payload over UART.
  4. Modem outputs: `OK\r\n`
  5. Modem performs TLS handshake, posts data, and emits asynchronous URC:
     `+QHTTPPOST: <err>,<http_status_code>,<content_length>\r\n`
     - `<err>`: `0` (Success), `701`–`729` (HTTP/TLS connection failure codes).
     - `<http_status_code>`: `200`, `401`, `413`, `500`, etc.
     - `<content_length>`: Byte size of response payload.

### 7.4 AT+QHTTPREAD — Retrieve Server Response Body
- **Syntax:** `AT+QHTTPREAD=<wait_timeout>\r\n`
- **Response:**
  ```text
  CONNECT
  <response body bytes>
  OK
  +QHTTPREAD: 0
  ```
- **Timeout:** `<wait_timeout>` seconds.

### 7.5 AT+QHTTPSTOP — Abort In-Flight Transaction
- **Syntax:** `AT+QHTTPSTOP\r\n`
- **Response:** `OK\r\n`
- **Purpose:** Forces immediate closure of hung HTTP sessions.

---

## 8. Non-Volatile File Management Commands (Certificate Storage)

### 8.1 AT+QFUPL — Upload File to Modem UFS Storage
- **Syntax:** `AT+QFUPL="<filename>",<file_size>,<timeout>\r\n`
- **Procedure:**
  1. Host sends `AT+QFUPL="cacert.pem",1939,30\r\n`
  2. Modem responds with: `CONNECT\r\n`
  3. Host writes raw certificate bytes over UART.
  4. Modem responds with:
     `+QFUPL: <actual_uploaded_size>,<checksum>\r\n\r\nOK\r\n`

### 8.2 AT+QFLST — List Files in UFS Storage
- **Syntax:** `AT+QFLST="*" \r\n`
- **Response:** `+QFLST: "<filename>",<file_size>\r\n\r\nOK\r\n`

### 8.3 AT+QFDEL — Delete File from UFS Storage
- **Syntax:** `AT+QFDEL="<filename>"\r\n`
- **Response:** `OK\r\n`

---

## 9. Error Codes & Recovery Matrix

| Error Code | Meaning | Probable Cause | Recovery Action |
|---|---|---|---|
| `+CME ERROR: 10` | SIM not inserted | Card missing or loose holder | Re-seat card; pulse RESET_N |
| `+CME ERROR: 13` | SIM failure | Card corrupted or dirty contacts | Clean contacts; replace SIM |
| `+CME ERROR: 14` | SIM busy | Modem initializing SIM interface | Wait 2s; retry `AT+CPIN?` |
| `+CME ERROR: 17` | SIM PIN required | PIN lock active | Issue `AT+CPIN="<pin>"` |
| `+CME ERROR: 30` | No network service | No coverage or antenna detached | Verify RF cable; check `AT+CSQ` |
| `+CME ERROR: 132` | SIM not allowed | Carrier blocked or inactive plan | Check subscription / bill pay |
| `+CME ERROR: 148` | Unregistered network | Not attached to EPS network | Wait for `AT+CEREG?` = 1 or 5 |
| `+CME ERROR: 551` | PDP context activation failed | Invalid APN or IP allocation fail | Verify `AT+QICSGP`; reset CID 1 |
| `+CME ERROR: 552` | PDP context deactivated | Network drop or inactivity sleep | Issue `AT+QIACT=1` |
| `+QHTTPPOST: 701` | HTTP(S) Unknown error | Internal stack state corrupted | Issue `AT+QHTTPSTOP`; restart stack |
| `+QHTTPPOST: 702` | HTTP(S) Timeout | Server slow or cold start sleep | Increase timeout to 60s; retry |
| `+QHTTPPOST: 703` | HTTP(S) Busy | Previous transaction not cleared | Issue `AT+QHTTPSTOP` |
| `+QHTTPPOST: 714` | SSL Handshake failure | Certificate mismatch or clock drift | Verify `cacert.pem`, SNI & `ignorelocaltime` |
| `+QHTTPPOST: 716` | Socket closed by remote host | Cloudflare/Render dropped connection | Reconnect PDP context; retry |
