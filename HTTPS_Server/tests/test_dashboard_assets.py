"""Dashboard HTML and static JavaScript assets test suite."""
import pytest
from httpx import ASGITransport, AsyncClient
from backend.main import app


@pytest.mark.asyncio
async def test_dashboard_all_modular_scripts_delivery():
    """Verify that all modular frontend JavaScript files are served with application/javascript."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        scripts = [
            "/static/js/api.js",
            "/static/js/dashboard.js",
            "/static/js/telemetry.js",
            "/static/js/app.js",
        ]
        for script_path in scripts:
            res = await client.get(script_path)
            assert res.status_code == 200, f"Failed to serve {script_path}: {res.status_code}"
            assert "javascript" in res.headers["content-type"].lower()
            assert len(res.text) > 100


@pytest.mark.asyncio
async def test_dashboard_html_key_components():
    """Verify that the dashboard HTML includes all essential UI sections and element IDs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/")
        assert res.status_code == 200
        html = res.text

        # Core element IDs
        expected_ids = [
            "header-live-clock",
            "auth-token-input",
            "auth-token-toggle-btn",
            "auth-token-apply-btn",
            "auth-token-clear-btn",
            "auth-token-status",
            "auth-required-banner",
            "stale-telemetry-alert",
            "backend-availability",
            "server-url",
            "device-comm-status",
            "device-id-display",
            "metric-water-cm",
            "metric-water-pct",
            "metric-raw-voltage",
            "metric-battery-voltage",
            "metric-sensor-status",
            "metric-alarm-status",
            "dynamic-variables-container",
            "variable-table-body",
            "variable-search-input",
            "gps-coordinates",
            "gps-open-btn",
            "history-table-body",
            "history-limit-select",
            "history-device-filter",
            "raw-json-content",
            "raw-json-copy-btn",
            "raw-json-download-btn",
            "manual-post-json-editor",
            "manual-post-send-btn",
            "file-upload-input",
            "file-upload-submit-btn",
            "comm-monitor-table-body",
            "comm-monitor-clear-btn",
        ]

        for elem_id in expected_ids:
            assert f'id="{elem_id}"' in html, f"Missing element ID in index.html: {elem_id}"


@pytest.mark.asyncio
async def test_dashboard_zero_inline_tokens():
    """Verify that no sensitive tokens or passwords are baked into frontend HTML or scripts."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = [
            "/",
            "/static/js/api.js",
            "/static/js/dashboard.js",
            "/static/js/telemetry.js",
            "/static/js/app.js",
            "/static/css/style.css",
        ]
        for path in files:
            res = await client.get(path)
            content = res.text.lower()
            assert "dev_secret_token_123" not in content
            assert "secret_token" not in content
