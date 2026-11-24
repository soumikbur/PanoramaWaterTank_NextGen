"""Telemetry repository for time series database access."""
import json
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from sqlalchemy import select, desc, asc, func, or_, and_, not_
from sqlalchemy.sql.functions import coalesce
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.telemetry import TelemetryReading
from app.models.device import Device
from app.core.device_identity import get_canonical_uid, is_genuine_hardware_uid


def format_telemetry_table_row(r: TelemetryReading, d_uid: Optional[str] = None) -> Dict[str, Any]:
    """Formats a TelemetryReading instance into the exact 13 requested columns."""
    raw_p: Dict[str, Any] = {}
    if r.raw_payload:
        try:
            raw_p = json.loads(r.raw_payload) if isinstance(r.raw_payload, str) else r.raw_payload
        except Exception:
            pass

    # 1. Device ID - consolidated to canonical UID
    raw_uid = str(d_uid or r.device_uid or r.device_id)
    dev_id = get_canonical_uid(raw_uid)

    # 2. Recorded At (DD-MM-YYYY HH:mm:ss)
    rec_at_fmt = r.timestamp.strftime("%d-%m-%Y %H:%M:%S") if r.timestamp else "--"

    # 4. Level 1 %
    lvl = r.level_percent if r.level_percent is not None else raw_p.get("wlp1")

    # 3. AI1 mA
    ai1_ma = raw_p.get("ai1") or raw_p.get("ai1_ma") or raw_p.get("cur1")
    if ai1_ma is None and lvl is not None:
        try:
            ai1_ma = round(4.0 + 16.0 * (float(lvl) / 100.0), 2)
        except Exception:
            ai1_ma = None
    elif ai1_ma is not None:
        try:
            ai1_ma = round(float(ai1_ma), 2)
        except Exception:
            pass

    # 5. AI1 Valid
    if r.sensor_valid is True or raw_p.get("wlvl") is True or raw_p.get("wlv1") is True:
        ai1_valid = "Valid"
    elif r.sensor_valid is False or raw_p.get("wlvl") is False or raw_p.get("wlv1") is False:
        ai1_valid = "Invalid"
    else:
        ai1_valid = "--"

    # 6. Battery V
    bat_v = r.battery_v1 if r.battery_v1 is not None else raw_p.get("v1")
    if bat_v is not None:
        try:
            bat_v = round(float(bat_v), 3)
        except Exception:
            pass

    # 7. Battery %
    bat_pct = raw_p.get("bat")
    if bat_pct is None and bat_v is not None:
        try:
            v = float(bat_v)
            if 3.0 <= v <= 4.2:
                bat_pct = round(max(0.0, min(100.0, (v - 3.0) / 1.2 * 100.0)), 1)
            elif 10.5 <= v <= 14.5:
                bat_pct = round(max(0.0, min(100.0, (v - 10.5) / 3.5 * 100.0)), 1)
        except Exception:
            pass

    # 8. Latitude & 9. Longitude
    lat = r.latitude if r.latitude is not None else raw_p.get("lat")
    lon = r.longitude if r.longitude is not None else (raw_p.get("long") or raw_p.get("lon"))
    if lat is not None:
        try:
            lat = round(float(lat), 7)
        except Exception:
            pass
    if lon is not None:
        try:
            lon = round(float(lon), 7)
        except Exception:
            pass

    # 10. Altitude m
    alt = r.altitude if r.altitude is not None else raw_p.get("alt")
    if alt is not None:
        try:
            alt = round(float(alt), 2)
        except Exception:
            pass

    # 11. GPS Valid
    if lat is not None and lon is not None and not (lat == 0 and lon == 0):
        gps_valid = "Valid"
    elif lat is not None or lon is not None:
        gps_valid = "Invalid"
    else:
        gps_valid = "--"

    # 12. Altitude Valid
    if alt is not None and alt != 0:
        alt_valid = "Valid"
    elif alt is not None:
        alt_valid = "Invalid"
    else:
        alt_valid = "--"

    # 13. Received UTC (strictly in UTC format: DD-MM-YYYY HH:mm:ss)
    if r.created_at:
        rec_utc = r.created_at
        if rec_utc.tzinfo is not None:
            rec_utc = rec_utc.astimezone(timezone.utc)
        rec_utc_fmt = rec_utc.strftime("%d-%m-%Y %H:%M:%S")
    else:
        rec_utc_fmt = "--"

    return {
        "id": r.id,
        "deviceId": dev_id,
        "recordedAt": rec_at_fmt,
        "ai1Ma": ai1_ma,
        "level1Percent": f"{round(float(lvl), 1)}%" if lvl is not None else "--",
        "ai1Valid": ai1_valid,
        "batteryV": bat_v,
        "batteryPercent": f"{round(float(bat_pct), 1)}%" if bat_pct is not None else "--",
        "latitude": lat,
        "longitude": lon,
        "altitudeM": alt,
        "gpsValid": gps_valid,
        "altitudeValid": alt_valid,
        "receivedUtc": rec_utc_fmt,
    }


