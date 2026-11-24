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
                    "train_number": "12626",
                    "name": "Kerala Express",
                    "region": "SOUTH",
                    "railway_zone": "SR",
                    "train_type": "Superfast Express",
                    "source_station": "New Delhi",
                    "source_code": "NDLS",
                    "destination_station": "Thiruvananthapuram",
                    "destination_code": "TVC",
                    "coaches": ["SLRD", "S1", "S2", "B1", "B2", "A1"],
                },
                {
                    "train_number": "12301",
                    "name": "Howrah Rajdhani Express",
                    "region": "EAST",
                    "railway_zone": "ER",
                    "train_type": "Rajdhani Express",
                    "source_station": "Howrah Junction",
                    "source_code": "HWH",
                    "destination_station": "New Delhi",
                    "destination_code": "NDLS",
                    "coaches": ["B1", "B2", "B3", "A1", "A2", "H1"],
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
                    cur.execute(
                        """
                        INSERT INTO coaches (
                            id, train_number, coach_number, coach_name, coach_category, coach_type,
                            position, device_uid, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'PASSENGER', 'AC_CHAIR_CAR', ?, '', ?, ?)
                        """,
                        (c_id, tr["train_number"], c_num, f"Coach {c_num}", idx, now_iso, now_iso),
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

            # Baseline hardware device
            cur.execute(
                """
                INSERT OR IGNORE INTO devices (
                    uid, id, name, train_number, coach_number, device_type,
                    protocol, mqtt_client_id, mqtt_topic, tank_assignment,
                    status, is_online, last_seen_at, created_at, updated_at
                ) VALUES (
                    '0023004D4B42501120353332', 'dev-001', 'Shatabdi Coach B4 Water System',
                    'UNASSIGNED', 'UNASSIGNED', 'Quectel EC200U 4G LTE',
                    'MQTT over TLS/WSS', 'panorama-wli-0023004D4B42501120353332',
                    'panorama/telemetry/0023004D4B42501120353332', 'BOTH',
                    'AVAILABLE', 0, NULL, ?, ?
                )
                """,
                (now_iso, now_iso),
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
            devices_rows = cur.execute("SELECT * FROM devices").fetchall()
            device_online_map = {d["train_number"]: bool(d["is_online"]) for d in devices_rows if d["train_number"]}

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
                    c_count = len(coach_rows) or tr["total_coaches"] or 1
                    t_count = c_count * 2
                    is_online = device_online_map.get(t_num, False)

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
                        "is_online": is_online,
                        "connectivity_status": "ONLINE" if is_online else "OFFLINE",
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
            coaches_list = []
            for cr in coach_rows:
                c_num = cr["coach_number"]
                tank_rows = cur.execute(
                    "SELECT * FROM tanks WHERE train_number = ? AND coach_number = ? ORDER BY tank_index ASC",
                    (clean, c_num),
                ).fetchall()
                tanks_list = [
                    {
                        "id": tk["id"],
                        "tank_index": tk["tank_index"],
                        "name": tk["name"],
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
                    "coach_category": cr["coach_category"],
                    "device_uid": cr["device_uid"] or "",
                    "is_online": False,
                    "hardware_version": "Standard WLI Node",
                    "tanks": tanks_list,
                })

            return {
                "train_number": clean,
                "name": tr["name"],
                "region": tr["region"],
                "coaches_count": len(coaches_list),
                "tanks_count": sum(len(c["tanks"]) for c in coaches_list),
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
                        conn.execute(
                            """
                            INSERT INTO tanks (
                                id, train_number, coach_number, tank_index, name, tank_type,
                                capacity_liters, height_cm, area_m2, current_level_percent,
                                current_volume_liters, status, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, 'CYLINDRICAL', ?, ?, 0.04, 0.0, 0.0, 'NORMAL', ?, ?)
                            """,
                            (tank_id, train_number, c_num, t_idx, t_name, tank_c * 25.0, tank_h, now_iso, now_iso),
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
            conn.execute(
                """
                INSERT INTO coaches (id, train_number, coach_number, coach_name, coach_category, coach_type, position, device_uid, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'PASSENGER', 'AC_CHAIR_CAR', ?, '', ?, ?)
                """,
                (c_id, clean_tr, c_num, f"Coach {c_num}", pos, now_iso, now_iso),
            )
            tank_h = tr["tank_height_cm"] or 50.0
            tank_c = tr["tank_capacity_liters"] or 20.0
            for t_idx in (1, 2):
                t_id = f"tank-{clean_tr}-{c_num}-{t_idx}"
                conn.execute(
                    """
                    INSERT INTO tanks (id, train_number, coach_number, tank_index, name, tank_type, capacity_liters, height_cm, area_m2, current_level_percent, current_volume_liters, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'CYLINDRICAL', ?, ?, 0.04, 0.0, 0.0, 'NORMAL', ?, ?)
                    """,
                    (t_id, clean_tr, c_num, t_idx, f"Tank {t_idx}", tank_c * 25.0, tank_h, now_iso, now_iso),
                )
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
            return [dict(r) for r in rows]

    def create_device(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        uid = str(payload.get("uid") or "").strip().upper()
        if not uid:
            raise ValueError("Device UID is required.")
        with self._lock:
            conn = self._get_conn()
            existing = conn.execute("SELECT 1 FROM devices WHERE uid = ?", (uid,)).fetchone()
            if existing:
                raise ValueError(f"Device UID {uid} already exists.")
            now_iso = datetime.now(timezone.utc).isoformat()
            d_id = f"dev-{uuid.uuid4().hex[:8]}"
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
                    payload.get("train_number") or "UNASSIGNED",
                    payload.get("coach_number") or "UNASSIGNED",
                    payload.get("device_type") or "Quectel EC200U 4G LTE",
                    payload.get("protocol") or "MQTT over TLS/WSS",
                    payload.get("mqtt_client_id") or f"panorama-wli-{uid.lower()}",
                    payload.get("mqtt_topic") or f"panorama/telemetry/{uid}",
                    payload.get("tank_assignment") or "BOTH",
                    payload.get("status") or "AVAILABLE",
                    now_iso, now_iso,
                ),
            )
            conn.commit()
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return {"id": d_id, "uid": uid, "status": "AVAILABLE"}

    def delete_device(self, device_id: str) -> bool:
        with self._lock:
            conn = self._get_conn()
            conn.execute("DELETE FROM devices WHERE id = ? OR uid = ?", (device_id, device_id))
            conn.commit()
            self._rebuild_devices_state_snapshot_unlocked(conn)
        return True


shared_state_service = SharedStateService()
