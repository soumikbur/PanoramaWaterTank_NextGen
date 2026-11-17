"""Production & Remote Public HTTPS Endpoint Verification Client.

Validates deployed or local FastAPI instances against all required functional,
security, authentication, and TLS verification constraints.
Never prints or logs raw API secrets.

Usage:
    python scripts/test_production_endpoint.py --base-url https://<service-name>.onrender.com --token <SECRET>
    python scripts/test_production_endpoint.py --base-url http://127.0.0.1:8000
    python scripts/test_production_endpoint.py --base-url https://localhost:8443 --ca-cert certificates/development/server.crt
    python scripts/test_production_endpoint.py --auto-start
"""
import argparse
import io
import json
import os
import socket
import ssl
import sys
import time
from multiprocessing import Process
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class TestResult:
    def __init__(self, test_id: str, name: str, endpoint: str):
        self.test_id = test_id
        self.name = name
        self.endpoint = endpoint
        self.passed: bool = False
        self.status_code: Optional[int] = None
        self.latency_ms: float = 0.0
        self.message: str = ""


def mask_token(token: str) -> str:
    """Mask token string for safe logging and display."""
    if not token:
        return "<EMPTY>"
    if len(token) <= 6:
        return "***"
    return f"{token[:2]}***{token[-2:]}"


def _spawn_local_server(port: int, token: str):
    """Module-level target function to spawn a local test server."""
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    os.environ["API_TOKEN"] = token
    os.environ["PORT"] = str(port)
    os.environ["ENVIRONMENT"] = "testing"
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, log_level="warning")


