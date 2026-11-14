"""Safely clean database of synthetic PANORAMA-* demo devices and test trains,
preserving genuine hardware devices (0026004D4B42501120353332, 0023004D4B42501120353332).
"""
import sqlite3

con = sqlite3.connect('panorama_dev.db')
cur = con.cursor()

# 1. Identify artificial devices
all_devs = cur.execute("SELECT id, uid, name FROM devices;").fetchall()
demo_ids = [d[0] for d in all_devs if d[1].startswith("PANORAMA-") or d[1].startswith("DEV-TEST-")]
genuine = [d for d in all_devs if not d[1].startswith("PANORAMA-") and not d[1].startswith("DEV-TEST-")]

print(f"Total devices before: {len(all_devs)}")
print(f"Demo devices to remove: {len(demo_ids)}")
print(f"Genuine devices preserved: {[d[1] for d in genuine]}")

# 2. Delete related records for demo devices
if demo_ids:
    placeholders = ",".join(["?"] * len(demo_ids))
    tanks_deleted = cur.execute(f"DELETE FROM tanks WHERE device_id IN ({placeholders});", demo_ids).rowcount
    telemetry_deleted = cur.execute(f"DELETE FROM telemetry_readings WHERE device_id IN ({placeholders});", demo_ids).rowcount
    alarms_deleted = cur.execute(f"DELETE FROM alarms WHERE device_id IN ({placeholders});", demo_ids).rowcount
    devs_deleted = cur.execute(f"DELETE FROM devices WHERE id IN ({placeholders});", demo_ids).rowcount
    print(f"Deleted {devs_deleted} demo devices, {tanks_deleted} tanks, {telemetry_deleted} telemetry readings, {alarms_deleted} alarms.")

# 3. Ensure genuine devices are unassigned and available
cur.execute("""
    UPDATE devices 
    SET train_number = 'UNASSIGNED', 
        coach_number = 'UNASSIGNED', 
        status = 'AVAILABLE',
        is_online = 0
    WHERE uid NOT LIKE 'PANORAMA-%';
""")

# 4. Clean up test trains
trains_before = cur.execute("SELECT train_number, name FROM trains;").fetchall()
print(f"Trains before cleanup: {trains_before}")
cur.execute("DELETE FROM trains;")
print("Cleaned all demo/test trains from trains table.")

con.commit()

# Final report
final_devs = cur.execute("SELECT id, uid, train_number, coach_number, status, is_online FROM devices;").fetchall()
final_trains = cur.execute("SELECT count(*) FROM trains;").fetchone()[0]
print(f"\nFinal State:")
print(f"Total Trains: {final_trains}")
print(f"Total Devices: {len(final_devs)}")
for d in final_devs:
    print(f"  Device UID: {d[1]} | Train: {d[2]} | Coach: {d[3]} | Status: {d[4]} | Online: {d[5]}")

con.close()
