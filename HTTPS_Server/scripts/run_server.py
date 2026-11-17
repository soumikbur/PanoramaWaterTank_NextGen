"""Server execution runner supporting both HTTP and HTTPS modes."""
import argparse
import ssl
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn
from backend import config


def run(
    mode: str = "http",
    host: str = None,
    port: int = None,
    cert_file: Path = None,
    key_file: Path = None,
    reload: bool = False,
):
    """Start Uvicorn in HTTP or HTTPS mode."""
    target_host = host or config.HOST
    is_https = mode.lower() == "https"

    if is_https:
        target_port = port or config.HTTPS_PORT
        cert_path = cert_file or (config.PROJECT_DIR / config.TLS_CERT_FILE)
        key_path = key_file or (config.PROJECT_DIR / config.TLS_KEY_FILE)

        if not cert_path.exists() or not key_path.exists():
            print(f"[-] Error: TLS certificate or private key missing.")
            print(f"    Expected cert at: {cert_path}")
            print(f"    Expected key at:  {key_path}")
            print("[!] Please run 'python scripts/generate_certificate.py' first.")
            sys.exit(1)

        print("=" * 64)
        print("Starting Panorama Water Tank Receiver in SECURE HTTPS Mode")
        print(f"  URL:       https://{target_host}:{target_port}")
        print(f"  Cert:      {cert_path}")
        print(f"  Key:       {key_path}")
        print("  Protocols: TLS 1.2 / TLS 1.3 (Obsolete SSLv2/v3/1.0/1.1 Disabled)")
        print("=" * 64)

        # Enforce modern ciphers and disable weak algorithms
        modern_ciphers = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384"

        uvicorn.run(
            "backend.main:app",
            host=target_host,
            port=target_port,
            reload=reload,
            ssl_keyfile=str(key_path),
            ssl_certfile=str(cert_path),
            ssl_version=ssl.PROTOCOL_TLS_SERVER,
            ssl_ciphers=modern_ciphers,
            log_level=config.LOG_LEVEL.lower(),
        )
    else:
        target_port = port or config.HTTP_PORT
        print("=" * 64)
        print("Starting Panorama Water Tank Receiver in DEVELOPMENT HTTP Mode")
        print(f"  URL:       http://{target_host}:{target_port}")
        print("=" * 64)

        uvicorn.run(
            "backend.main:app",
            host=target_host,
            port=target_port,
            reload=reload,
            log_level=config.LOG_LEVEL.lower(),
        )


def main():
    parser = argparse.ArgumentParser(description="Start the Panorama WLI HTTPS/HTTP receiver server.")
    parser.add_argument(
        "--mode",
        choices=["http", "https"],
        default="https" if config.HTTPS_ENABLED else "http",
        help="Server listener protocol mode (default: http or configured HTTPS_ENABLED)",
    )
    parser.add_argument("--host", type=str, default=None, help="Listen host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=None, help="Listen port (default: 8000 for http, 8443 for https)")
    parser.add_argument("--cert", type=Path, default=None, help="Custom TLS certificate path")
    parser.add_argument("--key", type=Path, default=None, help="Custom TLS private key path")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code change")
    args = parser.parse_args()

    run(
        mode=args.mode,
        host=args.host,
        port=args.port,
        cert_file=args.cert,
        key_file=args.key,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
