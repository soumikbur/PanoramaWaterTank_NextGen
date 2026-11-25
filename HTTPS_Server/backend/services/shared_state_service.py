"""SQLite-backed centralized shared state persistence for multi-user SCADA sync.

Stores authoritative versioned operational state (`fleet`, `devices`, `settings`, `users`)
so all browser sessions and Capacitor Android clients read and write the exact same
authoritative production database rather than relying on browser-local storage.
"""
import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend import config

VALID_NAMESPACES = ("fleet", "devices", "settings", "users")

REGION_CONFIG = {
    "NORTH": {"name": "Northern Railway", "code": "NR"},
    "SOUTH": {"name": "Southern Railway", "code": "SR"},
    "EAST": {"name": "Eastern Railway", "code": "ER"},
    "WEST": {"name": "Western Railway", "code": "WR"},
    "CENTRAL": {"name": "Central Railway", "code": "CR"},
}

import re as _re
_HEX_24_RE = _re.compile(r"^[0-9A-Fa-f]{24}$")
_TEST_UID_RE = _re.compile(r"TEST|AUDIT|DUMMY|DEMO|SEED|PLACEHOLDER|ROGUE|MOCK", _re.I)


def is_genuine_hardware_uid(uid: Optional[str]) -> bool:
    if not uid or not isinstance(uid, str):
        return False
    clean = uid.strip()
    if _TEST_UID_RE.search(clean):
        return False
    return bool(_HEX_24_RE.match(clean))

ZONE_TO_REGION = {
    "NR": "NORTH", "NCR": "NORTH", "NER": "NORTH",
    "SR": "SOUTH", "SCR": "SOUTH", "SWR": "SOUTH",
    "ER": "EAST", "SER": "EAST", "ECR": "EAST", "ECOR": "EAST", "SECR": "EAST",
    "WR": "WEST", "WCR": "WEST", "CR": "CENTRAL", "KR": "WEST",
}


