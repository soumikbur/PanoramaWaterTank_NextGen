"""SQLite-backed centralized shared state persistence for multi-user SCADA sync.

Stores authoritative versioned operational state (`fleet`, `devices`, `settings`, `users`)
so all browser sessions (including separate browsers and incognito windows) read and write
the exact same central database rather than relying on browser-local storage.
"""
import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from backend import config

VALID_NAMESPACES = ("fleet", "devices", "settings", "users")


def _default_db_path() -> Path:
    configured = os.getenv("STATE_DB_PATH", "").strip()
    if configured:
        return Path(configured)
    return config.PROJECT_DIR / "data" / "panorama_shared_state.db"


class VersionConflictError(Exception):
    """Raised when an optimistic-concurrency expected_version check fails."""

    def __init__(self, current_version: int, expected_version: int):
        self.current_version = current_version
        self.expected_version = expected_version
        super().__init__(
            f"Version conflict: expected version {expected_version}, current server version is {current_version}."
        )


class SharedStateService:
    """Thread-safe SQLite store with persistent WAL connection and monotonic server versioning."""

    def __init__(self, db_path: Optional[Path] = None):
        self._db_path: Path = db_path or _default_db_path()
        self._lock = threading.RLock()
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _get_conn(self) -> sqlite3.Connection:
        """Return persistent WAL-mode connection (re-opening cleanly if closed or DB path recreated)."""
        if self._conn is not None:
            return self._conn
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), timeout=10.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        self._conn = conn
        return conn

    def close(self) -> None:
        """Close the persistent SQLite connection cleanly on shutdown."""
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None

    def _init_db(self) -> None:
        with self._lock:
            conn = self._get_conn()
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS shared_state (
                    namespace TEXT PRIMARY KEY,
                    version INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    mutation_id TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL,
                    updated_iso TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def get_namespace(self, namespace: str) -> Optional[Dict[str, Any]]:
        if namespace not in VALID_NAMESPACES:
            raise ValueError(f"Unsupported sync namespace: {namespace}")
        with self._lock:
            conn = self._get_conn()
            row = conn.execute(
                "SELECT namespace, version, updated_at, mutation_id, payload_json, updated_iso "
                "FROM shared_state WHERE namespace = ?",
                (namespace,),
            ).fetchone()
            if not row:
                return None
            return {
                "namespace": row["namespace"],
                "version": int(row["version"]),
                "updated_at": int(row["updated_at"]),
                "mutation_id": row["mutation_id"],
                "updated_iso": row["updated_iso"],
                "data": json.loads(row["payload_json"]),
            }

    def get_all_namespaces(self) -> Dict[str, Optional[Dict[str, Any]]]:
        with self._lock:
            conn = self._get_conn()
            rows = conn.execute(
                "SELECT namespace, version, updated_at, mutation_id, payload_json, updated_iso "
                "FROM shared_state"
            ).fetchall()
            result: Dict[str, Optional[Dict[str, Any]]] = {ns: None for ns in VALID_NAMESPACES}
            for row in rows:
                ns = row["namespace"]
                if ns in result:
                    result[ns] = {
                        "namespace": ns,
                        "version": int(row["version"]),
                        "updated_at": int(row["updated_at"]),
                        "mutation_id": row["mutation_id"],
                        "updated_iso": row["updated_iso"],
                        "data": json.loads(row["payload_json"]),
                    }
            return result

    def upsert_namespace(
        self,
        namespace: str,
        payload: Dict[str, Any],
        event_type: str = "STATE_UPDATED",
        mutation_id: Optional[str] = None,
        expected_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Persist namespace state transactionally in SQLite with monotonic server version."""
        if namespace not in VALID_NAMESPACES:
            raise ValueError(f"Unsupported sync namespace: {namespace}")
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a JSON object.")

        now_ms = int(time.time() * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        event_id = f"evt_{uuid.uuid4().hex[:12]}"
        mut_id = (mutation_id or "").strip() or f"mut_{uuid.uuid4().hex[:10]}"

        with self._lock:
            conn = self._get_conn()
            try:
                conn.execute("BEGIN IMMEDIATE")
                existing = conn.execute(
                    "SELECT version, updated_at FROM shared_state WHERE namespace = ?",
                    (namespace,),
                ).fetchone()
                prev_version = int(existing["version"]) if existing else 0
                prev_updated = int(existing["updated_at"]) if existing else 0

                if expected_version is not None and prev_version != expected_version:
                    conn.rollback()
                    raise VersionConflictError(prev_version, expected_version)

                next_version = prev_version + 1
                next_updated = max(now_ms, prev_updated + 1)

                # Attach authoritative server version & timestamp inside persisted payload copy
                stored_payload = dict(payload)
                stored_payload["version"] = next_version
                stored_payload["updatedAt"] = next_updated
                stored_payload["mutationId"] = mut_id

                payload_json = json.dumps(stored_payload, separators=(",", ":"))
                conn.execute(
                    """
                    INSERT INTO shared_state (namespace, version, updated_at, mutation_id, payload_json, updated_iso)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(namespace) DO UPDATE SET
                        version = excluded.version,
                        updated_at = excluded.updated_at,
                        mutation_id = excluded.mutation_id,
                        payload_json = excluded.payload_json,
                        updated_iso = excluded.updated_iso
                    """,
                    (namespace, next_version, next_updated, mut_id, payload_json, now_iso),
                )
                conn.commit()
            except VersionConflictError:
                raise
            except Exception:
                conn.rollback()
                raise

        return {
            "event_id": event_id,
            "event_type": event_type,
            "namespace": namespace,
            "version": next_version,
            "updated_at": next_updated,
            "mutation_id": mut_id,
            "timestamp": now_iso,
            "data": stored_payload,
        }


shared_state_service = SharedStateService()
