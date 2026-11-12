"""Unit and integration tests for intelligent railway lookup & train registration."""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, init_db
from app.main import app
from app.models.device import Device
from app.models.train import Train, TrainLookupCache
from app.services.train_lookup_service import (
    DataMeetOpenProvider,
    IndianRailApiProvider,
    RailRadarProvider,
    RapidApiIrctcProvider,
    TrainLookupService,
    is_express_family_train,
    map_zone_to_region,
    normalize_train_type,
    train_lookup_service,
)


def test_region_and_type_normalization():
    assert map_zone_to_region("NR") == "NORTH"
    assert map_zone_to_region("SER") == "EAST"
    assert map_zone_to_region("WR") == "WEST"
    assert map_zone_to_region("SR") == "SOUTH"
    assert map_zone_to_region("Central Railway") == "WEST"
    assert normalize_train_type("Shtb") == "Shatabdi Express"
    assert normalize_train_type("Raj") == "Rajdhani Express"
    assert normalize_train_type("SF") == "Superfast Express"


@pytest.mark.asyncio
async def test_invalid_format_rejected_without_network():
    svc = TrainLookupService(providers=[])
    for bad in ("", "abc", "123", "123456"):
        res = await svc.lookup(bad)
        assert res.status == "INVALID_FORMAT"


@pytest.mark.asyncio
async def test_primary_railradar_and_coaches_normalization(monkeypatch):
    monkeypatch.setattr(settings, "RAILRADAR_API_KEY", "test-railradar-key")
    monkeypatch.setattr(settings, "RAPIDAPI_IRCTC_KEY", "")
    monkeypatch.setattr(settings, "INDIANRAIL_API_KEY", "")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/trains/12951/coaches"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "coaches": [
                            {"position": 1, "code": "L", "class": "LOCO"},
                            {"position": 2, "code": "EOG", "class": "EOG"},
                            {"position": 3, "code": "H1", "class": "1A"},
                            {"position": 4, "code": "A1", "class": "2A"},
                            {"position": 5, "code": "B1", "class": "3A"},
                        ]
                    }
                },
            )
        if request.url.path.endswith("/trains/12951"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "trainNumber": "12951",
                        "trainName": "MUMBAI TEJAS RAJDHANI",
                        "sourceStationName": "MUMBAI CENTRAL",
                        "sourceStationCode": "MMCT",
                        "destinationStationName": "NEW DELHI",
                        "destinationStationCode": "NDLS",
                        "zone": "WR",
                        "trainType": "Rajdhani",
                        "daysOfWeek": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                        "halts": [
                            {"stationCode": "MMCT", "stationName": "MUMBAI CENTRAL", "departure": "17:00", "day": 1},
                            {"stationCode": "NDLS", "stationName": "NEW DELHI", "arrival": "08:32", "day": 2},
                        ],
                    }
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    svc = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(transport=transport),
    )
    res = await svc.lookup("12951")
    assert res.status == "VERIFIED"
    assert res.provider == "RailRadar"
    assert res.train_name == "MUMBAI TEJAS RAJDHANI"
    assert res.source_code == "MMCT"
    assert res.destination_code == "NDLS"
    assert res.region == "WEST"
    assert res.railway_zone == "WR"
    assert res.has_official_composition is True
    # Engine 'L' excluded -> 4 real cars (EOG, H1, A1, B1)
    assert [c.coach_number for c in res.coach_composition] == ["EOG", "H1", "A1", "B1"]
    assert res.total_coaches == 4
    assert res.missing_fields == []