def run_test_suite(
    base_url: str,
    token: str,
    timeout: float = 30.0,
    ca_cert: Optional[str] = None,
) -> Tuple[List[TestResult], bool]:
    """Execute end-to-end verification against the target server."""
    clean_base = base_url.rstrip("/")
    parsed = urlparse(clean_base)
    is_https = parsed.scheme.lower() == "https"

    # Configure SSL context
    verify_param: Any = True
    if is_https:
        if ca_cert and os.path.isfile(ca_cert):
            ctx = ssl.create_default_context(cafile=ca_cert)
            verify_param = ctx
        else:
            verify_param = True

    results: List[TestResult] = []
    auth_headers = {"Authorization": f"Bearer {token}"}
    device_id = "COACH-CLOUD-TEST-01"

    print("=" * 88)
    print("PANORAMA WATER TANK — PRODUCTION ENDPOINT VALIDATION")
    print(f"Target URL:    {clean_base}")
    print(f"Protocol:      {parsed.scheme.upper()}")
    print(f"Auth Token:    {mask_token(token)}")
    print(f"TLS Verify:    {'Strict (Custom CA)' if ca_cert else ('Strict (System CA)' if is_https else 'N/A (HTTP)')}")
    print(f"Timeout:       {timeout}s (accommodates free-tier cold starts)")
    print("=" * 88)

    with httpx.Client(base_url=clean_base, timeout=timeout, verify=verify_param, follow_redirects=True) as client:
        # TEST 01: Health Check
        r1 = TestResult("TEST-01", "Health Check", "GET /api/health")
        try:
            t0 = time.perf_counter()
            resp = client.get("/api/health")
            r1.latency_ms = (time.perf_counter() - t0) * 1000
            r1.status_code = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "online":
                    r1.passed = True
                    r1.message = f"Online (v{data.get('version', 'unknown')})"
                else:
                    r1.message = f"Unexpected payload: {data}"
            else:
                r1.message = f"Unexpected status code {resp.status_code}"
        except Exception as e:
            r1.message = f"Connection failed: {e}"
        results.append(r1)

        # TEST 02: System Diagnostics & Secret Leakage Check
        r2 = TestResult("TEST-02", "System Diagnostics", "GET /api/system/info")
        try:
            t0 = time.perf_counter()
            resp = client.get("/api/system/info")
            r2.latency_ms = (time.perf_counter() - t0) * 1000
            r2.status_code = resp.status_code
            if resp.status_code == 200:
                body_text = resp.text
                if token and token in body_text and len(token) > 4:
                    r2.message = "CRITICAL: Secret API token leaked in system info response!"
                    r2.passed = False
                else:
                    data = resp.json()
                    uptime = data.get("uptime_seconds", 0)
                    r2.passed = True
                    r2.message = f"OK (Uptime: {uptime}s, Records: {data.get('storage', {}).get('current_history_records', 0)})"
            else:
                r2.message = f"Unexpected status code {resp.status_code}"
        except Exception as e:
            r2.message = f"Request failed: {e}"
        results.append(r2)

        # TEST 03: Embedded Laboratory Dashboard Root
        r3 = TestResult("TEST-03", "Laboratory Dashboard", "GET /")
        try:
            t0 = time.perf_counter()
            resp = client.get("/")
            r3.latency_ms = (time.perf_counter() - t0) * 1000
            r3.status_code = resp.status_code
            if resp.status_code == 200:
                html_text = resp.text.lower()
                if "<html" in html_text and "panorama" in html_text:
                    r3.passed = True
                    r3.message = f"OK ({len(resp.content)} bytes HTML layout)"
                else:
                    r3.message = "Root returned 200 but HTML layout content missing"
            else:
                r3.message = f"Unexpected status code {resp.status_code}"
        except Exception as e:
            r3.message = f"Request failed: {e}"
        results.append(r3)

        # TEST 04: Unauthenticated Request Rejection
        r4 = TestResult("TEST-04", "Unauthenticated Guard", "POST /api/telemetry")
        try:
            t0 = time.perf_counter()
            resp = client.post("/api/telemetry", json={"device_id": "TEST-NOAUTH"})
            r4.latency_ms = (time.perf_counter() - t0) * 1000
            r4.status_code = resp.status_code
            if resp.status_code == 401:
                r4.passed = True
                r4.message = "Rejected correctly (401 Unauthorized)"
            else:
                r4.message = f"Security breach: Expected 401, got {resp.status_code}"
        except Exception as e:
            r4.message = f"Request failed: {e}"
        results.append(r4)

        # TEST 05: Invalid Token Rejection
        r5 = TestResult("TEST-05", "Invalid Token Guard", "POST /api/telemetry")
        try:
            t0 = time.perf_counter()
            resp = client.post(
                "/api/telemetry",
                headers={"Authorization": "Bearer completely_fake_invalid_token_999"},
                json={"device_id": "TEST-BADAUTH"},
            )
            r5.latency_ms = (time.perf_counter() - t0) * 1000
            r5.status_code = resp.status_code
            if resp.status_code == 401:
                r5.passed = True
                r5.message = "Rejected correctly (401 Unauthorized)"
            else:
                r5.message = f"Security breach: Expected 401, got {resp.status_code}"
        except Exception as e:
            r5.message = f"Request failed: {e}"
        results.append(r5)

        # TEST 06: Authenticated JSON Telemetry POST
        r6 = TestResult("TEST-06", "JSON Telemetry POST", "POST /api/telemetry")
        payload = {
            "device_id": device_id,
            "water_level_cm": 184.5,
            "water_percentage": 92.25,
            "pressure_bar": 0.84,
            "battery_v": 12.6,
            "signal_csq": 29,
            "gps_lat": 22.5726,
            "gps_lon": 88.3639,
        }
        try:
            t0 = time.perf_counter()
            resp = client.post("/api/telemetry", headers=auth_headers, json=payload)
            r6.latency_ms = (time.perf_counter() - t0) * 1000
            r6.status_code = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success" and data.get("device_id") == device_id:
                    r6.passed = True
                    r6.message = f"Accepted (Vars: {data.get('variables_count', 0)}, Level: 184.5cm)"
                else:
                    r6.message = f"Unexpected response schema: {data}"
            else:
                r6.message = f"Ingestion rejected with HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            r6.message = f"Request failed: {e}"
        results.append(r6)

        # TEST 07: Authenticated Multipart File Upload
        r7 = TestResult("TEST-07", "Multipart File Upload", "POST /api/telemetry/file")
        file_payload = {
            "device_id": f"{device_id}-FILE",
            "water_level_cm": 160.0,
            "water_percentage": 80.0,
            "pressure_bar": 0.72,
            "battery_v": 12.2,
        }
        file_bytes = json.dumps(file_payload).encode("utf-8")
        try:
            t0 = time.perf_counter()
            resp = client.post(
                "/api/telemetry/file",
                headers=auth_headers,
                files={"file": ("telemetry_sample.json", io.BytesIO(file_bytes), "application/json")},
            )
            r7.latency_ms = (time.perf_counter() - t0) * 1000
            r7.status_code = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    r7.passed = True
                    r7.message = f"File processed ({len(file_bytes)} bytes ingested)"
                else:
                    r7.message = f"Upload error response: {data}"
            else:
                r7.message = f"Upload rejected with HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            r7.message = f"Upload request failed: {e}"
        results.append(r7)

        # TEST 08: Latest Telemetry Query
        r8 = TestResult("TEST-08", "Latest Telemetry", "GET /api/telemetry/latest")
        try:
            t0 = time.perf_counter()
            resp = client.get(
                "/api/telemetry/latest",
                headers=auth_headers,
                params={"device_id": device_id},
            )
            r8.latency_ms = (time.perf_counter() - t0) * 1000
            r8.status_code = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                rec = data.get("data", {})
                if rec.get("device_id") == device_id and rec.get("water_level_cm") == 184.5:
                    r8.passed = True
                    r8.message = f"Matched (Device: {device_id}, Level: {rec.get('water_level_cm')}cm)"
                else:
                    r8.message = f"Data mismatch: {rec}"
            else:
                r8.message = f"Query failed with HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            r8.message = f"Query failed: {e}"
        results.append(r8)

        # TEST 09: Telemetry History Query
        r9 = TestResult("TEST-09", "Telemetry History", "GET /api/telemetry/history")
        try:
            t0 = time.perf_counter()
            resp = client.get(
                "/api/telemetry/history",
                headers=auth_headers,
                params={"device_id": device_id, "limit": 5},
            )
            r9.latency_ms = (time.perf_counter() - t0) * 1000
            r9.status_code = resp.status_code
            if resp.status_code == 200:
                data = resp.json()
                records = data.get("data", [])
                if len(records) >= 1:
                    r9.passed = True
                    r9.message = f"Retrieved {len(records)} historical records (newest first)"
                else:
                    r9.message = f"Empty history list returned for device: {device_id}"
            else:
                r9.message = f"History query failed with HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            r9.message = f"Query failed: {e}"
        results.append(r9)

        # TEST 10: HTTPS Certificate & TLS Verification
        r10 = TestResult("TEST-10", "TLS Certificate Validation", "TLS Handshake & Trust")
        if is_https:
            try:
                hostname = parsed.hostname or "localhost"
                port = parsed.port or 443
                ssl_ctx = ssl.create_default_context(cafile=ca_cert) if ca_cert else ssl.create_default_context()
                t0 = time.perf_counter()
                with ssl_ctx.wrap_socket(
                    ssl.socket(),
                    server_hostname=hostname,
                ) as s:
                    s.settimeout(timeout)
                    s.connect((hostname, port))
                    cert = s.getpeercert()
                r10.latency_ms = (time.perf_counter() - t0) * 1000
                r10.status_code = 200
                r10.passed = True
                subject = dict(x[0] for x in cert.get("subject", ()))
                common_name = subject.get("commonName", "Unknown")
                r10.message = f"Verified (CN: {common_name}, Valid to: {cert.get('notAfter', 'N/A')})"
            except ssl.SSLCertVerificationError as e:
                r10.passed = False
                r10.message = f"SSL Certificate Verification Failed: {e}"
            except Exception as e:
                r10.passed = False
                r10.message = f"TLS Handshake Error: {e}"
        else:
            r10.passed = True
            r10.status_code = None
            r10.message = "Skipped (Target uses plain HTTP; required only for HTTPS)"
        results.append(r10)

    # Print Formatted Results
    print(f"\n{'ID':<9} {'TEST NAME':<26} {'HTTP':<6} {'LATENCY':<10} {'RESULT':<8} {'DETAILS'}")
    print("-" * 88)
    all_passed = True
    for r in results:
        status_str = str(r.status_code) if r.status_code is not None else "---"
        lat_str = f"{r.latency_ms:.1f}ms" if r.latency_ms > 0 else "---"
        verdict = "PASS" if r.passed else "FAIL"
        if not r.passed:
            all_passed = False
        print(f"{r.test_id:<9} {r.name:<26} {status_str:<6} {lat_str:<10} {verdict:<8} {r.message}")

    print("-" * 88)
    passed_count = sum(1 for r in results if r.passed)
    total_count = len(results)
    print(f"Summary: {passed_count}/{total_count} tests passed (Success Rate: {(passed_count/total_count)*100:.1f}%)")
    print("=" * 88)

    return results, all_passed


