import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from httpx import AsyncClient, ASGITransport
from app.main import app

async def main():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Search stations
        res = await client.get("/api/v1/location/stations/search?q=Dadar")
        print("Search Dadar status:", res.status_code, "count:", len(res.json()))

        # 2. Official route
        res2 = await client.get("/api/v1/location/official-route/12249")
        print("Official route 12249 status:", res2.status_code, "stops:", res2.json().get("stops_count"))

        # 3. Corridors
        res3 = await client.get("/api/v1/location/corridors")
        print("Corridors status:", res3.status_code, "trains count:", len(res3.json()))
        for tr, st in res3.json().items():
            if len(st) > 0:
                print(f"  Train {tr}: {len(st)} stops")

        # 4. Locations
        res4 = await client.get("/api/v1/location")
        print("Locations status:", res4.status_code, "trains count:", len(res4.json()))
        for loc in res4.json():
            print(f"  Train {loc['train_number']}: has_route={loc['has_route']}, stops={loc['route_stops_count']}")

if __name__ == "__main__":
    asyncio.run(main())
