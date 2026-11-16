# API Documentation — Panorama Water Tank Monitor (NextGen)

**Specification**: OpenAPI 3.1  
**Base URL**: `/api/v1`  
**Authentication**: Bearer JWT (`Authorization: Bearer <token>`)  
**Protocols**: HTTPS, WSS (WebSockets), MQTTS  

---

## 1. Authentication & User Management

### `POST /api/v1/auth/login`
- **Description**: Authenticate with username and password to retrieve a JWT access token.
- **Request Body**:
  ```json
  {
    "username": "@admin",
    "password": "Admin@123"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "uuid",
      "username": "@admin",
      "role": "ADMIN",
      "fullName": "System Administrator"
    }
  }
  ```

---

## 2. Health & Diagnostics (Phase 7)

### `GET /api/v1/health`
- **Description**: Full system health check validating database, MQTT broker, and active WebSocket connections.
- **Response (200 OK)**:
  ```json
  {
    "status": "HEALTHY",
    "app": "Panorama Water Tank Monitor",
    "version": "2.0.0",
    "environment": "development",
    "timestamp": "2026-11-16T09:44:48.123456+00:00",
    "uptimeSeconds": 1420,
    "database": {
      "status": "CONNECTED",
      "responseTimeMs": 1.25,
      "engine": "postgresql"
    },
    "mqtt": {
      "status": "CONNECTED",
      "broker": "broker.hivemq.com",
      "port": 1883
    },
    "websockets": {
      "activeClients": 3
    }
  }
  ```
- **Response (503 Service Unavailable)**: Returned if the database is disconnected.

### `GET /api/v1/health/database`
- **Description**: Granular database connectivity, latency, and pool diagnostic endpoint.
- **Response (200 OK)**:
  ```json
  {
    "status": "HEALTHY",
    "connected": true,
    "responseTimeMs": 0.85,
    "databaseEngine": "postgresql",
    "pool": {
      "dialect": "postgresql",
      "isPostgreSQL": true,
      "poolSize": 10,
      "checkedIn": 10,
      "checkedOut": 0,
      "overflow": 0
    },
    "timestamp": "2026-11-16T09:44:48.234567+00:00",
    "error": null
  }
  ```

### `GET /api/v1/health/mqtt`
- **Description**: Granular MQTT broker telemetry client and subscription inspector.
- **Response (200 OK)**:
  ```json
  {
    "status": "HEALTHY",
    "connected": true,
    "broker": {
      "host": "broker.hivemq.com",
      "port": 1883,
      "tls": false,
      "clientIdPrefix": "panorama-backend"
    },
    "topics": {
      "telemetryFilter": "panorama/telemetry/+",
      "statusFilter": "panorama/status/+",
      "commandPrefix": "panorama/commands/",
      "syncPrefix": "panorama/sync/#"
    },
    "timestamp": "2026-11-16T09:44:48.345678+00:00"
  }
  ```

### `GET /api/v1/health/system`
- **Description**: Runtime process telemetry, memory footprint, and operating environment.
- **Response (200 OK)**:
  ```json
  {
    "status": "HEALTHY",
    "app": "Panorama Water Tank Monitor",
    "version": "2.0.0",
    "environment": "development",
    "startedAt": "2026-11-16T09:20:00+00:00",
    "uptimeSeconds": 1488,
    "runtime": {
      "pythonVersion": "3.11.9",
      "platform": "Windows-10-10.0.26100-SP0",
      "architecture": "AMD64",
      "processId": 8412
    },
    "memory": {
      "rssBytes": 68157440,
      "rssMb": 65.0,
      "cpuPercent": 0.2
    },
    "timestamp": "2026-11-16T09:44:48.456789+00:00"
  }
  ```

---

## 3. Fleet & Train Management

### `GET /api/v1/trains`
- **Description**: List all active configured trains.

### `POST /api/v1/trains`
- **Description**: Create or register a new train with coach consist.
- **Request Body**:
  ```json
  {
    "train_number": "12002",
    "name": "Bhopal Shatabdi Express",
    "region": "NORTH",
    "coaches": [
      { "coach_number": "E1", "coach_category": "PASSENGER", "coach_type": "EXECUTIVE_CHAIR_CAR" },
      { "coach_number": "C1", "coach_category": "PASSENGER", "coach_type": "AC_CHAIR_CAR" }
    ]
  }
  ```

### `DELETE /api/v1/trains/{train_number}`
- **Description**: Soft delete a train and cascade unassignment of devices without data loss.

---

## 4. Hardware Devices & Auto-Discovery

### `GET /api/v1/devices`
- **Description**: Retrieve all registered and auto-discovered edge hardware nodes.

### `POST /api/v1/devices`
- **Description**: Authorize and register a discovered hardware UID.

### `PUT /api/v1/devices/{uid}`
- **Description**: Map or update a device's train and coach assignment.

---

## 5. System Configuration & Unified Settings

### `POST /api/v1/settings/apply`
- **Description**: Validate and apply 5-section unified SCADA configuration (MQTT, Geometry, Thresholds, Ubidots, Modems).
