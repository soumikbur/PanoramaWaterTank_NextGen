"""Telemetry repository for time series database access."""
import json
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from sqlalchemy import select, desc, asc, func, or_, and_
from sqlalchemy.sql.functions import coalesce
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.telemetry import TelemetryReading
from app.models.device import Device


def format_telemetry_table_row(r: TelemetryReading, d_uid: Optional[str] = None) -> Dict[str, Any]:
    """Formats a TelemetryReading instance into the exact 13 requested columns."""
    raw_p: Dict[str, Any] = {}
    if r.raw_payload:
        try:
            raw_p = json.loads(r.raw_payload) if isinstance(r.raw_payload, str) else r.raw_payload
        except Exception:
            pass

    # 1. Device ID
    dev_id = str(r.device_uid or d_uid or r.device_id)

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
        conditions = []

        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    TelemetryReading.device_uid.ilike(term),
                    Device.uid.ilike(term),
                    TelemetryReading.device_id.ilike(term),
                )
            )

        if device_id and device_id.strip() and device_id.strip().upper() != "ALL":
            did = device_id.strip()
            conditions.append(
                or_(
                    TelemetryReading.device_uid == did,
                    Device.uid == did,
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

    async def get_paginated_telemetry_records(
        self,
        search: Optional[str] = None,
        device_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        ai1_valid: Optional[str] = None,
        gps_valid: Optional[str] = None,
        altitude_valid: Optional[str] = None,
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

        # Count total matching rows
        count_stmt = select(func.count(TelemetryReading.id)).outerjoin(
            Device, TelemetryReading.device_id == Device.id
        )
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = (await self.session.execute(count_stmt)).scalar_one()

        if total == 0:
            return 0, 0, []

        totalPages = (total + limit - 1) // limit
        page = max(1, min(page, totalPages))
        offset = (page - 1) * limit

        # Base query with outerjoin to resolve device UID if device_uid is null
        stmt = select(TelemetryReading, Device.uid.label("d_uid")).outerjoin(
            Device, TelemetryReading.device_id == Device.id
        )
        if conditions:
            stmt = stmt.where(and_(*conditions))

        # Order by
        order_col = TelemetryReading.created_at
        if sort_by == "recordedAt":
            order_col = TelemetryReading.timestamp
        elif sort_by == "deviceId":
            order_col = coalesce(TelemetryReading.device_uid, Device.uid, TelemetryReading.device_id)
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

        stmt = select(TelemetryReading, Device.uid.label("d_uid")).outerjoin(
            Device, TelemetryReading.device_id == Device.id
        )
        if conditions:
            stmt = stmt.where(and_(*conditions))

        order_col = TelemetryReading.created_at
        if sort_by == "recordedAt":
            order_col = TelemetryReading.timestamp
        elif sort_by == "deviceId":
            order_col = coalesce(TelemetryReading.device_uid, Device.uid, TelemetryReading.device_id)
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


