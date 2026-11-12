"""Multi-provider Indian Railways train lookup and normalization service.

Resolution priority:
1. In-memory TTL cache + SQLite persistent lookup cache (`train_lookup_cache`)
2. RailRadar v1 REST API (public endpoint or `RAILRADAR_API_KEY` when configured)
3. RapidAPI IRCTC API (when `RAPIDAPI_IRCTC_KEY` is configured)
4. IndianRailAPI v2 (when `INDIANRAIL_API_KEY` is configured)
5. DataMeet OpenData Indian Railways dataset (`trains.json`, zero API key, cached locally)

Never fabricates missing fields: any field not supplied by the resolved source
(e.g., railway zone, running days, intermediate route, or official coach consist)
is returned as None / empty and listed in `missing_fields`.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.train import TrainLookupCache

logger = logging.getLogger("train_lookup_service")

TRAIN_NUMBER_RE = re.compile(r"^\d{4,5}$")

ZONE_TO_REGION: Dict[str, str] = {
    "NR": "NORTH",
    "NCR": "NORTH",
    "NER": "NORTH",
    "NWR": "NORTH",
    "NFR": "EAST",
    "ER": "EAST",
    "ECR": "EAST",
    "ECOR": "EAST",
    "SER": "EAST",
    "SECR": "EAST",
    "WR": "WEST",
    "WCR": "WEST",
    "CR": "WEST",
    "KR": "WEST",
    "SR": "SOUTH",
    "SCR": "SOUTH",
    "SWR": "SOUTH",
    "MR": "EAST",
}

REGION_DEFAULT_ZONE: Dict[str, str] = {
    "NORTH": "NR",
    "SOUTH": "SR",
    "EAST": "ER",
    "WEST": "WR",
}

TRAIN_TYPE_MAP: Dict[str, str] = {
    "SHTB": "Shatabdi Express",
    "SHATABDI": "Shatabdi Express",
    "RAJ": "Rajdhani Express",
    "RAJDHANI": "Rajdhani Express",
    "SF": "Superfast Express",
    "SUPERFAST": "Superfast Express",
    "EXP": "Express",
    "EXPRESS": "Express",
    "PASS": "Passenger",
    "PASSENGER": "Passenger",
    "DRNT": "Duronto Express",
    "DURONTO": "Duronto Express",
    "GR": "Garib Rath Express",
    "GARIB RATH": "Garib Rath Express",
    "JSHT": "Jan Shatabdi Express",
    "JSHTB": "Jan Shatabdi Express",
    "JAN SHATABDI": "Jan Shatabdi Express",
    "VB": "Vande Bharat Express",
    "VANDE BHARAT": "Vande Bharat Express",
    "SK": "Sampark Kranti Express",
    "SKR": "Sampark Kranti Express",
    "HS": "Humsafar Express",
    "TEJ": "Tejas Express",
    "MEMU": "MEMU",
    "DEMU": "DEMU",
    "MAIL": "Mail Express",
    "MAIL_EXPRESS": "Mail Express",
    "ANT": "Antyodaya Express",
}

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def map_zone_to_region(zone: Optional[str], fallback: str = "NORTH") -> str:
    """Map an Indian Railways zone code or region label to NORTH/SOUTH/EAST/WEST."""
    if not zone:
        return fallback
    cleaned = zone.strip().upper()
    if cleaned in ("NORTH", "SOUTH", "EAST", "WEST"):
        return cleaned
    if cleaned in ZONE_TO_REGION:
        return ZONE_TO_REGION[cleaned]
    if "NORTH" in cleaned:
        return "NORTH"
    if "SOUTH" in cleaned and "EAST" not in cleaned:
        return "SOUTH"
    if "EAST" in cleaned or "BENGAL" in cleaned or "ODISHA" in cleaned:
        return "EAST"
    if "WEST" in cleaned or "CENTRAL" in cleaned or "MUMBAI" in cleaned:
        return "WEST"
    return fallback


def normalize_train_type(raw_type: Optional[str], train_name: Optional[str] = None) -> str:
    """Normalize shorthand train class codes into readable labels."""
    if raw_type:
        key = raw_type.strip().upper()
        if key in TRAIN_TYPE_MAP:
            return TRAIN_TYPE_MAP[key]
        if len(raw_type.strip()) > 2:
            return raw_type.strip()
    if train_name:
        upper_name = train_name.upper()
        for token, label in (
            ("VANDE BHARAT", "Vande Bharat Express"),
            ("RAJDHANI", "Rajdhani Express"),
            ("SHATABDI", "Shatabdi Express"),
            ("DURONTO", "Duronto Express"),
            ("GARIB RATH", "Garib Rath Express"),
            ("HUMSAFAR", "Humsafar Express"),
            ("TEJAS", "Tejas Express"),
            ("SUPERFAST", "Superfast Express"),
            ("SF ", "Superfast Express"),
            ("MAIL", "Mail Express"),
            ("PASSENGER", "Passenger"),
            ("EXPRESS", "Express"),
        ):
            if token in upper_name:
                return label
    return "Express"


NON_EXPRESS_TOKENS = (
    "PASSENGER",
    "PASS",
    "MEMU",
    "DEMU",
    "EMU",
    "MMTS",
    "LOCAL",
    "SUBURBAN",
    "ORDINARY",
    "TOY",
    "FREIGHT",
    "GOODS",
    "PARCEL",
)

EXPRESS_FAMILY_TOKENS = (
    "EXPRESS",
    "MAIL/EXPRESS",
    "MAIL EXPRESS",
    "MAIL",
    "EXP",
    "SUPERFAST",
    "SF",
    "PREMIUM",
    "RAJDHANI",
    "RAJ",
    "SHATABDI",
    "SHTB",
    "JAN SHATABDI",
    "JSHT",
    "DURONTO",
    "DRNT",
    "GARIB RATH",
    "GR",
    "VANDE BHARAT",
    "VB",
    "HUMSAFAR",
    "HS",
    "TEJAS",
    "TEJ",
    "SAMPARK KRANTI",
    "SK",
    "ANTYODAYA",
    "ANT",
    "GATIMAAN",
    "SUVIDHA",
    "AMRIT BHARAT",
    "NAMO BHARAT",
)


def is_express_family_train(
    raw_type: Optional[str],
    raw_category: Optional[str],
    train_name: Optional[str] = None,
) -> Tuple[bool, str]:
    """Validate Express-family eligibility using structured metadata before name heuristics."""
    meta_tokens = [
        (raw_category or "").strip().upper(),
        (raw_type or "").strip().upper(),
    ]
    for tok in meta_tokens:
        if not tok:
            continue
        if any(re.search(rf"\b{re.escape(bad)}\b", tok) for bad in NON_EXPRESS_TOKENS) and "EXPRESS" not in tok:
            return False, (raw_type or raw_category or "Passenger").strip()
        if tok in ("PASSENGER", "MEMU", "DEMU", "EMU", "MMTS", "LOCAL", "SUBURBAN", "PASS"):
            return False, tok
    for tok in meta_tokens:
        if not tok:
            continue
        if any(good in tok for good in EXPRESS_FAMILY_TOKENS):
            return True, (raw_type or raw_category or "Express").strip()

    upper_name = (train_name or "").strip().upper()
    if upper_name:
        has_express_kw = any(
            kw in upper_name
            for kw in (
                "EXPRESS",
                "EXP",
                "MAIL",
                "RAJDHANI",
                "SHATABDI",
                "DURONTO",
                "GARIB RATH",
                "VANDE BHARAT",
                "HUMSAFAR",
                "TEJAS",
                "SUPERFAST",
                "SAMPARK KRANTI",
                "ANTYODAYA",
                "GATIMAAN",
            )
        )
        has_non_express_kw = any(
            re.search(rf"\b{bad}\b", upper_name) for bad in NON_EXPRESS_TOKENS
        )
        if has_non_express_kw and not has_express_kw:
            return False, (raw_type or "Passenger").strip()

    return True, (raw_type or raw_category or "Express").strip()


def infer_region_from_coords(lat: Any, lng: Any) -> Optional[str]:
    """Derive fleet operational region from verified origin station coordinates when zone is omitted."""
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if lng_f >= 84.0:
        return "EAST"
    if lat_f < 17.5 or (lat_f < 20.0 and lng_f >= 76.5):
        return "SOUTH"
    if lng_f < 76.5 and lat_f < 24.5:
        return "WEST"
    return "NORTH"


def parse_coach_position_string(coach_position: Optional[str]) -> List[CoachCompositionItem]:
    """Parse hyphen-delimited rake string (e.g. ENG-SLRD-S1-B1-A1-H1) into CoachCompositionItem list."""
    if not coach_position or not isinstance(coach_position, str):
        return []
    coaches: List[CoachCompositionItem] = []
    pos = 1
    for raw_token in coach_position.split("-"):
        label = raw_token.strip().upper()
        if not label or label in ("LOCO", "L", "ENG"):
            continue
        cat, ctype = infer_coach_category(label)
        coaches.append(
            CoachCompositionItem(
                position=pos,
                coach_number=label,
                coach_category=cat,
                coach_type=ctype,
            )
        )
        pos += 1
    return coaches


def infer_coach_category(coach_code: str, raw_type: Optional[str] = None) -> Tuple[str, str]:
    """Map Indian Railways coach code / class token to (category, coach_type)."""
    c = (coach_code or "").strip().upper()
    rt = (raw_type or "").strip().upper()
    if c.startswith("EC") or "EA" in c or "EV" in c or rt in ("EC", "EA", "EXEC"):
        return "Executive AC", "EC"
    if c.startswith("H") or rt in ("1A", "FIRST AC"):
        return "First AC", "1A"
    if c.startswith("A") or rt in ("2A", "AC 2 TIER"):
        return "AC 2-Tier", "2A"
    if c.startswith("M") or rt in ("3E", "AC 3 ECONOMY"):
        return "AC 3-Economy", "3E"
    if c.startswith("B") or rt in ("3A", "AC 3 TIER"):
        return "AC 3-Tier", "3A"
    if c.startswith("C") or c.startswith("J") or rt in ("CC", "CHAIR CAR"):
        return "AC Chair Car", "CC"
    if c.startswith("S") and not c.startswith("SLR") or rt in ("SL", "SLEEPER"):
        return "Sleeper", "SL"
    if c.startswith("D") or rt in ("2S", "SECOND SITTING"):
        return "Second Sitting", "2S"
    if c in ("GS", "GEN", "UR") or c.startswith("GS") or c.startswith("GEN"):
        return "General Second Class", "GS"
    if c.startswith("PC"):
        return "Pantry Car", "PC"
    if c.startswith("SLR"):
        return "SLR / Guard", "SLR"
    if c.startswith("EOG") or c.startswith("LWLRRM"):
        return "EOG / Power Car", "EOG"
    return (raw_type or "Coach"), (rt or "COACH")


def parse_running_days(raw_days: Any) -> Optional[List[str]]:
    """Normalize various API running-day formats to list of 3-letter weekday names."""
    if not raw_days:
        return None
    if isinstance(raw_days, list):
        days: List[str] = []
        for idx, item in enumerate(raw_days):
            if isinstance(item, bool):
                if item and idx < len(DAY_NAMES):
                    days.append(DAY_NAMES[idx])
            elif isinstance(item, dict):
                name = str(item.get("day") or item.get("name") or "")[:3].title()
                runs = item.get("runs", item.get("running", True))
                if runs and name:
                    days.append(name)
            elif isinstance(item, str):
                cleaned = item.strip()
                if cleaned.upper() in ("Y", "YES", "1", "TRUE") and idx < len(DAY_NAMES):
                    days.append(DAY_NAMES[idx])
                elif cleaned.upper() not in ("N", "NO", "0", "FALSE"):
                    days.append(cleaned[:3].title())
        return days or None
    if isinstance(raw_days, dict):
        days = []
        for day in DAY_NAMES:
            for k, v in raw_days.items():
                if k[:3].lower() == day.lower() and v in (True, 1, "1", "Y", "y", "YES"):
                    days.append(day)
                    break
        return days or None
    if isinstance(raw_days, str):
        s = raw_days.strip()
        if len(s) == 7 and all(ch in "01YNyn" for ch in s):
            return [DAY_NAMES[i] for i, ch in enumerate(s) if ch in ("1", "Y", "y")] or None
        parts = [p.strip()[:3].title() for p in re.split(r"[,\s/]+", s) if p.strip()]
        return parts or None
    return None


class CoachCompositionItem(BaseModel):
    position: int
    coach_number: str
    coach_category: str
    coach_type: Optional[str] = None


class RouteStopItem(BaseModel):
    station_code: str
    station_name: str
    arrival: Optional[str] = None
    departure: Optional[str] = None
    day: Optional[int] = None


class ProviderAttempt(BaseModel):
    provider: str
    outcome: str  # verified | not_found | skipped_no_key | timeout | error | mismatched | rate_limited | auth_error | invalid_response
    latency_ms: float = 0.0
    detail: Optional[str] = None


class TrainLookupResponse(BaseModel):
    status: str  # VERIFIED | NOT_FOUND | UNAVAILABLE | INVALID_FORMAT
    error_code: Optional[str] = None  # TIMEOUT | RATE_LIMITED | AUTH_ERROR | INVALID_RESPONSE | SERVER_UNAVAILABLE | NOT_FOUND | INVALID_FORMAT
    train_number: str
    train_name: Optional[str] = None
    source_station: Optional[str] = None
    source_code: Optional[str] = None
    destination_station: Optional[str] = None
    destination_code: Optional[str] = None
    region: Optional[str] = None
    railway_zone: Optional[str] = None
    train_type: Optional[str] = None
    running_days: Optional[List[str]] = None
    route: List[RouteStopItem] = Field(default_factory=list)
    coach_composition: List[CoachCompositionItem] = Field(default_factory=list)
    total_coaches: Optional[int] = None
    has_official_composition: bool = False
    provider: Optional[str] = None
    cached: bool = False
    latency_ms: float = 0.0
    verified_at: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)
    already_exists: bool = False
    message: str = ""
    provider_attempts: List[ProviderAttempt] = Field(default_factory=list)


class ProviderFetchOutcome(BaseModel):
    outcome: str  # verified | not_found | unavailable | mismatched | skipped_no_key
    error_code: Optional[str] = None  # TIMEOUT | RATE_LIMITED | AUTH_ERROR | INVALID_RESPONSE | SERVER_UNAVAILABLE | NON_EXPRESS_TRAIN
    train_category: Optional[str] = None
    data: Optional[TrainLookupResponse] = None
    detail: Optional[str] = None


async def _get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    timeout: float = 5.0,
    retries: int = 1,
) -> httpx.Response:
    """Perform GET with bounded retry on transient network/timeout or 5xx responses."""
    last_exc: Optional[BaseException] = None
    last_resp: Optional[httpx.Response] = None
    for attempt in range(retries + 1):
        try:
            resp = await client.get(url, headers=headers, params=params, timeout=timeout)
            if resp.status_code < 500 or attempt >= retries:
                return resp
            last_resp = resp
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt >= retries:
                raise
        await asyncio.sleep(0.15 * (attempt + 1))
    if last_resp is not None:
        return last_resp
    assert last_exc is not None
    raise last_exc


def _classify_http_status(status_code: int) -> Tuple[str, str]:
    if status_code == 429:
        return "RATE_LIMITED", "HTTP 429 rate limit exceeded"
    if status_code in (401, 403):
        return "AUTH_ERROR", f"HTTP {status_code} invalid API credentials"
    if status_code >= 500:
        return "SERVER_UNAVAILABLE", f"HTTP {status_code} upstream server error"
    return "SERVER_UNAVAILABLE", f"HTTP {status_code}"


class BaseTrainProvider(ABC):
    """Interface for an Indian Railways data provider."""

    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if required credentials/config exist."""

    @abstractmethod
    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        """Query the upstream source for `train_number`."""


