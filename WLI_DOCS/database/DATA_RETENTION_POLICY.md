# Panorama Water Tank Monitor – Data Retention Policy

## 1. Core Principle: Zero Automatic Data Loss

All application data in the **Panorama Water Tank Monitor** must remain permanently stored until an authorized administrator explicitly deletes it. 

The database retains records across:
- Browser close, refresh, or session termination.
- Client computer restart or disconnection.
- Backend server restart or cold boot.
- Backend deployment or container redeployments on Render.
- GitHub Pages static bundle updates.
- Temporary or prolonged MQTT broker disconnects.
- Cross-device concurrent access.

---

## 2. Strict Prohibition of Automatic Deletion and TTL

1. **No Time-to-Live (TTL):** No TTL or automatic expiration policy is applied to `trains`, `coaches`, `devices`, `tanks`, `telemetry_readings`, `alarms`, or `audit_events`.
2. **Zero Automatic Truncation:** Telemetry historical records are retained indefinitely for predictive maintenance, regulatory reporting, and water consumption auditing.
3. **No Startup Resets or Drops:** The application startup procedure (`init_db()` in `backend/app/core/database.py`) is strictly idempotent and non-destructive. It executes `Base.metadata.create_all()` and safely adds missing columns; it **never** issues `DROP TABLE`, `TRUNCATE`, or `DELETE`.
4. **No Synthetic Mock Overwriting:** Genuine user-created trains and coach consists are never overwritten or replaced with mock/seed data upon startup.

---

## 3. Explicit Administrative Deletion Workflow

Data may **only** be removed through an explicit HTTP `DELETE` request initiated by an authenticated user possessing the `ADMIN` role.

### 3.1 Train Deletion Protocol
When an administrator deletes a train (`DELETE /api/v1/trains/{train_number}`):
1. **Device Protection:** Edge monitoring nodes bound to the train are released back to the unassigned hardware inventory pool (`train_number="UNASSIGNED"`, `coach_number="UNASSIGNED"`, `status="AVAILABLE"`) rather than destroyed, preserving hardware calibration and historical sensor telemetry.
2. **Alarm Resolution:** Open alarms are cleanly transitioned to `RESOLVED` with an explanatory comment in `alarm_history`.
3. **Consist Deletion:** Relational coach records belonging to the train are removed or soft-deleted.
4. **Immutable Deletion Audit Record:** A snapshot of the train and consist is serialized into `deletion_audit_records` storing:
   - `admin_username`: Username of the initiating administrator.
   - `entity_type`: `"TRAIN"`.
   - `entity_identifier`: Train number (e.g. `12301`).
   - `snapshot_json`: Full JSON state prior to deletion.
   - `reason`: Justification provided by administrator.
   - `ip_address`: Remote client IP address.
   - `created_at`: Exact UTC timestamp.
5. **Transactional Sync Outbox:** A `TRAIN_DELETED` event is written to `sync_outbox` in the same database transaction, ensuring all distributed devices immediately update their UI without manual refreshing.

### 3.2 Coach Deletion Protocol
When an administrator deletes a coach (`DELETE /api/v1/trains/{train_number}/coaches/{coach_number}`):
1. The coach is soft-deleted (`is_deleted = True`), preventing foreign key cascades from deleting historical telemetry.
2. The associated edge device is returned to the unassigned pool.
3. An immutable entry is written to `deletion_audit_records`.
4. A `COACH_DELETED` outbox event is queued and broadcast.
