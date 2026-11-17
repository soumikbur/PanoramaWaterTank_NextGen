"""Project structure and environment isolation verification test suite."""
import os
import sys
from pathlib import Path


def test_import_main_app():
    """Verify that the FastAPI application can be imported cleanly."""
    from backend.main import app
    assert app is not None
    assert app.title == "Panorama Water Tank — HTTPS Receiver"
    assert app.version == "0.1.0"


def test_required_directory_structure():
    """Verify that all required Phase 03 directories exist."""
    base_dir = Path(__file__).resolve().parent.parent
    expected_dirs = [
        base_dir / "backend",
        base_dir / "backend" / "routes",
        base_dir / "backend" / "schemas",
        base_dir / "backend" / "services",
        base_dir / "backend" / "utils",
        base_dir / "backend" / "static",
        base_dir / "backend" / "static" / "css",
        base_dir / "backend" / "static" / "js",
        base_dir / "tests",
        base_dir / "certificates",
        base_dir / "docs",
        base_dir / "docs" / "architecture",
        base_dir / "docs" / "deployment",
        base_dir / "docs" / "testing",
        base_dir / "docs" / "audit",
    ]
    for d in expected_dirs:
        assert d.is_dir(), f"Expected directory missing: {d}"


def test_required_root_files():
    """Verify that all required Phase 03 root files exist."""
    base_dir = Path(__file__).resolve().parent.parent
    expected_files = [
        base_dir / ".env.example",
        base_dir / ".gitignore",
        base_dir / "requirements.txt",
        base_dir / "render.yaml",
        base_dir / "certificates" / "README.md",
    ]
    for f in expected_files:
        assert f.is_file(), f"Expected file missing: {f}"


def test_environment_resilience_missing_env():
    """Verify that missing environment variables do not crash the application."""
    # Temporarily remove any set env vars
    old_env = os.environ.get("ENVIRONMENT")
    try:
        if "ENVIRONMENT" in os.environ:
            del os.environ["ENVIRONMENT"]
        from backend.main import app
        assert app is not None
    finally:
        if old_env is not None:
            os.environ["ENVIRONMENT"] = old_env


def test_isolation_from_mqtt():
    """Verify that backend modules have zero dependency on MQTT or legacy Qt."""
    import backend.main
    loaded_modules = sys.modules.keys()
    assert "paho.mqtt" not in loaded_modules
    assert "paho" not in loaded_modules