class TelemetryRepository:
    """Async repository for Telemetry readings."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert(self, reading: TelemetryReading) -> TelemetryReading:
        self.session.add(reading)
        return reading

    async def get_latest_for_device(self, device_id: str) -> Optional[TelemetryReading]:
        stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.device_id == device_id)
            .order_by(desc(TelemetryReading.timestamp))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_for_tank(self, tank_id: str) -> Optional[TelemetryReading]:
        stmt = (
            select(TelemetryReading)
            .where(TelemetryReading.tank_id == tank_id)
            .order_by(desc(TelemetryReading.timestamp))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_history_for_tank(
        self,
        tank_id: str,
        start_time: datetime,
        end_time: Optional[datetime] = None
    ) -> List[TelemetryReading]:
        if end_time is None:
            end_time = datetime.now(timezone.utc)

        stmt = (
            select(TelemetryReading)
            .where(
                TelemetryReading.tank_id == tank_id,
                TelemetryReading.timestamp >= start_time,
                TelemetryReading.timestamp <= end_time
            )
            .order_by(TelemetryReading.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    def _build_filter_conditions(
        self,
        search: Optional[str] = None,
        device_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        ai1_valid: Optional[str] = None,
        gps_valid: Optional[str] = None,
        altitude_valid: Optional[str] = None,
    ) -> List[Any]:
        conditions = [
            # Strict genuine registered device cross-reference (source of truth)
            Device.id.isnot(None),
            Device.is_deleted == False,
            Device.status.in_(["AVAILABLE", "ENGAGED", "REGISTERED"]),
            func.length(Device.uid) == 24,
            not_(Device.uid.ilike("%TEST%")),
            not_(Device.uid.ilike("%AUDIT%")),
            not_(Device.uid.ilike("%DUMMY%")),
            not_(Device.uid.ilike("%DEMO%")),
            not_(Device.uid.ilike("%SEED%")),
            not_(Device.uid.ilike("%PLACEHOLDER%")),
            not_(Device.uid.ilike("%ROGUE%")),
            not_(Device.uid.ilike("%MOCK%")),
        ]

        if search and search.strip():
            term = f"%{search.strip()}%"
            canonical_term = get_canonical_uid(search.strip())
            conditions.append(
                or_(
                    TelemetryReading.device_uid.ilike(term),
                    Device.uid.ilike(term),
                    Device.uid == canonical_term,
                    TelemetryReading.device_id.ilike(term),
                )
            )

        if device_id and device_id.strip() and device_id.strip().upper() != "ALL":
            did = device_id.strip()
            canonical_did = get_canonical_uid(did)
            conditions.append(
                or_(
                    TelemetryReading.device_uid == did,
                    TelemetryReading.device_uid == canonical_did,
                    Device.uid == did,
                    Device.uid == canonical_did,
                    TelemetryReading.device_id == did,
                )
            )

        if start_date:
            conditions.append(TelemetryReading.timestamp >= start_date)

        if end_date:
            conditions.append(TelemetryReading.timestamp <= end_date)

        if ai1_valid and ai1_valid in ("Valid", "Invalid"):
            is_valid = (ai1_valid == "Valid")
            conditions.append(TelemetryReading.sensor_valid == is_valid)

        if gps_valid and gps_valid in ("Valid", "Invalid"):
            if gps_valid == "Valid":
                conditions.append(
                    and_(
                        TelemetryReading.latitude.isnot(None),
                        TelemetryReading.longitude.isnot(None),
                        TelemetryReading.latitude != 0,
                        TelemetryReading.longitude != 0,
                    )
                )
            else:
                conditions.append(
                    or_(
                        TelemetryReading.latitude.is_(None),
                        TelemetryReading.longitude.is_(None),
                        TelemetryReading.latitude == 0,
                        TelemetryReading.longitude == 0,
                    )
                )

        if altitude_valid and altitude_valid in ("Valid", "Invalid"):
            if altitude_valid == "Valid":
                conditions.append(
                    and_(
                        TelemetryReading.altitude.isnot(None),
                        TelemetryReading.altitude != 0,
                    )
                )
            else:
                conditions.append(
                    or_(
                        TelemetryReading.altitude.is_(None),
                        TelemetryReading.altitude == 0,
                    )
                )

        return conditions

    async def get_unique_devices_latest_records(
        self,
        search: Optional[str] = None,
        sort_by: str = "recordedAt",
        sort_order: str = "desc",
        page: int = 1,
        limit: int = 25,
    ) -> Tuple[int, int, List[Dict[str, Any]]]:
        """Fetch strictly one record per unique registered physical device containing its latest telemetry."""
        # 1. Window ranking subquery over telemetry_readings
        ranked = (
            select(
                TelemetryReading.id.label("t_id"),
                TelemetryReading.device_id.label("t_dev_id"),
                TelemetryReading.timestamp.label("t_timestamp"),
                TelemetryReading.level_percent.label("t_level"),
                TelemetryReading.battery_v1.label("t_bat"),
                TelemetryReading.latitude.label("t_lat"),
                TelemetryReading.longitude.label("t_lon"),
                TelemetryReading.altitude.label("t_alt"),
                TelemetryReading.sensor_valid.label("t_valid"),
                TelemetryReading.created_at.label("t_created"),
                func.row_number().over(
                    partition_by=TelemetryReading.device_id,
                    order_by=(desc(TelemetryReading.timestamp), desc(TelemetryReading.id))
                ).label("rn")
            )
            .subquery()
        )

        stmt = (
            select(
                Device,
                ranked.c.t_id,
                ranked.c.t_timestamp,
                ranked.c.t_level,
                ranked.c.t_bat,
                ranked.c.t_lat,
                ranked.c.t_lon,
                ranked.c.t_alt,
                ranked.c.t_valid,
                ranked.c.t_created
            )
            .outerjoin(
                ranked,
                and_(Device.id == ranked.c.t_dev_id, ranked.c.rn == 1)
            )
            .where(
                Device.is_deleted == False,
                Device.status.in_(["AVAILABLE", "ENGAGED", "REGISTERED"]),
                func.length(Device.uid) == 24,
                not_(Device.uid.ilike("%TEST%")),
                not_(Device.uid.ilike("%AUDIT%")),
                not_(Device.uid.ilike("%DUMMY%")),
                not_(Device.uid.ilike("%DEMO%")),
                not_(Device.uid.ilike("%SEED%")),
                not_(Device.uid.ilike("%PLACEHOLDER%")),
                not_(Device.uid.ilike("%ROGUE%")),
                not_(Device.uid.ilike("%MOCK%")),
            )
        )

        results = (await self.session.execute(stmt)).all()

        # Deduplicate to canonical genuine devices
        seen_canonical = set()
        unique_devices_rows = []
        for r in results:
            dev = r[0]
            if not is_genuine_hardware_uid(dev.uid):
                continue
            canonical_uid = get_canonical_uid(dev.uid)
            if canonical_uid in seen_canonical:
                continue
            seen_canonical.add(canonical_uid)

            t_id = r[1]
            if t_id is not None:
                t_timestamp = r[2]
                t_level = r[3]
                t_bat = r[4]
                t_lat = r[5]
                t_lon = r[6]
                t_alt = r[7]
                t_valid = r[8]
                t_created = r[9]

                rec_str = t_timestamp.strftime("%d-%m-%Y %H:%M:%S") if hasattr(t_timestamp, "strftime") else str(t_timestamp)[:19]
                rec_utc = t_created.strftime("%d-%m-%Y %H:%M:%S") if hasattr(t_created, "strftime") else rec_str

                ai1_ma = None
                if t_level is not None:
                    ai1_ma = round(4.0 + (t_level / 100.0) * 16.0, 2)

                bat_pct = None
                if t_bat is not None:
                    pct = max(0.0, min(100.0, (t_bat - 3.0) / (4.2 - 3.0) * 100.0))
                    bat_pct = f"{pct:.1f}%"

                gps_v = "Valid" if (t_lat and t_lon and (t_lat != 0 or t_lon != 0)) else "--"
                alt_v = "Valid" if (t_alt is not None and t_alt != 0) else "--"
                ai1_v = "Valid" if t_valid is not False else "Invalid"

                row = {
                    "id": t_id,
                    "deviceId": canonical_uid,
                    "deviceName": dev.name or f"Node {canonical_uid[-6:]}",
                    "trainNumber": dev.train_number if dev.train_number and dev.train_number != "UNASSIGNED" else None,
                    "coachNumber": dev.coach_number if dev.coach_number and dev.coach_number != "UNASSIGNED" else None,
                    "recordedAt": rec_str,
                    "ai1Ma": ai1_ma,
                    "level1Percent": f"{t_level:.1f}%" if t_level is not None else "--",
                    "ai1Valid": ai1_v,
                    "batteryV": round(t_bat, 3) if t_bat is not None else None,
                    "batteryPercent": bat_pct,
                    "latitude": t_lat,
                    "longitude": t_lon,
                    "altitudeM": t_alt,
                    "gpsValid": gps_v,
                    "altitudeValid": alt_v,
                    "receivedUtc": rec_utc,
                    "isOnline": bool(dev.is_online),
                    "hasTelemetry": True,
                    "rawTimestamp": t_timestamp or datetime.min,
                }
            else:
                row = {
                    "id": f"dev-{dev.id}",
                    "deviceId": canonical_uid,
                    "deviceName": dev.name or f"Node {canonical_uid[-6:]}",
                    "trainNumber": dev.train_number if dev.train_number and dev.train_number != "UNASSIGNED" else None,
                    "coachNumber": dev.coach_number if dev.coach_number and dev.coach_number != "UNASSIGNED" else None,
                    "recordedAt": "--",
                    "ai1Ma": None,
                    "level1Percent": "--",
                    "ai1Valid": "--",
                    "batteryV": None,
                    "batteryPercent": "--",
                    "latitude": None,
                    "longitude": None,
                    "altitudeM": None,
                    "gpsValid": "--",
                    "altitudeValid": "--",
                    "receivedUtc": "--",
                    "isOnline": bool(dev.is_online),
                    "hasTelemetry": False,
                    "rawTimestamp": datetime.min,
                }
            unique_devices_rows.append(row)

        # Search filter
        if search and search.strip():
            q = search.strip().lower()
            unique_devices_rows = [
                r for r in unique_devices_rows
                if q in r["deviceId"].lower()
                or (r.get("deviceName") and q in r["deviceName"].lower())
                or (r.get("trainNumber") and q in str(r["trainNumber"]).lower())
                or (r.get("coachNumber") and q in str(r["coachNumber"]).lower())
            ]

        # Sorting
        is_asc = sort_order.lower() == "asc"
        if sort_by == "deviceId":
            unique_devices_rows.sort(key=lambda r: r["deviceId"], reverse=not is_asc)
        elif sort_by in ("level1Percent", "ai1Ma"):
            unique_devices_rows.sort(key=lambda r: (r["hasTelemetry"], r["ai1Ma"] or -1), reverse=not is_asc)
        elif sort_by in ("batteryV", "batteryPercent"):
            unique_devices_rows.sort(key=lambda r: (r["hasTelemetry"], r["batteryV"] or -1), reverse=not is_asc)
        else:  # recordedAt / receivedUtc (default)
            unique_devices_rows.sort(key=lambda r: (r["hasTelemetry"], r["rawTimestamp"]), reverse=not is_asc)

        # Pagination on UNIQUE DEVICES
        total = len(unique_devices_rows)
        totalPages = max(1, (total + limit - 1) // limit)
        safe_page = max(1, min(page, totalPages))
        start_idx = (safe_page - 1) * limit
        paged_items = unique_devices_rows[start_idx:start_idx + limit]

        # Clean internal fields
        for item in paged_items:
            item.pop("rawTimestamp", None)

        return total, totalPages, paged_items

    async def get_unique_devices_records_for_export(
        self,
        search: Optional[str] = None,
        sort_by: str = "recordedAt",
        sort_order: str = "desc",
    ) -> List[Dict[str, Any]]:
        """Retrieve all unique genuine devices for CSV export (strictly 13 columns)."""
        _, _, items = await self.get_unique_devices_latest_records(
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            page=1,
            limit=5000,
        )
        return items

    async def get_paginated_telemetry_records(
        self,
        search: Optional[str] = None,
        device_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        ai1_valid: Optional[str] = None,
        gps_valid: Optional[str] = None,
        altitude_valid: Optional[str] = None,
        latest_only: bool = False,
        sort_by: str = "receivedUtc",
        sort_order: str = "desc",
        page: int = 1,
        limit: int = 25,
    ) -> Tuple[int, int, List[Dict[str, Any]]]:
        """Fetch paginated, filtered, and sorted telemetry records."""
        conditions = self._build_filter_conditions(
            search=search,
            device_id=device_id,
            start_date=start_date,
            end_date=end_date,
            ai1_valid=ai1_valid,
            gps_valid=gps_valid,
            altitude_valid=altitude_valid,
        )

        latest_subq = None
        if latest_only:
            latest_subq = (
                select(func.max(TelemetryReading.id).label("max_id"))
                .group_by(TelemetryReading.device_id)
                .subquery()
            )

        # Count total matching rows
        count_stmt = select(func.count(TelemetryReading.id)).join(
            Device, TelemetryReading.device_id == Device.id
        )
        if latest_subq is not None:
            count_stmt = count_stmt.join(latest_subq, TelemetryReading.id == latest_subq.c.max_id)
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = (await self.session.execute(count_stmt)).scalar_one()

        if total == 0:
            return 0, 0, []

        totalPages = (total + limit - 1) // limit
        page = max(1, min(page, totalPages))
        offset = (page - 1) * limit

        # Base query with inner join to enforce registered hardware devices
        stmt = select(TelemetryReading, Device.uid.label("d_uid")).join(
            Device, TelemetryReading.device_id == Device.id
        )
        if latest_subq is not None:
            stmt = stmt.join(latest_subq, TelemetryReading.id == latest_subq.c.max_id)
        if conditions:
            stmt = stmt.where(and_(*conditions))

        # Order by
        order_col = TelemetryReading.created_at
        if sort_by == "recordedAt":
            order_col = TelemetryReading.timestamp
        elif sort_by == "deviceId":
            order_col = coalesce(Device.uid, TelemetryReading.device_uid, TelemetryReading.device_id)
        elif sort_by in ("ai1Ma", "level1Percent"):
            order_col = TelemetryReading.level_percent
        elif sort_by in ("batteryV", "batteryPercent"):
            order_col = TelemetryReading.battery_v1

        if sort_order.lower() == "asc":
            stmt = stmt.order_by(asc(order_col), asc(TelemetryReading.id))
        else:
            stmt = stmt.order_by(desc(order_col), desc(TelemetryReading.id))

        stmt = stmt.offset(offset).limit(limit)
        results = (await self.session.execute(stmt)).all()

        formatted_items = [
            format_telemetry_table_row(r, d_uid) for r, d_uid in results
        ]

        return total, totalPages, formatted_items

    async def get_all_telemetry_records_for_export(
        self,
        search: Optional[str] = None,
        device_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        ai1_valid: Optional[str] = None,
        gps_valid: Optional[str] = None,
        altitude_valid: Optional[str] = None,
        latest_only: bool = False,
        sort_by: str = "receivedUtc",
        sort_order: str = "desc",
        max_rows: int = 5000,
    ) -> List[Dict[str, Any]]:
        """Retrieve all matching records for CSV export (strictly 13 columns, no IMEI/SIM)."""
        conditions = self._build_filter_conditions(
            search=search,
            device_id=device_id,
            start_date=start_date,
            end_date=end_date,
            ai1_valid=ai1_valid,
            gps_valid=gps_valid,
            altitude_valid=altitude_valid,
        )

        latest_subq = None
        if latest_only:
            latest_subq = (
                select(func.max(TelemetryReading.id).label("max_id"))
                .group_by(TelemetryReading.device_id)
                .subquery()
            )

        stmt = select(TelemetryReading, Device.uid.label("d_uid")).join(
            Device, TelemetryReading.device_id == Device.id
        )
        if latest_subq is not None:
            stmt = stmt.join(latest_subq, TelemetryReading.id == latest_subq.c.max_id)
        if conditions:
            stmt = stmt.where(and_(*conditions))

        order_col = TelemetryReading.created_at
        if sort_by == "recordedAt":
            order_col = TelemetryReading.timestamp
        elif sort_by == "deviceId":
            order_col = coalesce(Device.uid, TelemetryReading.device_uid, TelemetryReading.device_id)
        elif sort_by in ("ai1Ma", "level1Percent"):
            order_col = TelemetryReading.level_percent
        elif sort_by in ("batteryV", "batteryPercent"):
            order_col = TelemetryReading.battery_v1

        if sort_order.lower() == "asc":
            stmt = stmt.order_by(asc(order_col), asc(TelemetryReading.id))
        else:
            stmt = stmt.order_by(desc(order_col), desc(TelemetryReading.id))

        stmt = stmt.limit(max_rows)
        results = (await self.session.execute(stmt)).all()

        return [format_telemetry_table_row(r, d_uid) for r, d_uid in results]


