# Security Policy

## Supported Versions

Security updates and critical defect patches are actively applied to the following software versions:

| Version | Release Status | Supported |
|---|---|:---:|
| **2.0.x (NextGen)** | Active Stable Release | :white_check_mark: |
| **1.0.x (Legacy C++/Qt)** | Deprecated Reference | :x: |

---

## Reporting a Vulnerability

We appreciate the responsible disclosure of security vulnerabilities by the engineering and cybersecurity community.

- **Private Reporting:** If you discover a potential vulnerability in this repository, please do **not** open a public issue. Instead, report it privately via [GitHub Private Vulnerability Reporting](https://github.com/soumikbur/PanoramaWaterTank_NextGen/security/advisories/new).
- **Required Details:**
  - Description and location of the vulnerability (file name and line numbers).
  - Steps to reproduce or proof-of-concept payload.
  - Potential impact assessment (e.g., authentication bypass, data exfiltration, service disruption).
- **Response Commitment:**
  - Acknowledgement within 48 hours.
  - Technical triage and severity assignment within 5 business days.
  - Patch development and coordinated release following verification.

---

## Industrial Security Notice

This repository contains developer-oriented source code and demonstration configurations. Production deployment in operational railway environments mandates independent security assessment, physical network isolation (private APN), dedicated mutual TLS (mTLS) broker infrastructure, and formal organizational approval.
