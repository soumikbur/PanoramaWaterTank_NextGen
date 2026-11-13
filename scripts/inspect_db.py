import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '../backend/panorama_dev.db')
con = sqlite3.connect(db_path)
cur = con.cursor()

print("--- TRAINS ---")
for row in cur.execute("SELECT train_number, name, region, source_station, destination_station, route_json FROM trains").fetchall():
    print(row[0], "|", row[1], "|", row[2], "|", row[3], "->", row[4], "| route halts:", len(row[5]) if row[5] else 0)

print("\n--- DEVICES ---")
for row in cur.execute("SELECT id, uid, train_number, coach_number, is_online, last_seen_at FROM devices").fetchall():
    print(row)

print("\n--- RECENT GPS READINGS ---")
for row in cur.execute("SELECT id, device_id, timestamp, latitude, longitude, speed_kmh FROM telemetry_readings WHERE latitude IS NOT NULL ORDER BY timestamp DESC LIMIT 5").fetchall():
    print(row)

con.close()