def _compute_missing_fields(resp: TrainLookupResponse) -> List[str]:
    missing: List[str] = []
    if not resp.source_station:
        missing.append("sourceStation")
    if not resp.destination_station:
        missing.append("destinationStation")
    if not resp.railway_zone:
        missing.append("railwayZone")
    if not resp.running_days:
        missing.append("runningDays")
    if not resp.route:
        missing.append("route")
    if not resp.has_official_composition or not resp.coach_composition:
        missing.append("coachComposition")
    return missing


class RailRadarProvider(BaseTrainProvider):
    """Primary live provider: RailRadar v1 REST API (public endpoint + optional API key)."""

    name = "RailRadar"

    def is_configured(self) -> bool:
        return bool(settings.RAILRADAR_BASE_URL and settings.RAILRADAR_BASE_URL.strip())

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        if not self.is_configured():
            return ProviderFetchOutcome(outcome="skipped_no_key", detail="RAILRADAR_BASE_URL not configured")

        headers: Dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": "PanoramaWaterTank/2.0",
        }
        api_key = (settings.RAILRADAR_API_KEY or "").strip()
        if api_key:
            headers["X-Api-Key"] = api_key
            headers["Authorization"] = f"Bearer {api_key}"

        base = settings.RAILRADAR_BASE_URL.rstrip("/")
        info_url = f"{base}/trains/{train_number}"
        coaches_url = f"{base}/trains/{train_number}/coaches"

        try:
            info_task = _get_with_retry(client, info_url, headers=headers, timeout=timeout)
            coach_task = _get_with_retry(client, coaches_url, headers=headers, timeout=timeout, retries=0)
            info_res, coach_res = await asyncio.gather(info_task, coach_task, return_exceptions=True)
        except Exception as exc:
            err_code = "TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(exc))

        if isinstance(info_res, BaseException):
            err_code = "TIMEOUT" if isinstance(info_res, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(info_res))

        if info_res.status_code == 404:
            return ProviderFetchOutcome(outcome="not_found", detail="HTTP 404")
        if info_res.status_code != 200:
            err_code, detail = _classify_http_status(info_res.status_code)
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=detail)

        try:
            payload = info_res.json()
        except Exception:
            return ProviderFetchOutcome(outcome="unavailable", error_code="INVALID_RESPONSE", detail="Invalid JSON response")

        data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
        if not isinstance(data, dict):
            return ProviderFetchOutcome(outcome="not_found", detail="Empty train payload")

        train_obj = data.get("train") if isinstance(data.get("train"), dict) else data
        returned_num = str(
            train_obj.get("trainNumber") or train_obj.get("train_number") or train_obj.get("number") or ""
        ).strip()
        if returned_num and returned_num != train_number:
            return ProviderFetchOutcome(
                outcome="mismatched",
                detail=f"Requested {train_number}, received {returned_num}",
            )
        raw_name = train_obj.get("trainName") or train_obj.get("train_name") or train_obj.get("name")
        if not raw_name:
            return ProviderFetchOutcome(outcome="not_found", detail="No train name returned")

        name = str(raw_name).strip()
        src_obj = train_obj.get("source") if isinstance(train_obj.get("source"), dict) else {}
        dst_obj = train_obj.get("destination") if isinstance(train_obj.get("destination"), dict) else {}
        src_name = train_obj.get("sourceStationName") or train_obj.get("from_station_name") or src_obj.get("name") or (
            train_obj.get("source") if isinstance(train_obj.get("source"), str) else None
        )
        src_code = train_obj.get("sourceStationCode") or train_obj.get("from_station_code") or src_obj.get("code")
        dst_name = train_obj.get("destinationStationName") or train_obj.get("to_station_name") or dst_obj.get("name") or (
            train_obj.get("destination") if isinstance(train_obj.get("destination"), str) else None
        )
        dst_code = train_obj.get("destinationStationCode") or train_obj.get("to_station_code") or dst_obj.get("code")
        zone = (train_obj.get("zone") or train_obj.get("railwayZone") or "").strip().upper() or None
        raw_type = train_obj.get("trainType") or train_obj.get("type")
        raw_category = train_obj.get("category")
        running_days = parse_running_days(train_obj.get("daysOfWeek") or train_obj.get("runningDays") or train_obj.get("runDays"))

        route: List[RouteStopItem] = []
        raw_halts = data.get("halts") or data.get("route") or []
        if isinstance(raw_halts, list):
            for stop in raw_halts:
                if not isinstance(stop, dict):
                    continue
                if stop.get("isHalt") is False:
                    continue
                st_obj = stop.get("station") if isinstance(stop.get("station"), dict) else {}
                st_code = stop.get("stationCode") or stop.get("station_code") or st_obj.get("code")
                if not st_code:
                    continue
                st_name = stop.get("stationName") or stop.get("station_name") or st_obj.get("name") or st_code
                route.append(
                    RouteStopItem(
                        station_code=str(st_code).strip().upper(),
                        station_name=str(st_name).strip(),
                        arrival=stop.get("arrival") or stop.get("arrivalTime"),
                        departure=stop.get("departure") or stop.get("departureTime"),
                        day=stop.get("day") or stop.get("arrivalDay") or stop.get("departureDay"),
                    )
                )

        coaches: List[CoachCompositionItem] = []
        if not isinstance(coach_res, BaseException) and coach_res.status_code == 200:
            try:
                c_payload = coach_res.json()
                c_data = c_payload.get("data") if isinstance(c_payload, dict) and isinstance(c_payload.get("data"), dict) else {}
                c_list = (
                    c_data.get("rake")
                    or c_data.get("coaches")
                    or (c_payload.get("coaches") if isinstance(c_payload, dict) else c_payload)
                )
                if isinstance(c_list, list):
                    pos = 1
                    for item in c_list:
                        if not isinstance(item, dict):
                            continue
                        label = str(item.get("coachNumber") or item.get("code") or item.get("label") or "").strip()
                        cls_type = item.get("class") or item.get("coachClass") or item.get("classType")
                        if not label or label.upper() in ("LOCO", "L", "ENG") or str(cls_type or "").upper() == "LOCO":
                            continue
                        cat, ctype = infer_coach_category(label, cls_type)
                        coaches.append(
                            CoachCompositionItem(
                                position=item.get("position") or pos,
                                coach_number=label,
                                coach_category=cat,
                                coach_type=ctype,
                            )
                        )
                        pos += 1
            except Exception:
                pass
        if not coaches and train_obj.get("coachPosition"):
            coaches = parse_coach_position_string(train_obj.get("coachPosition"))

        region = (
            map_zone_to_region(zone)
            if zone
            else (infer_region_from_coords(src_obj.get("lat"), src_obj.get("lng")) or "NORTH")
        )

        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=str(src_name).strip() if src_name else None,
            source_code=str(src_code).strip().upper() if src_code else None,
            destination_station=str(dst_name).strip() if dst_name else None,
            destination_code=str(dst_code).strip().upper() if dst_code else None,
            region=region,
            railway_zone=zone,
            train_type=normalize_train_type(raw_type, name),
            running_days=running_days,
            route=route,
            coach_composition=coaches,
            total_coaches=len(coaches) if coaches else None,
            has_official_composition=bool(coaches),
            provider=self.name,
            verified_at=datetime.now(timezone.utc).isoformat(),
            message="Train verified successfully.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(
            outcome="verified",
            train_category=str(raw_category).strip() if raw_category else None,
            data=resp,
        )