@pytest.mark.asyncio
async def test_fallback_on_primary_error_and_mismatch(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, "RAILRADAR_API_KEY", "rr-key")
    monkeypatch.setattr(settings, "RAPIDAPI_IRCTC_KEY", "rapid-key")
    monkeypatch.setattr(settings, "INDIANRAIL_API_KEY", "ir-key")

    # Pre-seed a temp DataMeet index file
    idx_file = tmp_path / "dm_index.json"
    idx_file.write_text(
        json.dumps(
            {
                "12621": {
                    "number": "12621",
                    "name": "TAMIL NADU SF EXPRESS",
                    "zone": "SR",
                    "from_station_code": "MAS",
                    "from_station_name": "CHENNAI CENTRAL",
                    "to_station_code": "NDLS",
                    "to_station_name": "NEW DELHI",
                    "type": "SF",
                }
            }
        ),
        encoding="utf-8",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if "railradar" in host:
            # Primary returns server error
            return httpx.Response(503, json={"error": "upstream down"})
        if "rapidapi" in host:
            # Secondary returns corrupted train_number mismatch
            return httpx.Response(
                200,
                json={"data": {"trainNumber": "99999", "trainName": "WRONG TRAIN"}},
            )
        if "indianrailapi" in host:
            # Tertiary times out / raises connect error
            raise httpx.ConnectTimeout("Timed out")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    svc = TrainLookupService(
        providers=[
            RailRadarProvider(),
            RapidApiIrctcProvider(),
            IndianRailApiProvider(),
            DataMeetOpenProvider(index_path=idx_file),
        ],
        client_factory=lambda: httpx.AsyncClient(transport=transport),
    )

    res = await svc.lookup("12621")
    assert res.status == "VERIFIED"
    assert res.provider == "DataMeet OpenData"
    assert res.train_name == "TAMIL NADU SF EXPRESS"
    assert res.region == "SOUTH"
    assert res.railway_zone == "SR"
    assert res.has_official_composition is False
    assert "coachComposition" in res.missing_fields
    outcomes = {a.provider: a.outcome for a in res.provider_attempts}
    assert outcomes["RailRadar"] == "unavailable"
    assert outcomes["RapidAPI-IRCTC"] == "mismatched"
    assert outcomes["IndianRailAPI"] == "unavailable"
    assert outcomes["DataMeet OpenData"] == "verified"


@pytest.mark.asyncio
async def test_distinguishes_unavailable_vs_not_found(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, "RAILRADAR_API_KEY", "rr-key")
    monkeypatch.setattr(settings, "RAPIDAPI_IRCTC_KEY", "")
    monkeypatch.setattr(settings, "INDIANRAIL_API_KEY", "")

    # 1. Network unavailable + no local index -> UNAVAILABLE
    def fail_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Offline")

    svc_offline = TrainLookupService(
        providers=[RailRadarProvider(), DataMeetOpenProvider(index_path=tmp_path / "missing.json")],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fail_handler)),
    )
    offline_res = await svc_offline.lookup("12002")
    assert offline_res.status == "UNAVAILABLE"

    # 2. Authoritative index present, train absent -> NOT_FOUND
    idx_file = tmp_path / "present.json"
    idx_file.write_text(json.dumps({"12002": {"number": "12002", "name": "SHATABDI"}}), encoding="utf-8")
    svc_nf = TrainLookupService(
        providers=[DataMeetOpenProvider(index_path=idx_file)],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(fail_handler)),
    )
    nf_res = await svc_nf.lookup("98765")
    assert nf_res.status == "NOT_FOUND"


