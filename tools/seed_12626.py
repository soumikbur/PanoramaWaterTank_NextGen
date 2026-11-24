import sqlite3, json, uuid
from datetime import datetime, timezone

conn = sqlite3.connect('c:/Users/User/Documents/Antigravity_soumik/PanoramaWaterTank_NextGen/backend/panorama_dev.db')
c = conn.cursor()

coaches = [
    { "position": 1, "coach_number": "SLRD", "coach_category": "Sleeper Class (SL)", "coach_type": "SLRD", "device_uid": "0026004D4B42501120353332" },
    { "position": 2, "coach_number": "S1", "coach_category": "Sleeper", "coach_type": "Sleeper", "device_uid": "" },
    { "position": 3, "coach_number": "S2", "coach_category": "Sleeper", "coach_type": "Sleeper", "device_uid": "" },
    { "position": 4, "coach_number": "B1", "coach_category": "AC", "coach_type": "AC 3-Tier (3A)", "device_uid": "" },
    { "position": 5, "coach_number": "B2", "coach_category": "AC", "coach_type": "AC 3-Tier (3A)", "device_uid": "" },
    { "position": 6, "coach_number": "A1", "coach_category": "AC", "coach_type": "AC 2-Tier (2A)", "device_uid": "" }
]

c.execute("SELECT id FROM trains WHERE train_number = '12626'")
row = c.fetchone()
now_iso = datetime.now(timezone.utc).isoformat()

if row:
    c.execute("""
        UPDATE trains
        SET name = 'Kerala Express', region = 'SOUTH', railway_zone = 'SR', train_type = 'Superfast Express',
            total_coaches = 6, coach_configuration_json = ?, updated_at = ?
        WHERE train_number = '12626'
    """, (json.dumps(coaches), now_iso))
else:
    c.execute("""
        INSERT INTO trains (
            id, train_number, name, source_station, source_code, destination_station, destination_code,
            region, railway_zone, train_type, coach_configuration_json, total_coaches,
            has_official_composition, created_at, updated_at
        ) VALUES (
            ?, '12626', 'Kerala Express', 'New Delhi', 'NDLS', 'Trivandrum Central', 'TVC',
            'SOUTH', 'SR', 'Superfast Express', ?, 6, 1, ?, ?
        )
    """, (f"train-{uuid.uuid4().hex[:8]}", json.dumps(coaches), now_iso, now_iso))

# Also ensure device 0026004D4B42501120353332 is assigned to 12626 / SLRD
c.execute("""
    UPDATE devices
    SET train_number = '12626', coach_number = 'SLRD', status = 'ENGAGED'
    WHERE uid = '0026004D4B42501120353332'
""")

conn.commit()
print("Successfully inserted / updated Train 12626 in panorama_dev.db!")
