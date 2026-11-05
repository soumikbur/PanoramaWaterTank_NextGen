"""Employee and User Management API Router (Admin Only)."""
import json
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, desc

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.audit import AuditEvent
from app.models.base import utc_now
from app.schemas.auth import (
    UserOut,
    UserCreate,
    UserUpdate,
    ResetPasswordRequest,
    UpdateStatusRequest,
    RegistrationActionRequest
)
from app.api.v1.auth import get_current_admin_user

router = APIRouter(prefix="/users", tags=["Users & Employee Management"])


@router.get("", response_model=List[UserOut])
async def list_users(
    search: Optional[str] = None,
    department: Optional[str] = None,
    designation: Optional[str] = None,
    account_status: Optional[str] = None,
    role: Optional[str] = None,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all registered system users/employees with filtering and search."""
    stmt = select(User).order_by(desc(User.created_at))

    filters = []
    if search:
        s = f"%{search.strip()}%"
        filters.append(
            or_(
                User.username.ilike(s),
                User.full_name.ilike(s),
                User.email.ilike(s),
                User.employee_id.ilike(s),
                User.phone.ilike(s),
                User.department.ilike(s),
                User.designation.ilike(s),
            )
        )
    if department:
        filters.append(User.department.ilike(f"%{department.strip()}%"))
    if designation:
        filters.append(User.designation.ilike(f"%{designation.strip()}%"))
    if account_status:
        filters.append(User.account_status == account_status.upper())
    if role:
        filters.append(User.role == role.upper())

    if filters:
        stmt = stmt.where(and_(*filters))

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new employee account with validated fields and initial credentials."""
    uname = data.username.strip()
    if not uname.startswith("@") and not uname.isalnum():
        uname = f"@{uname.lstrip('@')}"

    # Check username collision
    existing = await db.execute(select(User).where(User.username == uname))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Username '{uname}' already exists.")

    # Generate employee ID if omitted
    emp_id = data.employeeId or f"EMP-{secrets.randbelow(900) + 100}"
    existing_emp = await db.execute(select(User).where(User.employee_id == emp_id))
    if existing_emp.scalar_one_or_none():
        emp_id = f"EMP-{secrets.randbelow(9000) + 1000}"

    raw_password = data.password if data.password and data.password.strip() else f"Emp@{secrets.randbelow(900000) + 100000}"

    new_user = User(
        username=uname,
        hashed_password=get_password_hash(raw_password),
        full_name=data.fullName.strip(),
        email=data.email,
        phone=data.phone,
        employee_id=emp_id,
        designation=data.designation or "Station Operator",
        department=data.department or "Rolling Stock Operations",
        division_region=data.divisionRegion or "Eastern Railway (Howrah)",
        role=data.role.upper() if data.role else "EMPLOYEE",
        account_status=data.accountStatus.upper() if data.accountStatus else "ACTIVE",
        is_active=(data.accountStatus.upper() == "ACTIVE") if data.accountStatus else True,
        must_change_password=data.mustChangePassword,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="CREATE_EMPLOYEE",
        target_type="USER",
        target_id=new_user.username,
        details=json.dumps({"employee_id": emp_id, "role": new_user.role, "created_by": current_admin.username}),
        ip_address=client_ip
    ))
    await db.commit()

    return new_user


