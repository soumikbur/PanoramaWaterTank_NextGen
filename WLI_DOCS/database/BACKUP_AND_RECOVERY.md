# Panorama Water Tank Monitor – Backup & Disaster Recovery Guide

## 1. Overview

To guarantee enterprise-grade data persistence and disaster resilience for railway SCADA operations, Panorama provides automated, verified backup and restore tools located in `backend/scripts/`:
- `backend/scripts/backup_db.py`: Online hot backup and compression.
- `backend/scripts/restore_db.py`: Verified decompression, integrity validation, and database restoration.

---

## 2. Backup Protocol (`scripts/backup_db.py`)

### 2.1 Mechanics
- **SQLite (Local & Edge):** Utilizes Python's native `sqlite3.Connection.backup()` online backup API. This copies database pages while the engine is running without blocking active transactions or corrupting WAL frames.
- **PostgreSQL (Production):** Utilizes `pg_dump` with piped gzip compression.
- **Compression:** Compresses archive to `.gz` format to minimize storage footprint.
- **Integrity Digest:** Computes a SHA-256 cryptographic checksum of the compressed archive.
- **Manifest File:** Generates a companion `.manifest.json` recording table row counts, file size, SHA-256 hash, and UTC timestamp.

### 2.2 CLI Usage
```bash
# Run default backup to backend/backups/
python scripts/backup_db.py

# Run backup to custom destination directory
python scripts/backup_db.py --output-dir /var/backups/panorama
```

---

## 3. Restore & Disaster Recovery Protocol (`scripts/restore_db.py`)

### 3.1 Mechanics
1. **Manifest Checksum Validation:** If a companion `.manifest.json` exists, verifies that `sha256(backup_file) == manifest.sha256`. Fails immediately if corruption is detected.
2. **Decompression to Staging File:** Decompresses to `<target>.restore_tmp`.
3. **Database Integrity Verification:** Runs `PRAGMA integrity_check` on the staging database. Fails if any corruption is found.
4. **Table & Schema Audit:** Enumerates all tables and logs row counts.
5. **Atomic Replacement:** Backs up the current active database file to `<target>.pre_restore_bak` and atomically renames the verified staging file into place.

### 3.2 CLI Usage
```bash
# Restore specific backup archive to active database
python scripts/restore_db.py backups/panorama_backup_20261114_213746.db.gz

# Restore to specific target path
python scripts/restore_db.py backups/panorama_backup_20261114_213746.db.gz --target ./panorama_dev.db
```

---

## 4. Verification Evidence

All 8 persistence and disaster recovery acceptance tests are continuously validated via automated pytest suite `backend/tests/test_permanent_database.py`:
- `test_1_train_metadata_persistence_across_restart` (PASSED)
- `test_2_19_coaches_consist_persistence` (PASSED)
- `test_3_device_registry_persistence` (PASSED)
- `test_4_tank_configuration_persistence` (PASSED)
- `test_5_historical_telemetry_retention_without_ttl` (PASSED)
- `test_6_multi_device_sync_outbox_queue` (PASSED)
- `test_7_manual_deletion_audit_record` (PASSED)
- `test_8_backup_and_restore_recovery` (PASSED)
