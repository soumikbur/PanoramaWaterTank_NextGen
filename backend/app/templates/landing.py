"""Professional HTML Landing Page for Panorama Water Tank Monitor Backend."""

def get_landing_html(app_name: str, app_version: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{app_name} — SCADA & Telemetry API</title>
  <style>
    :root {{
      --bg-base: #0B0F19;
      --bg-card: #131C2E;
      --bg-card-hover: #1A263D;
      --border: #1E293B;
      --border-accent: #2563EB;
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --accent-blue: #3B82F6;
      --accent-cyan: #06B6D4;
      --accent-emerald: #10B981;
      --accent-amber: #F59E0B;
      --accent-red: #EF4444;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font);
      line-height: 1.5;
      padding: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }}
    .container {{
      max-width: 1140px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
      flex: 1;
      width: 100%;
    }}
    header {{
      border-bottom: 1px solid var(--border);
      background: rgba(11, 15, 25, 0.85);
      backdrop-filter: blur(8px);
      position: sticky;
      top: 0;
      z-index: 50;
    }}
    .nav-inner {{
      max-width: 1140px;
      margin: 0 auto;
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .brand {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--text-main);
    }}
    .brand-icon {{
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, #1D4ED8, #06B6D4);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
    }}
    .brand-title {{
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }}
    .brand-sub {{
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid transparent;
    }}
    .badge-primary {{
      background: rgba(59, 130, 246, 0.12);
      color: #93C5FD;
      border-color: rgba(59, 130, 246, 0.3);
    }}
    .badge-success {{
      background: rgba(16, 185, 129, 0.12);
      color: #6EE7B7;
      border-color: rgba(16, 185, 129, 0.3);
    }}
    .badge-amber {{
      background: rgba(245, 158, 11, 0.12);
      color: #FCD34D;
      border-color: rgba(245, 158, 11, 0.3);
    }}
    .pulse-dot {{
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
      animation: pulse 2s infinite;
    }}
    @keyframes pulse {{
      0%, 100% {{ opacity: 1; transform: scale(1); }}
      50% {{ opacity: 0.4; transform: scale(0.85); }}
    }}
    .hero {{
      margin-bottom: 2.5rem;
    }}
    .hero h1 {{
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #FFFFFF 40%, #94A3B8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
    .hero p {{
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 680px;
    }}
    .status-strip {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2.5rem;
    }}
    .status-card {{
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }}
    .status-label {{
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.04em;
    }}
    .status-value {{
      font-size: 1.15rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}
    .section-title {{
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }}
    .api-card {{
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      text-decoration: none;
      color: var(--text-main);
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}
    .api-card:hover {{
      background: var(--bg-card-hover);
      border-color: var(--accent-blue);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }}
    .api-card-header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }}
    .api-method {{
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      background: #1E3A8A;
      color: #93C5FD;
      font-family: monospace;
    }}
    .api-title {{
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 0.35rem;
    }}
    .api-path {{
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--accent-cyan);
      margin-bottom: 0.5rem;
    }}
    .api-desc {{
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.45;
    }}
    .card-footer {{
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.75rem;
      color: var(--accent-blue);
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
    }}
    .live-box {{
      background: linear-gradient(180deg, #131C2E, #0E1626);
      border: 1px solid #1E3A8A;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2.5rem;
    }}
    .live-box-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }}
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }}
    .metric-item {{
      background: rgba(11, 15, 25, 0.6);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem;
    }}
    .metric-label {{
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }}
    .metric-value {{
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-main);
      font-family: monospace;
    }}
    footer {{
      border-top: 1px solid var(--border);
      padding: 1.5rem;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      background: rgba(11, 15, 25, 0.95);
    }}
  </style>
