"""Build and refresh the curated Indian Express Train Database (`backend/data/express_trains_db.json`).

Sources:
- DataMeet OpenData `trains.json` (`datameet/railways`)
- Live verification adapters (`RailRadarAdapter`, `ErailPublicAdapter`) when `--enrich` is passed

Usage:
    python scripts/import_express_trains.py
    python scripts/import_express_trains.py --refresh-datameet --enrich 15120 12301 12951 22436 12002
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.services.train_lookup_service import (
    ErailPublicAdapter,
    LocalExpressDatabase,
    RailRadarAdapter,
    TRAIN_NUMBER_RE,
    is_express_family_train,
    map_zone_to_region,
    normalize_train_type,
)


async def build_express_database(
    refresh_datameet: bool = False,
    enrich_numbers: List[str] | None = None,
) -> Dict[str, Any]:
    dm_path = BACKEND_DIR / "data" / "datameet_trains_index.json"
    out_path = BACKEND_DIR / "data" / "express_trains_db.json"

    if refresh_datameet or not dm_path.exists():
        print(f"Downloading DataMeet trains.json from {settings.DATAMEET_TRAINS_URL} ...")
        async with httpx.AsyncClient(follow_redirects=True, timeout=25.0) as client:
            res = await client.get(settings.DATAMEET_TRAINS_URL)
            res.raise_for_status()
            raw = res.json()
        dm_index: Dict[str, Dict[str, Any]] = {}
        for feat in raw.get("features", []):
            props = feat.get("properties") or {}
            num = str(props.get("number") or "").strip()
            if num:
                dm_index[num] = props
        dm_path.parent.mkdir(parents=True, exist_ok=True)
        dm_path.write_text(json.dumps(dm_index), encoding="utf-8")
        print(f"Saved {len(dm_index)} DataMeet records to {dm_path}")
    else:
        dm_index = json.loads(dm_path.read_text(encoding="utf-8"))

    verified_at = datetime.now(timezone.utc).isoformat()
    by_number: Dict[str, Dict[str, Any]] = {}
    excluded_count = 0

    for num, entry in dm_index.items():
        clean_num = str(entry.get("number") or num).strip()
        name = str(entry.get("name") or "").strip()
        if not TRAIN_NUMBER_RE.match(clean_num) or not name:
            continue
        raw_type = entry.get("type")
        is_exp, _ = is_express_family_train(raw_type, None, name)
        if not is_exp:
            excluded_count += 1
            continue

        zone = str(entry.get("zone") or "").strip().upper() or None
        by_number[clean_num] = {
            "train_number": clean_num,
            "train_name": name,
            "source_station": str(entry.get("from_station_name")).strip() if entry.get("from_station_name") else None,
            "source_code": str(entry.get("from_station_code")).strip().upper() if entry.get("from_station_code") else None,
            "destination_station": str(entry.get("to_station_name")).strip() if entry.get("to_station_name") else None,
            "destination_code": str(entry.get("to_station_code")).strip().upper() if entry.get("to_station_code") else None,
            "railway_zone": zone,
            "region": map_zone_to_region(zone),
            "train_type": normalize_train_type(raw_type, name),
            "running_days": None,
            "source": "DataMeet OpenData",
            "verified_at": verified_at,
            "is_express": True,
        }

    # Optionally enrich missing/newer trains directly from live RailRadar / eRail adapters
    if enrich_numbers:
        railradar = RailRadarAdapter()
        erail = ErailPublicAdapter()
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            for tnum in enrich_numbers:
                clean = tnum.strip()
                if not TRAIN_NUMBER_RE.match(clean):
                    continue
                outcome = await railradar.fetch(clean, client, 10.0)
                if outcome.outcome != "verified":
                    outcome = await erail.fetch(clean, client, 10.0)
                if outcome.outcome == "verified" and outcome.data is not None:
                    resp = outcome.data
                    ok, _ = is_express_family_train(resp.train_type, outcome.train_category, resp.train_name)
                    if not ok:
                        print(f"[SKIP non-Express] {clean}: {resp.train_name} ({resp.train_type})")
                        continue
                    prev_zone = by_number.get(clean, {}).get("railway_zone")
                    zone = resp.railway_zone or prev_zone
                    by_number[clean] = {
                        "train_number": clean,
                        "train_name": resp.train_name,
                        "source_station": resp.source_station,
                        "source_code": resp.source_code,
                        "destination_station": resp.destination_station,
                        "destination_code": resp.destination_code,
                        "railway_zone": zone,
                        "region": map_zone_to_region(zone) if zone else resp.region,
                        "train_type": resp.train_type,
                        "running_days": resp.running_days,
                        "source": resp.provider or "Live Verified API",
                        "verified_at": resp.verified_at or datetime.now(timezone.utc).isoformat(),
                        "is_express": True,
                    }
                    print(f"[ENRICHED] {clean}: {resp.train_name} ({resp.source_code} -> {resp.destination_code}) via {resp.provider}")

    name_tokens: Dict[str, List[str]] = {}
    for num, rec in by_number.items():
        for tok in set(re.findall(r"[A-Z0-9]{2,}", str(rec.get("train_name") or "").upper())):
            name_tokens.setdefault(tok, []).append(num)

    payload = {
        "meta": {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "express_train_count": len(by_number),
            "excluded_non_express": excluded_count,
            "sources": sorted({str(v.get("source")) for v in by_number.values()}),
        },
        "by_number": by_number,
        "name_tokens": name_tokens,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(tmp, out_path)
    print(f"Built {out_path} with {len(by_number)} verified Express trains ({excluded_count} non-Express excluded, {len(name_tokens)} name tokens).")
    return payload["meta"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build/refresh curated Indian Express train database.")
    parser.add_argument("--refresh-datameet", action="store_true", help="Re-download DataMeet trains.json")
    parser.add_argument("--enrich", nargs="*", default=[], help="Train numbers to live-verify and import")
    args = parser.parse_args()
    asyncio.run(build_express_database(refresh_datameet=args.refresh_datameet, enrich_numbers=args.enrich))


if __name__ == "__main__":
    main()

