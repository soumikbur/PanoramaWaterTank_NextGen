"""
MQTT Local-to-Cloud Bridge Utility.
Bridges local Mosquitto broker (127.0.0.1:1883) to HiveMQ Cloud (broker.hivemq.com:1883).
Forwards incoming hardware telemetry frames from topic 002F00654B42501203203533332 and panorama/#.
"""
import time
import json
import paho.mqtt.client as mqtt

LOCAL_BROKER = "127.0.0.1"
LOCAL_PORT = 1883
CLOUD_BROKER = "broker.hivemq.com"
CLOUD_PORT = 1883

TOPICS = [
    ("002F00654B42501203203533332", 0),
    ("002F00654B42501203203533332/#", 0),
    ("0023004D4B42501120353332", 0),
    ("0023004D4B42501120353332/#", 0),
    ("panorama/telemetry/#", 0),
]

cloud_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2 if hasattr(mqtt, 'CallbackAPIVersion') else None, client_id="panorama-local-cloud-bridge-out")
cloud_connected = False

def on_cloud_connect(client, userdata, flags, rc, properties=None):
    global cloud_connected
    cloud_connected = True
    print(f"[BRIDGE] Connected to Cloud Broker ({CLOUD_BROKER}:{CLOUD_PORT})")

cloud_client.on_connect = on_cloud_connect

try:
    cloud_client.connect(CLOUD_BROKER, CLOUD_PORT, 60)
    cloud_client.loop_start()
except Exception as e:
    print(f"[BRIDGE] Warning: Cloud connect failed: {e}")

local_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2 if hasattr(mqtt, 'CallbackAPIVersion') else None, client_id="panorama-local-cloud-bridge-in")

def on_local_connect(client, userdata, flags, rc, properties=None):
    print(f"[BRIDGE] Connected to Local Mosquitto ({LOCAL_BROKER}:{LOCAL_PORT}). Subscribing...")
    for t, q in TOPICS:
        client.subscribe(t, q)
        print(f"  Subscribed to local topic: {t}")

def on_local_message(client, userdata, msg):
    payload_str = msg.payload.decode('utf-8', errors='ignore')
    print(f"[BRIDGE] Forwarding {len(msg.payload)} bytes from local {msg.topic} -> Cloud...")
    try:
        cloud_client.publish(msg.topic, msg.payload, qos=msg.qos, retain=msg.retain)
    except Exception as e:
        print(f"[BRIDGE] Forward error: {e}")

local_client.on_connect = on_local_connect
local_client.on_message = on_local_message

def run():
    print("[BRIDGE] Starting MQTT Local -> Cloud Bridge Service...")
    try:
        local_client.connect(LOCAL_BROKER, LOCAL_PORT, 60)
        local_client.loop_forever()
    except KeyboardInterrupt:
        print("[BRIDGE] Stopping...")
    finally:
        local_client.disconnect()
        cloud_client.disconnect()

if __name__ == "__main__":
    run()
