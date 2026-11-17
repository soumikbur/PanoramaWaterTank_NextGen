"""HTTPS client testing script for verifying TLS certificate and encrypted REST API transmission."""
import argparse
import json
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import httpx
from backend import config


def test_https_communication(
    target_url: str = "https://127.0.0.1:8443",
    cert_path: Path = None,
    token: str = None,
):
    """Execute authenticated HTTPS POST request against local TLS server."""
    active_token = token or config.API_TOKEN or "dev_secret_token_123"
    resolved_cert = cert_path or (PROJECT_ROOT / "certificates" / "development" / "server.crt")

    if not resolved_cert.exists():
        print(f"[-] Error: Certificate file not found at {resolved_cert}")
        sys.exit(1)

    print("=" * 64)
    print("      PANORAMA WLI HTTPS CLIENT TEST & VERIFICATION")
    print("=" * 64)
    print(f"Target URL:        {target_url}")
    print(f"Certificate Path:  {resolved_cert}")
    print(f"Authentication:    Bearer <redacted:{len(active_token)} chars>")
    print("=" * 64)

    test_payload = {
        "device_id": "WLI_TEST_001",
        "timestamp": int(time.time()),
        "water_level_cm": 125.5,
        "water_level_percentage": 50.2,
        "raw_voltage": 1.25,
        "sensor_status": "NORMAL",
        "latitude": 22.5726,
        "longitude": 88.3639,
        "gps_valid": True,
        "battery_voltage": 12.4,
        "alarm_status": "NONE",
        "custom_variable": 45,
    }

    # Use HTTPX client configured with strict certificate verification
    with httpx.Client(verify=str(resolved_cert), timeout=10.0) as client:
        # 1. Test Health Endpoint
        print("\n[*] 1. Testing GET /api/health over HTTPS...")
        t0 = time.perf_counter()
        res_health = client.get(f"{target_url}/api/health")
        latency_health = (time.perf_counter() - t0) * 1000
        print(f"    Status:   HTTP {res_health.status_code}")
        print(f"    Latency:  {latency_health:.2f}ms")
        print(f"    Response: {res_health.json()}")
        assert res_health.status_code == 200, f"Health check failed: {res_health.text}"

        # 2. Test Unauthenticated POST (Expect 401)
        print("\n[*] 2. Testing Unauthorized POST (Security Guard)...")
        res_unauth = client.post(f"{target_url}/api/telemetry", json={"device_id": "UNAUTH_TEST"})
        print(f"    Status:   HTTP {res_unauth.status_code} (Expected 401)")
        assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"

        # 3. Test Authenticated JSON POST
        print("\n[*] 3. Transmitting Encrypted Telemetry via POST /api/telemetry...")
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Content-Type": "application/json",
        }
        t0 = time.perf_counter()
        res_post = client.post(f"{target_url}/api/telemetry", json=test_payload, headers=headers)
        latency_post = (time.perf_counter() - t0) * 1000
        print(f"    Status:   HTTP {res_post.status_code}")
        print(f"    Latency:  {latency_post:.2f}ms")
        print(f"    Response: {json.dumps(res_post.json(), indent=2)}")
        assert res_post.status_code == 200, f"Telemetry POST failed: {res_post.text}"

        # 4. Test Authenticated GET Latest
        print("\n[*] 4. Querying Latest Telemetry via GET /api/telemetry/latest...")
        res_latest = client.get(f"{target_url}/api/telemetry/latest?device_id=WLI_TEST_001", headers=headers)
        print(f"    Status:   HTTP {res_latest.status_code}")
        print(f"    Response: {res_latest.json()}")
        assert res_latest.status_code == 200

    print("\n" + "=" * 64)
    print("[SUCCESS] All HTTPS endpoints verified successfully over TLS!")
    print("=" * 64)


def _spawn_https_server(port: int, cert_path: Path, key_path: Path, token: str):
    """Module-level target function for child process running Uvicorn over HTTPS."""
    import ssl
    import uvicorn
    import os
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    os.environ["API_TOKEN"] = token
    os.environ["ENVIRONMENT"] = "testing"
    modern_ciphers = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384"
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=port,
        ssl_certfile=str(cert_path),
        ssl_keyfile=str(key_path),
        ssl_version=ssl.PROTOCOL_TLS_SERVER,
        ssl_ciphers=modern_ciphers,
        log_level="warning",
    )


def main():
    parser = argparse.ArgumentParser(description="Test local HTTPS REST API endpoints.")
    parser.add_argument("--url", default="https://127.0.0.1:8443", help="Target HTTPS URL (default: https://127.0.0.1:8443)")
    parser.add_argument("--cert", type=Path, default=None, help="Path to CA/server certificate for validation")
    parser.add_argument("--token", type=str, default=None, help="API Bearer Token")
    parser.add_argument("--auto-start", action="store_true", help="Automatically spawn a temporary HTTPS server if not running")
    args = parser.parse_args()

    proc = None
    if args.auto_start:
        import socket
        from multiprocessing import Process
        
        # Check if already running
        port = int(args.url.split(":")[-1].split("/")[0])
        running = False
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                running = True
        except OSError:
            pass

        if not running:
            cert_path = args.cert or (PROJECT_ROOT / "certificates" / "development" / "server.crt")
            key_path = PROJECT_ROOT / "certificates" / "development" / "server.key"
            token = args.token or config.API_TOKEN or "dev_secret_token_123"
            print(f"[*] Auto-starting temporary HTTPS test server on port {port}...")

            proc = Process(
                target=_spawn_https_server,
                args=(port, cert_path, key_path, token),
                daemon=True,
            )
            proc.start()
            # Wait for startup
            st = time.time()
            while time.time() - st < 5.0:
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                        break
                except OSError:
                    time.sleep(0.1)

    try:
        test_https_communication(
            target_url=args.url,
            cert_path=args.cert,
            token=args.token,
        )
    finally:
        if proc:
            proc.terminate()
            proc.join()


if __name__ == "__main__":
    main()
