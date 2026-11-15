"""Railway Station Geolocation & Corridor Service.

Provides verified geographic coordinates for Indian Railways stations
backed by the official DataMeet open railway dataset (8,697 stations)
and verified Indian Railways station databases.
"""
import json
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List

logger = logging.getLogger("panorama.station_service")

# Common aliases for station codes that were renamed or have multiple code designations
STATION_ALIASES: Dict[str, str] = {
    "BNRS": "MUV",     # Banaras (formerly Manduadih MUV)
    "BSBS": "MUV",     # Banaras alternative code
    "CSMT": "CSTM",    # Chhatrapati Shivaji Maharaj Terminus
    "AYC": "FD",       # Ayodhya Cantt (formerly Faizabad FD)
    "PRYJ": "ALD",     # Prayagraj (formerly Allahabad ALD)
    "DDU": "MGS",      # Pt. Deen Dayal Upadhyaya (formerly Mughalsarai MGS)
}

# Known major stations fallback cache with verified coordinates (WGS84)
VERIFIED_MAJOR_STATIONS: Dict[str, Dict[str, Any]] = {
    "NDLS": {"code": "NDLS", "name": "New Delhi", "lat": 28.6423, "lon": 77.2200, "zone": "NR", "water_refill": True, "capacity": 50000.0},
    "HWH": {"code": "HWH", "name": "Howrah Junction", "lat": 22.5839, "lon": 88.3426, "zone": "ER", "water_refill": True, "capacity": 50000.0},
    "BWN": {"code": "BWN", "name": "Barddhaman Junction", "lat": 23.2324, "lon": 87.8615, "zone": "ER", "water_refill": True, "capacity": 25000.0},
    "DGR": {"code": "DGR", "name": "Durgapur", "lat": 23.5014, "lon": 87.3119, "zone": "ER", "water_refill": True, "capacity": 20000.0},
    "RNG": {"code": "RNG", "name": "Raniganj", "lat": 23.6186, "lon": 87.1358, "zone": "ER", "water_refill": False, "capacity": 0.0},
    "ASN": {"code": "ASN", "name": "Asansol Junction", "lat": 23.6871, "lon": 86.9746, "zone": "ER", "water_refill": True, "capacity": 30000.0},
    "DHN": {"code": "DHN", "name": "Dhanbad Junction", "lat": 23.7957, "lon": 86.4304, "zone": "ECR", "water_refill": True, "capacity": 25000.0},
    "CNB": {"code": "CNB", "name": "Kanpur Central", "lat": 26.4547, "lon": 80.3507, "zone": "NCR", "water_refill": True, "capacity": 40000.0},
    "PRYJ": {"code": "PRYJ", "name": "Prayagraj Junction", "lat": 25.4497, "lon": 81.8282, "zone": "NCR", "water_refill": True, "capacity": 35000.0},
    "BSB": {"code": "BSB", "name": "Varanasi Junction", "lat": 25.3273, "lon": 82.9865, "zone": "NR", "water_refill": True, "capacity": 30000.0},
    "MUV": {"code": "MUV", "name": "Banaras", "lat": 25.3000, "lon": 82.9721, "zone": "NER", "water_refill": True, "capacity": 20000.0},
    "BNRS": {"code": "BNRS", "name": "Banaras", "lat": 25.3000, "lon": 82.9721, "zone": "NER", "water_refill": True, "capacity": 20000.0},
    "DDN": {"code": "DDN", "name": "Dehradun", "lat": 30.3140, "lon": 78.0336, "zone": "NR", "water_refill": True, "capacity": 20000.0},
    "MAS": {"code": "MAS", "name": "Chennai Central", "lat": 13.0848, "lon": 80.2749, "zone": "SR", "water_refill": True, "capacity": 50000.0},
    "SBC": {"code": "SBC", "name": "KSR Bengaluru", "lat": 12.9776, "lon": 77.5681, "zone": "SWR", "water_refill": True, "capacity": 45000.0},
    "BKN": {"code": "BKN", "name": "Bikaner Junction", "lat": 28.0141, "lon": 73.3166, "zone": "NWR", "water_refill": True, "capacity": 20000.0},
    "BDTS": {"code": "BDTS", "name": "Mumbai Bandra Terminus", "lat": 19.0619, "lon": 72.8405, "zone": "WR", "water_refill": True, "capacity": 40000.0},
    "MMCT": {"code": "MMCT", "name": "Mumbai Central", "lat": 18.9696, "lon": 72.8193, "zone": "WR", "water_refill": True, "capacity": 50000.0},
    "CSTM": {"code": "CSTM", "name": "Mumbai CSMT", "lat": 18.9445, "lon": 72.8369, "zone": "CR", "water_refill": True, "capacity": 50000.0},
    "RKMP": {"code": "RKMP", "name": "Rani Kamlapati", "lat": 23.2081, "lon": 77.4373, "zone": "WCR", "water_refill": True, "capacity": 25000.0},
    "BPL": {"code": "BPL", "name": "Bhopal Junction", "lat": 23.2687, "lon": 77.4116, "zone": "WCR", "water_refill": True, "capacity": 35000.0},
    "GWL": {"code": "GWL", "name": "Gwalior Junction", "lat": 26.2166, "lon": 78.1887, "zone": "NCR", "water_refill": True, "capacity": 25000.0},
    "AGC": {"code": "AGC", "name": "Agra Cantt", "lat": 27.1591, "lon": 78.0063, "zone": "NCR", "water_refill": True, "capacity": 30000.0},
    "KGP": {"code": "KGP", "name": "Kharagpur Junction", "lat": 22.3391, "lon": 87.3256, "zone": "SER", "water_refill": True, "capacity": 30000.0},
    "BBS": {"code": "BBS", "name": "Bhubaneswar", "lat": 20.2666, "lon": 85.8436, "zone": "ECoR", "water_refill": True, "capacity": 30000.0},
    "PURI": {"code": "PURI", "name": "Puri", "lat": 19.8135, "lon": 85.8312, "zone": "ECoR", "water_refill": True, "capacity": 25000.0},
    "VSKP": {"code": "VSKP", "name": "Visakhapatnam", "lat": 17.7212, "lon": 83.2878, "zone": "ECoR", "water_refill": True, "capacity": 35000.0},
    "BZA": {"code": "BZA", "name": "Vijayawada Junction", "lat": 16.5186, "lon": 80.6200, "zone": "SCR", "water_refill": True, "capacity": 40000.0},
    "SC": {"code": "SC", "name": "Secunderabad Junction", "lat": 17.4344, "lon": 78.5015, "zone": "SCR", "water_refill": True, "capacity": 40000.0},
    "PNBE": {"code": "PNBE", "name": "Patna Junction", "lat": 25.6019, "lon": 85.1376, "zone": "ECR", "water_refill": True, "capacity": 35000.0},
    "PUNE": {"code": "PUNE", "name": "Pune Junction", "lat": 18.5284, "lon": 73.8739, "zone": "CR", "water_refill": True, "capacity": 35000.0},
    "NGP": {"code": "NGP", "name": "Nagpur Junction", "lat": 21.1528, "lon": 79.0882, "zone": "CR", "water_refill": True, "capacity": 35000.0},
    "GKP": {"code": "GKP", "name": "Gorakhpur Junction", "lat": 26.7588, "lon": 83.3820, "zone": "NER", "water_refill": True, "capacity": 30000.0},
    "LKO": {"code": "LKO", "name": "Lucknow Charbagh", "lat": 26.8313, "lon": 80.9228, "zone": "NR", "water_refill": True, "capacity": 40000.0},
    "JAT": {"code": "JAT", "name": "Jammu Tawi", "lat": 32.7061, "lon": 74.8800, "zone": "NR", "water_refill": True, "capacity": 25000.0},
    "UHP": {"code": "UHP", "name": "Udhampur", "lat": 32.9262, "lon": 75.0003, "zone": "NR", "water_refill": True, "capacity": 15000.0},
    "KQU": {"code": "KQU", "name": "Kamarkundu", "lat": 22.8272, "lon": 88.1969, "zone": "ER", "water_refill": False, "capacity": 0.0},
    "PAN": {"code": "PAN", "name": "Panagarh", "lat": 23.4518, "lon": 87.4382, "zone": "ER", "water_refill": False, "capacity": 0.0},
}


