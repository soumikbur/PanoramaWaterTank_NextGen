"""Unit tests for HistoryService statistical aggregation."""
from app.services.history_service import HistoryService


def test_aggregate_stats():
    """Verify calculation of average, min, max, and delta."""
    readings = [
        {"levelPercent": 50.0},
        {"levelPercent": 60.0},
        {"levelPercent": 70.0},
        {"levelPercent": 80.0}
    ]
    stats = HistoryService.calculate_stats(readings)
    assert stats.averagePercent == 65.0
    assert stats.minPercent == 50.0
    assert stats.maxPercent == 80.0
    assert stats.deltaPercent == 30.0


def test_empty_stats():
    """Verify empty series returns zeroed stats."""
    stats = HistoryService.calculate_stats([])
    assert stats.averagePercent == 0.0
    assert stats.minPercent == 0.0
    assert stats.maxPercent == 0.0
    assert stats.deltaPercent == 0.0