@pytest.mark.asyncio
async def test_live_datameet_lookup_and_db_cache_persistence():
    await init_db()
    test_train_no = "12842"

    # Ensure clean slate for test train
    async with AsyncSessionLocal() as db:
        await db.execute(delete(TrainLookupCache).where(TrainLookupCache.train_number == test_train_no))
        await db.execute(delete(Device).where(Device.train_number == test_train_no))
        await db.execute(delete(Train).where(Train.train_number == test_train_no))
        await db.commit()
    train_lookup_service.clear_cache()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/api/v1/auth/login", json={"username": "@admin", "password": "Admin@123"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        # Unauthenticated lookup blocked
        unauth = await client.get(f"/api/v1/trains/lookup/{test_train_no}")
        assert unauth.status_code == 401

        # 1st lookup: resolves live from DataMeet OpenData and caches to SQLite
        first = await client.get(f"/api/v1/trains/lookup/{test_train_no}", headers=headers)
        assert first.status_code == 200
        d1 = first.json()
        assert d1["status"] == "VERIFIED"
        assert d1["train_number"] == test_train_no
        assert "COROMANDEL" in d1["train_name"].upper()
        assert d1["source_code"] == "MAS"
        assert d1["destination_code"] in ("HWH", "SHM")
        assert d1["region"] in ("EAST", "SOUTH")
        assert d1["already_exists"] is False

        # 2nd lookup: hits memory/DB cache even faster
        second = await client.get(f"/api/v1/trains/lookup/{test_train_no}", headers=headers)
        assert second.status_code == 200
        d2 = second.json()
        assert d2["cached"] is True
        assert d2["latency_ms"] < 50.0

        # Nonexistent train number -> NOT_FOUND
        missing = await client.get("/api/v1/trains/lookup/99998", headers=headers)
        assert missing.status_code == 200
        assert missing.json()["status"] == "NOT_FOUND"

        # Add train with full metadata & custom coaches -> 201
        create_res = await client.post(
            "/api/v1/trains",
            headers=headers,
            json={
                "train_number": test_train_no,
                "name": d1["train_name"],
                "region": d1["region"],
                "railway_zone": d1["railway_zone"],
                "source_station": d1["source_station"],
                "source_code": d1["source_code"],
                "destination_station": d1["destination_station"],
                "destination_code": d1["destination_code"],
                "train_type": d1["train_type"],
                "api_provider": d1["provider"],
                "last_verified_at": d1["verified_at"],
                "coaches": [
                    {"coach_number": "A1", "coach_category": "AC 2-Tier", "coach_type": "2A"},
                    {"coach_number": "B1", "coach_category": "AC 3-Tier", "coach_type": "3A"},
                ],
            },
        )
        assert create_res.status_code == 201
        assert create_res.json()["coaches_created"] == 2

        # Duplicate add blocked with 409
        dup_res = await client.post(
            "/api/v1/trains",
            headers=headers,
            json={"train_number": test_train_no, "name": "Duplicate", "region": "EAST"},
        )
        assert dup_res.status_code == 409

        # Lookup now reports already_exists=True
        exists_lookup = await client.get(f"/api/v1/trains/lookup/{test_train_no}", headers=headers)
        assert exists_lookup.json()["already_exists"] is True

        # Persisted metadata visible in GET /trains/{no}/consist
        consist_res = await client.get(f"/api/v1/trains/{test_train_no}/consist", headers=headers)
        assert consist_res.status_code == 200
        consist = consist_res.json()
        assert consist["coaches_count"] == 2
        assert consist["source_code"] == "MAS"
        assert consist["destination_code"] == d1["destination_code"]
        assert consist["api_provider"] == d1["provider"]

        # Clean up
        del_res = await client.delete(f"/api/v1/trains/{test_train_no}", headers=headers)
        assert del_res.status_code == 200

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(Train).where(Train.train_number == test_train_no))).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_error_code_differentiation_for_rate_limit_auth_timeout(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(settings, "RAILRADAR_API_KEY", "test-key")
    monkeypatch.setattr(settings, "RAPIDAPI_IRCTC_KEY", "")
    monkeypatch.setattr(settings, "INDIANRAIL_API_KEY", "")

    # 1. Rate Limit (429)
    svc_rl = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(429))),
    )
    res_rl = await svc_rl.lookup("15102")
    assert res_rl.status == "UNAVAILABLE"
    assert res_rl.error_code == "RATE_LIMITED"

    # 2. Invalid credentials (401)
    svc_auth = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(401))),
    )
    res_auth = await svc_auth.lookup("15102")
    assert res_auth.status == "UNAVAILABLE"
    assert res_auth.error_code == "AUTH_ERROR"

    # 3. Network timeout
    def timeout_handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Timed out")

    svc_to = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler)),
    )
    res_to = await svc_to.lookup("15102")
    assert res_to.status == "UNAVAILABLE"
    assert res_to.error_code == "TIMEOUT"

    # 4. Malformed JSON response
    svc_bad = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(
            transport=httpx.MockTransport(lambda req: httpx.Response(200, text="{not valid json"))
        ),
    )
    res_bad = await svc_bad.lookup("15102")
    assert res_bad.status == "UNAVAILABLE"
    assert res_bad.error_code == "INVALID_RESPONSE"

    # 5. Live 404 from primary falling back cleanly to DataMeet archive
    idx_file = tmp_path / "fallback_dm.json"
    idx_file.write_text(
        json.dumps(
            {
                "12621": {
                    "number": "12621",
                    "name": "TAMIL NADU SF EXPRESS",
                    "zone": "SR",
                    "from_station_code": "MAS",
                    "from_station_name": "CHENNAI CENTRAL",
                    "to_station_code": "NDLS",
                    "to_station_name": "NEW DELHI",
                    "type": "SF",
                }
            }
        ),
        encoding="utf-8",
    )
    svc_404_fb = TrainLookupService(
        providers=[RailRadarProvider(), DataMeetOpenProvider(index_path=idx_file)],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(404))),
    )
    res_fb = await svc_404_fb.lookup("12621")
    assert res_fb.status == "VERIFIED"
    assert res_fb.provider == "DataMeet OpenData"
    assert {a.provider: a.outcome for a in res_fb.provider_attempts}["RailRadar"] == "not_found"

    # 6. Live API unavailable + archive miss must report UNAVAILABLE (not false NOT_FOUND)
    svc_unavail_archive = TrainLookupService(
        providers=[RailRadarProvider(), DataMeetOpenProvider(index_path=idx_file)],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler)),
    )
    res_ua = await svc_unavail_archive.lookup("15120")
    assert res_ua.status == "UNAVAILABLE"
    assert res_ua.error_code == "TIMEOUT"


