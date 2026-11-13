// apps/mobile/scripts/audit_preload.cjs
// Preload script to isolate audit test runs from public MQTT broker spam and ensure clean start
try {
  window.localStorage.removeItem('panorama_token');
  window.localStorage.removeItem('panorama_user');
  window.localStorage.setItem('panorama_mqtt_host', '127.0.0.1');
  window.localStorage.setItem('panorama_mqtt_port', '1883');
} catch (e) {
  // Ignore in isolated contexts
}
