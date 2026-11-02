export interface SettingItem {
  key: string;
  category: string;
  value: any;
  description?: string;
  updatedAt: string;
}

export interface MqttConfig {
  brokerHost: string;
  brokerPort: number;
  tlsPort: number;
  useTls: boolean;
  username?: string;
  password?: string;
  clientIdPrefix: string;
}

export interface UnifiedSettings {
  mqtt_broker: string;
  mqtt_port: number;
  mqtt_use_tls: boolean;
  mqtt_topic: string;
  device_host: string;
  device_port: number;
  device_refresh_interval: number;
  ubidots_host: string;
  ubidots_device_label: string;
  ubidots_token: string;

  tank_shape: 'CYLINDRICAL' | 'RECTANGULAR' | string;
  tank_height_cm: number;
  tank_diameter_cm: number;
  tank_capacity_liters: number;
  tank_area_m2: number;

  sensor_type: string;
  sensor_zero_offset_cm: number;
  sensor_span_cm: number;
  sensor_filter_constant_sec: number;
  sensor_invert: boolean;

  alarm_warning_percent: number;
  alarm_critical_percent: number;
  alarm_overflow_percent: number;
}