</head>
<body>
  <header>
    <div class="nav-inner">
      <a href="/" class="brand">
        <div class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <div>
          <div class="brand-title">{app_name}</div>
          <div class="brand-sub">Railway SCADA Telemetry Gateway</div>
        </div>
      </a>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <span class="badge badge-primary">v{app_version}</span>
        <span class="badge badge-success"><span class="pulse-dot"></span> LIVE</span>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <div style="display:inline-block; margin-bottom: 0.5rem;">
        <span class="badge badge-primary">STM32 Embedded Architecture</span>
        <span class="badge badge-success">Pure Python FastAPI ASGI</span>
      </div>
      <h1>Industrial SCADA Telemetry API</h1>
      <p>Next-generation water level monitoring, volumetric analytics, and hardware telemetry gateway for Indian Railways passenger coach fleet operations.</p>
    </section>

    <!-- Real-time Diagnostics Strip -->
    <div class="status-strip">
      <div class="status-card">
        <span class="status-label">Backend Status</span>
        <span class="status-value" id="val-backend" style="color:var(--accent-emerald);">ONLINE</span>
      </div>
      <div class="status-card">
        <span class="status-label">Database Health</span>
        <span class="status-value" id="val-database">CHECKING...</span>
      </div>
      <div class="status-card">
        <span class="status-label">MQTT Telemetry</span>
        <span class="status-value" id="val-mqtt">CHECKING...</span>
      </div>
      <div class="status-card">
        <span class="status-label">API Response Time</span>
        <span class="status-value" id="val-latency" style="color:var(--accent-cyan); font-family:monospace;">-- ms</span>
      </div>
    </div>

    <!-- Live Telemetry Monitor Preview -->
    <div class="live-box">
      <div class="live-box-header">
        <div>
          <h3 style="font-size:1.1rem; font-weight:700;">Live Coach Tank Telemetry</h3>
          <p style="font-size:0.8rem; color:var(--text-muted);">Shatabdi Express • Train #12002 • Coach B4 • Cylindrical Tank</p>
        </div>
        <a href="/api/v1/tanks/live" class="badge badge-primary" style="text-decoration:none;">View Raw Live JSON &rarr;</a>
      </div>
      <div class="metrics-grid">
        <div class="metric-item">
          <div class="metric-label">Water Level</div>
          <div class="metric-value" id="tele-level">-- %</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Volume</div>
          <div class="metric-value" id="tele-vol">-- L</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Water Height</div>
          <div class="metric-value" id="tele-height">-- cm</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Alarm State</div>
          <div class="metric-value" id="tele-alarm" style="font-size:1rem; color:var(--accent-emerald);">NORMAL</div>
        </div>
      </div>
    </div>

    <h2 class="section-title">Core API Services & Documentation</h2>
    <div class="grid">
      <a href="/docs" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">SWAGGER UI</span>
            <span class="badge badge-primary">Interactive</span>
          </div>
          <div class="api-title">OpenAPI Interactive Docs</div>
          <div class="api-path">/docs</div>
          <p class="api-desc">Explore the full OpenAPI 3.1.0 schema, test endpoints, submit requests, and inspect real-time response structures.</p>
        </div>
        <div class="card-footer">Open Interactive Explorer &rarr;</div>
      </a>

      <a href="/api/v1/tanks/live" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">GET</span>
            <span class="badge badge-success">Live Telemetry</span>
          </div>
          <div class="api-title">Primary Tank Status</div>
          <div class="api-path">/api/v1/tanks/live</div>
          <p class="api-desc">Real-time water level percent, calculated volume in liters, water height, capacity rank, and alarm status.</p>
        </div>
        <div class="card-footer">Inspect Telemetry JSON &rarr;</div>
      </a>

      <a href="/api/v1/health" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">GET</span>
            <span class="badge badge-success">Diagnostics</span>
          </div>
          <div class="api-title">System Health & Diagnostic Probe</div>
          <div class="api-path">/api/v1/health</div>
          <p class="api-desc">Verifies async database connectivity, MQTT broker subscription status, and active telemetry clients.</p>
        </div>
        <div class="card-footer">View System Diagnostics &rarr;</div>
      </a>

      <a href="/api/v1/location/corridor" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">GET</span>
            <span class="badge badge-primary">GIS / GPS</span>
          </div>
          <div class="api-title">Railway Corridor & Stations</div>
          <div class="api-path">/api/v1/location/corridor</div>
          <p class="api-desc">Waypoints, water refilling facilities, and station telemetry coordinates along the designated railway corridor.</p>
        </div>
        <div class="card-footer">View Corridor Geometry &rarr;</div>
      </a>

      <a href="/api/v1/alarms" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">GET</span>
            <span class="badge badge-amber">SCADA</span>
          </div>
          <div class="api-title">Alarm & Fault Management</div>
          <div class="api-path">/api/v1/alarms</div>
          <p class="api-desc">Critical, low-water warning, overflow thresholds, and hardware diagnostic alarms across all monitored coach tanks.</p>
        </div>
        <div class="card-footer">Inspect Alarm States &rarr;</div>
      </a>

      <a href="/api/v1/settings" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">GET</span>
            <span class="badge badge-primary">Config</span>
          </div>
          <div class="api-title">Tank Geometry & Calibration</div>
          <div class="api-path">/api/v1/settings</div>
          <p class="api-desc">Cylindrical tank dimensions, cross-sectional area, threshold triggers, and MQTT broker connectivity parameters.</p>
        </div>
        <div class="card-footer">View Calibration Settings &rarr;</div>
      </a>

      <a href="/redoc" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">DOCS</span>
            <span class="badge badge-primary">Specification</span>
          </div>
          <div class="api-title">ReDoc API Reference</div>
          <div class="api-path">/redoc</div>
          <p class="api-desc">Clean, human-readable API documentation formatted for third-party client integrators and SCADA systems.</p>
        </div>
        <div class="card-footer">Open ReDoc Viewer &rarr;</div>
      </a>

      <a href="/openapi.json" class="api-card">
        <div>
          <div class="api-card-header">
            <span class="api-method">SCHEMA</span>
            <span class="badge badge-primary">JSON</span>
          </div>
          <div class="api-title">Raw OpenAPI Specification</div>
          <div class="api-path">/openapi.json</div>
          <p class="api-desc">Machine-readable OpenAPI 3.1.0 JSON contract for client SDK generation, validation, and contract testing.</p>
        </div>
        <div class="card-footer">View Schema JSON &rarr;</div>
      </a>
    </div>
  </main>

  <footer>
    <p><strong>{app_name}</strong> • Version {app_version} • High-Performance Python FastAPI ASGI</p>
    <p style="margin-top:0.25rem; font-size:0.75rem;">Pure Server Architecture — Zero Vite / Zero Node Runtime • Dedicated Industrial SCADA Telemetry</p>
  </footer>

  <script>
    async function updateHealth() {{
      const start = performance.now();
      try {{
        const res = await fetch('/api/v1/health');
        const latency = Math.round(performance.now() - start);
        document.getElementById('val-latency').textContent = latency + ' ms';
        if (res.ok) {{
          const data = await res.json();
          document.getElementById('val-database').textContent = data.database || 'CONNECTED';
          document.getElementById('val-database').style.color = (data.database === 'CONNECTED') ? 'var(--accent-emerald)' : 'var(--accent-amber)';
          document.getElementById('val-mqtt').textContent = data.mqttBroker || 'ACTIVE';
          document.getElementById('val-mqtt').style.color = (data.mqttBroker === 'CONNECTED') ? 'var(--accent-emerald)' : 'var(--accent-amber)';
        }}
      }} catch (e) {{
        document.getElementById('val-latency').textContent = '--';
      }}
    }}

    async function updateTelemetry() {{
      try {{
        const res = await fetch('/api/v1/tanks/live');
        if (res.ok) {{
          const data = await res.json();
          if (data.levelPercent !== null && data.levelPercent !== undefined) {{
            document.getElementById('tele-level').textContent = data.levelPercent.toFixed(1) + ' %';
          }} else {{
            document.getElementById('tele-level').textContent = 'READY';
          }}
          if (data.volumeLiters !== null && data.volumeLiters !== undefined) {{
            document.getElementById('tele-vol').textContent = data.volumeLiters.toFixed(1) + ' L';
          }} else {{
            document.getElementById('tele-vol').textContent = '20.0 L';
          }}
          if (data.heightCm !== null && data.heightCm !== undefined) {{
            document.getElementById('tele-height').textContent = data.heightCm.toFixed(1) + ' cm';
          }} else {{
            document.getElementById('tele-height').textContent = '50.0 cm';
          }}
          if (data.alarmStatus) {{
            const alarmEl = document.getElementById('tele-alarm');
            alarmEl.textContent = data.alarmStatus;
            alarmEl.style.color = (data.alarmStatus === 'NORMAL' || data.alarmStatus === 'AWAITING_TELEMETRY') ? 'var(--accent-emerald)' : 'var(--accent-amber)';
          }}
        }}
      }} catch (e) {{}}
    }}

    updateHealth();
    updateTelemetry();
    setInterval(updateHealth, 5000);
    setInterval(updateTelemetry, 4000);
  </script>
</body>
</html>
"""
