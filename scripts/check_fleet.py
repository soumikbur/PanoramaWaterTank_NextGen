import urllib.request
import json

url = "http://127.0.0.1:8000/api/v1/location"
req = urllib.request.urlopen(url)
data = json.loads(req.read().decode())

print(f"Total Trains returned: {len(data)}")
for t in data:
    tr = t.get("train_number")
    name = t.get("train_name", "")
    has_rt = t.get("has_route", False)
    stops = t.get("route_stops_count", 0)
    has_gps = t.get("has_gps", False)
    lat = t.get("current_latitude")
    lon = t.get("current_longitude")
    print(f"Train {tr:10} | {name:35} | Route: {str(has_rt):5} ({stops} stops) | GPS: {str(has_gps):5} ({lat}, {lon})")
