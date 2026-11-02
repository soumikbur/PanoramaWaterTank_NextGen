"""Standalone server runner for Panorama Water Tank Backend."""
import os
import sys
import uvicorn

# Ensure the backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"Starting Panorama Water Tank Backend on http://{host}:{port} ...", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info")

