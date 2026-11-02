"""Historical Time-Series Analytics Service."""
from typing import List, Dict, Any
from app.schemas.telemetry import TelemetryStats


class HistoryService:
    """Calculates statistics over telemetry time series data."""

    @staticmethod
    def calculate_stats(readings: List[Dict[str, Any]], level_key: str = "levelPercent") -> TelemetryStats:
        """Compute average, min, max, and net delta from ordered readings."""
        if not readings:
            return TelemetryStats(
                averagePercent=0.0,
                minPercent=0.0,
                maxPercent=0.0,
                deltaPercent=0.0
            )

        levels = [float(r[level_key]) for r in readings]
        avg_val = sum(levels) / len(levels)
        min_val = min(levels)
        max_val = max(levels)
        delta_val = levels[-1] - levels[0]

        return TelemetryStats(
            averagePercent=round(avg_val, 1),
            minPercent=round(min_val, 1),
            maxPercent=round(max_val, 1),
            deltaPercent=round(delta_val, 1)
        )