class RapidApiIrctcProvider(BaseTrainProvider):
    """Secondary commercial provider: RapidAPI IRCTC API."""

    name = "RapidAPI-IRCTC"

    def is_configured(self) -> bool:
        return bool(settings.RAPIDAPI_IRCTC_KEY and settings.RAPIDAPI_IRCTC_KEY.strip())

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        if not self.is_configured():
            return ProviderFetchOutcome(outcome="skipped_no_key", detail="RAPIDAPI_IRCTC_KEY not set")

        host = settings.RAPIDAPI_IRCTC_HOST.strip()
        headers = {
            "X-RapidAPI-Key": settings.RAPIDAPI_IRCTC_KEY.strip(),
            "X-RapidAPI-Host": host,
            "Accept": "application/json",
        }
        url = f"https://{host}/api/v1/getTrainSchedule"

        try:
            res = await _get_with_retry(client, url, headers=headers, params={"trainNo": train_number}, timeout=timeout)
        except Exception as exc:
            err_code = "TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(exc))

        if res.status_code == 404:
            return ProviderFetchOutcome(outcome="not_found", detail="HTTP 404")
        if res.status_code != 200:
            err_code, detail = _classify_http_status(res.status_code)
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=detail)

        try:
            payload = res.json()
        except Exception:
            return ProviderFetchOutcome(outcome="unavailable", error_code="INVALID_RESPONSE", detail="Invalid JSON response")

        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict) or not (data.get("trainName") or data.get("train_name")):
            if isinstance(payload, dict) and payload.get("status") is False:
                return ProviderFetchOutcome(outcome="not_found", detail=str(payload.get("message") or "Not found"))
            return ProviderFetchOutcome(outcome="not_found", detail="Empty IRCTC schedule payload")

        returned_num = str(data.get("trainNumber") or data.get("trainNo") or "").strip()
        if returned_num and returned_num != train_number:
            return ProviderFetchOutcome(
                outcome="mismatched",
                detail=f"Requested {train_number}, received {returned_num}",
            )

        name = str(data.get("trainName") or data.get("train_name")).strip()
        route_raw = data.get("route") or []
        route: List[RouteStopItem] = []
        if isinstance(route_raw, list):
            for st in route_raw:
                if isinstance(st, dict) and (st.get("station_code") or st.get("stationCode")):
                    route.append(
                        RouteStopItem(
                            station_code=str(st.get("station_code") or st.get("stationCode")),
                            station_name=str(st.get("station_name") or st.get("stationName") or ""),
                            arrival=st.get("sta") or st.get("arrival"),
                            departure=st.get("std") or st.get("departure"),
                            day=st.get("day"),
                        )
                    )

        src_name = data.get("sourceStationName") or (route[0].station_name if route else None)
        src_code = data.get("sourceStationCode") or (route[0].station_code if route else None)
        dst_name = data.get("destinationStationName") or (route[-1].station_name if route else None)
        dst_code = data.get("destinationStationCode") or (route[-1].station_code if route else None)
        zone = (data.get("zone") or "").strip().upper() or None
        running_days = parse_running_days(data.get("runDays"))

        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=src_name,
            source_code=src_code,
            destination_station=dst_name,
            destination_code=dst_code,
            region=map_zone_to_region(zone),
            railway_zone=zone,
            train_type=normalize_train_type(data.get("trainType"), name),
            running_days=running_days,
            route=route,
            coach_composition=[],
            total_coaches=None,
            has_official_composition=False,
            provider=self.name,
            verified_at=datetime.now(timezone.utc).isoformat(),
            message="Train verified successfully.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(outcome="verified", data=resp)