def normalize_region(raw: Optional[str]) -> str:
    """Normalize region/zone input to canonical NORTH, SOUTH, EAST, WEST, or CENTRAL."""
    cleaned = (raw or "").strip().upper()
    if cleaned in REGION_CONFIG:
        return cleaned
    if cleaned in ZONE_TO_REGION:
        return ZONE_TO_REGION[cleaned]
    if "EAST" in cleaned or "ER" in cleaned or "SER" in cleaned or "BENGAL" in cleaned or "ODISHA" in cleaned:
        return "EAST"
    if "NORTH" in cleaned or "NR" in cleaned or "DELHI" in cleaned:
        return "NORTH"
    if "SOUTH" in cleaned or "SR" in cleaned or "CHENNAI" in cleaned:
        return "SOUTH"
    if "CENTRAL" in cleaned or "CR" in cleaned:
        return "CENTRAL"
    if "WEST" in cleaned or "WR" in cleaned or "MUMBAI" in cleaned:
        return "WEST"
    return "NORTH"


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
    """Thread-safe SQLite store with persistent WAL connection and relational entities."""

    def __init__(self, db_path: Optional[Path] = None):
        self._db_path: Path = db_path or _default_db_path()
        self._lock = threading.RLock()
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is not None:
            return self._conn
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=10000;")
        conn.execute("PRAGMA foreign_keys=ON;")
        self._conn = conn
        return conn

    def close(self) -> None:
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
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS shared_state (
                    namespace TEXT PRIMARY KEY,
                    version INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    mutation_id TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL,
                    updated_iso TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS railway_regions (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    headquarters TEXT
                );

                CREATE TABLE IF NOT EXISTS railway_zones (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    region_code TEXT,
                    headquarters TEXT,
                    FOREIGN KEY (region_code) REFERENCES railway_regions(code) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS trains (
                    train_number TEXT PRIMARY KEY,
                    id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    region TEXT NOT NULL,
                    railway_zone TEXT,
                    train_type TEXT DEFAULT 'Express',
                    source_station TEXT,
                    source_code TEXT,
                    destination_station TEXT,
                    destination_code TEXT,
                    tank_height_cm REAL DEFAULT 50.0,
                    tank_capacity_liters REAL DEFAULT 20.0,
                    total_coaches INTEGER DEFAULT 6,
                    has_official_composition INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS coaches (
                    id TEXT PRIMARY KEY,
                    train_number TEXT NOT NULL,
                    coach_number TEXT NOT NULL,
                    coach_name TEXT,
                    coach_category TEXT DEFAULT 'PASSENGER',
                    coach_type TEXT DEFAULT 'AC_CHAIR_CAR',
                    position INTEGER NOT NULL DEFAULT 1,
                    device_uid TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(train_number, coach_number),
                    FOREIGN KEY (train_number) REFERENCES trains(train_number) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS tanks (
                    id TEXT PRIMARY KEY,
                    train_number TEXT NOT NULL,
                    coach_number TEXT NOT NULL,
                    tank_index INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    tank_type TEXT DEFAULT 'CYLINDRICAL',
                    capacity_liters REAL DEFAULT 500.0,
                    height_cm REAL DEFAULT 50.0,
                    area_m2 REAL DEFAULT 0.04,
                    current_level_percent REAL DEFAULT 0.0,
                    current_volume_liters REAL DEFAULT 0.0,
                    status TEXT DEFAULT 'NORMAL',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(train_number, coach_number, tank_index),
                    FOREIGN KEY (train_number) REFERENCES trains(train_number) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS devices (
                    uid TEXT PRIMARY KEY,
                    id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    train_number TEXT DEFAULT 'UNASSIGNED',
                    coach_number TEXT DEFAULT 'UNASSIGNED',
                    device_type TEXT DEFAULT 'Quectel EC200U 4G LTE',
                    protocol TEXT DEFAULT 'MQTT over TLS/WSS',
                    mqtt_client_id TEXT,
                    mqtt_topic TEXT,
                    tank_assignment TEXT DEFAULT 'BOTH',
                    status TEXT DEFAULT 'AVAILABLE',
                    is_online INTEGER DEFAULT 0,
                    last_seen_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS alarms (
                    id TEXT PRIMARY KEY,
                    device_id TEXT,
                    train_number TEXT,
                    coach_number TEXT,
                    severity TEXT NOT NULL,
                    alarm_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    status TEXT DEFAULT 'ACTIVE',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );

                CREATE TABLE IF NOT EXISTS mqtt_latest_topics (
                    topic TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    qos INTEGER DEFAULT 0,
                    retained INTEGER DEFAULT 0,
                    received_at TEXT NOT NULL
                );
                """
            )
            conn.commit()
            self._seed_baseline_if_empty(conn)

    def _seed_baseline_if_empty(self, conn: sqlite3.Connection) -> None:
        """Seed baseline regions, zones, trains, coaches, tanks, devices, and shared_state."""
        # 1. Regions
        cur = conn.cursor()
        for code, info in REGION_CONFIG.items():
            cur.execute(
                "INSERT OR IGNORE INTO railway_regions (code, name, headquarters) VALUES (?, ?, ?)",
                (code, info["name"], "HQ"),
            )

        # 2. Zones
        for z_code, r_code in ZONE_TO_REGION.items():
            cur.execute(
                "INSERT OR IGNORE INTO railway_zones (code, name, region_code, headquarters) VALUES (?, ?, ?, ?)",
                (z_code, f"{z_code} Zone", r_code, "HQ"),
            )

        # 3. Check if trains table is empty
        count = cur.execute("SELECT COUNT(*) FROM trains").fetchone()[0]
        if count == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            baseline_trains = [
                {
                    "train_number": "15120",
                    "name": "Banaras Janta Express",
                    "region": "NORTH",
                    "railway_zone": "NR",
                    "train_type": "Mail/Express",
                    "source_station": "Dehradoon",
                    "source_code": "DDN",
                    "destination_station": "Banaras",
                    "destination_code": "BNRS",
                    "coaches": ["SLRD", "GEN", "H1", "A2", "A1", "B2", "B1", "M2", "M1", "S3", "S2", "S1", "LPR"],
                },
                {
                    "train_number": "12249",
                    "name": "Swarn Nagari Express",
                    "region": "NORTH",
                    "railway_zone": "NR",
                    "train_type": "Superfast Express",
                    "source_station": "Shakurbasti",
                    "source_code": "SSB",
                    "destination_station": "Jaisalmer",
                    "destination_code": "JSM",
                    "coaches": ["SLRD", "D1", "D2", "C1", "C2", "B1"],
                },
                {
                    "train_number": "12302",
                    "name": "New Delhi Howrah Rajdhani Express",
                    "region": "NORTH",
                    "railway_zone": "NR",
                    "train_type": "Rajdhani Express",
                    "source_station": "New Delhi",
                    "source_code": "NDLS",
                    "destination_station": "Howrah Jn",
                    "destination_code": "HWH",
                    "coaches": ["SLRD", "S1", "S2", "B1", "B2", "A1"],
                },
                {
                    "train_number": "12626",
                    "name": "Kerala Express",
                    "region": "SOUTH",
                    "railway_zone": "SR",
                    "train_type": "Superfast Express",
                    "source_station": "New Delhi",
                    "source_code": "NDLS",
                    "destination_station": "Thiruvananthapuram",
                    "destination_code": "TVC",
                    "coaches": ["SLRD", "S1", "S2", "B1", "B2", "A1", "C1", "C2"],
                },
                {
                    "train_number": "12301",
                    "name": "Howrah - New Delhi Rajdhani Express",
                    "region": "EAST",
                    "railway_zone": "ER",
                    "train_type": "Rajdhani Express",
                    "source_station": "Howrah Junction",
                    "source_code": "HWH",
                    "destination_station": "New Delhi",
                    "destination_code": "NDLS",
                    "coaches": ["C1", "C2"],
                },
                {
                    "train_number": "11043",
                    "name": "Ballia Express",
                    "region": "WEST",
                    "railway_zone": "CR",
                    "train_type": "Express",
                    "source_station": "Dadar",
                    "source_code": "DR",
                    "destination_station": "Ballia",
                    "destination_code": "BUI",
                    "coaches": ["SLRD", "S1", "S2", "B1", "B2", "A1"],
                },
            ]

            for tr in baseline_trains:
                t_id = f"tr-{uuid.uuid4().hex[:8]}"
                coaches = tr["coaches"]
                cur.execute(
                    """
                    INSERT INTO trains (
                        train_number, id, name, region, railway_zone, train_type,
                        source_station, source_code, destination_station, destination_code,
                        tank_height_cm, tank_capacity_liters, total_coaches, has_official_composition,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 50.0, 20.0, ?, 1, ?, ?)
                    """,
                    (
                        tr["train_number"], t_id, tr["name"], tr["region"], tr["railway_zone"], tr["train_type"],
                        tr["source_station"], tr["source_code"], tr["destination_station"], tr["destination_code"],
                        len(coaches), now_iso, now_iso,
                    ),
                )
                for idx, c_num in enumerate(coaches, 1):
                    c_id = f"coach-{tr['train_number']}-{c_num}"
                    mapped_uid = (
                        "0023004D4B42501120353332"
                        if (tr["train_number"] == "15120" and c_num == "SLRD")
                        else (
                            "002F00654B42501320353332"
                            if (tr["train_number"] == "12301" and c_num == "C2")
                            else ""
                        )
                    )
                    cur.execute(
                        """
                        INSERT INTO coaches (
                            id, train_number, coach_number, coach_name, coach_category, coach_type,
                            position, device_uid, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'PASSENGER', 'AC_CHAIR_CAR', ?, ?, ?, ?)
                        """,
                        (c_id, tr["train_number"], c_num, f"Coach {c_num}", idx, mapped_uid, now_iso, now_iso),
                    )
                    # 2 tanks per coach
                    for t_idx in (1, 2):
                        t_name = "Arrival Side (Tank 1)" if t_idx == 1 else "Departure Side (Tank 2)"
                        tank_id = f"tank-{tr['train_number']}-{c_num}-{t_idx}"
                        cur.execute(
                            """
                            INSERT INTO tanks (
                                id, train_number, coach_number, tank_index, name, tank_type,
                                capacity_liters, height_cm, area_m2, current_level_percent,
                                current_volume_liters, status, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, 'CYLINDRICAL', 500.0, 50.0, 0.04, 0.0, 0.0, 'NORMAL', ?, ?)
                            """,
                            (tank_id, tr["train_number"], c_num, t_idx, t_name, now_iso, now_iso),
                        )

            # Baseline hardware devices (Device 1 & Device 2 + standby hardware)
            baseline_devices = [
                ("0023004D4B42501120353332", "dev-001", "WLI Primary Node 332", "15120", "SLRD", "ENGAGED"),
                ("002F00654B42501320353332", "dev-002", "WLI Hardware Node 002F", "12301", "C2", "ENGAGED"),
                ("0026004D4B42501120353332", "dev-003", "Legacy Historical Node", "UNASSIGNED", "UNASSIGNED", "AVAILABLE"),
                ("0023004D4B42501120353331", "dev-004", "WLI Node Sensor 31", "UNASSIGNED", "UNASSIGNED", "AVAILABLE"),
                ("0027004D4B42501120353337", "dev-005", "WLI Node Sensor 37", "UNASSIGNED", "UNASSIGNED", "AVAILABLE"),
            ]
            for uid, d_id, d_name, d_tr, d_ch, d_status in baseline_devices:
                cur.execute(
                    """
                    INSERT OR IGNORE INTO devices (
                        uid, id, name, train_number, coach_number, device_type,
                        protocol, mqtt_client_id, mqtt_topic, tank_assignment,
                        status, is_online, last_seen_at, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?, 'Quectel EC200U 4G LTE',
                        'MQTT over TLS/WSS', ?, ?, 'BOTH',
                        ?, 0, NULL, ?, ?
                    )
                    """,
                    (uid, d_id, d_name, d_tr, d_ch, f"panorama-wli-{uid.lower()}", f"panorama/telemetry/{uid}", d_status, now_iso, now_iso),
                )
        conn.commit()

    def _rebuild_fleet_state_snapshot_unlocked(self, conn: sqlite3.Connection) -> None:
        """Rebuild the 'fleet' namespace JSON in shared_state from the relational tables."""
        cur = conn.cursor()
        train_rows = cur.execute("SELECT * FROM trains ORDER BY train_number ASC").fetchall()
        trains_map: Dict[str, Any] = {}

        for tr in train_rows:
            t_num = tr["train_number"]
            coach_rows = cur.execute(
                "SELECT * FROM coaches WHERE train_number = ? ORDER BY position ASC", (t_num,)
            ).fetchall()
            coaches_list = []
            for cr in coach_rows:
                c_num = cr["coach_number"]
                tank_rows = cur.execute(
                    "SELECT * FROM tanks WHERE train_number = ? AND coach_number = ? ORDER BY tank_index ASC",
                    (t_num, c_num),
                ).fetchall()
                tanks_list = [
                    {
                        "id": tk["id"],
                        "tank_index": tk["tank_index"],
                        "name": tk["name"],
                        "tank_type": tk["tank_type"] or "CYLINDRICAL",
                        "geometry": tk["tank_type"] or "CYLINDRICAL",
                        "capacity_liters": tk["capacity_liters"],
                        "height_cm": tk["height_cm"],
                        "current_level_percent": tk["current_level_percent"],
                        "current_volume_liters": tk["current_volume_liters"],
                        "status": tk["status"],
                    }
                    for tk in tank_rows
                ]
                coaches_list.append(
                    {
                        "coach_number": c_num,
                        "coach_category": cr["coach_category"],
                        "device_uid": cr["device_uid"] or "",
                        "is_online": False,
                        "hardware_version": "Standard WLI Node",
                        "tanks": tanks_list,
                    }
                )

            tanks_count = sum(len(c["tanks"]) for c in coaches_list)
            train_item = {
                "train_number": t_num,
                "name": tr["name"],
                "type": tr["train_type"] or "Express",
                "coaches_count": len(coaches_list),
                "tanks_count": tanks_count,
                "is_online": False,
                "status": "All Normal",
                "active_alarms": 0,
                "region": tr["region"],
                "source_station": tr["source_station"] or "Origin",
                "source_code": tr["source_code"] or "SRC",
                "destination_station": tr["destination_station"] or "Terminus",
                "destination_code": tr["destination_code"] or "DST",
                "railway_zone": tr["railway_zone"] or "NR",
                "total_coaches": len(coaches_list),
                "has_official_composition": bool(tr["has_official_composition"]),
                "tank_height_cm": tr["tank_height_cm"],
                "tank_capacity_liters": tr["tank_capacity_liters"],
            }
            consist_item = {
                "train_number": t_num,
                "name": tr["name"],
                "region": tr["region"],
                "coaches_count": len(coaches_list),
                "tanks_count": tanks_count,
                "online_status": False,
                "active_alarms_count": 0,
                "coaches": coaches_list,
                "source_station": tr["source_station"] or "Origin",
                "source_code": tr["source_code"] or "SRC",
                "destination_station": tr["destination_station"] or "Terminus",
                "destination_code": tr["destination_code"] or "DST",
                "railway_zone": tr["railway_zone"] or "NR",
                "train_type": tr["train_type"] or "Express",
                "total_coaches": len(coaches_list),
                "has_official_composition": bool(tr["has_official_composition"]),
                "tank_height_cm": tr["tank_height_cm"],
                "tank_capacity_liters": tr["tank_capacity_liters"],
            }
            trains_map[t_num] = {"train": train_item, "consist": consist_item}

        now_ms = int(time.time() * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        fleet_data = {
            "version": 1,
            "updatedAt": now_ms,
            "mutationId": f"fleet-{uuid.uuid4().hex[:8]}",
            "trains": trains_map,
            "deletedTrainNumbers": {},
        }
        payload_str = json.dumps(fleet_data, separators=(",", ":"))

        cur.execute(
            """
            INSERT INTO shared_state (namespace, version, updated_at, mutation_id, payload_json, updated_iso)
            VALUES ('fleet', 1, ?, ?, ?, ?)
            ON CONFLICT(namespace) DO UPDATE SET
                version = shared_state.version + 1,
                updated_at = excluded.updated_at,
                mutation_id = excluded.mutation_id,
                payload_json = excluded.payload_json,
                updated_iso = excluded.updated_iso
            """,
            (now_ms, fleet_data["mutationId"], payload_str, now_iso),
        )
        conn.commit()

    def _rebuild_devices_state_snapshot_unlocked(self, conn: sqlite3.Connection) -> None:
        """Rebuild the 'devices' namespace JSON in shared_state from devices table."""
        cur = conn.cursor()
        rows = cur.execute("SELECT * FROM devices ORDER BY uid ASC").fetchall()
        dev_list = []
        for r in rows:
            dev_list.append({
                "uid": r["uid"],
                "id": r["id"],
                "name": r["name"],
                "train_number": r["train_number"],
                "coach_number": r["coach_number"],
                "device_type": r["device_type"],
                "protocol": r["protocol"],
                "mqtt_client_id": r["mqtt_client_id"],
                "mqtt_topic": r["mqtt_topic"],
                "tank_assignment": r["tank_assignment"],
                "status": r["status"],
                "is_online": bool(r["is_online"]),
                "last_seen_at": r["last_seen_at"],
            })

        now_ms = int(time.time() * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        dev_data = {
            "version": 1,
            "updatedAt": now_ms,
            "devices": dev_list,
        }
        payload_str = json.dumps(dev_data, separators=(",", ":"))
        cur.execute(
            """
            INSERT INTO shared_state (namespace, version, updated_at, mutation_id, payload_json, updated_iso)
            VALUES ('devices', 1, ?, 'initial-dev', ?, ?)
            ON CONFLICT(namespace) DO UPDATE SET
                version = shared_state.version + 1,
                updated_at = excluded.updated_at,
                payload_json = excluded.payload_json,
                updated_iso = excluded.updated_iso
            """,
            (now_ms, payload_str, now_iso),
        )
        conn.commit()

    # -------------------------------------------------------------------------
    # Shared State Generic API
    # -------------------------------------------------------------------------

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

    # -------------------------------------------------------------------------
    # Authoritative Railway Regions & Fleet Queries
    # -------------------------------------------------------------------------

    def get_regions_summary(self) -> List[Dict[str, Any]]:
        """Compute authoritative summary for all standard railway regions."""
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()

            train_rows = cur.execute("SELECT * FROM trains ORDER BY train_number ASC").fetchall()
            devices_rows = [dict(r) for r in cur.execute("SELECT * FROM devices").fetchall() if is_genuine_hardware_uid(r["uid"])]
            dev_by_uid = {d["uid"]: d for d in devices_rows}
            devs_by_train: Dict[str, List[Dict[str, Any]]] = {}
            for d in devices_rows:
                tr = (d.get("train_number") or "").strip()
                if tr and tr.upper() != "UNASSIGNED":
                    devs_by_train.setdefault(tr, []).append(d)

            # Alarms
            alarms_rows = cur.execute("SELECT * FROM alarms WHERE status = 'ACTIVE'").fetchall()
            alarm_counts: Dict[str, int] = {}
            has_crit_map: Dict[str, bool] = {}
            for a in alarms_rows:
                t_num = a["train_number"]
                if t_num:
                    alarm_counts[t_num] = alarm_counts.get(t_num, 0) + 1
                    if a["severity"] == "CRITICAL":
                        has_crit_map[t_num] = True

            regions_result = []
            for reg_key, reg_info in REGION_CONFIG.items():
                trains_in_reg = [t for t in train_rows if normalize_region(t["region"]) == reg_key]
                train_items = []
                reg_coaches = 0
                reg_tanks = 0
                reg_online = 0
                reg_has_crit = False
                reg_has_warn = False

                for tr in trains_in_reg:
                    t_num = tr["train_number"]
                    coach_rows = cur.execute("SELECT * FROM coaches WHERE train_number = ?", (t_num,)).fetchall()
                    c_count = len(coach_rows) or tr["total_coaches"] or 0
                    t_count = c_count * 2
                    tr_devs = devs_by_train.get(t_num, [])
                    assigned_uids = {(cr["device_uid"] or "").strip() for cr in coach_rows if (cr["device_uid"] or "").strip()}
                    for u in assigned_uids:
                        if u in dev_by_uid and dev_by_uid[u] not in tr_devs:
                            tr_devs.append(dev_by_uid[u])
                    is_online = any(bool(d.get("is_online")) for d in tr_devs)
                    ever_seen = any(bool(d.get("last_seen_at")) for d in tr_devs)
                    conn_status = "ONLINE" if is_online else ("OFFLINE" if ever_seen else "NEVER_CONNECTED")

                    active_alerts = alarm_counts.get(t_num, 0)
                    if has_crit_map.get(t_num, False):
                        reg_has_crit = True
                    elif active_alerts > 0:
                        reg_has_warn = True

                    if is_online:
                        reg_online += 1
                    reg_coaches += c_count
                    reg_tanks += t_count

                    train_items.append({
                        "train_number": t_num,
                        "name": tr["name"],
                        "region": reg_key,
                        "type": tr["train_type"] or "Express",
                        "coaches_count": c_count,
                        "tanks_count": t_count,
                        "devices_count": len(tr_devs),
                        "is_online": is_online,
                        "connectivity_status": conn_status,
                        "status": "All Normal" if active_alerts == 0 else f"{active_alerts} Active Alerts",
                        "active_alarms": active_alerts,
                        "source_station": tr["source_station"] or "Origin",
                        "source_code": tr["source_code"] or "SRC",
                        "destination_station": tr["destination_station"] or "Terminus",
                        "destination_code": tr["destination_code"] or "DST",
                        "railway_zone": tr["railway_zone"] or "NR",
                        "tank_height_cm": tr["tank_height_cm"],
                        "tank_capacity_liters": tr["tank_capacity_liters"],
                    })

                status = "All Normal"
                if reg_has_crit:
                    status = "Critical"
                elif reg_has_warn:
                    status = "Warning"

                regions_result.append({
                    "region": reg_key,
                    "name": reg_info["name"],
                    "code": reg_info["code"],
                    "configuredTrains": len(train_items),
                    "coaches": reg_coaches,
                    "tanks": reg_tanks,
                    "onlineTrains": reg_online,
                    "status": status,
                    "trains": train_items,
                })

            return regions_result

    def list_trains(self, region: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            rows = cur.execute("SELECT * FROM trains ORDER BY train_number ASC").fetchall()
            results = []

            for tr in rows:
                t_num = tr["train_number"]
                tr_reg = normalize_region(tr["region"])
                if region and region.strip().upper() != "ALL" and tr_reg != normalize_region(region):
                    continue
                if search and search.strip():
                    q = search.strip().lower()
                    if q not in t_num.lower() and q not in tr["name"].lower():
                        continue

                c_rows = cur.execute("SELECT COUNT(*) FROM coaches WHERE train_number = ?", (t_num,)).fetchone()[0]
                c_count = c_rows or tr["total_coaches"] or 1
                results.append({
                    "train_number": t_num,
                    "name": tr["name"],
                    "type": tr["train_type"] or "Express",
                    "region": tr_reg,
                    "coaches_count": c_count,
                    "tanks_count": c_count * 2,
                    "is_online": False,
                    "status": "All Normal",
                    "active_alarms": 0,
                    "source_station": tr["source_station"] or "Origin",
                    "source_code": tr["source_code"] or "SRC",
                    "destination_station": tr["destination_station"] or "Terminus",
                    "destination_code": tr["destination_code"] or "DST",
                    "railway_zone": tr["railway_zone"] or "NR",
                    "total_coaches": c_count,
                    "has_official_composition": bool(tr["has_official_composition"]),
                    "tank_height_cm": tr["tank_height_cm"],
                    "tank_capacity_liters": tr["tank_capacity_liters"],
                })

            return results

    def get_train_consist(self, train_number: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            clean = train_number.strip()
            tr = cur.execute("SELECT * FROM trains WHERE train_number = ?", (clean,)).fetchone()
            if not tr:
                return None

            coach_rows = cur.execute(
                "SELECT * FROM coaches WHERE train_number = ? ORDER BY position ASC", (clean,)
            ).fetchall()
            dev_rows = cur.execute("SELECT * FROM devices").fetchall()
            dev_by_uid = {d["uid"]: dict(d) for d in dev_rows if is_genuine_hardware_uid(d["uid"])}
            coaches_list = []
            any_coach_online = False
            for cr in coach_rows:
                c_num = cr["coach_number"]
                d_uid = (cr["device_uid"] or "").strip()
                dev_info = dev_by_uid.get(d_uid) if d_uid else None
                c_online = bool(dev_info and dev_info.get("is_online"))
                if c_online:
                    any_coach_online = True
                tank_rows = cur.execute(
                    "SELECT * FROM tanks WHERE train_number = ? AND coach_number = ? ORDER BY tank_index ASC",
                    (clean, c_num),
                ).fetchall()
                tanks_list = [
                    {
                        "id": tk["id"],
                        "tank_index": tk["tank_index"],
                        "name": tk["name"],
                        "tank_type": tk["tank_type"] or "CYLINDRICAL",
                        "geometry": tk["tank_type"] or "CYLINDRICAL",
                        "capacity_liters": tk["capacity_liters"],
                        "height_cm": tk["height_cm"],
                        "current_level_percent": tk["current_level_percent"],
                        "current_volume_liters": tk["current_volume_liters"],
                        "status": tk["status"],
                    }
                    for tk in tank_rows
                ]
                coaches_list.append({
                    "coach_number": c_num,
                    "coach_name": cr["coach_name"] or f"Coach {c_num}",
                    "coach_category": cr["coach_category"],
                    "coach_type": cr["coach_type"],
                    "device_uid": d_uid,
                    "is_online": c_online,
                    "hardware_version": "Standard WLI Node",
                    "tanks": tanks_list,
                })

            return {
                "train_number": clean,
                "name": tr["name"],
                "region": tr["region"],
                "coaches_count": len(coaches_list),
                "tanks_count": sum(len(c["tanks"]) for c in coaches_list),
                "online_status": any_coach_online,
                "active_alarms_count": 0,
                "coaches": coaches_list,
                "source_station": tr["source_station"] or "Origin",
                "source_code": tr["source_code"] or "SRC",
                "destination_station": tr["destination_station"] or "Terminus",
                "destination_code": tr["destination_code"] or "DST",
                "railway_zone": tr["railway_zone"] or "NR",
                "train_type": tr["train_type"] or "Express",
                "total_coaches": len(coaches_list),
                "has_official_composition": bool(tr["has_official_composition"]),
                "tank_height_cm": tr["tank_height_cm"],
                "tank_capacity_liters": tr["tank_capacity_liters"],
            }

    def create_train(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new train atomically with coaches and tanks, then update shared_state."""
        train_number = str(payload.get("train_number") or "").strip()
        name = str(payload.get("name") or f"Train {train_number}").strip()
        if not train_number:
            raise ValueError("Train number is required.")

        reg = normalize_region(payload.get("region"))
        zone = str(payload.get("railway_zone") or REGION_CONFIG.get(reg, {}).get("code", "NR")).strip().upper()
        train_type = str(payload.get("train_type") or payload.get("type") or "Express").strip()
        tank_h = float(payload.get("tank_height_cm") or payload.get("tank_height") or 50.0)
        tank_c = float(payload.get("tank_capacity_liters") or payload.get("tank_capacity") or 20.0)

        coach_specs = payload.get("coaches") or []
        coaches_to_create: List[str] = []
        if isinstance(coach_specs, list) and len(coach_specs) > 0:
            seen = set()
            for cs in coach_specs:
                cn = (cs.get("coach_number") if isinstance(cs, dict) else str(cs)).strip().upper()
                if cn and cn not in seen:
                    seen.add(cn)
                    coaches_to_create.append(cn)
        elif payload.get("coach_number"):
            coaches_to_create.append(str(payload.get("coach_number")).strip().upper())
        else:
            coaches_to_create.append("B1")

        with self._lock:
            conn = self._get_conn()
            try:
                conn.execute("BEGIN IMMEDIATE")
                existing = conn.execute("SELECT 1 FROM trains WHERE train_number = ?", (train_number,)).fetchone()
                if existing:
                    conn.rollback()
                    raise ValueError(f"Train {train_number} is already registered in the fleet.")

                now_iso = datetime.now(timezone.utc).isoformat()
                t_id = f"tr-{uuid.uuid4().hex[:8]}"

                conn.execute(
                    """
                    INSERT INTO trains (
                        train_number, id, name, region, railway_zone, train_type,
                        source_station, source_code, destination_station, destination_code,
                        tank_height_cm, tank_capacity_liters, total_coaches, has_official_composition,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        train_number, t_id, name, reg, zone, train_type,
                        payload.get("source_station"), payload.get("source_code"),
                        payload.get("destination_station"), payload.get("destination_code"),
                        tank_h, tank_c, len(coaches_to_create), now_iso, now_iso,
                    ),
                )

                for idx, c_num in enumerate(coaches_to_create, 1):
                    c_id = f"coach-{train_number}-{c_num}"
                    conn.execute(
                        """
                        INSERT INTO coaches (
                            id, train_number, coach_number, coach_name, coach_category, coach_type,
                            position, device_uid, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'PASSENGER', 'AC_CHAIR_CAR', ?, '', ?, ?)
                        """,
                        (c_id, train_number, c_num, f"Coach {c_num}", idx, now_iso, now_iso),
                    )
                    for t_idx in (1, 2):
                        t_name = "Arrival Side (Tank 1)" if t_idx == 1 else "Departure Side (Tank 2)"
                        tank_id = f"tank-{train_number}-{c_num}-{t_idx}"
                        tank_liters = tank_c * 25.0 if tank_c <= 20.0 else tank_c
                        conn.execute(
                            """
                            INSERT INTO tanks (
                                id, train_number, coach_number, tank_index, name, tank_type,
                                capacity_liters, height_cm, area_m2, current_level_percent,
                                current_volume_liters, status, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, 'CYLINDRICAL', ?, ?, 0.04, 0.0, 0.0, 'NORMAL', ?, ?)
                            """,
                            (tank_id, train_number, c_num, t_idx, t_name, tank_liters, tank_h, now_iso, now_iso),
                        )

                conn.commit()
                self._rebuild_fleet_state_snapshot_unlocked(conn)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise

        return {
            "message": "Train registered successfully",
            "train_number": train_number,
            "name": name,
            "region": reg,
            "railway_zone": zone,
            "coaches_count": len(coaches_to_create),
            "tanks_count": len(coaches_to_create) * 2,
            "tank_height_cm": tank_h,
            "tank_capacity_liters": tank_c,
        }

    def update_train(self, train_number: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            conn = self._get_conn()
            clean = train_number.strip()
            tr = conn.execute("SELECT * FROM trains WHERE train_number = ?", (clean,)).fetchone()
            if not tr:
                raise ValueError(f"Train {clean} not found.")

            new_name = payload.get("name", tr["name"]).strip()
            new_reg = normalize_region(payload.get("region", tr["region"]))
            new_zone = payload.get("railway_zone", tr["railway_zone"])
            new_type = payload.get("train_type") or payload.get("type", tr["train_type"])
            now_iso = datetime.now(timezone.utc).isoformat()

            conn.execute(
                """
                UPDATE trains SET name = ?, region = ?, railway_zone = ?, train_type = ?, updated_at = ?
                WHERE train_number = ?
                """,
                (new_name, new_reg, new_zone, new_type, now_iso, clean),
            )
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)

        return {
            "message": "Train updated successfully",
            "train_number": clean,
            "name": new_name,
            "region": new_reg,
            "railway_zone": new_zone,
            "train_type": new_type,
        }

    def delete_train(self, train_number: str) -> bool:
        with self._lock:
            conn = self._get_conn()
            clean = train_number.strip()
            tr = conn.execute("SELECT * FROM trains WHERE train_number = ?", (clean,)).fetchone()
            if not tr:
                return False

            conn.execute("DELETE FROM tanks WHERE train_number = ?", (clean,))
            conn.execute("DELETE FROM coaches WHERE train_number = ?", (clean,))
            conn.execute("DELETE FROM trains WHERE train_number = ?", (clean,))
            conn.execute(
                "UPDATE devices SET train_number = 'UNASSIGNED', coach_number = 'UNASSIGNED' WHERE train_number = ?",
                (clean,),
            )
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return True

    def add_coach(self, train_number: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            conn = self._get_conn()
            clean_tr = train_number.strip()
            tr = conn.execute("SELECT * FROM trains WHERE train_number = ?", (clean_tr,)).fetchone()
            if not tr:
                raise ValueError(f"Train {clean_tr} not found.")

            c_num = str(payload.get("coach_number") or "").strip().upper()
            if not c_num:
                raise ValueError("Coach number is required.")

            now_iso = datetime.now(timezone.utc).isoformat()
            existing = conn.execute(
                "SELECT 1 FROM coaches WHERE train_number = ? AND coach_number = ?", (clean_tr, c_num)
            ).fetchone()
            if existing:
                raise ValueError(f"Coach {c_num} already exists on Train {clean_tr}.")

            pos = conn.execute("SELECT COUNT(*) FROM coaches WHERE train_number = ?", (clean_tr,)).fetchone()[0] + 1
            c_id = f"coach-{clean_tr}-{c_num}"
            c_name = str(payload.get("coach_name") or f"Coach {c_num}").strip()
            c_cat = str(payload.get("coach_category") or "PASSENGER").strip()
            c_type = str(payload.get("coach_type") or c_cat or "AC_CHAIR_CAR").strip()
            dev_uid = str(payload.get("device_uid") or "").strip()
            conn.execute(
                """
                INSERT INTO coaches (id, train_number, coach_number, coach_name, coach_category, coach_type, position, device_uid, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (c_id, clean_tr, c_num, c_name, c_cat, c_type, pos, dev_uid, now_iso, now_iso),
            )
            default_h = float(payload.get("tank_height_cm") or tr["tank_height_cm"] or 50.0)
            tank_c = tr["tank_capacity_liters"] or 20.0
            for t_idx, name_k, h_k, g_k, default_name in (
                (1, "tank_1_name", "tank_1_height_cm", "tank_1_geometry", "Arrival Side (Tank 1)"),
                (2, "tank_2_name", "tank_2_height_cm", "tank_2_geometry", "Departure Side (Tank 2)"),
            ):
                t_id = f"tank-{clean_tr}-{c_num}-{t_idx}"
                t_name = str(payload.get(name_k) or default_name).strip()
                t_h = float(payload.get(h_k) or default_h or 50.0)
                t_geom = str(payload.get(g_k) or "CYLINDRICAL").strip().upper()
                conn.execute(
                    """
                    INSERT INTO tanks (id, train_number, coach_number, tank_index, name, tank_type, capacity_liters, height_cm, area_m2, current_level_percent, current_volume_liters, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.04, 0.0, 0.0, 'NORMAL', ?, ?)
                    """,
                    (t_id, clean_tr, c_num, t_idx, t_name, t_geom, tank_c * 25.0, t_h, now_iso, now_iso),
                )
            if dev_uid and is_genuine_hardware_uid(dev_uid):
                self._sync_exclusive_assignment_unlocked(conn, dev_uid, clean_tr, c_num, now_iso)
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)

        return {"message": f"Coach {c_num} added to Train {clean_tr}", "coach_number": c_num}

    def delete_coach(self, train_number: str, coach_number: str) -> bool:
        with self._lock:
            conn = self._get_conn()
            clean_tr = train_number.strip()
            clean_c = coach_number.strip().upper()
            conn.execute("DELETE FROM tanks WHERE train_number = ? AND coach_number = ?", (clean_tr, clean_c))
            conn.execute("DELETE FROM coaches WHERE train_number = ? AND coach_number = ?", (clean_tr, clean_c))
            conn.execute(
                "UPDATE devices SET coach_number = 'UNASSIGNED' WHERE train_number = ? AND coach_number = ?",
                (clean_tr, clean_c),
            )
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
        return True

    def rename_coach(self, train_number: str, old_coach: str, new_coach: str) -> bool:
        with self._lock:
            conn = self._get_conn()
            clean_tr = train_number.strip()
            c_old = old_coach.strip().upper()
            c_new = new_coach.strip().upper()
            if not c_new:
                raise ValueError("New coach number cannot be empty.")
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE coaches SET coach_number = ?, coach_name = ?, updated_at = ? WHERE train_number = ? AND coach_number = ?",
                (c_new, f"Coach {c_new}", now_iso, clean_tr, c_old),
            )
            conn.execute(
                "UPDATE tanks SET coach_number = ?, updated_at = ? WHERE train_number = ? AND coach_number = ?",
                (c_new, now_iso, clean_tr, c_old),
            )
            conn.execute(
                "UPDATE devices SET coach_number = ? WHERE train_number = ? AND coach_number = ?",
                (c_new, clean_tr, c_old),
            )
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
        return True

    # -------------------------------------------------------------------------
    # Devices Management
    # -------------------------------------------------------------------------

    def list_devices(self) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            rows = conn.execute("SELECT * FROM devices ORDER BY uid ASC").fetchall()
            return [dict(r) for r in rows if is_genuine_hardware_uid(r["uid"])]

    def _sync_exclusive_assignment_unlocked(
        self, conn: sqlite3.Connection, uid: str, train_number: str, coach_number: str, now_iso: str
    ) -> None:
        clean_uid = (uid or "").strip()
        tr_clean = (train_number or "").strip()
        ch_clean = (coach_number or "").strip().upper()
        is_assigned = bool(
            clean_uid
            and tr_clean
            and tr_clean.upper() != "UNASSIGNED"
            and ch_clean
            and ch_clean != "UNASSIGNED"
        )
        if clean_uid:
            conn.execute(
                "UPDATE coaches SET device_uid = '', updated_at = ? WHERE device_uid = ? AND NOT (train_number = ? AND coach_number = ?)",
                (now_iso, clean_uid, tr_clean if is_assigned else "__NONE__", ch_clean if is_assigned else "__NONE__"),
            )
        if is_assigned:
            conn.execute(
                "UPDATE devices SET train_number = 'UNASSIGNED', coach_number = 'UNASSIGNED', status = 'AVAILABLE', updated_at = ? WHERE train_number = ? AND coach_number = ? AND uid != ?",
                (now_iso, tr_clean, ch_clean, clean_uid),
            )
            conn.execute(
                "UPDATE coaches SET device_uid = ?, updated_at = ? WHERE train_number = ? AND coach_number = ?",
                (clean_uid, now_iso, tr_clean, ch_clean),
            )

    def update_coach(self, train_number: str, coach_number: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        clean_tr = train_number.strip()
        clean_c = coach_number.strip().upper()
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._get_conn()
            cr = conn.execute(
                "SELECT * FROM coaches WHERE train_number = ? AND coach_number = ?", (clean_tr, clean_c)
            ).fetchone()
            if not cr:
                raise ValueError(f"Coach {clean_c} not found on Train {clean_tr}.")

            c_name = payload.get("coach_name") or cr["coach_name"]
            c_cat = payload.get("coach_category") or cr["coach_category"]
            c_type = payload.get("coach_type") or cr["coach_type"]
            new_uid = payload.get("device_uid")
            old_uid = (cr["device_uid"] or "").strip()
            final_uid = old_uid if new_uid is None else new_uid.strip()

            conn.execute(
                "UPDATE coaches SET coach_name = ?, coach_category = ?, coach_type = ?, device_uid = ?, updated_at = ? WHERE train_number = ? AND coach_number = ?",
                (c_name, c_cat, c_type, final_uid, now_iso, clean_tr, clean_c),
            )

            for idx, cap_k, h_k, n_k, g_k in (
                (1, "tank_1_capacity", "tank_1_height_cm", "tank_1_name", "tank_1_geometry"),
                (2, "tank_2_capacity", "tank_2_height_cm", "tank_2_name", "tank_2_geometry"),
            ):
                cap = payload.get(cap_k)
                ht = payload.get(h_k) or payload.get("tank_height_cm")
                tname = payload.get(n_k)
                tgeom = payload.get(g_k)
                if any(v is not None for v in (cap, ht, tname, tgeom)):
                    conn.execute(
                        """
                        UPDATE tanks
                        SET name = COALESCE(?, name),
                            capacity_liters = COALESCE(?, capacity_liters),
                            height_cm = COALESCE(?, height_cm),
                            tank_type = COALESCE(?, tank_type),
                            updated_at = ?
                        WHERE train_number = ? AND coach_number = ? AND tank_index = ?
                        """,
                        (tname, cap, ht, (tgeom.upper() if isinstance(tgeom, str) else None), now_iso, clean_tr, clean_c, idx),
                    )

            if new_uid is not None:
                if old_uid and old_uid != final_uid:
                    conn.execute(
                        "UPDATE devices SET train_number = 'UNASSIGNED', coach_number = 'UNASSIGNED', status = 'AVAILABLE', updated_at = ? WHERE uid = ?",
                        (now_iso, old_uid),
                    )
                if final_uid:
                    if not is_genuine_hardware_uid(final_uid):
                        raise ValueError("Invalid hardware UID")
                    ex = conn.execute("SELECT 1 FROM devices WHERE uid = ?", (final_uid,)).fetchone()
                    if ex:
                        conn.execute(
                            "UPDATE devices SET train_number = ?, coach_number = ?, status = 'ENGAGED', updated_at = ? WHERE uid = ?",
                            (clean_tr, clean_c, now_iso, final_uid),
                        )
                    else:
                        conn.execute(
                            """
                            INSERT INTO devices (
                                uid, id, name, train_number, coach_number, device_type,
                                protocol, mqtt_client_id, mqtt_topic, tank_assignment,
                                status, is_online, last_seen_at, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, 'Quectel EC200U 4G LTE', 'MQTT over TLS/WSS', ?, ?, 'BOTH', 'ENGAGED', 0, NULL, ?, ?)
                            """,
                            (final_uid, f"dev-{uuid.uuid4().hex[:8]}", f"Node ({final_uid[-6:]})", clean_tr, clean_c, f"panorama-wli-{final_uid.lower()}", f"panorama/telemetry/{final_uid}", now_iso, now_iso),
                        )
                    self._sync_exclusive_assignment_unlocked(conn, final_uid, clean_tr, clean_c, now_iso)

            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return {"success": True, "train_number": clean_tr, "coach_number": clean_c, "device_uid": final_uid}

    def update_device(self, device_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._get_conn()
            row = conn.execute("SELECT * FROM devices WHERE id = ? OR uid = ?", (device_id, device_id)).fetchone()
            if not row:
                return None
            uid = row["uid"]
            name = (payload.get("name") or row["name"]).strip()
            tr_no = (payload.get("trainNumber") if payload.get("trainNumber") is not None else payload.get("train_number"))
            ch_no = (payload.get("coachNumber") if payload.get("coachNumber") is not None else payload.get("coach_number"))
            final_tr = (tr_no if tr_no is not None else row["train_number"]).strip() or "UNASSIGNED"
            final_ch = (ch_no if ch_no is not None else row["coach_number"]).strip().upper() or "UNASSIGNED"
            final_st = "ENGAGED" if (final_tr.upper() != "UNASSIGNED" and final_ch != "UNASSIGNED") else "AVAILABLE"
            conn.execute(
                "UPDATE devices SET name = ?, train_number = ?, coach_number = ?, status = ?, updated_at = ? WHERE uid = ?",
                (name, final_tr, final_ch, final_st, now_iso, uid),
            )
            self._sync_exclusive_assignment_unlocked(conn, uid, final_tr, final_ch, now_iso)
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
            self._rebuild_devices_state_snapshot_unlocked(conn)
            updated = conn.execute("SELECT * FROM devices WHERE uid = ?", (uid,)).fetchone()
            return dict(updated) if updated else None

    def update_tank(self, tank_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._get_conn()
            row = conn.execute("SELECT * FROM tanks WHERE id = ?", (tank_id,)).fetchone()
            if not row:
                return None
            conn.execute(
                """
                UPDATE tanks SET name = COALESCE(?, name),
                    capacity_liters = COALESCE(?, capacity_liters),
                    height_cm = COALESCE(?, height_cm),
                    area_m2 = COALESCE(?, area_m2),
                    tank_type = COALESCE(?, tank_type),
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.get("name"),
                    payload.get("capacityLiters") or payload.get("capacity_liters"),
                    payload.get("heightCm") or payload.get("height_cm"),
                    payload.get("areaM2") or payload.get("area_m2"),
                    payload.get("geometry") or payload.get("tank_type"),
                    now_iso,
                    tank_id,
                ),
            )
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
            updated = conn.execute("SELECT * FROM tanks WHERE id = ?", (tank_id,)).fetchone()
            return dict(updated) if updated else None

    def create_device(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        uid = str(payload.get("uid") or "").strip().upper()
        if not is_genuine_hardware_uid(uid):
            raise ValueError("Invalid hardware UID: must be a genuine 24-char physical hex identifier.")
        with self._lock:
            conn = self._get_conn()
            existing = conn.execute("SELECT 1 FROM devices WHERE uid = ?", (uid,)).fetchone()
            if existing:
                raise ValueError(f"Device UID {uid} already exists.")
            now_iso = datetime.now(timezone.utc).isoformat()
            d_id = f"dev-{uuid.uuid4().hex[:8]}"
            tr_no = str(payload.get("train_number") or payload.get("trainNumber") or "UNASSIGNED").strip() or "UNASSIGNED"
            ch_no = str(payload.get("coach_number") or payload.get("coachNumber") or "UNASSIGNED").strip().upper() or "UNASSIGNED"
            is_engaged = tr_no.upper() != "UNASSIGNED" and ch_no != "UNASSIGNED"
            dev_status = "ENGAGED" if is_engaged else (payload.get("status") or "AVAILABLE")
            conn.execute(
                """
                INSERT INTO devices (
                    uid, id, name, train_number, coach_number, device_type,
                    protocol, mqtt_client_id, mqtt_topic, tank_assignment,
                    status, is_online, last_seen_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
                """,
                (
                    uid, d_id, payload.get("name") or "Coach Water Monitor",
                    tr_no,
                    ch_no,
                    payload.get("device_type") or "Quectel EC200U 4G LTE",
                    payload.get("protocol") or "MQTT over TLS/WSS",
                    payload.get("mqtt_client_id") or f"panorama-wli-{uid.lower()}",
                    payload.get("mqtt_topic") or f"panorama/telemetry/{uid}",
                    payload.get("tank_assignment") or "BOTH",
                    dev_status,
                    now_iso, now_iso,
                ),
            )
            self._sync_exclusive_assignment_unlocked(conn, uid, tr_no, ch_no, now_iso)
            conn.commit()
            self._rebuild_fleet_state_snapshot_unlocked(conn)
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return {"id": d_id, "uid": uid, "train_number": tr_no, "coach_number": ch_no, "status": dev_status}

    def delete_device(self, device_id: str) -> bool:
        with self._lock:
            conn = self._get_conn()
            conn.execute("DELETE FROM devices WHERE id = ? OR uid = ?", (device_id, device_id))
            conn.commit()
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return True

    def list_mqtt_topics(self, limit: int = 500) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            rows = conn.execute(
                "SELECT topic, payload, qos, retained, received_at FROM mqtt_latest_topics ORDER BY received_at DESC LIMIT ?",
                (max(1, min(limit, 1000)),),
            ).fetchall()
            return [
                {
                    "topic": r["topic"],
                    "payload": r["payload"],
                    "qos": int(r["qos"]),
                    "retained": bool(r["retained"]),
                    "received_at": r["received_at"],
                }
                for r in rows
            ]

    def get_mqtt_topic(self, topic: str) -> Optional[Dict[str, Any]]:
        clean = topic.strip()
        if not clean:
            return None
        with self._lock:
            conn = self._get_conn()
            r = conn.execute(
                "SELECT topic, payload, qos, retained, received_at FROM mqtt_latest_topics WHERE topic = ?",
                (clean,),
            ).fetchone()
            if not r:
                return None
            return {
                "topic": r["topic"],
                "payload": r["payload"],
                "qos": int(r["qos"]),
                "retained": bool(r["retained"]),
                "received_at": r["received_at"],
            }

    def upsert_mqtt_topic(self, topic: str, payload: str, qos: int = 0, retained: bool = False) -> Dict[str, Any]:
        clean = topic.strip()
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._get_conn()
            conn.execute(
                """
                INSERT INTO mqtt_latest_topics (topic, payload, qos, retained, received_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(topic) DO UPDATE SET
                    payload = excluded.payload,
                    qos = excluded.qos,
                    retained = excluded.retained,
                    received_at = excluded.received_at
                """,
                (clean, payload, int(qos), 1 if retained else 0, now_iso),
            )
            conn.commit()
        return {"topic": clean, "payload": payload, "qos": int(qos), "retained": bool(retained), "received_at": now_iso}


shared_state_service = SharedStateService()
