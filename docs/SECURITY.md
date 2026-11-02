# Panorama Water Tank Monitor — Security Architecture & Hardening Guide

This document defines the security architecture, threat model, cryptographic standards, and hardening policies implemented across the NextGen Panorama Water Tank Monitor stack.

---

## 1. Threat Model & Security Boundaries

```
[ Edge Hardware (ESP32-S3) ] 
       |
       | (Boundary 1: Public Cellular LTE Network)
       v
[ TLS 1.2+ MQTT Broker (Port 8883) ]
       |
       | (Boundary 2: Container Network / Private VPC)
       v
[ Backend Services (FastAPI + PostgreSQL) ]
       |
       | (Boundary 3: TLS HTTPS / WSS Web Gateway)
       v
[ Operators / HMI Clients (React Native) ]
```

### 1.1 Threat Surface Analysis
| Threat Scenario | Vector | Mitigation in NextGen Stack |
| :--- | :--- | :--- |
| **Eavesdropping on Cellular Link** | Packet sniffing on cellular/satellite links | TLS 1.2+ mandatory on Port 8883 with strong cipher suites (`ECDHE-RSA-AES256-GCM-SHA384`). |
| **Rogue Edge Device Spoofing** | Attacker connects fake device to inject false water levels | Per-device MQTT credentials / client certificate validation; strict UID verification against PostgreSQL device registry. |
| **SQL Injection** | Malicious characters in Coach No, UID, or Search query | 100% Parameterized queries via Async SQLAlchemy ORM; zero raw string SQL interpolation. |
| **Denial of Service (DoS) via Flooding** | High-frequency telemetry packet spam | Token bucket rate limiting in FastAPI; broker max message size limits (16 KB) and QoS throttling. |
| **Unauthorized Administrative Action** | Attacker modifying tank physical geometry | Role-Based Access Control (RBAC); password hashing with `bcrypt` (work factor 12); JWT token expiration. |
| **Data Leakage via Public Broker** | Using public HiveMQ without authentication | Private Mosquitto instance with authenticated username/password or client certificates; 0 reliance on public brokers in production. |

---

## 2. Authentication & Authorization (RBAC)

### 2.1 Role-Based Access Control Matrix
| Resource / Operation | VIEWER | OPERATOR | ADMIN |
| :--- | :---: | :---: | :---: |
| View Live Dashboard & Tanks | Read | Read | Read |
| View Historical Charts & CSV Export | Read | Read | Read |
| View Active & Historical Alarms | Read | Read | Read |
| Acknowledge Active Alarms | No | Yes | Yes |
| Trigger Device Diagnostics Ping | No | Yes | Yes |
| Update Tank Physical Geometry | No | No | Yes |
| Modify Alarm Thresholds | No | No | Yes |
| Manage Devices & System Users | No | No | Yes |
| Configure MQTT Connection Settings | No | No | Yes |

### 2.2 Password Security & Token Lifecycle
- **Password Storage**: Hashed using `bcrypt` with salt and cost factor 12.
- **JWT Tokens**: Signed using HMAC-SHA256 (`HS256`) with a cryptographically random 256-bit secret key.
  - Access Token TTL: 24 hours.
  - Refresh Token TTL: 7 days.
  - Token Revocation: JTI tracking for logged-out sessions.

---

## 3. Network Transport & Cryptography

### 3.1 MQTT over TLS Configuration
- Broker listens on port `8883`.
- Minimum protocol version: TLS 1.2 (TLS 1.0 and 1.1 explicitly disabled).
- Recommended Cipher Suites:
  - `TLS_AES_256_GCM_SHA384`
  - `TLS_CHACHA20_POLY1305_SHA256`
  - `ECDHE-ECDSA-AES256-GCM-SHA384`
  - `ECDHE-RSA-AES256-GCM-SHA384`

### 3.2 Secure WebSocket (`WSS`)
- All WebSocket connections must terminate over HTTPS/TLS.
- Real-time frames are authenticated during handshake via token query param or `Sec-WebSocket-Protocol` header.

---

## 4. Secret Management & Hardening Guidelines

1. **Zero Hardcoded Secrets**: No API keys, passwords, or private keys in source code. All configuration injected via environment variables (`.env`).
2. **PostgreSQL Least Privilege**: Backend connects using dedicated application user `panorama_app` with schema-scoped permissions (no superuser access).
3. **Docker Container Non-Root Users**: Application containers run under unprivileged system user (`uid: 10001`).
4. **Audit Logging**: Every administrative action, alarm acknowledgement, and geometry update is recorded immutably in `audit_events`.