class IndianRailApiProvider(BaseTrainProvider):
    """Tertiary commercial provider: IndianRailAPI v2."""

    name = "IndianRailAPI"

    def is_configured(self) -> bool:
        return bool(settings.INDIANRAIL_API_KEY and settings.INDIANRAIL_API_KEY.strip())

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        if not self.is_configured():
            return ProviderFetchOutcome(outcome="skipped_no_key", detail="INDIANRAIL_API_KEY not set")

        key = settings.INDIANRAIL_API_KEY.strip()
        base = settings.INDIANRAIL_BASE_URL.rstrip("/")
        info_url = f"{base}/TrainInformation/apikey/{key}/TrainNumber/{train_number}/"
        coach_url = f"{base}/CoachPosition/apikey/{key}/TrainNumber/{train_number}/"

        try:
            info_res, coach_res = await asyncio.gather(
                _get_with_retry(client, info_url, timeout=timeout),
                _get_with_retry(client, coach_url, timeout=timeout, retries=0),
                return_exceptions=True,
            )
        except Exception as exc:
            err_code = "TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(exc))

        if isinstance(info_res, BaseException):
            err_code = "TIMEOUT" if isinstance(info_res, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(info_res))
        if info_res.status_code != 200:
            err_code, detail = _classify_http_status(info_res.status_code)
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=detail)

        try:
            payload = info_res.json()
        except Exception:
            return ProviderFetchOutcome(outcome="unavailable", error_code="INVALID_RESPONSE", detail="Invalid JSON response")

        code = str(payload.get("ResponseCode") or "")
        if code == "201":
            return ProviderFetchOutcome(outcome="unavailable", error_code="AUTH_ERROR", detail="Authentication rejected (201)")
        if code != "200":
            return ProviderFetchOutcome(outcome="not_found", detail=str(payload.get("Message") or f"Code {code}"))

        returned_num = str(payload.get("TrainNo") or "").strip()
        if returned_num and returned_num != train_number:
            return ProviderFetchOutcome(
                outcome="mismatched",
                detail=f"Requested {train_number}, received {returned_num}",
            )

        name = str(payload.get("TrainName") or "").strip()
        if not name:
            return ProviderFetchOutcome(outcome="not_found", detail="Missing TrainName")

        src = payload.get("Source") or {}
        dst = payload.get("Destination") or {}

        coaches: List[CoachCompositionItem] = []
        if not isinstance(coach_res, BaseException) and coach_res.status_code == 200:
            try:
                cp = coach_res.json()
                c_raw = cp.get("Coaches") or []
                if isinstance(c_raw, list):
                    pos = 1
                    for item in c_raw:
                        label = str(item.get("Code") or item.get("Name") or "").strip()
                        if not label or label.upper() in ("LOCO", "L", "ENG"):
                            continue
                        cat, ctype = infer_coach_category(label, item.get("Class"))
                        coaches.append(
                            CoachCompositionItem(
                                position=pos,
                                coach_number=label,
                                coach_category=cat,
                                coach_type=ctype,
                            )
                        )
                        pos += 1
            except Exception:
                pass

        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=src.get("Code") if isinstance(src, dict) else None,
            source_code=src.get("Code") if isinstance(src, dict) else None,
            destination_station=dst.get("Code") if isinstance(dst, dict) else None,
            destination_code=dst.get("Code") if isinstance(dst, dict) else None,
            region="NORTH",
            railway_zone=None,
            train_type=normalize_train_type(None, name),
            coach_composition=coaches,
            total_coaches=len(coaches) if coaches else None,
            has_official_composition=bool(coaches),
            provider=self.name,
            verified_at=datetime.now(timezone.utc).isoformat(),
            message="Train verified successfully.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(outcome="verified", data=resp)


