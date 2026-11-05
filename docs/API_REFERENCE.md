# Panorama Water Tank Monitor — REST & WebSocket API Reference

The NextGen backend provides an OpenAPI 3.1 compliant REST API and a real-time WebSocket protocol under the `/api/v1` namespace.

---

## 1. Authentication & Security

All REST requests (except `/auth/login` and `/health`) must include a valid JWT Bearer token in the `Authorization` HTTP header:
```http
Authorization: Bearer <jwt_access_token>
```

### 1.1 POST `/api/v1/auth/login`
Authenticates an operator or administrator and issues a JWT token. Automatically normalizes usernames (e.g. `@admin` and `admin` resolve to `@admin`).
- **Request Body**:
```json
{
  "username": "@admin",
  "password": "Admin@123"
}
```
- **Response `200 OK`**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5c...",
  "token_type": "bearer",
  "expires_in": 86400,
  "must_change_password": false,
  "user": {
    "id": "11111111-2222-3333-4444-555555555555",
    "username": "@admin",
    "fullName": "System Administrator",
    "email": "admin@panorama.railways.gov",
    "phone": "+91-33-2641-0001",
    "employeeId": "EMP-001",
    "designation": "Chief SCADA Administrator",
    "department": "Signalling & Telecommunications",
    "divisionRegion": "Eastern Railway HQ",
    "role": "ADMIN",
    "accountStatus": "ACTIVE",
    "isActive": true,
    "mustChangePassword": false,
    "lastLoginAt": "2026-11-05T08:00:00Z"
  }
}
```
- **Error Responses**:
  - `401 Unauthorized`: Invalid railway credentials, or account is `INACTIVE` or `LOCKED`.

### 1.2 GET `/api/v1/auth/me`
Returns the currently authenticated user's profile based on the JWT Bearer token.
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**: Same as `user` object above.

### 1.3 POST `/api/v1/auth/change-password`
Allows an authenticated employee to change their password.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
```json
{
  "current_password": "Employee@123",
  "new_password": "NewEmployeePassword@2026"
}
```
- **Response `200 OK`**:
```json
{
  "message": "Password updated successfully"
}
```
- **Error Responses**:
  - `403 Forbidden`: Returned if called by an `ADMIN` account (*Administrator passwords cannot be changed in-app. Use the secure developer recovery CLI tool.*).
  - `400 Bad Request`: Password too short (< 6 characters) or current password incorrect.

---

### 1.4 POST /api/v1/auth/register
Public registration endpoint for new railway employees. Creates a profile with role EMPLOYEE and status PENDING_APPROVAL.
- **Request Body**: EmployeeRegistrationRequest
- **Response 201 Created**: Returns registration confirmation with registration_id, username, and account_status: PENDING_APPROVAL.

---

## 2. Fleet & Device Endpoints

### 2.1 GET `/api/v1/devices`
Lists monitored coach units with optional filtering and pagination.
- **Query Parameters**:
  - `search` (string, optional): Search by `uid`, `trainNumber`, or `coachNumber`.
  - `isOnline` (boolean, optional): Filter by connectivity status.
- **Response `200 OK`**:
```json
[
  {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "uid": "0026004D4B42501120353332",
    "trainNumber": "12002",
    "coachNumber": "B4",
    "name": "Shatabdi Coach B4 Water System",
    "isOnline": true,
    "lastSeenAt": "2026-10-28T12:00:00Z",
    "primaryLevel": 76.5,
    "secondaryLevel": 74.8,
    "hasActiveAlarm": false
  }
]
```

### 2.2 GET `/api/v1/devices/{id}/diagnostics`
Retrieves granular edge engineering parameters (ADC voltages, GPS, signal strength).
- **Response `200 OK`**:
```json
{
  "deviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "uid": "0026004D4B42501120353332",
  "batteryV1": 12.65,
  "auxiliaryV2": 12.58,
  "gps": {
    "latitude": 28.6139,
    "longitude": 77.2090,
    "altitudeMeters": 216.5,
    "speedKmh": 64.2,
    "satellites": 8
  },
  "sensorHealth": {
    "sensor1Valid": true,
    "sensor2Valid": true
  },
  "lastPayloadAt": "2026-10-28T12:00:00Z"
}
```

---

## 3. Water Tank Endpoints

### 3.1 GET `/api/v1/tanks/live`
Returns the real-time operational state for the primary dashboard tank.
- **Response `200 OK`**:
```json
{
  "tankId": "d4c3b2a1-6f5e-4b3a-2c1d-0e9f8a7b6c5d",
  "deviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "deviceUid": "0026004D4B42501120353332",
  "trainNumber": "12002",
  "coachNumber": "B4",
  "tankName": "Coach B4 Primary Tank",
  "levelPercent": 76.5,
  "rawLevelPercent": 76.5,
  "volumeLiters": 15.3,
  "heightCm": 38.3,
  "capacityLiters": 20.0,
  "maxHeightCm": 50.0,
  "crossSectionalAreaM2": 0.04,
  "rank": "HIGH",
  "alarmStatus": "NORMAL",
  "batteryVoltage": 12.65,
  "isOnline": true,
  "lastUpdate": "2026-10-28T12:00:00Z"
}
```

### 3.2 PUT `/api/v1/tanks/{id}`
Updates geometric parameters and alarm thresholds for a tank.
- **Request Body**:
```json
{
  "capacityLiters": 20.0,
  "heightCm": 50.0,
  "areaM2": 0.04,
  "warningThresholdPercent": 20.0,
  "criticalThresholdPercent": 10.0,
  "overflowThresholdPercent": 100.0
}
```

---

## 4. Telemetry & Historical Trends

### 4.1 GET `/api/v1/telemetry/history`
Returns aggregated time-series data with LTTB (Largest-Triangle-Three-Buckets) downsampling to ~100 points for smooth frontend chart rendering.
- **Query Parameters**:
  - `tankId` (UUID, required): Tank identifier.
  - `range` (string, default: `24h`): `12h`, `24h`, or `7d`.
- **Response `200 OK`**:
```json
{
  "tankId": "d4c3b2a1-6f5e-4b3a-2c1d-0e9f8a7b6c5d",
  "range": "24h",
  "stats": {
    "averagePercent": 72.4,
    "minPercent": 48.0,
    "maxPercent": 92.5,
    "deltaPercent": -12.3
  },
  "dataPoints": [
    {
      "timestamp": "2026-10-27T12:00:00Z",
      "levelPercent": 88.8,
      "volumeLiters": 17.8,
      "heightCm": 44.4
    },
    {
      "timestamp": "2026-10-28T12:00:00Z",
      "levelPercent": 76.5,
      "volumeLiters": 15.3,
      "heightCm": 38.3
    }
  ]
}
```

---

## 5. Alarms & Notifications

### 5.1 GET `/api/v1/alarms`
Lists active or historical alarm events.
- **Query Parameters**:
  - `status` (string, optional): `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`.
- **Response `200 OK`**:
```json
[
  {
    "id": "e9a8b7c6-d5e4-3f2a-1b0c-9d8e7f6a5b4c",
    "deviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "coachNumber": "B4",
    "alarmType": "WARNING_LOW",
    "severity": "WARNING",
    "triggerValue": 18.2,
    "thresholdValue": 20.0,
    "message": "Water Level low (18.2% < 20.0%)",
    "status": "ACTIVE",
    "triggeredAt": "2026-10-28T11:45:12Z"
  }
]
```

### 5.2 POST `/api/v1/alarms/{id}/acknowledge`
Acknowledges an active alarm event.
- **Request Body**:
```json
{
  "comment": "Refilling arranged at next junction."
}
```

---

## 6. CSV Data Export

### 6.1 GET `/api/v1/export/csv`
Streams telemetry readings formatted as an RFC 4180 CSV document.
- **Query Parameters**:
  - `tankId` (UUID, required)
  - `range` (string, optional): `12h`, `24h`, `7d`
- **Response Headers**:
  - `Content-Type: text/csv`
  - `Content-Disposition: attachment; filename="water_tank_history_20261028.csv"`
- **CSV Content Format**:
```csv
Timestamp,Train_Number,Coach_Number,Device_UID,Level_Percent,Volume_Liters,Height_cm,Battery_V1,Status
2026-10-28T12:00:00Z,12002,B4,0026004D4B42501120353332,76.5,15.3,38.3,12.65,NORMAL
```

---

## 7. Real-Time WebSocket Interface

### 7.1 Endpoint: `WS /api/v1/ws/live`
Clients connect to receive sub-second push notifications without polling.

#### Client -> Server Frame: Subscription
```json
{
  "action": "SUBSCRIBE",
  "deviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
}
```

#### Server -> Client Frame: Telemetry Update
```json
{
  "event": "TELEMETRY_UPDATE",
  "data": {
    "deviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "deviceUid": "0026004D4B42501120353332",
    "timestamp": "2026-10-28T12:00:00Z",
    "primaryLevel": 76.5,
    "primaryVolume": 15.3,
    "primaryHeight": 38.3,
    "primaryRank": "HIGH",
    "secondaryLevel": 74.8,
    "batteryVoltage": 12.65,
    "gpsSpeed": 64.2,
    "isOnline": true
  }
}
```

#### Server -> Client Frame: Alarm Event
```json
{
  "event": "ALARM_TRIGGERED",
  "data": {
    "alarmId": "e9a8b7c6-d5e4-3f2a-1b0c-9d8e7f6a5b4c",
    "type": "CRITICAL_LOW",
    "severity": "CRITICAL",
    "message": "Water Level critical: 8.5% < 10.0%",
    "timestamp": "2026-10-28T12:01:00Z"
  }
}
```

---

## 8. Employee Management Endpoints (Admin Only)

All endpoints in this section require `Authorization: Bearer <token>` and `role: ADMIN`. Calls by non-admin accounts return `403 Forbidden`.

### 8.1 GET `/api/v1/users`
Lists railway personnel with optional search and filters.
- **Query Parameters**:
  - `search` (string, optional): Search by name, username, employee ID, designation, or email.
  - `department` (string, optional): Filter by department.
  - `role` (string, optional): Filter by `ADMIN` or `EMPLOYEE`.
  - `account_status` (string, optional): Filter by `ACTIVE`, `INACTIVE`, or `LOCKED`.
- **Response `200 OK`**: Array of `UserOut` objects.

### 8.2 POST `/api/v1/users`
Registers a new railway employee.
- **Request Body**:
```json
{
  "username": "@rajesh.kumar",
  "password": "InitialTempPassword123",
  "full_name": "Rajesh Kumar",
  "email": "rajesh.kumar@panorama.railways.gov",
  "phone": "+91-98300-12345",
  "employee_id": "EMP-045",
  "designation": "Yard Supervisor",
  "department": "Rolling Stock Operations",
  "division_region": "Howrah Division (HWH)",
  "role": "EMPLOYEE",
  "must_change_password": true
}
```
- **Response `201 Created`**: Returns created `UserOut` object.

### 8.3 GET `/api/v1/users/{id}`
Fetches detailed employee profile by ID.

### 8.4 PUT `/api/v1/users/{id}`
Updates editable employee attributes (full name, email, phone, designation, department, division/region, role).

### 8.5 POST `/api/v1/users/{id}/reset-password`
Resets an employee's password.
- **Request Body**:
```json
{
  "new_password": "NewTemporaryPassword2026!",
  "must_change_password": true
}
```
- **Response `200 OK`**:
```json
{
  "message": "Password reset successfully",
  "must_change_password": true
}
```

### 8.6 PATCH `/api/v1/users/{id}/status`
Updates account status (`ACTIVE`, `INACTIVE`, `LOCKED`). Unlocking an account resets `failed_login_attempts` to 0.
- **Request Body**:
```json
{
  "account_status": "ACTIVE"
}
```

### 8.7 DELETE `/api/v1/users/{id}`
Permanently deletes an employee.
- **Guardrail**: Root `@admin` account cannot be deleted (returns `400 Bad Request`).

### 8.8 GET `/api/v1/users/{id}/activity`
Returns the recent security and authentication audit history for the specified user.

---

### 8.9 GET /api/v1/users/registrations
Lists pending and historical employee registration requests with optional status and search filters.

### 8.10 GET /api/v1/users/registrations/{id}
Retrieves complete application dossier for a specific registration request.

### 8.11 POST /api/v1/users/registrations/{id}/approve
Approves an employee application and transitions account status to ACTIVE.

### 8.12 POST /api/v1/users/registrations/{id}/reject
Rejects an employee application. Mandatory rejection reason required.

---

## 9. Protected System Administration Endpoints (Admin Only)

### 9.1 POST `/api/v1/settings/apply`
Applies unified railway SCADA geometry, thresholds, MQTT parameters, and server configurations.
- **Requires**: `ADMIN` role (returns `403 Forbidden` if called by `EMPLOYEE`).

### 9.2 POST `/api/v1/settings/factory-reset`
Restores system parameters to factory baseline.
- **Requires**: `ADMIN` role (returns `403 Forbidden` if called by `EMPLOYEE`).
