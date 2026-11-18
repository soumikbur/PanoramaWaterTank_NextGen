"""Thread-safe bounded telemetry storage service with persistent SQLite WAL write-through."""
import itertools
import json
import os
import sqlite3
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from backend import config


def _default_telemetry_db_path() -> Path:
    configured = os.getenv("TELEMETRY_DB_PATH", "").strip()
    if configured:
        return Path(configured)
    return config.PROJECT_DIR / "data" / "panorama_telemetry.db"


class InMemoryStorageService:
    """Thread-safe, bounded telemetry store with optional persistent SQLite write-through.

    Keeps latest readings per device and a bounded circular buffer in RAM for low-latency
    queries while persisting records to SQLite via a persistent WAL connection when `db_path`
    is provided.
    """

    def __init__(self, max_history: Optional[int] = None, db_path: Optional[Path] = None):
        self._max_history = max_history if max_history is not None else config.MAX_HISTORY_RECORDS
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None
        self._db_row_count: int = 0
        self._latest_by_device: Dict[str, Dict[str, Any]] = {}
        self._history: deque[Dict[str, Any]] = deque(maxlen=self._max_history)
        self._start_time = time.time()
        self._total_ingested: int = 0
        self._duplicate_count: int = 0
        if self._db_path is not None:
            self._init_db()
            self._hydrate_from_db()

    @property
    def db_path(self) -> Optional[Path]:
        return self._db_path

    def _get_conn(self) -> sqlite3.Connection:
        assert self._db_path is not None
        if self._conn is not None:
            return self._conn
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), timeout=10.0, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        self._conn = conn
        return conn

    def close(self) -> None:
        """Close persistent SQLite connection cleanly on application shutdown."""
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None

    def _init_db(self) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                sequence_id INTEGER,
                received_at TEXT NOT NULL,
                is_duplicate INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_telemetry_device_id ON telemetry_records (device_id, id DESC)"
        )
        conn.commit()

    def _hydrate_from_db(self) -> None:
        conn = self._get_conn()
        count_row = conn.execute("SELECT COUNT(*) FROM telemetry_records").fetchone()
        self._db_row_count = int(count_row[0]) if count_row else 0
        rows = conn.execute(
            "SELECT payload_json FROM telemetry_records ORDER BY id DESC LIMIT ?",
            (self._max_history,),
        ).fetchall()
        for (payload_json,) in reversed(rows):
            try:
                rec = json.loads(payload_json)
                if isinstance(rec, dict) and rec.get("device_id"):
                    self._latest_by_device[str(rec["device_id"])] = rec
                    self._history.append(rec)
                    self._total_ingested += 1
                    if rec.get("is_duplicate"):
                        self._duplicate_count += 1
            except Exception:
                continue

    def _persist_record_to_db(self, record: Dict[str, Any]) -> None:
        if self._db_path is None:
            return
        conn = self._get_conn()
        seq = record.get("sequence_id")
        seq_int = int(seq) if isinstance(seq, int) and not isinstance(seq, bool) else None
        conn.execute(
            "INSERT INTO telemetry_records (device_id, sequence_id, received_at, is_duplicate, payload_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                str(record["device_id"]),
                seq_int,
                str(record.get("received_at", "")),
                1 if record.get("is_duplicate") else 0,
                json.dumps(record, separators=(",", ":")),
            ),
        )
        self._db_row_count += 1
        # Amortized pruning: only prune when exceeding capacity by 10% (avoids subquery DELETE on every write)
        prune_threshold = self._max_history + max(10, self._max_history // 10)
        if self._db_row_count > prune_threshold:
            conn.execute(
                "DELETE FROM telemetry_records WHERE id NOT IN "
                "(SELECT id FROM telemetry_records ORDER BY id DESC LIMIT ?)",
                (self._max_history,),
            )
            self._db_row_count = self._max_history
        conn.commit()

    def get_db_record_count(self, device_id: Optional[str] = None) -> int:
        """Return persisted SQLite telemetry row count (or 0 if running RAM-only)."""
        if self._db_path is None:
            return 0
        with self._lock:
            conn = self._get_conn()
            if device_id is not None:
                row = conn.execute(
                    "SELECT COUNT(*) FROM telemetry_records WHERE device_id = ?",
                    (device_id.strip(),),
                ).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) FROM telemetry_records").fetchone()
            return int(row[0]) if row else 0

    def store_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Store a telemetry record thread-safely in SQLite and RAM."""
        device_id = str(record.get("device_id", "")).strip()
        if not device_id:
            raise ValueError("Record must include a valid non-empty device_id.")

        with self._lock:
            seq = record.get("sequence_id")
            prev_record = self._latest_by_device.get(device_id)
            is_dup = bool(prev_record and seq is not None and prev_record.get("sequence_id") == seq)
            record["is_duplicate"] = is_dup

            # Persist to SQLite first before updating RAM caches and counters
            self._persist_record_to_db(record)

            if is_dup:
                self._duplicate_count += 1
            self._latest_by_device[device_id] = record.copy()
            self._history.append(record.copy())
            self._total_ingested += 1

        return record

    def get_latest(self, device_id: Optional[str] = None) -> Union[Dict[str, Any], List[Dict[str, Any]], None]:
        """Retrieve latest telemetry for a specific device, or all devices."""
        with self._lock:
            if device_id is not None:
                cleaned_id = device_id.strip()
                record = self._latest_by_device.get(cleaned_id)
                return record.copy() if record else None
            return [rec.copy() for rec in self._latest_by_device.values()]

    def get_history(
        self, device_id: Optional[str] = None, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Retrieve historical telemetry records in reverse chronological order (newest first)."""
        clamped_limit = max(1, min(limit, self._max_history))
        with self._lock:
            if device_id is not None:
                cleaned_id = device_id.strip()
                matching: List[Dict[str, Any]] = []
                for rec in reversed(self._history):
                    if rec.get("device_id") == cleaned_id:
                        matching.append(rec.copy())
                        if len(matching) >= clamped_limit:
                            break
                return matching
            return [rec.copy() for rec in itertools.islice(reversed(self._history), clamped_limit)]

    def get_stats(self) -> Dict[str, Any]:
        """Retrieve operational statistics and storage metrics."""
        with self._lock:
            devices = list(self._latest_by_device.keys())
            return {
                "total_records_ingested": self._total_ingested,
                "duplicate_records_detected": self._duplicate_count,
                "current_history_records": len(self._history),
                "max_history_capacity": self._max_history,
                "tracked_devices_count": len(devices),
                "tracked_devices": devices,
                "uptime_seconds": round(time.time() - self._start_time, 2),
                "sqlite_persisted": self._db_path is not None,
            }

    def clear(self) -> None:
        """Reset all storage state (for automated testing isolation)."""
        with self._lock:
            self._latest_by_device.clear()
            self._history.clear()
            self._total_ingested = 0
            self._duplicate_count = 0
            self._db_row_count = 0
            self._start_time = time.time()
            if self._db_path is not None:
                conn = self._get_conn()
                conn.execute("DELETE FROM telemetry_records")
                conn.commit()


# Singleton instance shared across the application (SQLite write-through enabled)
storage_service = InMemoryStorageService(db_path=_default_telemetry_db_path())