@pytest.mark.asyncio
async def test_express_only_filter_metadata_and_heuristics():
    # Structured metadata takes precedence over name tokens
    assert is_express_family_train("Mail/Express", "Express", "Bilaspur Express cum Passenger")[0] is True
    assert is_express_family_train("MEMU", "Local", "Mangaluru Central MEMU Express")[0] is False
    assert is_express_family_train("DEMU", "Local", "Sangli DEMU Express")[0] is False
    assert is_express_family_train("Passenger", "Passenger", "Gorakhpur Gonda Passenger")[0] is False
    assert is_express_family_train("Rajdhani Express", "Premium", "Howrah New Delhi Rajdhani")[0] is True

    def non_express_handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/trains/64101/coaches"):
            return httpx.Response(404)
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "train": {
                        "number": "64101",
                        "name": "Aligarh - Delhi EMU",
                        "type": "EMU",
                        "category": "Local",
                        "source": {"code": "ALJN", "name": "Aligarh Jn"},
                        "destination": {"code": "DLI", "name": "Delhi Jn"},
                    }
                },
            },
        )

    svc = TrainLookupService(
        providers=[RailRadarProvider()],
        client_factory=lambda: httpx.AsyncClient(transport=httpx.MockTransport(non_express_handler)),
    )
    res = await svc.lookup("64101")
    assert res.status == "UNSUPPORTED_TYPE"
    assert res.error_code == "NON_EXPRESS_TRAIN"


@pytest.mark.asyncio
async def test_live_all_target_express_trains_including_15120(monkeypatch):
    monkeypatch.setattr(settings, "RAILRADAR_API_KEY", "")
    monkeypatch.setattr(settings, "RAPIDAPI_IRCTC_KEY", "")
    monkeypatch.setattr(settings, "INDIANRAIL_API_KEY", "")

    svc = TrainLookupService()
    targets = {
        "15120": ("JANTA", "DDN", ("BNRS", "BSBS")),
        "12301": ("RAJDHANI", "HWH", ("NDLS",)),
        "12302": ("RAJDHANI", "NDLS", ("HWH",)),
        "12309": ("RAJDHANI", "RJPB", ("NDLS",)),
        "12310": ("RAJDHANI", "NDLS", ("RJPB",)),
        "12951": ("RAJDHANI", "MMCT", ("NDLS",)),
        "12952": ("RAJDHANI", "NDLS", ("MMCT",)),
    }
    for num, (name_kw, expected_src, expected_dsts) in targets.items():
        res = await svc.lookup(num, force_refresh=True)
        assert res.status == "VERIFIED", f"{num} failed: {res.status} {res.message} {res.provider_attempts}"
        assert res.train_number == num
        assert name_kw in (res.train_name or "").upper(), f"Unexpected name for {num}: {res.train_name}"
        assert res.source_code == expected_src, f"Unexpected src for {num}: {res.source_code}"
        assert res.destination_code in expected_dsts, f"Unexpected dst for {num}: {res.destination_code}"
        assert "EXPRESS" in (res.train_type or "").upper()
    assert svc.get_provider_health().get("RailRadar", {}).get("verified", 0) >= len(targets)
