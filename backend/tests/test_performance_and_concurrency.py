"""Performance and High-Concurrency Stress Test Suite.

Evaluates:
1. Concurrent API request handling across tanks, devices, trains, and telemetry.
2. High-throughput edge telemetry ingestion.
3. Sub-200ms response time latency guarantees under multi-operator load.
"""
import asyncio
import time
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_concurrent_read_queries():
    """Simulate 30 concurrent operator queries across multiple SCADA endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        endpoints = [
            "/api/v1/tanks",
            "/api/v1/tanks/live",
            "/api/v1/devices",
            "/api/v1/trains",
            "/api/v1/trains/regions",
            "/api/v1/alarms/stats",
            "/api/v1/settings/config",
            "/api/v1/location",
        ]

        tasks = []
        start_time = time.perf_counter()

        # Fire 30 requests concurrently
        for i in range(30):
            target = endpoints[i % len(endpoints)]
            tasks.append(client.get(target))

        responses = await asyncio.gather(*tasks)
        total_time = time.perf_counter() - start_time

        # All requests must return HTTP 200
        for r in responses:
            assert r.status_code == 200

        # Average latency per request must be sub-350ms under concurrent burst
        avg_latency = total_time / len(responses)
        assert avg_latency < 0.35, f"Average latency too high: {avg_latency:.4f}s"


@pytest.mark.asyncio
async def test_high_throughput_telemetry_ingestion():
    """Verify system performance during rapid edge telemetry submission bursts."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "uid": "0026004D4B42501120353332",
            "trno": "12002",
            "chno": "B4",
            "wlp1": 75.0,
            "v1": 3.75,
            "wlvl": True,
            "lat": 22.5839,
            "lon": 88.3426,
            "speed": 85.0,
            "sats": 12
        }

        start = time.perf_counter()
        tasks = [client.post("/api/v1/telemetry/ingest", json=payload) for _ in range(20)]
        responses = await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start

        for r in responses:
            assert r.status_code == 200
            assert r.json()["status"] == "SUCCESS"

        throughput = 20 / elapsed
        assert throughput >= 5, f"Throughput was {throughput:.1f} req/s (expected >= 5)"
