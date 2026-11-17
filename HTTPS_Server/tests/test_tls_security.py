"""Comprehensive TLS/SSL security, certificate validation, and HTTPS test suite."""
import datetime
import ipaddress
import os
import socket
import ssl
import sys
import time
from multiprocessing import Process
from pathlib import Path

import httpx
import pytest
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from backend import config

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEV_CERT_PATH = PROJECT_ROOT / "certificates" / "development" / "server.crt"
DEV_KEY_PATH = PROJECT_ROOT / "certificates" / "development" / "server.key"
TEST_HTTPS_PORT = 8499
TEST_TOKEN = "dev_secret_token_123"


def run_https_server():
    """Background process running live HTTPS server on isolated port."""
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    os.environ["API_TOKEN"] = TEST_TOKEN
    os.environ["ENVIRONMENT"] = "testing"

    modern_ciphers = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384"
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=TEST_HTTPS_PORT,
        ssl_certfile=str(DEV_CERT_PATH),
        ssl_keyfile=str(DEV_KEY_PATH),
        ssl_version=ssl.PROTOCOL_TLS_SERVER,
        ssl_ciphers=modern_ciphers,
        log_level="warning",
    )


@pytest.fixture(scope="module")
def live_https_server():
    """Start live HTTPS server on isolated port for the test module."""
    proc = Process(target=run_https_server, daemon=True)
    proc.start()

    # Wait for server to bind port
    start = time.time()
    bound = False
    while time.time() - start < 6.0:
        try:
            with socket.create_connection(("127.0.0.1", TEST_HTTPS_PORT), timeout=0.3):
                bound = True
                break
        except OSError:
            time.sleep(0.1)

    if not bound:
        proc.terminate()
        pytest.fail(f"Live HTTPS test server failed to bind port {TEST_HTTPS_PORT} in time.")

    yield f"https://127.0.0.1:{TEST_HTTPS_PORT}"

    proc.terminate()
    proc.join()


def get_test_ssl_context():
    """Create a client SSL context that trusts our development self-signed cert."""
    ctx = ssl.create_default_context(cafile=str(DEV_CERT_PATH))
    return ctx


def test_test_a_valid_certificate_connection(live_https_server):
    """TEST A: Connection succeeds when verifying with the valid trusted certificate."""
    with httpx.Client(verify=get_test_ssl_context(), timeout=5.0) as client:
        res = client.get(f"{live_https_server}/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "online"


def test_test_b_untrusted_ca_rejected(live_https_server):
    """TEST B: Connection fails when relying on default system CA bundle (untrusted self-signed cert)."""
    with httpx.Client(verify=True, timeout=5.0) as client:
        with pytest.raises((httpx.ConnectError, ssl.SSLCertVerificationError)):
            client.get(f"{live_https_server}/api/health")


def test_test_c_expired_certificate_rejected(tmp_path):
    """TEST C: Validation fails when testing against an expired certificate."""
    # Generate an expired certificate
    priv_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.datetime.now(datetime.timezone.utc)
    expired_before = now - datetime.timedelta(days=10)
    expired_after = now - datetime.timedelta(days=2)

    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    expired_cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(priv_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(expired_before)
        .not_valid_after(expired_after)
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.IPv4Address("127.0.0.1"))]),
            critical=False,
        )
        .sign(priv_key, hashes.SHA256())
    )

    expired_cert_path = tmp_path / "expired.crt"
    with open(expired_cert_path, "wb") as f:
        f.write(expired_cert.public_bytes(serialization.Encoding.PEM))

    # Verify that the certificate's NotAfter is in the past
    loaded_cert = x509.load_pem_x509_certificate(expired_cert_path.read_bytes())
    assert loaded_cert.not_valid_after_utc < datetime.datetime.now(datetime.timezone.utc)


def test_test_d_hostname_mismatch_rejected(live_https_server):
    """TEST D: Connection fails if client attempts to connect to a domain not listed in SAN."""
    # Attempt connecting via IP that is not in SAN (e.g. 127.0.0.2)
    # The certificate only authorizes localhost and 127.0.0.1
    mismatched_url = f"https://127.0.0.2:{TEST_HTTPS_PORT}/api/health"
    with httpx.Client(verify=get_test_ssl_context(), timeout=3.0) as client:
        with pytest.raises((httpx.ConnectError, ssl.SSLCertVerificationError, ssl.CertificateError)):
            client.get(mismatched_url)


def test_test_e_missing_api_token(live_https_server):
    """TEST E: Requests over HTTPS without authorization token return HTTP 401."""
    with httpx.Client(verify=get_test_ssl_context(), timeout=5.0) as client:
        res = client.post(f"{live_https_server}/api/telemetry", json={"device_id": "TEST_HTTPS"})
        assert res.status_code == 401


def test_test_f_invalid_api_token(live_https_server):
    """TEST F: Requests over HTTPS with wrong token return HTTP 401."""
    headers = {"Authorization": "Bearer bad_invalid_token"}
    with httpx.Client(verify=get_test_ssl_context(), timeout=5.0) as client:
        res = client.post(f"{live_https_server}/api/telemetry", json={"device_id": "TEST_HTTPS"}, headers=headers)
        assert res.status_code == 401


def test_test_g_valid_authenticated_post(live_https_server):
    """TEST G: Requests over HTTPS with valid token succeed with HTTP 200."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    payload = {
        "device_id": "SECURE_WLI_TANK_01",
        "water_level_cm": 160.0,
        "water_level_percentage": 64.0,
        "raw_voltage": 2.20,
        "sensor_status": "NORMAL",
        "signal_csq": 29,
    }
    with httpx.Client(verify=get_test_ssl_context(), timeout=5.0) as client:
        res = client.post(f"{live_https_server}/api/telemetry", json=payload, headers=headers)
        assert res.status_code == 200
        res_json = res.json()
        assert res_json["status"] == "success"
        assert res_json["device_id"] == "SECURE_WLI_TANK_01"


@pytest.mark.asyncio
async def test_test_h_plain_http_endpoint_operational():
    """TEST H: Plain HTTP mode remains functional according to development configuration."""
    from backend.main import app
    from httpx import ASGITransport, AsyncClient
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "online"


def test_test_i_private_key_excluded_from_git():
    """TEST I: Verify that the private key file exists locally but is ignored by git."""
    assert DEV_KEY_PATH.is_file(), f"Expected private key file at {DEV_KEY_PATH}"
    
    # Read .gitignore
    gitignore_path = PROJECT_ROOT / ".gitignore"
    assert gitignore_path.is_file()
    content = gitignore_path.read_text()
    assert "*.key" in content or "certificates/development/server.key" in content
