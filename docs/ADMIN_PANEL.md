# Admin Panel — Employee Management & Governance

## 1. Executive Summary

The **Employee Management** module within the Panorama Water Tank Monitor NextGen provides railway administrators with full lifecycle governance over operational staff, yard controllers, technicians, and supervisors.

The interface is built into [UsersScreen.tsx](file:///c:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/apps/mobile/src/screens/UsersScreen.tsx) and backed by the administrative REST endpoints in [users.py](file:///c:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/backend/app/api/v1/users.py).

---

## 2. Interface Layout & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│ EMPLOYEE MANAGEMENT CONSOLE                                            │
│ Manage railway operators, access credentials, and security permissions │
├────────────────────────────────────────────────────────────────────────┤
│ [ Total: 8 ]   [ Active: 7 ]   [ Locked: 1 ]   [ Departments: 4 ]      │
├────────────────────────────────────────────────────────────────────────┤
│ [Search name, ID, username...] [Filter: Dept ▾] [Status ▾] [+ Add]     │
├────────────────────────────────────────────────────────────────────────┤
│ EMP ID   NAME         USERNAME    DEPT        ROLE      STATUS  ACTIONS│
│ EMP-001  Admin        @admin      S&T         ADMIN     ACTIVE  [👁]   │
│ EMP-002  R. Sharma    @employee   Rolling Stk EMPLOYEE  ACTIVE  [👁][🔑]│
│ EMP-003  S. Bannerjee @subir.b    Mechanical  EMPLOYEE  LOCKED  [👁][🔑]│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Features & Capabilities

### 3.1 Metric Summary Cards
The top metrics bar automatically aggregates real-time roster statistics:
- **Total Employees**: Count of all registered personnel.
- **Active Personnel**: Personnel with `account_status: ACTIVE`.
- **Locked Accounts**: Personnel locked due to excessive failed attempts or admin intervention.
- **Active Departments**: Distinct count of railway engineering departments represented.

### 3.2 Real-time Search & Multi-Column Filtering
- **Keyword Search**: Matches against Full Name, Username, Employee ID, Designation, or Email in real-time.
- **Department Filter**: Dropdown filtering by specific divisions (e.g., *Signalling & Telecommunications*, *Rolling Stock Operations*, *Mechanical Engineering*, *Electrical & Traction*).
- **Status Filter**: Filter by `ACTIVE`, `INACTIVE`, or `LOCKED`.
- **Role Filter**: Filter by `ADMIN` or `EMPLOYEE`.

### 3.3 Add New Employee
- Modal form collecting:
  - Full Name, Username, Email, Phone.
  - Employee ID, Designation, Department, Division/Region.
  - Role (`EMPLOYEE` or `ADMIN`).
  - Temporary Initial Password.
  - Checkbox: *Force password change on next login*.
- Pre-submission client-side validation ensures username uniqueness and compliant formatting.

### 3.4 Employee Profile Drawer
Clicking **View Details** on any employee opens a right-hand sliding inspection drawer (width: 480px) organized into 4 functional tabs:
1. **Personal Information**: Full Name, Email, Contact Phone, Emergency Contacts.
2. **Employment Details**: Employee ID, Designation, Division/Region, Date of Joining.
3. **Account & Security**: Role badge, Account Status (`ACTIVE`/`INACTIVE`/`LOCKED`), Password Status (*Temporary* vs *Established*), Failed Login Attempts, Last Login Timestamp.
4. **Activity History**: Tabular audit trail showing timestamps, events (e.g., `LOGIN_SUCCESS`, `PASSWORD_RESET`, `STATUS_CHANGE`), IP addresses, and user-agent metadata.

### 3.5 Password Reset Modal
Administrators can securely reset employee passwords without exposing plain text:
- **Generate Secure Temporary Password**: Generates an 8-character cryptographic alphanumeric string (e.g., `K9#mQ2$x`).
- **Force Password Change**: Sets `must_change_password: true`, requiring the employee to update credentials before accessing SCADA controls.
- **Copy Credentials**: One-click clipboard copy formatted for internal railway dispatch.

### 3.6 Account Status Lifecycle & Protection Guardrails
- **Status Toggle**: One-click actions to Deactivate, Activate, or Unlock an account.
- **Root Admin Protection**: The root `@admin` account is programmatically immutable:
  - Cannot be deleted via `DELETE /api/v1/users/{id}` (returns HTTP 400).
  - Cannot have its role downgraded from `ADMIN`.
  - Cannot be set to `INACTIVE` or `LOCKED`.

---

## 4. Backend API Contract

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/users` | `GET` | List employees with optional query filters (`search`, `department`, `role`, `status`). |
| `/api/v1/users` | `POST` | Create a new employee record and hash initial credentials. |
| `/api/v1/users/{id}` | `GET` | Fetch comprehensive employee profile. |
| `/api/v1/users/{id}` | `PUT` | Update profile information (name, department, designation, phone, email). |
| `/api/v1/users/{id}/reset-password` | `POST` | Reset employee password and optionally flag for mandatory change. |
| `/api/v1/users/{id}/status` | `PATCH` | Update status to `ACTIVE`, `INACTIVE`, or `LOCKED`. Clears failed attempts if unlocked. |
| `/api/v1/users/{id}` | `DELETE` | Permanently remove employee record (protected against root admin). |
| `/api/v1/users/{id}/activity` | `GET` | Fetch recent security and authentication audit events for the employee. |