def main():
    parser = argparse.ArgumentParser(
        description="Verify public or local Panorama Water Tank HTTPS receiver endpoints."
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default=os.getenv("BASE_URL", "http://127.0.0.1:8000"),
        help="Base service URL (e.g. https://panorama-wli-https-receiver.onrender.com or http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=os.getenv("API_TOKEN", "dev_secret_token_123"),
        help="API Bearer authentication token",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP request timeout in seconds (default: 30.0s)",
    )
    parser.add_argument(
        "--ca-cert",
        type=str,
        default=None,
        help="Custom CA certificate bundle path (for self-signed dev testing)",
    )
    parser.add_argument(
        "--auto-start",
        action="store_true",
        help="Spawn a temporary local test server if target port is unreachable",
    )

    args = parser.parse_args()

    proc = None
    if args.auto_start:
        parsed = urlparse(args.base_url)
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        host = parsed.hostname or "127.0.0.1"

        # Check if already running
        running = False
        try:
            with socket.create_connection((host, port), timeout=0.5):
                running = True
        except OSError:
            pass

        if not running:
            print(f"[*] Auto-starting temporary local test server on port {port}...")
            proc = Process(
                target=_spawn_local_server,
                args=(port, args.token),
                daemon=True,
            )
            proc.start()
            # Wait for startup
            st = time.time()
            while time.time() - st < 5.0:
                try:
                    with socket.create_connection((host, port), timeout=0.3):
                        break
                except OSError:
                    time.sleep(0.1)

    try:
        results, success = run_test_suite(
            base_url=args.base_url,
            token=args.token,
            timeout=args.timeout,
            ca_cert=args.ca_cert,
        )
        if not success:
            sys.exit(1)
    finally:
        if proc:
            proc.terminate()
            proc.join()


if __name__ == "__main__":
    main()