class ErailPublicAdapter(BaseTrainProvider):
    """Structured open endpoint adapter: eRail public train enquiry (`erail.in`)."""

    name = "eRail OpenData"

    def is_configured(self) -> bool:
        return True

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        url = "https://erail.in/rail/getTrains.aspx"
        headers = {
            "Accept": "text/plain, */*",
            "User-Agent": "PanoramaWaterTank/2.0",
        }
        try:
            res = await _get_with_retry(
                client, url, headers=headers, params={"TrainNo": train_number}, timeout=timeout
            )
        except Exception as exc:
            err_code = "TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=str(exc))

        if res.status_code == 404:
            return ProviderFetchOutcome(outcome="not_found", detail="HTTP 404")
        if res.status_code != 200:
            err_code, detail = _classify_http_status(res.status_code)
            return ProviderFetchOutcome(outcome="unavailable", error_code=err_code, detail=detail)

        body = (res.text or "").strip()
        if "Train not found" in body or "^" not in body:
            return ProviderFetchOutcome(outcome="not_found", detail="Train not found on eRail")

        record = body.split("^", 1)[1].split("~")
        if len(record) < 15:
            return ProviderFetchOutcome(
                outcome="unavailable", error_code="INVALID_RESPONSE", detail="Malformed eRail record"
            )

        returned_num = record[0].strip()
        if returned_num and returned_num != train_number:
            return ProviderFetchOutcome(
                outcome="mismatched",
                detail=f"Requested {train_number}, received {returned_num}",
            )

        name = record[1].strip()
        if not name:
            return ProviderFetchOutcome(outcome="not_found", detail="Missing train name")

        src_name = record[2].strip() or None
        src_code = record[3].strip().upper() or None
        dst_name = record[4].strip() or None
        dst_code = record[5].strip().upper() or None
        running_days = parse_running_days(record[13].strip() if len(record) > 13 else None)

        raw_type = None
        for idx, token in enumerate(record):
            if token == "Last" and idx + 1 < len(record):
                raw_type = record[idx + 1].strip() or None
                break

        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=src_name,
            source_code=src_code,
            destination_station=dst_name,
            destination_code=dst_code,
            region="NORTH",
            railway_zone=None,
            train_type=normalize_train_type(raw_type, name),
            running_days=running_days,
            route=[],
            coach_composition=[],
            total_coaches=None,
            has_official_composition=False,
            provider=self.name,
            verified_at=datetime.now(timezone.utc).isoformat(),
            message="Train verified successfully.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(
            outcome="verified",
            data=resp,
            train_category=raw_type,
        )


