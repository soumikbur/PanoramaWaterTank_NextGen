"""MQTT Ingestion Client.

Maintains an authenticated, secure connection to the MQTT broker, subscribes to
telemetry topics, persists readings, evaluates alarms, and broadcasts real-time
updates to WebSockets.
"""
import asyncio
import json
import logging
import ssl
from datetime import datetime, timezone
from typing import Optional, Any
import paho.mqtt.client as mqtt

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.mqtt.parser import TelemetryParser
from app.schemas.telemetry import MqttTelemetryPayload
from app.repositories.device_repo import DeviceRepository
from app.repositories.tank_repo import TankRepository
from app.repositories.telemetry_repo import TelemetryRepository
from app.repositories.alarm_repo import AlarmRepository
from app.core.device_identity import is_genuine_hardware_uid, get_canonical_uid
from app.services.calculator import VolumeCalculator
from app.services.alarm_service import AlarmService
from sqlalchemy import select
from app.models.telemetry import TelemetryReading
from app.models.train import Train
from app.websocket.manager import ws_manager

logger = logging.getLogger("panorama.mqtt")


class MqttService:
    """Manages MQTT connection and event handling."""

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected: bool = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def initialize(self, loop: asyncio.AbstractEventLoop) -> None:
        """Configure and start the MQTT client."""
        self._loop = loop
        client_id = f"{settings.MQTT_CLIENT_ID_PREFIX}-worker"
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            clean_session=True
        )

        # Authentication
        if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
            self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)

        # TLS Configuration
        if settings.MQTT_USE_TLS:
            self.client.tls_set(
                tls_version=ssl.PROTOCOL_TLS_CLIENT,
                cert_reqs=ssl.CERT_REQUIRED
            )

        # Callbacks
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def start(self) -> None:
        """Connect to broker and start background network thread."""
        if not self.client:
            logger.warning("MQTT Client not initialized before start.")
            return

        port = settings.MQTT_TLS_PORT if settings.MQTT_USE_TLS else settings.MQTT_BROKER_PORT
        logger.info(f"Connecting to MQTT Broker at {settings.MQTT_BROKER_HOST}:{port}...")
        try:
            self.client.connect_async(settings.MQTT_BROKER_HOST, port, keepalive=45)
            self.client.loop_start()
        except Exception as e:
            logger.error(f"Failed to start MQTT connection: {e}")

    def stop(self) -> None:
        """Stop background network thread and disconnect."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.is_connected = False
            logger.info("MQTT Client stopped.")

    def publish(self, topic: str, payload: Any, qos: int = 1, retain: bool = False) -> bool:
        """Publish payload (dict or str) to concrete MQTT topic and retain in backend."""
        if not self.client:
            logger.warning("MQTT client not available for publish.")
            return False
        try:
            body = (
                json.dumps(payload, default=str)
                if not isinstance(payload, (str, bytes))
                else (payload.decode("utf-8", errors="replace") if isinstance(payload, bytes) else payload)
            )
            res = self.client.publish(topic, body, qos=qos, retain=retain)
            success = res.rc == mqtt.MQTT_ERR_SUCCESS

            # Retain outgoing message in backend registry if published successfully
            if success and self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.persist_topic_message(
                        topic=topic,
                        raw_payload=body,
                        qos=qos,
                        retained=retain,
                        received_at=datetime.now(timezone.utc),
                    ),
                    self._loop,
                )

            return success
        except Exception as e:
            logger.error(f"Error publishing to {topic}: {e}")
            return False

    def _on_connect(self, client: mqtt.Client, userdata: Any, flags: Any, rc: Any, properties: Any = None) -> None:
        rc_code = getattr(rc, "value", rc)
        if rc_code == 0:
            self.is_connected = True
            logger.info(f"Connected to MQTT Broker successfully! Subscribing to: {settings.MQTT_TELEMETRY_TOPIC}")
            client.subscribe(settings.MQTT_TELEMETRY_TOPIC, qos=1)
            client.subscribe(settings.MQTT_STATUS_TOPIC, qos=1)
            client.subscribe("panorama/sync/#", qos=1)
            # Support edge devices publishing directly to root UID topics
            client.subscribe("+", qos=1)
            client.subscribe("+/s", qos=1)
        else:
            logger.error(f"MQTT Connection failed with return code {rc_code}")

    def _on_disconnect(self, client: mqtt.Client, userdata: Any, disconnect_flags_or_rc: Any, rc: Any = None, properties: Any = None) -> None:
        self.is_connected = False
        logger.warning("Disconnected from MQTT Broker. Auto-reconnect active.")

    def _on_message(self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
        """Handle incoming telemetry message and persist latest topic message."""
        try:
            raw_payload_str = (
                msg.payload.decode("utf-8", errors="replace")
                if isinstance(msg.payload, (bytes, bytearray))
                else str(msg.payload)
            )
            retained_flag = getattr(msg, "retain", False) or False

            # 1. Authoritative persistence: Always retain latest message for every distinct MQTT topic
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.persist_topic_message(
                        topic=msg.topic,
                        raw_payload=raw_payload_str,
                        qos=msg.qos,
                        retained=retained_flag,
                        received_at=datetime.now(timezone.utc),
                    ),
                    self._loop,
                )

            # 2. Domain telemetry processing: check if payload matches water tank telemetry schema
            payload = TelemetryParser.parse_payload(msg.payload)
            if payload and self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.process_telemetry(payload, msg.topic),
                    self._loop,
                )
        except Exception as e:
            logger.error(f"Error handling MQTT message: {e}")

    async def persist_topic_message(
        self,
        topic: str,
        raw_payload: str,
        qos: int = 0,
        retained: bool = False,
        received_at: Optional[datetime] = None,
    ) -> Optional[dict]:
        """Persist latest valid payload for topic in database and broadcast to WebSockets."""
        async with AsyncSessionLocal() as session:
            try:
                from app.repositories.mqtt_latest_repo import MqttLatestRepository
                repo = MqttLatestRepository(session)
                record = await repo.upsert(
                    topic=topic,
                    payload=raw_payload,
                    qos=qos,
                    retained=retained,
                    received_at=received_at or datetime.now(timezone.utc),
                )
                await session.commit()
                msg_dict = record.to_dict()

                # Broadcast live update across all connected clients via WebSocket
                try:
                    await ws_manager.broadcast("MQTT_TOPIC_UPDATE", msg_dict)
                except Exception as ws_err:
                    logger.debug(f"WS broadcast warning: {ws_err}")

                return msg_dict
            except Exception as e:
                await session.rollback()
                logger.error(f"Error persisting latest MQTT topic record for '{topic}': {e}")
                return None

    async def process_telemetry(self, payload: MqttTelemetryPayload, topic: str) -> None:
        """Asynchronously process validated telemetry into database and WebSockets."""
        async with AsyncSessionLocal() as session:
            try:
                device_repo = DeviceRepository(session)
                tank_repo = TankRepository(session)
                telemetry_repo = TelemetryRepository(session)
                alarm_repo = AlarmRepository(session)

                clean_trno = str(payload.trno or "").strip()
                clean_chno = str(payload.chno or "").strip()
                canonical_uid = get_canonical_uid(payload.uid)
                is_hw_uid = is_genuine_hardware_uid(payload.uid)
                now_utc = datetime.now(timezone.utc)

                configured_train = None
                if clean_trno:
                    configured_train = (
                        await session.execute(
                            select(Train).where(Train.train_number == clean_trno, Train.is_deleted == False)
                        )
                    ).scalar_one_or_none()

                is_configured_coach_fixture = (
                    not is_hw_uid
                    and configured_train is not None
                    and bool(clean_chno)
                    and canonical_uid.upper() == f"PANORAMA-{clean_trno}-{clean_chno}".upper()
                )

                if not is_hw_uid and not is_configured_coach_fixture:
                    logger.warning("Ignoring unverified or non-hardware UID '%s' from MQTT telemetry.", payload.uid)
                    return

                device = await device_repo.get_by_uid(canonical_uid)

                if not device:
                    # Physical hardware starts UNASSIGNED until an administrator maps it;
                    # configured train coach fixtures bind to their active configured train.
                    device = await device_repo.create_or_update(
                        uid=canonical_uid,
                        train_number=clean_trno if is_configured_coach_fixture else "UNASSIGNED",
                        coach_number=clean_chno if is_configured_coach_fixture else "UNASSIGNED",
                        name=(
                            f"Coach {clean_chno} Controller"
                            if is_configured_coach_fixture
                            else f"WLI Node ({canonical_uid[-6:]})"
                        ),
                        status="ENGAGED" if is_configured_coach_fixture else "AVAILABLE",
                        is_online=True,
                        last_seen_at=now_utc,
                    )
                    logger.info(f"Discovered new edge hardware node '{canonical_uid}' via MQTT.")
                else:
                    # Preserve administrator consist mapping; only clear if mapped train was deleted
                    assigned_tr = (device.train_number or "").strip()
                    if assigned_tr and assigned_tr.upper() != "UNASSIGNED":
                        mapped_train = (
                            await session.execute(
                                select(Train).where(Train.train_number == assigned_tr, Train.is_deleted == False)
                            )
                        ).scalar_one_or_none()
                        if mapped_train is None:
                            device.train_number = "UNASSIGNED"
                            device.coach_number = "UNASSIGNED"
                            device.status = "AVAILABLE"
                        else:
                            device.status = "ENGAGED"
                    else:
                        device.status = "AVAILABLE"
                    device.is_online = True
                    device.last_seen_at = now_utc
                    await session.flush()

                # 2. Fetch Primary Tank
                primary_tank = await tank_repo.get_by_device_and_index(device.id, 1)
                capacity = primary_tank.capacity_liters if primary_tank else 20.0
                max_height = primary_tank.height_cm if primary_tank else 50.0
                area = primary_tank.area_m2 if primary_tank else 0.04

                # 3. Calculate Volume & Geometry
                calc_metrics = VolumeCalculator.evaluate_metrics(
                    raw_level_percent=payload.wlp1,
                    capacity_liters=capacity,
                    max_height_cm=max_height,
                    area_m2=area
                )

                # 4. Parse timestamp
                try:
                    ts = datetime.fromisoformat(payload.dt.replace("Z", "+00:00")) if payload.dt else datetime.now(timezone.utc)
                except Exception:
                    ts = datetime.now(timezone.utc)

                effective_bat = payload.bat if payload.bat is not None else payload.v1
                effective_valid = payload.wlvl if payload.wlvl is not None else (payload.wlv1 if payload.wlv1 is not None else True)

                # 5. Insert Telemetry Record
                reading = TelemetryReading(
                    device_id=device.id,
                    tank_id=primary_tank.id if primary_tank else None,
                    timestamp=ts,
                    raw_level_percent=calc_metrics["raw_level_percent"],
                    level_percent=calc_metrics["level_percent"],
                    volume_liters=calc_metrics["volume_liters"],
                    height_cm=calc_metrics["water_height_cm"],
                    sensor_valid=effective_valid,
                    latitude=payload.lat,
                    longitude=payload.effective_longitude,
                    altitude=payload.alt,
                    speed_kmh=payload.speed,
                    satellites=payload.sats,
                    battery_v1=effective_bat,
                    auxiliary_v2=payload.v2,
                    raw_payload=payload.model_dump_json()
                )
                await telemetry_repo.insert(reading)

                # 6. Evaluate Alarms
                crit_thresh = primary_tank.critical_threshold_percent if primary_tank else 10.0
                warn_thresh = primary_tank.warning_threshold_percent if primary_tank else 20.0
                over_thresh = primary_tank.overflow_threshold_percent if primary_tank else 100.0

                detected_alarms = AlarmService.evaluate_reading(
                    raw_level_percent=payload.wlp1,
                    sensor_valid=effective_valid,
                    battery_voltage=effective_bat,
                    critical_threshold=crit_thresh,
                    warning_threshold=warn_thresh,
                    overflow_threshold=over_thresh
                )

                for alarm_data in detected_alarms:
                    existing = await alarm_repo.get_active_by_type(
                        device.id,
                        primary_tank.id if primary_tank else None,
                        alarm_data["alarm_type"]
                    )
                    if not existing:
                        new_alarm = await alarm_repo.create_alarm(
                            device_id=device.id,
                            tank_id=primary_tank.id if primary_tank else None,
                            alarm_type=alarm_data["alarm_type"],
                            severity=alarm_data["severity"],
                            trigger_value=alarm_data["trigger_value"],
                            threshold_value=alarm_data["threshold_value"],
                            message=alarm_data["message"]
                        )
                        # Broadcast Alarm Triggered
                        await ws_manager.broadcast("ALARM_TRIGGERED", {
                            "alarmId": new_alarm.id,
                            "type": new_alarm.alarm_type,
                            "severity": new_alarm.severity,
                            "message": new_alarm.message,
                            "timestamp": new_alarm.triggered_at
                        })

                # Check if alarms resolved
                open_alarms = await alarm_repo.list_alarms(status="OPEN", device_id=device.id)
                detected_types = {a["alarm_type"] for a in detected_alarms}
                for act in open_alarms:
                    if act.alarm_type not in detected_types:
                        await alarm_repo.resolve_alarm(act)
                        await ws_manager.broadcast("ALARM_RESOLVED", {
                            "alarmId": act.id,
                            "type": act.alarm_type,
                            "timestamp": datetime.now(timezone.utc)
                        })

                await session.commit()

                # 7. Broadcast Live Telemetry to WebSockets
                broadcast_data = {
                    "deviceId": device.id,
                    "deviceUid": device.uid,
                    "trainNumber": device.train_number,
                    "coachNumber": device.coach_number,
                    "timestamp": ts.isoformat(),
                    "primaryLevel": calc_metrics["level_percent"],
                    "rawLevel": calc_metrics["raw_level_percent"],
                    "primaryVolume": calc_metrics["volume_liters"],
                    "primaryHeight": calc_metrics["water_height_cm"],
                    "primaryRank": calc_metrics["rank"],
                    "capacityLiters": calc_metrics["capacity_liters"],
                    "secondaryLevel": payload.wlp2,
                    "batteryVoltage": effective_bat,
                    "gpsSpeed": payload.speed,
                    "status": AlarmService.determine_overall_status(detected_alarms),
                    "isOnline": True
                }
                await ws_manager.broadcast("TELEMETRY_UPDATE", broadcast_data)

            except Exception as e:
                await session.rollback()
                logger.error(f"Error processing telemetry frame: {e}")


mqtt_service = MqttService()

