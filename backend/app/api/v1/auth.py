"""Authentication API Router with Secure Role-Based Access Control."""
import json
from datetime import timedelta, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_password_hash, decode_access_token
from app.core.rate_limit import login_limiter, registration_limiter
from app.core.upload_validator import validate_document_upload
from app.models.user import User
from app.models.audit import AuditEvent
from app.models.base import utc_now, generate_uuid
from app.schemas.auth import UserLogin, Token, UserOut, ChangePasswordRequest, EmployeeRegistrationRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Optionally validate JWT token if provided; returns None if unauthenticated."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        if not payload:
            return None
        username = payload.get("sub")
        if not username:
            return None
        result = await db.execute(select(User).where((User.username == username) | (User.id == payload.get("id"))))
        user = result.scalar_one_or_none()
        if not user or not user.is_active or user.account_status != "ACTIVE":
            return None
        return user
    except Exception:
        return None


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Validate JWT token and return active authenticated user."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where((User.username == username) | (User.id == payload.get("id"))))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active or user.account_status == "INACTIVE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    if user.account_status == "LOCKED":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is locked due to security restrictions")
    if user.account_status in ("PENDING_APPROVAL", "REJECTED"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account registration is pending administrator approval or was rejected")

    # Verify session revocation / token version
    token_v = payload.get("v")
    if token_v is not None and token_v != (user.token_version or 1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked or expired. Please log in again."
        )

    # Update last activity timestamp (throttled to avoid SQLite lock contention on concurrent reads)
    now = utc_now()
    last = user.last_activity_at
    if last is not None and getattr(last, "tzinfo", None) is None:
        last = last.replace(tzinfo=timezone.utc)
    if not last or (now - last).total_seconds() > 30:
        user.last_activity_at = now
        await db.commit()
    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Verify administrator permissions."""
    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Administrator privileges required."
        )
    return current_user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT access token with audit recording."""
    client_ip = request.client.host if request.client else "unknown"
    login_limiter.check(client_ip)

    raw_user = credentials.username.strip()

    # Match exact username or alias (@admin / admin, @employee / employee / operator)
    stmt = select(User).where(
        (User.username == raw_user) |
        (User.username == f"@{raw_user}") |
        (User.username == raw_user.lstrip("@"))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 5 and user.role != "ADMIN":
                user.account_status = "LOCKED"
            await db.commit()
            # Audit failed attempt
            db.add(AuditEvent(
                user_id=user.id,
                action="LOGIN_FAILED",
                target_type="AUTH",
                target_id=user.username,
                details=json.dumps({"ip": client_ip, "attempts": user.failed_login_attempts}),
                ip_address=client_ip
            ))
            await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    if user.account_status == "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your employee registration request has been submitted and is awaiting administrator approval."
        )

    if user.account_status == "REJECTED":
        reason_msg = f" Reason: {user.rejection_reason}" if user.rejection_reason else ""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your employee registration request was rejected by the administrator.{reason_msg}"
        )

    if not user.is_active or user.account_status == "INACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your employee account is inactive. Please contact the administrator."
        )

    if user.account_status == "LOCKED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your employee account is locked due to security restrictions. Contact the administrator."
        )

    # Reset failed attempts and update login metadata
    user.failed_login_attempts = 0
    now = utc_now()
    user.last_login_at = now
    user.last_activity_at = now

    # Audit successful login
    db.add(AuditEvent(
        user_id=user.id,
        action="LOGIN_SUCCESS",
        target_type="AUTH",
        target_id=user.username,
        details=json.dumps({"ip": client_ip, "role": user.role}),
        ip_address=client_ip
    ))
    await db.commit()
    await db.refresh(user)

    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={"sub": user.username, "role": user.role, "id": user.id, "v": user.token_version or 1},
        expires_delta=expires_delta
    )

    return Token(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.model_validate(user),
        must_change_password=bool(user.must_change_password)
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return currently authenticated user profile."""
    return UserOut.model_validate(current_user)


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke current user session across all devices."""
    current_user.token_version = (current_user.token_version or 1) + 1
    await db.commit()
    return {"status": "SUCCESS", "message": "Successfully logged out. Session revoked."}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Allow employee to change their temporary or current password. Admin changes are strictly blocked."""
    if current_user.username in ("@admin", "admin") or current_user.role == "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator password cannot be changed inside the application. Contact the system developer for recovery."
        )

    if len(payload.new_password.strip()) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters long.")

    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.must_change_password = False
    current_user.token_version = (current_user.token_version or 1) + 1
    current_user.updated_at = utc_now()

    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=current_user.id,
        action="PASSWORD_CHANGED",
        target_type="USER",
        target_id=current_user.username,
        details=json.dumps({"ip": client_ip, "forced": False}),
        ip_address=client_ip
    ))
    await db.commit()

    return {"status": "SUCCESS", "message": "Password updated successfully."}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_employee(
    registration: EmployeeRegistrationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Register a new railway employee. Account remains PENDING_APPROVAL until approved by an administrator."""
    client_ip = request.client.host if request.client else "unknown"
    registration_limiter.check(client_ip)
    validate_document_upload(registration.documentName, registration.documentData)

    raw_username = registration.username.strip()
    clean_username = raw_username if raw_username.startswith("@") else f"@{raw_username}"

    if clean_username.lower() in ("@admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username @admin is reserved for root system administration."
        )

    if len(registration.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )
    if registration.password != registration.confirmPassword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match."
        )

    # Check for existing username
    existing_user = await db.execute(select(User).where(User.username.ilike(clean_username)))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{clean_username}' is already registered."
        )

    # Check for existing email
    if registration.email:
        existing_email = await db.execute(select(User).where(User.email.ilike(registration.email.strip())))
        if existing_email.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{registration.email}' is already registered."
            )

    # Check for existing employee ID
    if registration.employeeId:
        existing_emp_id = await db.execute(select(User).where(User.employee_id.ilike(registration.employeeId.strip())))
        if existing_emp_id.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee ID '{registration.employeeId}' is already registered."
            )

    dob = None
    if registration.dateOfBirth:
        try:
            dob = datetime.fromisoformat(registration.dateOfBirth)
        except Exception:
            pass

    joining = utc_now()
    if registration.joiningDate:
        try:
            joining = datetime.fromisoformat(registration.joiningDate)
        except Exception:
            pass

    emp_uuid = generate_uuid()
    new_employee = User(
        id=emp_uuid,
        username=clean_username,
        hashed_password=get_password_hash(registration.password),
        full_name=registration.fullName.strip(),
        email=registration.email.strip().lower() if registration.email else None,
        phone=registration.phone.strip(),
        employee_id=registration.employeeId.strip().upper(),
        designation=registration.designation.strip(),
        department=registration.department.strip(),
        division_region=registration.divisionRegion.strip(),
        date_of_birth=dob,
        gender=registration.gender.strip() if registration.gender else None,
        residential_address=registration.residentialAddress.strip() if registration.residentialAddress else None,
        assigned_location=registration.assignedLocation.strip() if registration.assignedLocation else None,
        reporting_manager=registration.reportingManager.strip() if registration.reportingManager else None,
        document_name=registration.documentName.strip() if registration.documentName else None,
        document_url=registration.documentData if registration.documentData else None,
        joining_date=joining,
        role="EMPLOYEE",  # Strictly EMPLOYEE, never ADMIN
        account_status="PENDING_APPROVAL",
        is_active=False,
        must_change_password=False,
        registration_date=utc_now(),
    )

    db.add(new_employee)
    client_ip = request.client.host if request.client else "unknown"
    db.add(AuditEvent(
        user_id=emp_uuid,
        action="REGISTRATION_SUBMITTED",
        target_type="EMPLOYEE_REGISTRATION",
        target_id=new_employee.username,
        details=json.dumps({
            "employee_id": new_employee.employee_id,
            "department": new_employee.department,
            "ip": client_ip
        }),
        ip_address=client_ip
    ))
    await db.commit()

    return {
        "message": "Your employee registration request has been submitted and is awaiting administrator approval.",
        "registration_id": emp_uuid,
        "username": new_employee.username,
        "status": "PENDING_APPROVAL"
    }
