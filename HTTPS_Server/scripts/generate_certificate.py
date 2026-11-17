"""Local self-signed X.509 certificate generator for HTTPS Receiver testing."""
import argparse
import datetime
import ipaddress
import os
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def generate_self_signed_cert(
    output_dir: Path,
    key_size: int = 2048,
    valid_days: int = 365,
    common_name: str = "localhost",
    lan_ip: str = None,
):
    """Generate an RSA private key and self-signed X.509 certificate with SAN."""
    output_dir.mkdir(parents=True, exist_ok=True)
    cert_path = output_dir / "server.crt"
    key_path = output_dir / "server.key"
    info_path = output_dir / "certificate_info.txt"

    print(f"[*] Generating {key_size}-bit RSA private key...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
    )

    # Subject & Issuer (Identical for self-signed certificate)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "West Bengal"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Kolkata"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Panorama Water Tank Monitor"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "IoT Engineering Lab"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    # Subject Alternative Names (SAN)
    san_list = [
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]

    if lan_ip:
        try:
            parsed_ip = ipaddress.ip_address(lan_ip.strip())
            san_list.append(x509.IPAddress(parsed_ip))
            print(f"[+] Added LAN IP SAN: {parsed_ip}")
        except ValueError:
            print(f"[-] Warning: Invalid LAN IP '{lan_ip}' skipped.")

    now = datetime.datetime.now(datetime.timezone.utc)
    not_before = now - datetime.timedelta(minutes=5)
    not_after = now + datetime.timedelta(days=valid_days)

    print(f"[*] Building X.509 certificate valid for {valid_days} days...")
    cert_builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
        .add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False,
        )
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([
                ExtendedKeyUsageOID.SERVER_AUTH,
                ExtendedKeyUsageOID.CLIENT_AUTH,
            ]),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(private_key.public_key()),
            critical=False,
        )
    )

    certificate = cert_builder.sign(
        private_key=private_key,
        algorithm=hashes.SHA256(),
    )

    # Write Private Key
    print(f"[*] Writing private key to {key_path}...")
    key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(key_path, "wb") as f:
        f.write(key_bytes)

    # Restrict permissions on POSIX systems if supported
    try:
        os.chmod(key_path, 0o600)
    except Exception:
        pass

    # Write Certificate
    print(f"[*] Writing certificate to {cert_path}...")
    cert_bytes = certificate.public_bytes(serialization.Encoding.PEM)
    with open(cert_path, "wb") as f:
        f.write(cert_bytes)

    # Write Certificate Summary
    fingerprint = certificate.fingerprint(hashes.SHA256()).hex().upper()
    formatted_fingerprint = ":".join(fingerprint[i : i + 2] for i in range(0, len(fingerprint), 2))

    summary_lines = [
        "==================================================",
        "  Panorama WLI Development TLS Certificate Info  ",
        "==================================================",
        f"Subject:         {common_name}",
        f"Issuer:          {common_name} (Self-Signed)",
        f"Serial Number:   {hex(certificate.serial_number)}",
        f"Valid From:      {not_before.isoformat()}",
        f"Valid Until:     {not_after.isoformat()}",
        f"Public Key:      RSA {key_size} bits",
        f"Signature:       SHA-256 with RSA Encryption",
        f"SHA-256 Digest:  {formatted_fingerprint}",
        "SAN Entries:     " + ", ".join(str(s.value) for s in san_list),
        "Key Usage:       Digital Signature, Key Encipherment",
        "Extended Usage:  TLS Web Server Authentication, TLS Web Client Authentication",
        "==================================================",
    ]

    with open(info_path, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines) + "\n")

    print("[+] Certificate and private key generation complete.")
    print(f"[+] Cert: {cert_path}")
    print(f"[+] Key:  {key_path}")
    print(f"[+] Info: {info_path}")
    return cert_path, key_path


def main():
    parser = argparse.ArgumentParser(description="Generate self-signed TLS certificate for local development.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "certificates" / "development",
        help="Target output directory (default: certificates/development)",
    )
    parser.add_argument("--key-size", type=int, default=2048, choices=[2048, 3072, 4096], help="RSA key size (default: 2048)")
    parser.add_argument("--days", type=int, default=365, help="Validity period in days (default: 365)")
    parser.add_argument("--common-name", type=str, default="localhost", help="Certificate Common Name (default: localhost)")
    parser.add_argument("--lan-ip", type=str, default=None, help="Optional LAN IP to include in SAN (e.g. 192.168.1.100)")
    args = parser.parse_args()

    generate_self_signed_cert(
        output_dir=args.output_dir,
        key_size=args.key_size,
        valid_days=args.days,
        common_name=args.common_name,
        lan_ip=args.lan_ip,
    )


if __name__ == "__main__":
    main()
