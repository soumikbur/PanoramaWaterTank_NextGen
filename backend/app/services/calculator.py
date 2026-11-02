"""Volume and Geometry Calculator Engine.

Strictly preserves the mathematical formulas, physical dimensions, and numerical
behaviors of the legacy C++ VolumeCalculator class.
"""
import math
from typing import Tuple, Dict, Any


class VolumeCalculator:
    """Mathematical engine for cylindrical and rectangular water tanks."""

    DEFAULT_CAPACITY_LITERS: float = 20.0
    DEFAULT_MAX_HEIGHT_METERS: float = 0.50   # 50.0 cm
    DEFAULT_AREA_M2: float = 0.04             # Cross-sectional area

    @staticmethod
    def calculate_radius(area_m2: float) -> float:
        """Calculate cylindrical tank radius from cross-sectional area: r = sqrt(A / pi)."""
        if area_m2 <= 0.0:
            return 0.0
        return math.sqrt(area_m2 / math.pi)

    @staticmethod
    def calculate_max_height(capacity_liters: float, area_m2: float) -> float:
        """Calculate maximum vessel height in meters: H_max = Volume(m3) / Area.
        
        Note: 1 m3 = 1000 Liters.
        """
        if area_m2 <= 0.0 or capacity_liters <= 0.0:
            return 0.0
        volume_m3 = capacity_liters / 1000.0
        return volume_m3 / area_m2

    @staticmethod
    def calculate_water_height(
        level_percentage: float,
        max_height_meters: float = DEFAULT_MAX_HEIGHT_METERS
    ) -> float:
        """Calculate water column height in meters from fill percentage:
        
        h = max_height * (level_percentage / 100.0)
        Clamped to [0.0, max_height_meters].
        """
        if max_height_meters <= 0.0:
            return 0.0
        clamped_percent = max(0.0, min(100.0, level_percentage))
        return max_height_meters * (clamped_percent / 100.0)

    @staticmethod
    def calculate_volume_liters(
        area_m2: float = DEFAULT_AREA_M2,
        water_height_meters: float = 0.0
    ) -> float:
        """Calculate volume in liters from water column height and area:
        
        Volume(L) = Area(m2) * Height(m) * 1000
        """
        if area_m2 <= 0.0 or water_height_meters <= 0.0:
            return 0.0
        return area_m2 * water_height_meters * 1000.0

    @staticmethod
    def calculate_fill_percentage(
        current_volume_liters: float,
        max_capacity_liters: float = DEFAULT_CAPACITY_LITERS
    ) -> float:
        """Calculate percentage fill from volume: (V / V_max) * 100."""
        if max_capacity_liters <= 0.0:
            return 0.0
        raw_percentage = (current_volume_liters / max_capacity_liters) * 100.0
        return max(0.0, min(100.0, raw_percentage))

    @staticmethod
    def determine_capacity_rank(fill_percentage: float) -> str:
        """Map fill percentage to the 4-tier capacity ranks matching legacy RankIndicator:
        
        - LOW: 0% - 25%
        - MODERATE: 25% - 50%
        - GOOD: 50% - 75%
        - HIGH: 75% - 100%
        """
        clamped = max(0.0, min(100.0, fill_percentage))
        if clamped < 25.0:
            return "LOW"
        elif clamped < 50.0:
            return "MODERATE"
        elif clamped < 75.0:
            return "GOOD"
        else:
            return "HIGH"

    @classmethod
    def evaluate_metrics(
        cls,
        raw_level_percent: float,
        capacity_liters: float = DEFAULT_CAPACITY_LITERS,
        max_height_cm: float = 50.0,
        area_m2: float = DEFAULT_AREA_M2
    ) -> Dict[str, Any]:
        """Compute full suite of geometric fluid metrics from raw telemetry level percentage."""
        max_height_m = max_height_cm / 100.0
        clamped_percent = max(0.0, min(100.0, raw_level_percent))
        is_overflow = raw_level_percent >= 100.0

        water_height_m = cls.calculate_water_height(clamped_percent, max_height_m)
        water_height_cm = water_height_m * 100.0
        volume_liters = cls.calculate_volume_liters(area_m2, water_height_m)
        rank = cls.determine_capacity_rank(clamped_percent)

        return {
            "raw_level_percent": round(raw_level_percent, 2),
            "level_percent": round(clamped_percent, 2),
            "water_height_cm": round(water_height_cm, 2),
            "water_height_m": round(water_height_m, 4),
            "volume_liters": round(volume_liters, 2),
            "capacity_liters": round(capacity_liters, 2),
            "max_height_cm": round(max_height_cm, 2),
            "area_m2": round(area_m2, 4),
            "rank": rank,
            "is_overflow": is_overflow
        }

