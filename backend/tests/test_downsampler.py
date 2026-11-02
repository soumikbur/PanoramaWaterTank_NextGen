"""Unit tests for Largest-Triangle-Three-Buckets (LTTB) Downsampler."""
from datetime import datetime, timedelta
from app.services.downsampler import LTTBDownsampler


def test_lttb_point_reduction():
    """Verify that a large dataset is reduced to exactly target threshold."""
    base_time = datetime(2026, 10, 28, 12, 0, 0)
    # Generate 500 points
    points = [
        {
            "id": i,
            "timestamp": base_time + timedelta(minutes=i),
            "levelPercent": 50.0 + (i % 20)
        }
        for i in range(500)
    ]

    downsampled = LTTBDownsampler.downsample(points, threshold=50)
    assert len(downsampled) == 50
    # First and last points must be preserved
    assert downsampled[0]["id"] == 0
    assert downsampled[-1]["id"] == 499


def test_lttb_peak_preservation():
    """Verify that an extreme isolated peak is preserved."""
    base_time = datetime(2026, 10, 28, 12, 0, 0)
    points = [
        {
            "id": i,
            "timestamp": base_time + timedelta(minutes=i),
            "levelPercent": 50.0
        }
        for i in range(200)
    ]
    # Insert extreme spike at index 100
    points[100]["levelPercent"] = 99.9

    downsampled = LTTBDownsampler.downsample(points, threshold=20)
    levels = [p["levelPercent"] for p in downsampled]
    assert 99.9 in levels


def test_lttb_valley_preservation():
    """Verify that an extreme isolated valley/dip is preserved."""
    base_time = datetime(2026, 10, 28, 12, 0, 0)
    points = [
        {
            "id": i,
            "timestamp": base_time + timedelta(minutes=i),
            "levelPercent": 75.0
        }
        for i in range(200)
    ]
    # Insert dip at index 50
    points[50]["levelPercent"] = 2.5

    downsampled = LTTBDownsampler.downsample(points, threshold=20)
    levels = [p["levelPercent"] for p in downsampled]
    assert 2.5 in levels