class StationService:
    """Provides station coordinates resolution from DataMeet and verified stations cache."""

    _index: Optional[Dict[str, Dict[str, Any]]] = None
    _trains_index: Optional[Dict[str, Dict[str, Any]]] = None

    @classmethod
    def _load_index(cls) -> Dict[str, Dict[str, Any]]:
        if cls._index is not None:
            return cls._index

        cls._index = {}
        # 1. Start with verified major stations
        cls._index.update(VERIFIED_MAJOR_STATIONS)

        # 2. Load disk index if available
        index_file = Path(__file__).resolve().parent.parent.parent / "data" / "datameet_stations_index.json"
        if index_file.exists():
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    disk_data = json.load(f)
                    for code, data in disk_data.items():
                        clean_c = code.strip().upper()
                        if clean_c not in cls._index:
                            cls._index[clean_c] = data
                logger.info(f"Loaded {len(cls._index)} stations into StationService cache.")
            except Exception as e:
                logger.warning(f"Failed to load datameet_stations_index.json: {e}")

        return cls._index

    @classmethod
    def _load_trains_index(cls) -> Dict[str, Dict[str, Any]]:
        if cls._trains_index is not None:
            return cls._trains_index

        cls._trains_index = {}
        backend_data_dir = Path(__file__).resolve().parent.parent.parent / "data"

        # Try express_trains_db.json first
        exp_file = backend_data_dir / "express_trains_db.json"
        if exp_file.exists():
            try:
                with open(exp_file, "r", encoding="utf-8") as f:
                    data = json.load(f).get("by_number", {})
                    cls._trains_index.update(data)
            except Exception as e:
                logger.warning(f"Failed loading express_trains_db.json: {e}")

        # Try datameet_trains_index.json
        dm_file = backend_data_dir / "datameet_trains_index.json"
        if dm_file.exists():
            try:
                with open(dm_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for num, info in data.items():
                        if num not in cls._trains_index:
                            cls._trains_index[num] = {
                                "train_number": num,
                                "train_name": info.get("name"),
                                "source_code": info.get("from_station_code"),
                                "source_station": info.get("from_station_name"),
                                "destination_code": info.get("to_station_code"),
                                "destination_station": info.get("to_station_name"),
                                "railway_zone": info.get("zone"),
                            }
            except Exception as e:
                logger.warning(f"Failed loading datameet_trains_index.json: {e}")

        return cls._trains_index

    @classmethod
    def get_station_coords(cls, station_code: Optional[str]) -> Optional[Tuple[float, float, str]]:
        """Resolve station coordinates: returns (latitude, longitude, station_name) or None."""
        if not station_code:
            return None

        clean = station_code.strip().upper()
        # Check alias
        lookup_code = STATION_ALIASES.get(clean, clean)

        idx = cls._load_index()
        info = idx.get(lookup_code) or idx.get(clean)
        if info:
            lat = info.get("lat") or info.get("latitude")
            lon = info.get("lon") or info.get("longitude")
            name = info.get("name") or clean
            if lat is not None and lon is not None:
                return float(lat), float(lon), str(name)

        return None

    @classmethod
    def get_station_info(cls, station_code: Optional[str]) -> Optional[Dict[str, Any]]:
        """Retrieve full station info dictionary if available."""
        if not station_code:
            return None
        clean = station_code.strip().upper()
        lookup_code = STATION_ALIASES.get(clean, clean)
        idx = cls._load_index()
        return idx.get(lookup_code) or idx.get(clean)

    @classmethod
    def lookup_train_terminals(cls, train_number: str) -> Optional[Tuple[str, str, str, str]]:
        """Find official (source_code, source_name, destination_code, destination_name) for train."""
        clean = train_number.strip()
        trains_idx = cls._load_trains_index()
        info = trains_idx.get(clean)
        if info:
            src_c = info.get("source_code") or info.get("from_station_code")
            src_n = info.get("source_station") or info.get("from_station_name") or src_c
            dst_c = info.get("destination_code") or info.get("to_station_code")
            dst_n = info.get("destination_station") or info.get("to_station_name") or dst_c
            if src_c and dst_c:
                return str(src_c).strip().upper(), str(src_n).strip(), str(dst_c).strip().upper(), str(dst_n).strip()
        return None
