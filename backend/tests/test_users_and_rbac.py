"""Test suite for User & Employee Management, Password Policies, and RBAC."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_employee_rbac_access_restrictions():
    """Verify that employee cannot access administrative user management endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as Employee
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"username": "@employee", "password": "Employee@123"}
        )
        assert login_res.status_code == 200
        emp_token = login_res.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # 2. Try to access user management endpoint as Employee (must be 403 Forbidden)
        users_res = await client.get("/api/v1/users", headers=emp_headers)
        assert users_res.status_code == 403
        assert "Administrator privileges required" in users_res.json()["detail"]

        # 3. Try to create user as Employee (must be 403 Forbidden)
        create_res = await client.post(
            "/api/v1/users",
            json={"username": "@test_emp", "fullName": "Test Employee"},
            headers=emp_headers
        )
        assert create_res.status_code == 403


@pytest.mark.asyncio
async def test_admin_user_management_lifecycle():
    """Verify complete admin employee management: create, edit, reset password, status, delete."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as Admin
        admin_login = await client.post(
            "/api/v1/auth/login",
            json={"username": "@admin", "password": "Admin@123"}
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. List users
        users_res = await client.get("/api/v1/users", headers=admin_headers)
        assert users_res.status_code == 200
        users_list = users_res.json()
        assert len(users_list) >= 2

        # 3. Create a new employee with unique username
        import secrets
        rnd_suffix = secrets.token_hex(3)
        uname = f"@rajesh.{rnd_suffix}"
        new_emp_payload = {
            "username": uname,
            "password": "TempPassword@123",
            "fullName": "Rajesh Kumar",
            "email": f"rajesh.{rnd_suffix}@railways.gov.in",
            "phone": "+91-98765-43210",
            "employeeId": f"EMP-{secrets.randbelow(800) + 100}",
            "designation": "Depot Supervisor",
            "department": "Rolling Stock Mechanical",
            "divisionRegion": "Howrah Division",
            "role": "EMPLOYEE",
            "accountStatus": "ACTIVE",
            "mustChangePassword": True
        }
        create_res = await client.post("/api/v1/users", json=new_emp_payload, headers=admin_headers)
        assert create_res.status_code == 201
        created_user = create_res.json()
        emp_id = created_user["id"]
        assert created_user["username"] == uname
        assert (created_user.get("employeeId") or created_user.get("employee_id")).startswith("EMP-")
        assert (created_user.get("mustChangePassword") or created_user.get("must_change_password")) is True

        # 4. Edit employee details
        update_payload = {
            "fullName": "Rajesh Kumar Sharma",
            "designation": "Senior Depot Supervisor"
        }
        update_res = await client.put(f"/api/v1/users/{emp_id}", json=update_payload, headers=admin_headers)
        assert update_res.status_code == 200
        res_data = update_res.json()
        assert (res_data.get("fullName") or res_data.get("full_name")) == "Rajesh Kumar Sharma"
        assert res_data.get("designation") == "Senior Depot Supervisor"

        # 5. Admin resets employee password
        reset_res = await client.post(
            f"/api/v1/users/{emp_id}/reset-password",
            json={"new_password": "NewEmpPass@2026", "force_change_next_login": True},
            headers=admin_headers
        )
        assert reset_res.status_code == 200
        assert reset_res.json()["must_change_password"] is True

        # 6. Verify employee can log in with new password
        emp_login = await client.post(
            "/api/v1/auth/login",
            json={"username": uname, "password": "NewEmpPass@2026"}
        )
        assert emp_login.status_code == 200
        assert emp_login.json()["must_change_password"] is True
        emp_token = emp_login.json()["access_token"]

        # 7. Employee updates their password
        change_res = await client.post(
            "/api/v1/auth/change-password",
            json={"new_password": "PermanentSecret@123"},
            headers={"Authorization": f"Bearer {emp_token}"}
        )
        assert change_res.status_code == 200

        # 8. Deactivate employee account
        status_res = await client.post(
            f"/api/v1/users/{emp_id}/status",
            json={"account_status": "INACTIVE"},
            headers=admin_headers
        )
        assert status_res.status_code == 200
        assert (status_res.json().get("accountStatus") or status_res.json().get("account_status")) == "INACTIVE"

        # 9. Verify inactive employee cannot login
        inactive_login = await client.post(
            "/api/v1/auth/login",
            json={"username": uname, "password": "PermanentSecret@123"}
        )
        assert inactive_login.status_code == 403

        # 10. Reactivate and then delete employee
        await client.post(
            f"/api/v1/users/{emp_id}/status",
            json={"account_status": "ACTIVE"},
            headers=admin_headers
        )
        del_res = await client.delete(f"/api/v1/users/{emp_id}", headers=admin_headers)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_admin_password_policy_restrictions():
    """Verify that admin password cannot be reset or changed in-app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as Admin
        admin_login = await client.post(
            "/api/v1/auth/login",
            json={"username": "@admin", "password": "Admin@123"}
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_id = admin_login.json()["user"]["id"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Attempt in-app password change as Admin (must be 403 Forbidden)
        change_res = await client.post(
            "/api/v1/auth/change-password",
            json={"new_password": "NewAdminPass@123"},
            headers=admin_headers
        )
        assert change_res.status_code == 403
        assert "Administrator password cannot be changed inside the application" in change_res.json()["detail"]

        # 2. Attempt to reset Admin password via reset-password endpoint (must be 403 Forbidden)
        reset_res = await client.post(
            f"/api/v1/users/{admin_id}/reset-password",
            json={"new_password": "NewAdminPass@123"},
            headers=admin_headers
        )
        assert reset_res.status_code == 403

        # 3. Attempt to delete Admin account (must be 403 Forbidden)
        del_res = await client.delete(f"/api/v1/users/{admin_id}", headers=admin_headers)
        assert del_res.status_code == 403