@router.get("/registrations", response_model=List[UserOut])
async def list_registrations(
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List employee registration requests with optional status and search filtering."""
    stmt = select(User).order_by(desc(User.created_at))
    filters = []

    if status and status.upper() != "ALL":
        filters.append(User.account_status == status.upper())
    else:
        filters.append(User.account_status.in_(["PENDING_APPROVAL", "REJECTED", "ACTIVE"]))

    if search:
        s = f"%{search.strip()}%"
        filters.append(
            or_(
                User.username.ilike(s),
                User.full_name.ilike(s),
                User.email.ilike(s),
                User.employee_id.ilike(s),
                User.department.ilike(s),
                User.designation.ilike(s),
            )
        )

    if filters:
        stmt = stmt.where(and_(*filters))

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/registrations/{reg_id}", response_model=UserOut)
async def get_registration_detail(
    reg_id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve complete details for a specific registration request."""
    result = await db.execute(select(User).where(User.id == reg_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration record not found.")
    return user


@router.post("/registrations/{reg_id}/approve", response_model=UserOut)
async def approve_registration(
    reg_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Approve a pending employee registration request."""
    result = await db.execute(select(User).where(User.id == reg_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration record not found.")

    if user.account_status == "ACTIVE":
        return user

    user.account_status = "ACTIVE"
    user.is_active = True
    user.role = "EMPLOYEE"
    user.approved_at = utc_now()
    user.approved_by = current_admin.username
    user.updated_at = utc_now()

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="REGISTRATION_APPROVED",
        target_type="EMPLOYEE_REGISTRATION",
        target_id=user.username,
        details=json.dumps({
            "employee_id": user.employee_id,
            "approved_by": current_admin.username,
            "ip": client_ip
        }),
        ip_address=client_ip
    ))
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/registrations/{reg_id}/reject", response_model=UserOut)
async def reject_registration(
    reg_id: str,
    action_data: RegistrationActionRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Reject an employee registration request with reason."""
    result = await db.execute(select(User).where(User.id == reg_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration record not found.")

    if user.role == "ADMIN" or user.username in ("@admin", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reject root administrator.")

    rejection_reason = (action_data.rejection_reason or "").strip()
    if not rejection_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A rejection reason is required to reject an employee registration."
        )

    user.account_status = "REJECTED"
    user.is_active = False
    user.rejection_reason = rejection_reason
    user.approved_at = None
    user.approved_by = current_admin.username
    user.updated_at = utc_now()

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="REGISTRATION_REJECTED",
        target_type="EMPLOYEE_REGISTRATION",
        target_id=user.username,
        details=json.dumps({
            "employee_id": user.employee_id,
            "rejected_by": current_admin.username,
            "reason": rejection_reason,
            "ip": client_ip
        }),
        ip_address=client_ip
    ))
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user_detail(
    user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve full employee profile by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    data: UserUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update employee details and assignment information."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    if data.fullName is not None:
        user.full_name = data.fullName.strip()
    if data.email is not None:
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone
    if data.employeeId is not None:
        user.employee_id = data.employeeId
    if data.designation is not None:
        user.designation = data.designation
    if data.department is not None:
        user.department = data.department
    if data.divisionRegion is not None:
        user.division_region = data.divisionRegion
    if data.role is not None:
        # Prevent demoting the root admin
        if user.username in ("@admin", "admin") and data.role.upper() != "ADMIN":
            raise HTTPException(status_code=400, detail="Cannot alter role of primary administrator.")
        user.role = data.role.upper()
    if data.accountStatus is not None:
        st = data.accountStatus.upper()
        if user.username in ("@admin", "admin") and st != "ACTIVE":
            raise HTTPException(status_code=400, detail="Cannot deactivate primary administrator.")
        user.account_status = st
        user.is_active = (st == "ACTIVE")
    if data.isActive is not None:
        user.is_active = data.isActive

    user.updated_at = utc_now()
    await db.commit()
    await db.refresh(user)

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="UPDATE_EMPLOYEE",
        target_type="USER",
        target_id=user.username,
        details=json.dumps({"updated_by": current_admin.username}),
        ip_address=client_ip
    ))
    await db.commit()

    return user


@router.post("/{user_id}/reset-password")
async def reset_employee_password(
    user_id: str,
    payload: ResetPasswordRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin-only password reset for employees. Admin password cannot be reset here."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    if user.username in ("@admin", "admin") or user.role == "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator password cannot be reset through the application interface. Contact system developer."
        )

    new_pwd = payload.new_password if payload.new_password and payload.new_password.strip() else f"EmpReset@{secrets.randbelow(900000) + 100000}"
    user.hashed_password = get_password_hash(new_pwd)
    user.must_change_password = payload.force_change_next_login
    user.token_version = (user.token_version or 1) + 1
    user.updated_at = utc_now()

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="RESET_PASSWORD",
        target_type="USER",
        target_id=user.username,
        details=json.dumps({
            "reset_by": current_admin.username,
            "force_change": payload.force_change_next_login
        }),
        ip_address=client_ip
    ))
    await db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Password reset successfully for {user.username}.",
        "temporary_password": new_pwd,
        "must_change_password": user.must_change_password
    }


@router.post("/{user_id}/status", response_model=UserOut)
async def update_account_status(
    user_id: str,
    payload: UpdateStatusRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Activate, deactivate, or unlock an employee account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    new_st = payload.account_status.upper()
    if new_st not in ("ACTIVE", "INACTIVE", "LOCKED"):
        raise HTTPException(status_code=400, detail="Invalid account status. Allowed: ACTIVE, INACTIVE, LOCKED")

    if user.username in ("@admin", "admin") and new_st != "ACTIVE":
        raise HTTPException(status_code=400, detail="Cannot alter status of primary administrator.")

    user.account_status = new_st
    user.is_active = (new_st == "ACTIVE")
    if new_st == "ACTIVE":
        user.failed_login_attempts = 0
    else:
        user.token_version = (user.token_version or 1) + 1

    user.updated_at = utc_now()
    await db.commit()
    await db.refresh(user)

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action=f"SET_STATUS_{new_st}",
        target_type="USER",
        target_id=user.username,
        details=json.dumps({"status": new_st, "changed_by": current_admin.username}),
        ip_address=client_ip
    ))
    await db.commit()

    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete employee record with safety checks against root admin deletion."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.username in ("@admin", "admin") or user.role == "ADMIN":
        raise HTTPException(status_code=403, detail="Cannot delete root system administrator account.")

    username = user.username
    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_admin.id,
        action="DELETE_USER",
        target_type="USER",
        target_id=username,
        details=json.dumps({"deleted_by": current_admin.username}),
        ip_address=client_ip
    ))
    await db.delete(user)
    await db.commit()

    return {"status": "SUCCESS", "message": f"User '{username}' deleted successfully."}


@router.get("/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve activity audit log for a specific user/employee."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    stmt = (
        select(AuditEvent)
        .where(or_(AuditEvent.user_id == user.id, AuditEvent.target_id == user.username))
        .order_by(desc(AuditEvent.timestamp))
        .limit(20)
    )
    res = await db.execute(stmt)
    events = res.scalars().all()

    return [
        {
            "id": ev.id,
            "action": ev.action,
            "targetType": ev.target_type,
            "targetId": ev.target_id,
            "details": ev.details,
            "ipAddress": ev.ip_address,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
        }
        for ev in events
    ]
