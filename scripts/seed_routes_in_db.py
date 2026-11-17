"""Seed verified railway routes and required trains in panorama_dev.db."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.core.database import AsyncSessionLocal, init_db
from app.models.train import Train
from app.models.coach import Coach
from app.services.station_service import StationService
from app.services.train_lookup_service import TrainLookupService
from sqlalchemy import select

async def seed_trains_and_routes():
    await init_db()
    lookup_service = TrainLookupService()

    async with AsyncSessionLocal() as session:
        # Helper to ensure coaches
        async def ensure_coaches(train_id: str, train_number: str, coach_list: list):
            res = await session.execute(select(Coach).where(Coach.train_number == train_number, Coach.is_deleted == False))
            existing = {c.coach_number: c for c in res.scalars().all()}
            for pos, cnum in enumerate(coach_list):
                if cnum not in existing:
                    c = Coach(train_id=train_id, train_number=train_number, coach_number=cnum, position=pos, coach_category="Sleeper" if "S" in cnum else "AC")
                    session.add(c)
                else:
                    existing[cnum].train_id = train_id

        # 1. Train 11043 - Ballia Express
        res = await session.execute(select(Train).where(Train.train_number == "11043"))
        t_11043 = res.scalar_one_or_none()
        lookup_11043 = await lookup_service.lookup("11043")
        stops_11043 = [s.model_dump() if hasattr(s, "model_dump") else s.__dict__ for s in lookup_11043.route]
        enriched_11043 = StationService.enrich_route_stops(stops_11043, "11043")

        if not t_11043:
            t_11043 = Train(
                train_number="11043",
                name="Ballia Express",
                region="WEST",
                railway_zone="CR",
                train_type="Express",
                source_station="Dadar",
                source_code="DR",
                destination_station="Ballia",
                destination_code="BUI",
                route_json=json.dumps(enriched_11043),
                total_coaches=6,
                has_official_composition=True,
                api_provider="RailRadar",
                last_verified_at=datetime.now(timezone.utc),
            )
            session.add(t_11043)
            await session.flush()
        else:
            t_11043.route_json = json.dumps(enriched_11043)
            t_11043.source_code = "DR"
            t_11043.source_station = "Dadar"
            t_11043.destination_code = "BUI"
            t_11043.destination_station = "Ballia"
            t_11043.is_deleted = False
            t_11043.last_verified_at = datetime.now(timezone.utc)
        await ensure_coaches(t_11043.id, "11043", ["SLRD", "S1", "S2", "B1", "B2", "A1"])

        # 2. Train 12249 - Swarn Nagari Express
        res = await session.execute(select(Train).where(Train.train_number == "12249"))
        t_12249 = res.scalar_one_or_none()
        lookup_12249 = await lookup_service.lookup("12249")
        stops_12249 = [s.model_dump() if hasattr(s, "model_dump") else s.__dict__ for s in lookup_12249.route]
        enriched_12249 = StationService.enrich_route_stops(stops_12249, "12249")

        if not t_12249:
            t_12249 = Train(
                train_number="12249",
                name="Swarn Nagari Express",
                region="NORTH",
                railway_zone="NR",
                train_type="Superfast Express",
                source_station="Shakurbasti",
                source_code="SSB",
                destination_station="Jaisalmer",
                destination_code="JSM",
                route_json=json.dumps(enriched_12249),
                total_coaches=6,
                has_official_composition=True,
                api_provider="RailRadar",
                last_verified_at=datetime.now(timezone.utc),
            )
            session.add(t_12249)
            await session.flush()
        else:
            t_12249.route_json = json.dumps(enriched_12249)
            t_12249.source_code = "SSB"
            t_12249.source_station = "Shakurbasti"
            t_12249.destination_code = "JSM"
            t_12249.destination_station = "Jaisalmer"
            t_12249.is_deleted = False
            t_12249.last_verified_at = datetime.now(timezone.utc)
        await ensure_coaches(t_12249.id, "12249", ["SLRD", "D1", "D2", "C1", "C2", "B1"])

        # 3. Train 98765 - Delete Target Express
        howrah_asansol_stops = [
            {"code": "HWH", "name": "Howrah Junction", "water_refill_available": True, "water_capacity_liters": 50000.0},
            {"code": "KQU", "name": "Kamarkundu", "water_refill_available": False, "water_capacity_liters": 0.0},
            {"code": "BWN", "name": "Barddhaman Junction", "water_refill_available": True, "water_capacity_liters": 25000.0},
            {"code": "PAN", "name": "Panagarh", "water_refill_available": False, "water_capacity_liters": 0.0},
            {"code": "DGR", "name": "Durgapur", "water_refill_available": True, "water_capacity_liters": 20000.0},
            {"code": "RNG", "name": "Raniganj", "water_refill_available": False, "water_capacity_liters": 0.0},
            {"code": "ASN", "name": "Asansol Junction", "water_refill_available": True, "water_capacity_liters": 30000.0},
        ]
        enriched_ha = StationService.enrich_route_stops(howrah_asansol_stops, "98765")

        res = await session.execute(select(Train).where(Train.train_number == "98765"))
        t_98765 = res.scalar_one_or_none()
        if not t_98765:
            t_98765 = Train(
                train_number="98765",
                name="Delete Target Express",
                region="EAST",
                railway_zone="ER",
                train_type="Express",
                source_station="Howrah Junction",
                source_code="HWH",
                destination_station="Asansol Junction",
                destination_code="ASN",
                route_json=json.dumps(enriched_ha),
                total_coaches=2,
                has_official_composition=False,
                api_provider="Administrator Configured",
                last_verified_at=datetime.now(timezone.utc),
            )
            session.add(t_98765)
            await session.flush()
        else:
            t_98765.route_json = json.dumps(enriched_ha)
            t_98765.source_code = "HWH"
            t_98765.source_station = "Howrah Junction"
            t_98765.destination_code = "ASN"
            t_98765.destination_station = "Asansol Junction"
            t_98765.is_deleted = False
            t_98765.last_verified_at = datetime.now(timezone.utc)
        await ensure_coaches(t_98765.id, "98765", ["A1", "B1"])

        # 4. Train 98766 - Preserve Express
        enriched_ha_preserve = StationService.enrich_route_stops(howrah_asansol_stops, "98766")
        res = await session.execute(select(Train).where(Train.train_number == "98766"))
        t_98766 = res.scalar_one_or_none()
        if not t_98766:
            t_98766 = Train(
                train_number="98766",
                name="Preserve Express",
                region="EAST",
                railway_zone="ER",
                train_type="Express",
                source_station="Howrah Junction",
                source_code="HWH",
                destination_station="Asansol Junction",
                destination_code="ASN",
                route_json=json.dumps(enriched_ha_preserve),
                total_coaches=2,
                has_official_composition=False,
                api_provider="Administrator Configured",
                last_verified_at=datetime.now(timezone.utc),
            )
            session.add(t_98766)
            await session.flush()
        else:
            t_98766.route_json = json.dumps(enriched_ha_preserve)
            t_98766.source_code = "HWH"
            t_98766.source_station = "Howrah Junction"
            t_98766.destination_code = "ASN"
            t_98766.destination_station = "Asansol Junction"
            t_98766.is_deleted = False
            t_98766.last_verified_at = datetime.now(timezone.utc)
        await ensure_coaches(t_98766.id, "98766", ["A1", "B1"])

        # 5. Enrich 12301
        res = await session.execute(select(Train).where(Train.train_number == "12301"))
        t_12301 = res.scalar_one_or_none()
        if t_12301:
            lookup_12301 = await lookup_service.lookup("12301")
            stops_12301 = [s.model_dump() if hasattr(s, "model_dump") else s.__dict__ for s in lookup_12301.route]
            enriched_12301 = StationService.enrich_route_stops(stops_12301, "12301")
            t_12301.route_json = json.dumps(enriched_12301)
            t_12301.source_code = "HWH"
            t_12301.source_station = "Howrah Junction"
            t_12301.destination_code = "NDLS"
            t_12301.destination_station = "New Delhi"
            t_12301.last_verified_at = datetime.now(timezone.utc)

        await session.commit()
        print("Successfully seeded all routes and verified trains in DB.")

if __name__ == "__main__":
    asyncio.run(seed_trains_and_routes())
