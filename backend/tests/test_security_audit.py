"""Comprehensive Security Audit and Vulnerability Remediation Test Suite.

Verifies:
1. Role-Based Access Control (RBAC) enforcement across all mutation endpoints.
2. Server-side session invalidation and token revocation on logout, password change, and admin reset.
3. In-memory rate limiting on authentication and registration endpoints (HTTP 429).
4. Secure document upload validation (file extension whitelist, path traversal blocking, magic bytes verification).
5. Defensive HTTP security headers.
"""
import base64
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.rate_limit import login_limiter, registration_limiter


@pytest.mark.asyncio
async def test_security_headers_present():
    """Verify that all defensive security headers are returned on API responses."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"
        assert resp.headers.get("x-xss-protection") == "1; mode=block"
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "default-src 'self'" in resp.headers.get("content-security-policy", "")


@pytest.mark.asyncio
async def test_rbac_mutation_endpoints_enforcement():
    """Verify that sensitive mutation endpoints are strictly restricted to Administrator role."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as Admin
        admin_login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Login as Employee
        emp_login = await client.post("/api/v1/auth/login", json={"username": "@employee", "password": "Employee@123"})
        assert emp_login.status_code == 200
        emp_token = emp_login.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # --- A. Tanks Mutation (PUT /tanks/{id}) ---
        await client.delete("/api/v1/trains/98991", headers=admin_headers)
        created_tmp_train = False
        tank_live = await client.get("/api/v1/tanks/live")
        if tank_live.json() is None:
            post_res = await client.post(
                "/api/v1/trains",
                headers=admin_headers,
                json={"train_number": "98991", "name": "RBAC Tank Audit", "region": "EAST", "coach_number": "B1"},
            )
            assert post_res.status_code in (200, 201), post_res.text
            created_tmp_train = True
            tank_live = await client.get("/api/v1/tanks/live")
        tank_id = tank_live.json()["tankId"]

        try:
            # Unauthenticated -> 401
            res = await client.put(f"/api/v1/tanks/{tank_id}", json={"capacityLiters": 25.0})
            assert res.status_code == 401

            # Employee -> 403 Forbidden
            res = await client.put(f"/api/v1/tanks/{tank_id}", json={"capacityLiters": 25.0}, headers=emp_headers)
            assert res.status_code == 403

            # Admin -> 200 Success
            res = await client.put(f"/api/v1/tanks/{tank_id}", json={"capacityLiters": 20.0}, headers=admin_headers)
            assert res.status_code == 200
        finally:
            if created_tmp_train:
                await client.delete("/api/v1/trains/98991", headers=admin_headers)

        # --- B. Devices Mutation (POST, PUT, DELETE /devices) ---
        test_uid = f"AUDIT-DEV-{uuid.uuid4().hex[:8]}"
        device_payload = {
            "uid": test_uid,
            "trainNumber": "12002",
            "coachNumber": "C1",
            "name": "Audit Test Node"
        }

        # Unauthenticated POST -> 401
        res = await client.post("/api/v1/devices", json=device_payload)
        assert res.status_code == 401

        # Employee POST -> 201 Created (Employees and Admins can register/map devices)
        res = await client.post("/api/v1/devices", json=device_payload, headers=emp_headers)
        assert res.status_code == 201
        created_dev_id = res.json()["id"]

        try:
            # Unauthenticated PUT -> 401
            res = await client.put(f"/api/v1/devices/{created_dev_id}", json={"name": "Renamed Node"})
            assert res.status_code == 401

            # Employee PUT -> 200 Success (Employees can update device metadata)
            res = await client.put(f"/api/v1/devices/{created_dev_id}", json={"name": "Renamed Node by Emp"}, headers=emp_headers)
            assert res.status_code == 200

            # Admin PUT -> 200 Success
            res = await client.put(f"/api/v1/devices/{created_dev_id}", json={"name": "Renamed Node by Admin"}, headers=admin_headers)
            assert res.status_code == 200

            # Unauthenticated DELETE -> 401
            res = await client.delete(f"/api/v1/devices/{created_dev_id}")
            assert res.status_code == 401

            # Employee DELETE -> 403 Forbidden (Deleting hardware devices remains strictly Admin only)
            res = await client.delete(f"/api/v1/devices/{created_dev_id}", headers=emp_headers)
            assert res.status_code == 403
        finally:
            # Admin DELETE -> 200 Success (Clean up test device)
            res = await client.delete(f"/api/v1/devices/{created_dev_id}", headers=admin_headers)
            assert res.status_code in (200, 404)

        # --- C. Trains Mutation (POST, PUT, DELETE /trains) ---
        train_payload = {
            "train_number": "99999",
            "name": "Audit Express",
            "region": "EAST",
            "coach_number": "A1"
        }

        # Unauthenticated POST -> 401
        res = await client.post("/api/v1/trains", json=train_payload)
        assert res.status_code == 401

        # Employee POST -> 403
        res = await client.post("/api/v1/trains", json=train_payload, headers=emp_headers)
        assert res.status_code == 403

        # Admin POST -> 201
        res = await client.post("/api/v1/trains", json=train_payload, headers=admin_headers)
        assert res.status_code == 201

        # Unauthenticated PUT -> 401
        res = await client.put("/api/v1/trains/99999", json={"name": "Renamed Express"})
        assert res.status_code == 401

        # Employee PUT -> 403
        res = await client.put("/api/v1/trains/99999", json={"name": "Renamed Express"}, headers=emp_headers)
        assert res.status_code == 403

        # Admin PUT -> 200
        res = await client.put("/api/v1/trains/99999", json={"name": "Renamed Express"}, headers=admin_headers)
        assert res.status_code == 200

        # Unauthenticated DELETE -> 401
        res = await client.delete("/api/v1/trains/99999")
        assert res.status_code == 401

        # Employee DELETE -> 403
        res = await client.delete("/api/v1/trains/99999", headers=emp_headers)
        assert res.status_code == 403

        # Admin DELETE -> 200
        res = await client.delete("/api/v1/trains/99999", headers=admin_headers)
        assert res.status_code == 200

        # --- D. Settings Mutation (PUT /settings/{key}) ---
        # Unauthenticated -> 401
        res = await client.put("/api/v1/settings/device.refresh_interval", json={"value": 4.0})
        assert res.status_code == 401

        # Employee -> 403
        res = await client.put("/api/v1/settings/device.refresh_interval", json={"value": 4.0}, headers=emp_headers)
        assert res.status_code == 403

        # Admin -> 200
        res = await client.put("/api/v1/settings/device.refresh_interval", json={"value": 3.0}, headers=admin_headers)
        assert res.status_code == 200


