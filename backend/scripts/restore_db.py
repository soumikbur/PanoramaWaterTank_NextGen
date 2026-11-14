"""Automated Database Restore Utility for Panorama Water Tank Monitor.

Restores database from compressed backup archive, validates SHA-256 checksums,
and performs post-restore integrity and record count verification.
"""
import argparse
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
logger = logging.getLogger("panorama.restore")


def sha256_checksum(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def restore_sqlite(gz_path: str, target_db: str) -> bool:
    """Restore SQLite database from .db.gz archive and verify integrity."""
    logger.info(f"Restoring SQLite database from {gz_path} to {target_db}...")

    # Check manifest if present
    manifest_path = gz_path.replace(".db.gz", ".manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        expected_sha = manifest.get("sha256")
        actual_sha = sha256_checksum(gz_path)
        if expected_sha and expected_sha != actual_sha:
            raise ValueError(f"Checksum mismatch! Expected: {expected_sha}, Actual: {actual_sha}")
        logger.info("Manifest checksum verified successfully.")

    # Decompress to temporary file first
    temp_target = f"{target_db}.restore_tmp"
    with gzip.open(gz_path, "rb") as f_in, open(temp_target, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)

    # Perform integrity check on decompressed database
    conn = sqlite3.connect(temp_target)
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity.lower() != "ok":
        conn.close()
        os.remove(temp_target)
        raise RuntimeError(f"Integrity check failed: {integrity}")

    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    table_stats = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
    conn.close()

    # Atomically replace target database
    if os.path.exists(target_db):
        backup_current = f"{target_db}.pre_restore_bak"
        if os.path.exists(backup_current):
            os.remove(backup_current)
        os.rename(target_db, backup_current)

    os.rename(temp_target, target_db)
    logger.info(f"Database successfully restored to {target_db}.")
    logger.info(f"Verified tables ({len(tables)}): {table_stats}")
    return True


def run_restore(archive_path: str, target_path: str = None) -> bool:
    if not os.path.exists(archive_path):
        raise FileNotFoundError(f"Backup archive not found: {archive_path}")

    if archive_path.endswith(".db.gz"):
        dest = target_path or os.path.join(_BACKEND_DIR, "panorama_dev.db")
        return restore_sqlite(archive_path, dest)
    else:
        raise NotImplementedError(f"Unsupported backup format for file: {archive_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Panorama Database Restore Utility")
    parser.add_argument("archive", help="Path to the .db.gz backup archive")
    parser.add_argument("--target", default=None, help="Target database path")
    args = parser.parse_args()

    try:
        run_restore(args.archive, args.target)
        print("[SUCCESS] Restore completed and verified.")
    except Exception as e:
        logger.error(f"Restore failed: {e}")
        sys.exit(1)
