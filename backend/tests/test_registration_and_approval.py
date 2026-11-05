import secrets
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_employee_registration_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_suffix = secrets.token_hex(3)
        reg_username = f"@test_emp_{unique_suffix}"
        reg_email = f"test.emp.{unique_suffix}@panorama.railways.gov"
        reg_empid = f"EMP-{unique_suffix.upper()}"
        reg_password = "SecurePassword@123"

        # 1. Attempt invalid registrations
        # A. Reserved username @admin
        bad_admin_res = await client.post("/api/v1/auth/register", json={
            "username": "@admin",
            "password": "Password123",
            "confirm_password": "Password123",
            "full_name": "Fake Admin",
            "email": "fake.admin@railways.gov",
            "phone": "+91-99999-00000",
            "employee_id": f"EMP-BAD-{unique_suffix}",
            "designation": "Operator",
            "department": "Rolling Stock",
            "division_region": "Eastern Railway",
        })
        assert bad_admin_res.status_code == 400
        assert "reserved" in bad_admin_res.json()["detail"].lower()

        # B. Password mismatch
        mismatch_res = await client.post("/api/v1/auth/register", json={
            "username": reg_username,
            "password": "Password123",
            "confirm_password": "DifferentPassword",
            "full_name": "Test Employee",
            "email": reg_email,
            "phone": "+91-99999-00001",
            "employee_id": reg_empid,
            "designation": "Operator",
            "department": "Rolling Stock",
            "division_region": "Eastern Railway",
        })
        assert mismatch_res.status_code == 400
        assert "passwords do not match" in mismatch_res.json()["detail"].lower()

        # 2. Successful registration submission
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": reg_username,
            "password": reg_password,
            "confirm_password": reg_password,
            "full_name": f"Test Operator {unique_suffix}",
            "date_of_birth": "1994-06-15T00:00:00Z",
            "gender": "Male",
            "email": reg_email,
            "phone": "+91-98765-43210",
            "residential_address": "12 Railway Colony, Howrah",
            "employee_id": reg_empid,
            "designation": "Assistant Yard Supervisor",
            "department": "Rolling Stock Operations",
            "division_region": "Howrah Division (HWH)",
            "assigned_location": "Howrah Yard Platform 8",
            "reporting_manager": "Chief Yard Controller",
            "document_name": "railway_id_proof.pdf",
        })
        assert reg_res.status_code == 201
        reg_data = reg_res.json()
        assert reg_data["status"] == "PENDING_APPROVAL"
        reg_id = reg_data["registration_id"]

        # 3. Duplicate registration checks
        dup_res = await client.post("/api/v1/auth/register", json={
            "username": reg_username,
            "password": reg_password,
            "confirm_password": reg_password,
            "full_name": "Duplicate Employee",
            "email": f"other.{unique_suffix}@railways.gov",
            "phone": "+91-99999-00002",
            "employee_id": f"EMP-OTHER-{unique_suffix}",
            "designation": "Operator",
            "department": "Rolling Stock",
            "division_region": "Eastern Railway",
        })
        assert dup_res.status_code == 400
        assert "already registered" in dup_res.json()["detail"].lower()

        # 4. Attempt login with PENDING_APPROVAL account -> must be rejected (HTTP 403)
        pending_login_res = await client.post("/api/v1/auth/login", json={
            "username": reg_username,
            "password": reg_password
        })
        assert pending_login_res.status_code == 403
        assert "awaiting administrator approval" in pending_login_res.json()["detail"].lower()

        # 5. Admin Authentication
        admin_login = await client.post("/api/v1/auth/login", json={
            "username": "@admin",
            "password": "Admin@123"
        })
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 6. Admin lists registrations
        list_res = await client.get("/api/v1/users/registrations?status=PENDING_APPROVAL", headers=admin_headers)
        assert list_res.status_code == 200
        registrations = list_res.json()
        matching_regs = [r for r in registrations if r["username"].lower() == reg_username.lower()]
        assert len(matching_regs) == 1
        reg_record = matching_regs[0]
        assert (reg_record.get("accountStatus") or reg_record.get("account_status")) == "PENDING_APPROVAL"
        assert (reg_record.get("fullName") or reg_record.get("full_name")) == f"Test Operator {unique_suffix}"

        # 7. Admin views registration detail
        detail_res = await client.get(f"/api/v1/users/registrations/{reg_id}", headers=admin_headers)
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["id"] == reg_id
        assert (detail.get("employeeId") or detail.get("employee_id")) == reg_empid
        assert (detail.get("documentName") or detail.get("document_name")) == "railway_id_proof.pdf"

        # 8. Test Rejection flow on a second applicant
        reject_suffix = secrets.token_hex(3)
        rej_username = f"@reject_emp_{reject_suffix}"
        rej_res = await client.post("/api/v1/auth/register", json={
            "username": rej_username,
            "password": "RejectPassword@123",
            "confirm_password": "RejectPassword@123",
            "full_name": "Rejected Applicant",
            "email": f"reject.{reject_suffix}@panorama.railways.gov",
            "phone": "+91-99999-11111",
            "employee_id": f"EMP-REJ-{reject_suffix.upper()}",
            "designation": "Temporary Trainee",
            "department": "Mechanical Engineering",
            "division_region": "Eastern Railway",
        })
        assert rej_res.status_code == 201
        rej_id = rej_res.json()["registration_id"]

        # Reject without reason -> 400
        bad_reject = await client.post(f"/api/v1/users/registrations/{rej_id}/reject", json={
            "rejection_reason": ""
        }, headers=admin_headers)
        assert bad_reject.status_code == 400

        # Reject with reason -> 200
        good_reject = await client.post(f"/api/v1/users/registrations/{rej_id}/reject", json={
            "rejection_reason": "Incomplete organizational background verification documents."
        }, headers=admin_headers)
        assert good_reject.status_code == 200
        assert (good_reject.json().get("accountStatus") or good_reject.json().get("account_status")) == "REJECTED"

        # Attempt login with REJECTED account -> 403 with reason
        rej_login = await client.post("/api/v1/auth/login", json={
            "username": rej_username,
            "password": "RejectPassword@123"
        })
        assert rej_login.status_code == 403
        assert "rejected" in rej_login.json()["detail"].lower()
        assert "incomplete organizational background" in rej_login.json()["detail"].lower()

        # 9. Admin approves original applicant
        approve_res = await client.post(f"/api/v1/users/registrations/{reg_id}/approve", headers=admin_headers)
        assert approve_res.status_code == 200
        approved_user = approve_res.json()
        assert (approved_user.get("accountStatus") or approved_user.get("account_status")) == "ACTIVE"
        assert (approved_user.get("isActive") or approved_user.get("is_active")) is True
        assert approved_user["role"] == "EMPLOYEE"
        assert (approved_user.get("approvedBy") or approved_user.get("approved_by")) == "@admin"

        # 10. Approved employee can now successfully log in!
        emp_login = await client.post("/api/v1/auth/login", json={
            "username": reg_username,
            "password": reg_password
        })
        assert emp_login.status_code == 200
        emp_token_data = emp_login.json()
        assert "access_token" in emp_token_data
        assert emp_token_data["user"]["role"] == "EMPLOYEE"
        assert (emp_token_data["user"].get("accountStatus") or emp_token_data["user"].get("account_status")) == "ACTIVE"