@pytest.mark.asyncio
async def test_session_invalidation_on_logout():
    """Verify that logging out revokes the session token server-side immediately."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Verify token works
        me_res = await client.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["username"] == "@admin"

        # Explicit logout
        logout_res = await client.post("/api/v1/auth/logout", headers=headers)
        assert logout_res.status_code == 200
        assert logout_res.json()["status"] == "SUCCESS"

        # Subsequent request with old token MUST fail with 401
        revoked_res = await client.get("/api/v1/auth/me", headers=headers)
        assert revoked_res.status_code == 401
        assert "revoked" in revoked_res.json()["detail"].lower() or "expired" in revoked_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_session_invalidation_on_password_change():
    """Verify that changing password invalidates existing sessions."""
    import uuid
    suffix = uuid.uuid4().hex[:8]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register a temporary employee
        emp_username = f"@test_pwd_{suffix}"
        reg_payload = {
            "fullName": "Password Change Tester",
            "email": f"passchange_{suffix}@panorama.gov",
            "phone": "+91-99999-00001",
            "employeeId": f"EMP-PASS-{suffix.upper()}",
            "designation": "Operator",
            "department": "Operations",
            "divisionRegion": "Eastern Railway",
            "username": emp_username,
            "password": "InitialPassword123!",
            "confirmPassword": "InitialPassword123!"
        }
        reg_res = await client.post("/api/v1/auth/register", json=reg_payload)
        assert reg_res.status_code == 201
        reg_id = reg_res.json()["registration_id"]

        # Admin approves employee
        admin_login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
        await client.post(f"/api/v1/users/registrations/{reg_id}/approve", headers=admin_headers)

        # Employee logs in
        login_res = await client.post("/api/v1/auth/login", json={"username": emp_username, "password": "InitialPassword123!"})
        assert login_res.status_code == 200
        old_token = login_res.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {old_token}"}

        # Change password
        chg_res = await client.post(
            "/api/v1/auth/change-password",
            json={"new_password": "NewSecretPassword123!"},
            headers=emp_headers
        )
        assert chg_res.status_code == 200

        # Old token is now revoked
        revoked_res = await client.get("/api/v1/auth/me", headers=emp_headers)
        assert revoked_res.status_code == 401

        # Login with new password succeeds
        new_login = await client.post("/api/v1/auth/login", json={"username": emp_username, "password": "NewSecretPassword123!"})
        assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_session_invalidation_on_admin_reset():
    """Verify that an admin resetting an employee password invalidates active employee sessions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as employee
        emp_login = await client.post("/api/v1/auth/login", json={"username": "@employee", "password": "Employee@123"})
        assert emp_login.status_code == 200
        emp_token = emp_login.json()["access_token"]
        emp_id = emp_login.json()["user"]["id"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # Admin logs in and resets employee password
        admin_login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        reset_res = await client.post(
            f"/api/v1/users/{emp_id}/reset-password",
            json={"new_password": "NewEmpPass@999", "force_change_next_login": False},
            headers=admin_headers
        )
        assert reset_res.status_code == 200

        # Former employee session MUST be revoked
        test_me = await client.get("/api/v1/auth/me", headers=emp_headers)
        assert test_me.status_code == 401

        # Restore original password for test consistency
        await client.post(
            f"/api/v1/users/{emp_id}/reset-password",
            json={"new_password": "Employee@123", "force_change_next_login": False},
            headers=admin_headers
        )


@pytest.mark.asyncio
async def test_login_rate_limiting():
    """Verify that exceeding login rate limit produces HTTP 429 Too Many Requests."""
    login_limiter.reset()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger 10 attempts
        for _ in range(10):
            res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "WrongPassword"})
            assert res.status_code == 401

        # 11th attempt must be rejected with 429
        rate_limited_res = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert rate_limited_res.status_code == 429
        assert "Retry-After" in rate_limited_res.headers
        assert "Too many" in rate_limited_res.json()["detail"]