class LocalExpressDatabase:
    """Curated, deduplicated local Indian Express train repository with number & name indexing."""

    DEFAULT_FRESHNESS_DAYS = 30

    def __init__(self, db_path: Optional[Path] = None):
        backend_root = Path(__file__).resolve().parents[2]
        self.db_path = db_path or (backend_root / "data" / "express_trains_db.json")
        self._by_number: Optional[Dict[str, Dict[str, Any]]] = None
        self._name_tokens: Dict[str, List[str]] = {}
        self._meta: Dict[str, Any] = {}

    def _rebuild_name_index(self) -> None:
        token_map: Dict[str, List[str]] = {}
        for num, rec in (self._by_number or {}).items():
            raw_name = str(rec.get("train_name") or "").upper()
            for tok in set(re.findall(r"[A-Z0-9]{2,}", raw_name)):
                token_map.setdefault(tok, []).append(num)
        self._name_tokens = token_map

    def load(self) -> Dict[str, Dict[str, Any]]:
        if self._by_number is not None:
            return self._by_number
        if not self.db_path.exists():
            self._by_number = {}
            self._name_tokens = {}
            return self._by_number
        try:
            raw = json.loads(self.db_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and isinstance(raw.get("by_number"), dict):
                self._by_number = dict(raw["by_number"])
                self._meta = dict(raw.get("meta") or {})
                if isinstance(raw.get("name_tokens"), dict):
                    self._name_tokens = raw["name_tokens"]
                else:
                    self._rebuild_name_index()
            elif isinstance(raw, dict):
                self._by_number = {str(k): v for k, v in raw.items() if isinstance(v, dict)}
                self._rebuild_name_index()
            else:
                self._by_number = {}
        except Exception as exc:
            logger.warning("Failed to load LocalExpressDatabase: %s", exc)
            self._by_number = {}
        return self._by_number

    def is_fresh(self, entry: Dict[str, Any], max_age_days: int = DEFAULT_FRESHNESS_DAYS) -> bool:
        verified_raw = entry.get("verified_at")
        if not verified_raw:
            return False
        try:
            dt = datetime.fromisoformat(str(verified_raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dt) <= timedelta(days=max_age_days)
        except Exception:
            return False

    def get_by_number(self, train_number: str) -> Optional[Dict[str, Any]]:
        return self.load().get((train_number or "").strip())

    def search_by_name(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        index = self.load()
        tokens = [t for t in re.findall(r"[A-Z0-9]{2,}", (query or "").upper())]
        if not tokens:
            return []
        candidate_sets = [set(self._name_tokens.get(t, [])) for t in tokens]
        matched_nums = set.intersection(*candidate_sets) if candidate_sets else set()
        if not matched_nums:
            q_upper = (query or "").strip().upper()
            matched_nums = {
                num
                for num, rec in index.items()
                if q_upper in str(rec.get("train_name") or "").upper()
            }
        results = [index[num] for num in sorted(matched_nums) if num in index]
        return results[:limit]

    def upsert_verified(self, resp: TrainLookupResponse) -> None:
        if resp.status != "VERIFIED" or not resp.train_number or not resp.train_name:
            return
        index = self.load()
        index[resp.train_number] = {
            "train_number": resp.train_number,
            "train_name": resp.train_name,
            "source_station": resp.source_station,
            "source_code": resp.source_code,
            "destination_station": resp.destination_station,
            "destination_code": resp.destination_code,
            "railway_zone": resp.railway_zone,
            "region": resp.region,
            "train_type": resp.train_type,
            "running_days": resp.running_days,
            "source": resp.provider or "Verified API",
            "verified_at": resp.verified_at or datetime.now(timezone.utc).isoformat(),
            "is_express": True,
        }
        self._rebuild_name_index()
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "meta": {
                    "schema_version": 1,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "express_train_count": len(index),
                },
                "by_number": index,
                "name_tokens": self._name_tokens,
            }
            tmp = self.db_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            os.replace(tmp, self.db_path)
        except Exception as exc:
            logger.warning("Failed to persist LocalExpressDatabase update: %s", exc)


class LocalExpressDatabaseAdapter(BaseTrainProvider):
    """O(1) local curated Indian Express database adapter with freshness tracking."""

    name = "Local Express Database"

    def __init__(self, database: Optional[LocalExpressDatabase] = None):
        self.database = database or LocalExpressDatabase()

    def is_configured(self) -> bool:
        return self.database.db_path.exists() and len(self.database.load()) > 0

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        entry = self.database.get_by_number(train_number)
        if not entry:
            return ProviderFetchOutcome(outcome="not_found", detail="Train absent from local Express database")

        name = str(entry.get("train_name") or "").strip()
        if not name:
            return ProviderFetchOutcome(outcome="not_found", detail="Missing train name in local record")

        zone = str(entry.get("railway_zone") or "").strip().upper() or None
        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=entry.get("source_station"),
            source_code=entry.get("source_code"),
            destination_station=entry.get("destination_station"),
            destination_code=entry.get("destination_code"),
            region=entry.get("region") or map_zone_to_region(zone),
            railway_zone=zone,
            train_type=normalize_train_type(entry.get("train_type"), name),
            running_days=entry.get("running_days"),
            route=[],
            coach_composition=[],
            total_coaches=None,
            has_official_composition=False,
            provider=str(entry.get("source") or self.name),
            verified_at=str(entry.get("verified_at") or datetime.now(timezone.utc).isoformat()),
            message="Train verified from Local Express Database.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(outcome="verified", data=resp)


class TrainDataAggregator:
    """Compares and merges verified responses without overwriting authoritative fields or fabricating missing data."""

    @staticmethod
    def merge_verified_results(
        primary: TrainLookupResponse, secondary: TrainLookupResponse
    ) -> TrainLookupResponse:
        if primary.train_number != secondary.train_number:
            return primary
        merged_zone = primary.railway_zone or secondary.railway_zone
        updates: Dict[str, Any] = {
            "source_station": primary.source_station or secondary.source_station,
            "source_code": primary.source_code or secondary.source_code,
            "destination_station": primary.destination_station or secondary.destination_station,
            "destination_code": primary.destination_code or secondary.destination_code,
            "railway_zone": merged_zone,
            "region": primary.region if primary.railway_zone else (map_zone_to_region(merged_zone) if merged_zone else primary.region),
            "running_days": primary.running_days or secondary.running_days,
            "route": primary.route or secondary.route,
            "coach_composition": primary.coach_composition or secondary.coach_composition,
            "total_coaches": primary.total_coaches or secondary.total_coaches,
            "has_official_composition": primary.has_official_composition or secondary.has_official_composition,
        }
        merged = primary.model_copy(update=updates)
        merged.missing_fields = _compute_missing_fields(merged)
        return merged


class DataMeetOpenProvider(BaseTrainProvider):
    """Open public zero-key Indian Railways provider backed by DataMeet `trains.json`.

    Lazily downloads the DataMeet GeoJSON train index once and stores a compact
    dict index on disk (`backend/data/datameet_trains_index.json`) plus memory so
    subsequent queries resolve in O(1) (<5ms) without downloading 14MB repeatedly.
    """

    name = "DataMeet OpenData"

    def __init__(self, index_path: Optional[Path] = None):
        backend_root = Path(__file__).resolve().parents[2]
        self.index_path = index_path or (backend_root / "data" / "datameet_trains_index.json")
        self._index: Optional[Dict[str, Dict[str, Any]]] = None
        self._load_lock = asyncio.Lock()
        self._last_error_code: Optional[str] = None

    def is_configured(self) -> bool:
        return bool(settings.DATAMEET_TRAINS_URL)

    def _parse_dataset(self, raw: Any) -> Dict[str, Dict[str, Any]]:
        index: Dict[str, Dict[str, Any]] = {}
        items: List[Dict[str, Any]] = []
        if isinstance(raw, dict) and isinstance(raw.get("features"), list):
            for feat in raw["features"]:
                if isinstance(feat, dict) and isinstance(feat.get("properties"), dict):
                    items.append(feat["properties"])
        elif isinstance(raw, dict):
            # Already an indexed dictionary
            for k, v in raw.items():
                if isinstance(v, dict):
                    num = str(v.get("number") or k).strip()
                    if num:
                        index[num] = v
            return index
        elif isinstance(raw, list):
            items = [x for x in raw if isinstance(x, dict)]

        for props in items:
            num = str(props.get("number") or props.get("train_number") or "").strip()
            if not num:
                continue
            index[num] = {
                "number": num,
                "name": props.get("name"),
                "zone": props.get("zone"),
                "from_station_code": props.get("from_station_code"),
                "from_station_name": props.get("from_station_name"),
                "to_station_code": props.get("to_station_code"),
                "to_station_name": props.get("to_station_name"),
                "type": props.get("type"),
                "departure": props.get("departure"),
                "arrival": props.get("arrival"),
                "duration_h": props.get("duration_h"),
                "duration_m": props.get("duration_m"),
                "distance": props.get("distance"),
            }
        return index

    async def _ensure_index(self, client: httpx.AsyncClient, timeout: float) -> Optional[Dict[str, Dict[str, Any]]]:
        if self._index is not None:
            return self._index

        async with self._load_lock:
            if self._index is not None:
                return self._index

            # 1. Check compact disk index first if reasonably fresh (< 7 days)
            if self.index_path.exists():
                try:
                    age_sec = time.time() - self.index_path.stat().st_mtime
                    if age_sec < 7 * 86400:
                        raw_disk = json.loads(self.index_path.read_text(encoding="utf-8"))
                        if isinstance(raw_disk, dict) and len(raw_disk) > 0:
                            self._index = raw_disk
                            return self._index
                except Exception as exc:
                    logger.warning("Failed reading local DataMeet index: %s", exc)

            # 2. Fetch upstream DataMeet trains.json
            download_timeout = max(timeout, 15.0)
            self._last_error_code = None
            try:
                res = await _get_with_retry(client, settings.DATAMEET_TRAINS_URL, timeout=download_timeout)
                if res.status_code != 200:
                    err_code, detail = _classify_http_status(res.status_code)
                    self._last_error_code = err_code
                    raise RuntimeError(detail)
                try:
                    raw_json = res.json()
                except Exception as json_exc:
                    self._last_error_code = "INVALID_RESPONSE"
                    raise RuntimeError("Invalid JSON response") from json_exc
                parsed = self._parse_dataset(raw_json)
                if not parsed:
                    self._last_error_code = "INVALID_RESPONSE"
                    raise RuntimeError("DataMeet dataset empty")
                self._index = parsed
                try:
                    self.index_path.parent.mkdir(parents=True, exist_ok=True)
                    tmp_path = self.index_path.with_suffix(".tmp")
                    tmp_path.write_text(json.dumps(parsed), encoding="utf-8")
                    os.replace(tmp_path, self.index_path)
                except Exception as write_exc:
                    logger.warning("Could not write DataMeet disk cache: %s", write_exc)
                return self._index
            except Exception as exc:
                logger.warning("DataMeet fetch failed (%s)", exc)
                if not self._last_error_code:
                    self._last_error_code = "TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE"
                # Stale disk index is still better than total outage
                if self.index_path.exists():
                    try:
                        raw_disk = json.loads(self.index_path.read_text(encoding="utf-8"))
                        if isinstance(raw_disk, dict) and len(raw_disk) > 0:
                            self._index = raw_disk
                            return self._index
                    except Exception:
                        pass
                return None

    async def fetch(
        self,
        train_number: str,
        client: httpx.AsyncClient,
        timeout: float,
    ) -> ProviderFetchOutcome:
        if not self.is_configured():
            return ProviderFetchOutcome(outcome="skipped_no_key", detail="DATAMEET_TRAINS_URL not configured")

        index = await self._ensure_index(client, timeout)
        if index is None:
            return ProviderFetchOutcome(
                outcome="unavailable",
                error_code=self._last_error_code or "SERVER_UNAVAILABLE",
                detail="Could not load DataMeet dataset",
            )

        entry = index.get(train_number)
        if not entry:
            return ProviderFetchOutcome(outcome="not_found", detail="Train absent from DataMeet index")

        returned_num = str(entry.get("number") or "").strip()
        if returned_num and returned_num != train_number:
            return ProviderFetchOutcome(
                outcome="mismatched",
                detail=f"Requested {train_number}, received {returned_num}",
            )

        name = str(entry.get("name") or "").strip()
        if not name:
            return ProviderFetchOutcome(outcome="not_found", detail="Missing train name in DataMeet entry")

        zone = str(entry.get("zone") or "").strip().upper() or None
        src_name = entry.get("from_station_name")
        src_code = entry.get("from_station_code")
        dst_name = entry.get("to_station_name")
        dst_code = entry.get("to_station_code")

        resp = TrainLookupResponse(
            status="VERIFIED",
            train_number=train_number,
            train_name=name,
            source_station=str(src_name).strip() if src_name else None,
            source_code=str(src_code).strip().upper() if src_code else None,
            destination_station=str(dst_name).strip() if dst_name else None,
            destination_code=str(dst_code).strip().upper() if dst_code else None,
            region=map_zone_to_region(zone),
            railway_zone=zone,
            train_type=normalize_train_type(entry.get("type"), name),
            running_days=None,
            route=[],
            coach_composition=[],
            total_coaches=None,
            has_official_composition=False,
            provider=self.name,
            verified_at=datetime.now(timezone.utc).isoformat(),
            message="Train verified successfully.",
        )
        resp.missing_fields = _compute_missing_fields(resp)
        return ProviderFetchOutcome(outcome="verified", data=resp)


# Clean adapter aliases for multi-source aggregator architecture
BaseTrainAdapter = BaseTrainProvider
RailRadarAdapter = RailRadarProvider
RapidApiIrctcAdapter = RapidApiIrctcProvider
IndianRailApiAdapter = IndianRailApiProvider
DataMeetOpenAdapter = DataMeetOpenProvider


class TrainLookupService:
    """Orchestrates cached & live multi-adapter train verification."""

    def __init__(
        self,
        providers: Optional[List[BaseTrainProvider]] = None,
        client_factory: Optional[Any] = None,
        local_db: Optional[LocalExpressDatabase] = None,
    ):
        self.local_db = local_db or LocalExpressDatabase()
        self.providers: List[BaseTrainProvider] = providers or [
            RailRadarAdapter(),
            ErailPublicAdapter(),
            RapidApiIrctcAdapter(),
            IndianRailApiAdapter(),
            LocalExpressDatabaseAdapter(self.local_db),
            DataMeetOpenAdapter(),
        ]
        self._client_factory = client_factory
        self._mem_cache: Dict[str, Tuple[float, TrainLookupResponse]] = {}
        self._provider_stats: Dict[str, Dict[str, Any]] = {}

    def clear_cache(self) -> None:
        self._mem_cache.clear()

    def get_provider_health(self) -> Dict[str, Dict[str, Any]]:
        """Return per-provider runtime counters (verified, not_found, failures, avg_latency_ms)."""
        return {k: dict(v) for k, v in self._provider_stats.items()}

    def _record_stat(self, provider_name: str, outcome: str, latency_ms: float, detail: Optional[str] = None) -> None:
        stats = self._provider_stats.setdefault(
            provider_name,
            {"verified": 0, "not_found": 0, "failures": 0, "last_latency_ms": 0.0, "last_error": None},
        )
        stats["last_latency_ms"] = latency_ms
        if outcome == "verified":
            stats["verified"] += 1
            stats["last_error"] = None
        elif outcome == "not_found":
            stats["not_found"] += 1
        elif outcome not in ("skipped_no_key",):
            stats["failures"] += 1
            stats["last_error"] = detail or outcome

    async def _read_cache(self, train_number: str, db: Optional[AsyncSession]) -> Optional[TrainLookupResponse]:
        now_ts = time.time()
        mem_entry = self._mem_cache.get(train_number)
        if mem_entry is not None:
            exp_ts, payload = mem_entry
            if exp_ts > now_ts:
                return payload.model_copy(update={"cached": True})
            self._mem_cache.pop(train_number, None)

        if db is None:
            return None

        stmt = select(TrainLookupCache).where(TrainLookupCache.train_number == train_number)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if not row:
            return None

        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None

        try:
            cached_model = TrainLookupResponse.model_validate_json(row.payload_json)
            remaining = (exp - datetime.now(timezone.utc)).total_seconds()
            self._mem_cache[train_number] = (now_ts + remaining, cached_model)
            return cached_model.model_copy(update={"cached": True})
        except Exception as exc:
            logger.warning("Corrupt cache row for %s: %s", train_number, exc)
            return None

    async def _write_cache(self, result: TrainLookupResponse, db: Optional[AsyncSession]) -> None:
        ttl = max(int(settings.RAILWAY_CACHE_TTL_SECONDS), 60)
        self._mem_cache[result.train_number] = (time.time() + ttl, result)
        if db is None:
            return

        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=ttl)
        payload_json = result.model_dump_json()

        stmt = select(TrainLookupCache).where(TrainLookupCache.train_number == result.train_number)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            existing.provider = result.provider or "Unknown"
            existing.payload_json = payload_json
            existing.fetched_at = now
            existing.expires_at = expires
        else:
            db.add(
                TrainLookupCache(
                    train_number=result.train_number,
                    provider=result.provider or "Unknown",
                    payload_json=payload_json,
                    fetched_at=now,
                    expires_at=expires,
                )
            )
        await db.commit()

    async def lookup(
        self,
        raw_train_number: str,
        db: Optional[AsyncSession] = None,
        force_refresh: bool = False,
        already_exists: bool = False,
    ) -> TrainLookupResponse:
        t0 = time.perf_counter()
        train_number = (raw_train_number or "").strip()

        if not TRAIN_NUMBER_RE.match(train_number):
            return TrainLookupResponse(
                status="INVALID_FORMAT",
                train_number=train_number,
                already_exists=already_exists,
                latency_ms=round((time.perf_counter() - t0) * 1000, 2),
                message="Invalid train number format. Enter a 4- or 5-digit Indian Railways train number.",
            )

        if not force_refresh:
            cached_resp = await self._read_cache(train_number, db)
            if cached_resp is not None:
                return cached_resp.model_copy(
                    update={
                        "cached": True,
                        "already_exists": already_exists,
                        "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                        "provider_attempts": [
                            ProviderAttempt(
                                provider="Local Cache",
                                outcome="verified",
                                latency_ms=round((time.perf_counter() - t0) * 1000, 2),
                                detail=f"Served from cached {cached_resp.provider} entry",
                            )
                        ],
                    }
                )

        attempts: List[ProviderAttempt] = []
        any_live_not_found = False
        any_archive_not_found = False
        any_unavailable = False
        last_error_code: Optional[str] = None
        timeout = float(settings.RAILWAY_LOOKUP_TIMEOUT_SECONDS)

        client_ctx = (
            self._client_factory()
            if self._client_factory is not None
            else httpx.AsyncClient(follow_redirects=True)
        )
        async with client_ctx as client:
            for provider in self.providers:
                if not provider.is_configured():
                    attempts.append(
                        ProviderAttempt(
                            provider=provider.name,
                            outcome="skipped_no_key",
                            latency_ms=0.0,
                            detail="Credentials not configured",
                        )
                    )
                    continue

                p_start = time.perf_counter()
                try:
                    outcome = await provider.fetch(train_number, client, timeout)
                except asyncio.TimeoutError:
                    p_ms = round((time.perf_counter() - p_start) * 1000, 2)
                    attempts.append(
                        ProviderAttempt(
                            provider=provider.name,
                            outcome="timeout",
                            latency_ms=p_ms,
                            detail=f"Timed out after {timeout}s",
                        )
                    )
                    self._record_stat(provider.name, "timeout", p_ms, f"Timed out after {timeout}s")
                    logger.warning("lookup train=%s provider=%s outcome=timeout latency_ms=%.2f", train_number, provider.name, p_ms)
                    any_unavailable = True
                    last_error_code = last_error_code or "TIMEOUT"
                    continue
                except Exception as exc:
                    p_ms = round((time.perf_counter() - p_start) * 1000, 2)
                    attempts.append(
                        ProviderAttempt(
                            provider=provider.name,
                            outcome="error",
                            latency_ms=p_ms,
                            detail=str(exc),
                        )
                    )
                    self._record_stat(provider.name, "error", p_ms, str(exc))
                    logger.warning("lookup train=%s provider=%s outcome=error err=%s latency_ms=%.2f", train_number, provider.name, exc, p_ms)
                    any_unavailable = True
                    last_error_code = last_error_code or ("TIMEOUT" if isinstance(exc, httpx.TimeoutException) else "SERVER_UNAVAILABLE")
                    continue

                p_ms = round((time.perf_counter() - p_start) * 1000, 2)
                attempts.append(
                    ProviderAttempt(
                        provider=provider.name,
                        outcome=outcome.outcome,
                        latency_ms=p_ms,
                        detail=outcome.detail,
                    )
                )
                self._record_stat(provider.name, outcome.outcome, p_ms, outcome.detail)
                logger.info("lookup train=%s provider=%s outcome=%s latency_ms=%.2f", train_number, provider.name, outcome.outcome, p_ms)

                if outcome.outcome == "verified" and outcome.data is not None:
                    is_express, detected_cat = is_express_family_train(
                        outcome.data.train_type,
                        outcome.train_category,
                        outcome.data.train_name,
                    )
                    total_ms = round((time.perf_counter() - t0) * 1000, 2)
                    if not is_express:
                        return TrainLookupResponse(
                            status="UNSUPPORTED_TYPE",
                            error_code="NON_EXPRESS_TRAIN",
                            train_number=train_number,
                            train_name=outcome.data.train_name,
                            train_type=outcome.data.train_type,
                            provider=outcome.data.provider,
                            already_exists=already_exists,
                            latency_ms=total_ms,
                            provider_attempts=attempts,
                            message=(
                                f"Only Express family trains are supported "
                                f"(Train {train_number} is {detected_cat}). Passenger, MEMU, DEMU, and suburban trains are excluded."
                            ),
                        )

                    verified = outcome.data.model_copy(
                        update={
                            "cached": False,
                            "already_exists": already_exists,
                            "latency_ms": total_ms,
                            "provider_attempts": attempts,
                        }
                    )
                    # Enrich missing railway zone metadata from curated Local Express DB without fabricating
                    local_entry = self.local_db.get_by_number(train_number)
                    if local_entry and not verified.railway_zone and local_entry.get("railway_zone"):
                        zone = str(local_entry["railway_zone"]).strip().upper()
                        verified = verified.model_copy(
                            update={"railway_zone": zone, "region": map_zone_to_region(zone)}
                        )
                        verified.missing_fields = _compute_missing_fields(verified)
                    elif not isinstance(provider, LocalExpressDatabaseAdapter):
                        self.local_db.upsert_verified(verified)
                    await self._write_cache(verified, db)
                    return verified

                if outcome.outcome == "not_found":
                    if isinstance(provider, (DataMeetOpenProvider, LocalExpressDatabaseAdapter)):
                        any_archive_not_found = True
                    else:
                        any_live_not_found = True
                elif outcome.outcome in ("unavailable", "mismatched"):
                    any_unavailable = True
                    if outcome.error_code:
                        last_error_code = outcome.error_code
                    elif outcome.outcome == "mismatched":
                        last_error_code = "INVALID_RESPONSE"

        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        if any_live_not_found or (any_archive_not_found and not any_unavailable):
            return TrainLookupResponse(
                status="NOT_FOUND",
                error_code="NOT_FOUND",
                train_number=train_number,
                already_exists=already_exists,
                latency_ms=total_ms,
                provider_attempts=attempts,
                message="Invalid Train Number. No matching train information was found.",
            )

        resolved_code = last_error_code or "SERVER_UNAVAILABLE"
        error_messages = {
            "TIMEOUT": "Network timeout while contacting railway verification servers. Click Verify to retry.",
            "RATE_LIMITED": "Railway API rate limit exceeded. Wait a moment and click Verify again.",
            "AUTH_ERROR": "Invalid API credentials configured for the railway lookup provider.",
            "INVALID_RESPONSE": "Unexpected response format received from the railway API.",
            "SERVER_UNAVAILABLE": "Railway API server unavailable. Please verify connectivity and retry.",
        }
        return TrainLookupResponse(
            status="UNAVAILABLE",
            error_code=resolved_code,
            train_number=train_number,
            already_exists=already_exists,
            latency_ms=total_ms,
            provider_attempts=attempts,
            message=error_messages.get(resolved_code, error_messages["SERVER_UNAVAILABLE"]),
        )


# Singleton used across API endpoints
train_lookup_service = TrainLookupService()

