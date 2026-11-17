"""Certificate inspection utility for X.509 certificates."""
import argparse
import sys
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import ExtensionOID


def inspect_certificate(cert_path: Path):
    """Parse and display full X.509 metadata from a PEM-encoded certificate."""
    if not cert_path.exists():
        print(f"[-] Error: Certificate file not found at {cert_path}")
        sys.exit(1)

    with open(cert_path, "rb") as f:
        cert_data = f.read()

    try:
        cert = x509.load_pem_x509_certificate(cert_data)
    except Exception as err:
        print(f"[-] Error: Failed to parse PEM certificate: {err}")
        sys.exit(1)

    fingerprint = cert.fingerprint(hashes.SHA256()).hex().upper()
    formatted_fingerprint = ":".join(fingerprint[i : i + 2] for i in range(0, len(fingerprint), 2))

    # SAN extension extraction
    san_list = []
    try:
        san_ext = cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
        for name in san_ext.value:
            san_list.append(f"{name.__class__.__name__}:{name.value}")
    except x509.ExtensionNotFound:
        san_list = ["(None)"]

    # Extended Key Usage extraction
    eku_list = []
    try:
        eku_ext = cert.extensions.get_extension_for_oid(ExtensionOID.EXTENDED_KEY_USAGE)
        for usage in eku_ext.value:
            eku_list.append(usage._name if hasattr(usage, "_name") else str(usage.dotted_string))
    except x509.ExtensionNotFound:
        eku_list = ["(None)"]

    # Key size & algorithm
    pub_key = cert.public_key()
    key_size = getattr(pub_key, "key_size", "Unknown")
    pub_algo = pub_key.__class__.__name__.replace("_RSAPublicKey", "RSA").replace("PublicKey", "")

    print("=" * 64)
    print("           X.509 CERTIFICATE INSPECTION REPORT")
    print("=" * 64)
    print(f"File Path:            {cert_path.resolve()}")
    print(f"Subject:              {cert.subject.rfc4514_string()}")
    print(f"Issuer:               {cert.issuer.rfc4514_string()}")
    print(f"Serial Number (Hex):  {hex(cert.serial_number)}")
    print(f"Serial Number (Dec):  {cert.serial_number}")
    print(f"Valid From (UTC):     {cert.not_valid_before_utc.isoformat()}")
    print(f"Valid Until (UTC):    {cert.not_valid_after_utc.isoformat()}")
    print(f"Public Key Algorithm: {pub_algo}")
    print(f"Public Key Size:      {key_size} bits")
    print(f"Signature Algorithm:  {cert.signature_algorithm_oid._name}")
    print(f"SHA-256 Fingerprint:  {formatted_fingerprint}")
    print(f"SAN Entries:          {', '.join(san_list)}")
    print(f"Extended Key Usage:   {', '.join(eku_list)}")
    print("=" * 64)

    return {
        "subject": cert.subject.rfc4514_string(),
        "issuer": cert.issuer.rfc4514_string(),
        "serial_hex": hex(cert.serial_number),
        "valid_from": cert.not_valid_before_utc.isoformat(),
        "valid_until": cert.not_valid_after_utc.isoformat(),
        "key_size": key_size,
        "algorithm": pub_algo,
        "fingerprint": formatted_fingerprint,
        "sans": san_list,
        "ekus": eku_list,
    }


def main():
    default_cert = Path(__file__).resolve().parent.parent / "certificates" / "development" / "server.crt"
    parser = argparse.ArgumentParser(description="Inspect X.509 digital certificate attributes.")
    parser.add_argument("cert_path", nargs="?", type=Path, default=default_cert, help="Path to PEM certificate file")
    args = parser.parse_args()

    inspect_certificate(args.cert_path)


if __name__ == "__main__":
    main()