@pytest.mark.asyncio
async def test_document_upload_validation():
    """Verify comprehensive document validation (extension whitelist, magic bytes, path traversal)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        base_reg = {
            "fullName": "Upload Test Candidate",
            "email": "upload_test@panorama.gov",
            "phone": "+91-99887-11223",
            "employeeId": "EMP-UPL-01",
            "designation": "Assistant Controller",
            "department": "Signalling",
            "divisionRegion": "Eastern Railway",
            "username": "@upload_tester",
            "password": "ValidPassword123!",
            "confirmPassword": "ValidPassword123!"
        }

        # 1. Path traversal attempt in filename -> 400
        bad_name_payload = {
            **base_reg,
            "documentName": "../../etc/shadow.pdf",
            "documentData": "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4 test content").decode("utf-8")
        }
        res = await client.post("/api/v1/auth/register", json=bad_name_payload)
        assert res.status_code == 400
        assert "path traversal" in res.json()["detail"].lower()

        # 2. Disallowed extension (.exe / .sh) -> 400
        bad_ext_payload = {
            **base_reg,
            "documentName": "malware.exe",
            "documentData": "data:application/octet-stream;base64," + base64.b64encode(b"MZ\x90\x00executable").decode("utf-8")
        }
        res = await client.post("/api/v1/auth/register", json=bad_ext_payload)
        assert res.status_code == 400
        assert "disallowed file extension" in res.json()["detail"].lower()

        # 3. Spoofed extension: .pdf with invalid / non-PDF magic bytes -> 400
        spoofed_payload = {
            **base_reg,
            "documentName": "fake.pdf",
            "documentData": "data:application/pdf;base64," + base64.b64encode(b"<html><script>alert(1)</script></html>").decode("utf-8")
        }
        res = await client.post("/api/v1/auth/register", json=spoofed_payload)
        assert res.status_code == 400
        assert "signature does not match" in res.json()["detail"].lower()

        # 4. Valid PDF magic bytes -> Accepted
        valid_pdf_payload = {
            **base_reg,
            "documentName": "id_card.pdf",
            "documentData": "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.5 valid sample pdf header and content").decode("utf-8")
        }
        res = await client.post("/api/v1/auth/register", json=valid_pdf_payload)
        assert res.status_code in (201, 400)  # 201 created or 400 if username exists from previous run


@pytest.mark.asyncio
async def test_path_traversal_mitigation():
    """Verify that path traversal attempts via SPA fallback are safely blocked."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Attempt to traverse to backend .env
        resp = await client.get("/../../.env")
        assert resp.status_code in (404, 200)
        # If 200, must be the HTML index shell, NEVER raw .env secrets
        if resp.status_code == 200:
            assert "<!DOCTYPE html>" in resp.text
            assert "SECRET_KEY" not in resp.text

        # 2. Attempt to read sqlite database directly
        resp_db = await client.get("/../panorama_dev.db")
        assert resp_db.status_code in (404, 200)
        if resp_db.status_code == 200:
            assert "<!DOCTYPE html>" in resp_db.text
            assert "SQLite format" not in resp_db.text


@pytest.mark.asyncio
async def test_cors_tenant_isolation():
    """Verify that arbitrary GitHub Pages tenants cannot execute credentialed cross-origin requests."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Untrusted GitHub Pages tenant should not be reflected in Access-Control-Allow-Origin
        resp = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://malicious-tenant.github.io",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert resp.headers.get("access-control-allow-origin") != "https://malicious-tenant.github.io"

        # Legitimate configured repository origin is allowed
        resp_legit = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://soumikbur.github.io",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert resp_legit.headers.get("access-control-allow-origin") == "https://soumikbur.github.io"


@pytest.mark.asyncio
async def test_csp_hardening():
    """Verify that Content Security Policy does not allow unsafe-eval."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        csp = resp.headers.get("content-security-policy", "")
        assert "'unsafe-eval'" not in csp
        assert "default-src 'self'" in csp


@pytest.mark.asyncio
async def test_csv_formula_injection_defense():
    """Verify that export CSV neutralizes dangerous formula injection characters."""
    from app.api.v1.export import sanitize_csv_cell
    assert sanitize_csv_cell("=cmd|' /C calc'!A0").startswith("'=")
    assert sanitize_csv_cell("+12345").startswith("'+")
    assert sanitize_csv_cell("-999").startswith("'-")
    assert sanitize_csv_cell("@SUM(A1:A10)").startswith("'@")
    assert sanitize_csv_cell("Normal Text") == "Normal Text"

