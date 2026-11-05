"""Developer-controlled CLI recovery script for Panorama SCADA Administrator account.

Usage:
  python backend/scripts/recover_admin.py --status
  python backend/scripts/recover_admin.py --reset-password "<NewPassword>"
  python backend/scripts/recover_admin.py --reset-default
"""
import sys
import os
import argparse
import asyncio

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.audit import AuditEvent
from app.models.base import utc_now


async def show_admin_status():
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where((User.username == "@admin") | (User.username == "admin"))
        )
        admin = result.scalar_one_or_none()
        if not admin:
            print("[!] Primary @admin account not found in database.")
            return
        print("=" * 60)
        print("PANORAMA SCADA ADMINISTRATOR STATUS")
        print("=" * 60)
        print(f"  User ID:         {admin.id}")
        print(f"  Username:        {admin.username}")
        print(f"  Full Name:       {admin.full_name}")
        print(f"  Email:           {admin.email}")
        print(f"  Role:            {admin.role}")
        print(f"  Account Status:  {admin.account_status}")
        print(f"  Is Active:       {admin.is_active}")
        print(f"  Failed Attempts: {admin.failed_login_attempts}")
        print(f"  Last Login:      {admin.last_login_at}")
        print(f"  Last Activity:   {admin.last_activity_at}")
        print("=" * 60)


async def reset_admin_password(new_password: str):
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where((User.username == "@admin") | (User.username == "admin"))
        )
        admin = result.scalar_one_or_none()
        if not admin:
            print("[*] Creating primary @admin account with specified credentials...")
            admin = User(
                username="@admin",
                hashed_password=get_password_hash(new_password),
                full_name="System Administrator",
                email="admin@panorama.railways.gov",
                role="ADMIN",
                employee_id="EMP-001",
                account_status="ACTIVE",
                is_active=True,
                must_change_password=False,
            )
            session.add(admin)
        else:
            admin.hashed_password = get_password_hash(new_password)
            admin.account_status = "ACTIVE"
            admin.is_active = True
            admin.failed_login_attempts = 0
            admin.must_change_password = False
            admin.updated_at = utc_now()

        session.add(AuditEvent(
            user_id=admin.id,
            action="DEVELOPER_ADMIN_RECOVERY",
            target_type="ADMIN",
            target_id=admin.username,
            details='{"source": "cli_developer_recovery", "status": "PASSWORD_RESET"}',
            ip_address="127.0.0.1"
        ))
        await session.commit()
        print(f"[OK] Administrator ({admin.username}) password reset successfully!")


def main():
    parser = argparse.ArgumentParser(description="Developer-controlled Admin Recovery Utility")
    parser.add_argument("--status", action="store_true", help="Display current admin account status")
    parser.add_argument("--reset-password", type=str, help="Set a new secure password for @admin")
    parser.add_argument("--reset-default", action="store_true", help="Restore @admin to Admin@123")

    args = parser.parse_args()

    if args.status:
        asyncio.run(show_admin_status())
    elif args.reset_password:
        asyncio.run(reset_admin_password(args.reset_password))
    elif args.reset_default:
        asyncio.run(reset_admin_password("Admin@123"))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
