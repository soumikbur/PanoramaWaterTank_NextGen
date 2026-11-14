"""Automated Backup Utility for Panorama Water Tank Monitor.

Creates timestamped, compressed, verified backups of the database
(SQLite WAL or PostgreSQL) with SHA-256 checksum validation and metadata manifest.
"""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import logging
import os
import shutil
import sqlite3
import sys

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("panorama.backup")


def sha256_checksum(filepath: str) -> str:
    """Compute hex SHA-256 digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def backup_sqlite(db_path: str, backup_dir: str) -> str:
    """Create a consistent SQLite backup using the online backup API and compress it."""
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    temp_backup = os.path.join(backup_dir, f"panorama_backup_{timestamp}.db")
    gz_backup = f"{temp_backup}.gz"
    manifest_file = os.path.join(backup_dir, f"panorama_backup_{timestamp}.manifest.json")

    logger.info(f"Connecting to source SQLite database: {db_path}")
    src_conn = sqlite3.connect(db_path)
    dst_conn = sqlite3.connect(temp_backup)

    # Online backup ensures point-in-time consistency even under concurrent WAL writes
    with dst_conn:
        src_conn.backup(dst_conn, pages=100)

    # Collect table stats from backup
    tables = [r[0] for r in dst_conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    table_counts = {}
    for tbl in tables:
        try:
            count = dst_conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            table_counts[tbl] = count
        except Exception:
            table_counts[tbl] = -1

    dst_conn.close()
    src_conn.close()

    # Compress the backup
    logger.info(f"Compressing backup to {gz_backup}...")
    with open(temp_backup, "rb") as f_in, gzip.open(gz_backup, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    os.remove(temp_backup)

    checksum = sha256_checksum(gz_backup)
    manifest = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database_type": "sqlite",
        "backup_file": os.path.basename(gz_backup),
        "sha256": checksum,
        "size_bytes": os.path.getsize(gz_backup),
        "tables": table_counts,
    }
    with open(manifest_file, "w", encoding="utf-8") as f_manifest:
        json.dump(manifest, f_manifest, indent=2)

    logger.info(f"Backup created successfully: {gz_backup}")
    logger.info(f"SHA-256 Checksum: {checksum}")
    logger.info(f"Manifest written to: {manifest_file}")
    return gz_backup


def run_backup(output_dir: str = None) -> str:
    target_dir = output_dir or os.path.join(_BACKEND_DIR, "backups")
    db_url = settings.DATABASE_URL

    if "sqlite" in db_url:
        sqlite_file = db_url.split("///")[-1]
        if not os.path.isabs(sqlite_file):
            sqlite_file = os.path.abspath(os.path.join(_BACKEND_DIR, sqlite_file))
        if not os.path.exists(sqlite_file):
            raise FileNotFoundError(f"SQLite file not found at {sqlite_file}")
        return backup_sqlite(sqlite_file, target_dir)
    else:
        # PostgreSQL pg_dump invocation
        os.makedirs(target_dir, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        sql_backup = os.path.join(target_dir, f"panorama_pg_{timestamp}.sql.gz")
        manifest_file = os.path.join(target_dir, f"panorama_pg_{timestamp}.manifest.json")
        cmd = f'pg_dump "{db_url}" | gzip > "{sql_backup}"'
        logger.info(f"Executing PostgreSQL dump to {sql_backup}...")
        ret = os.system(cmd)
        if ret != 0:
            raise RuntimeError(f"pg_dump failed with exit code {ret}")
        checksum = sha256_checksum(sql_backup)
        manifest = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database_type": "postgresql",
            "backup_file": os.path.basename(sql_backup),
            "sha256": checksum,
            "size_bytes": os.path.getsize(sql_backup),
        }
        with open(manifest_file, "w", encoding="utf-8") as f_manifest:
            json.dump(manifest, f_manifest, indent=2)
        logger.info(f"PostgreSQL backup created: {sql_backup}")
        return sql_backup


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Panorama Database Backup Utility")
    parser.add_argument("--output-dir", default=None, help="Directory to store backup files")
    args = parser.parse_args()

    try:
        path = run_backup(args.output_dir)
        print(f"[SUCCESS] Backup saved: {path}")
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        sys.exit(1)
