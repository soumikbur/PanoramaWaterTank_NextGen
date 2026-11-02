"""Panorama Water Tank Monitor — Realistic Edge Telemetry Simulator.

Simulates railway coach edge hardware emitting continuous telemetry frames over MQTT
or via REST API fallback. Simulates realistic passenger water consumption, train dynamics,
GPS progression along the railway corridor, and refilling at stations.
"""
import argparse
import json
import math
import random
import time
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

# Delhi to Agra Railway Coordinates
STATION_A = (28.6139, 77.2090)  # New Delhi
STATION_B = (27.1767, 78.0081)  # Agra Cantt


def simulate_train_run(
    broker: str,
    port: int,
    uid: str,
    train_no: str,
    coach_no: str,
    interval: float,
    frames: int = 0
):
    print(f"[*] Starting Railway Telemetry Simulator for Train {train_no}, Coach {coach_no} (UID: {uid})")
    print(f"[*] Target MQTT Broker: {broker}:{port}")

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"sim-{uid}"
    )

    try:
        client.connect(broker, port, keepalive=60)
        client.loop_start()
        print("[+] Connected to MQTT Broker successfully.")
    except Exception as e:
        print(f"[-] Could not connect to MQTT broker ({e}). Simulation running in dry-run mode.")
        client = None

    water_level = 88.0
    progress = 0.0
    tick = 0

    topic = f"panorama/telemetry/{uid}"

    try:
        while True:
            tick += 1
            # Consumption logic: gentle drain, occasional refills
            water_level -= random.uniform(0.1, 0.4)
            if water_level < 8.0:
                print("[!] Water reached critical low level (<10%). Simulating station refilling...")
                water_level = 95.0

            # GPS interpolation
            progress = (progress + 0.005) % 1.0
            lat = STATION_A[0] + (STATION_B[0] - STATION_A[0]) * progress + random.uniform(-0.001, 0.001)
            lon = STATION_A[1] + (STATION_B[1] - STATION_A[1]) * progress + random.uniform(-0.001, 0.001)
            speed = 75.0 + 20.0 * math.sin(tick * 0.1) + random.uniform(-2.0, 2.0)
            battery = 12.5 + 0.2 * math.cos(tick * 0.05) + random.uniform(-0.05, 0.05)

            payload = {
                "uid": uid,
                "trno": train_no,
                "chno": coach_no,
                "wlp1": round(water_level, 1),
                "wlp2": round(max(0.0, water_level - 1.5), 1),
                "wlvl": True,
                "wlv2": True,
                "lat": round(lat, 5),
                "long": round(lon, 5),
                "alt": 215.0,
                "speed": round(max(0.0, speed), 1),
                "sats": random.randint(8, 12),
                "v1": round(battery, 2),
                "v2": round(battery - 0.1, 2),
                "dt": datetime.now(timezone.utc).isoformat()
            }

            payload_json = json.dumps(payload)
            if client:
                client.publish(topic, payload_json, qos=1)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Published to {topic}: Level={payload['wlp1']}%, Vol={payload['wlp1']*0.2:.1f}L, Speed={payload['speed']}km/h")
            else:
                print(f"[DRY-RUN] {payload_json}")

            time.sleep(interval)
            if frames > 0 and tick >= frames:
                print(f"[+] Reached {frames} frames. Done.")
                break
    except KeyboardInterrupt:
        print("\n[*] Stopping simulator...")
        if client:
            client.loop_stop()
            client.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Panorama Edge Telemetry Simulator")
    parser.add_argument("--broker", default="broker.hivemq.com", help="MQTT Broker Host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT Broker Port")
    parser.add_argument("--uid", default="0026004D4B42501120353332", help="Device UID")
    parser.add_argument("--train", default="12002", help="Train Number")
    parser.add_argument("--coach", default="B4", help="Coach Number")
    parser.add_argument("--interval", type=float, default=3.0, help="Interval in seconds")
    parser.add_argument("--frames", type=int, default=0, help="Number of frames (0 = infinite)")

    args = parser.parse_args()
    simulate_train_run(
        broker=args.broker,
        port=args.port,
        uid=args.uid,
        train_no=args.train,
        coach_no=args.coach,
        interval=args.interval,
        frames=args.frames
    )

