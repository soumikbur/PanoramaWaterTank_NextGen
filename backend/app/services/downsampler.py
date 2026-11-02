"""Largest-Triangle-Three-Buckets (LTTB) Downsampling Algorithm.

Implements the exact downsampling algorithm used in the legacy C++ HistoryExporter
to reduce dense time-series telemetry to ~100 points for chart rendering while
preserving critical peaks, valleys, and trend shapes.
"""
from typing import List, Tuple, Dict, Any
from datetime import datetime


class LTTBDownsampler:
    """Downsamples time-series data using Largest-Triangle-Three-Buckets."""

    @staticmethod
    def downsample(
        data: List[Dict[str, Any]],
        threshold: int = 100,
        x_key: str = "timestamp",
        y_key: str = "levelPercent"
    ) -> List[Dict[str, Any]]:
        """Downsample a list of dictionary records to target threshold count."""
        data_len = len(data)
        if data_len <= threshold or threshold <= 2:
            return data

        sampled: List[Dict[str, Any]] = []

        # Bucket size. Leave room for start and end data points
        every = (data_len - 2) / (threshold - 2)

        # First point is always selected
        a = 0
        sampled.append(data[a])

        def get_xy(point: Dict[str, Any]) -> Tuple[float, float]:
            x_val = point[x_key]
            if isinstance(x_val, datetime):
                x = x_val.timestamp()
            elif isinstance(x_val, (int, float)):
                x = float(x_val)
            else:
                x = float(point.get("id", 0))
            y = float(point[y_key])
            return x, y

        for i in range(threshold - 2):
            # Calculate point average for next bucket (bucket c)
            avg_x = 0.0
            avg_y = 0.0
            avg_range_start = int(math_floor((i + 1) * every) + 1)
            avg_range_end = int(math_floor((i + 2) * every) + 1)
            avg_range_end = min(avg_range_end, data_len)

            avg_range_length = avg_range_end - avg_range_start
            if avg_range_length <= 0:
                avg_range_length = 1

            for j in range(avg_range_start, avg_range_end):
                jx, jy = get_xy(data[j])
                avg_x += jx
                avg_y += jy

            avg_x /= avg_range_length
            avg_y /= avg_range_length

            # Get the range for this bucket (bucket b)
            range_offs = int(math_floor(i * every) + 1)
            range_to = int(math_floor((i + 1) * every) + 1)

            # Point a
            point_a_x, point_a_y = get_xy(data[a])

            max_area = -1.0
            next_a = range_offs

            for j in range(range_offs, min(range_to, data_len)):
                jx, jy = get_xy(data[j])
                # Calculate triangle area over points a, this point, and average next
                area = abs(
                    (point_a_x - avg_x) * (jy - point_a_y) -
                    (point_a_x - jx) * (avg_y - point_a_y)
                ) * 0.5

                if area > max_area:
                    max_area = area
                    next_a = j

            sampled.append(data[next_a])
            a = next_a

        # Last point is always selected
        sampled.append(data[data_len - 1])
        return sampled


def math_floor(x: float) -> int:
    """Fast integer floor."""
    return int(x)

