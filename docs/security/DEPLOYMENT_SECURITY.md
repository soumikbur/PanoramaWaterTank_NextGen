# Panorama Water Tank Monitor — Production Deployment Security Guide

---

### 1. Mandatory Pre-Flight Security Checklist

Prior to commissioning onto live railway rolling stock:

- [ ] **Generate Random Secret Key:** Replace `SECRET_KEY` in `backend/.env` with an unpredictable 64-character hexadecimal key (`openssl rand -hex 32`).
- [ ] **Disable Debug Mode:** Ensure `DEBUG=false` and `ENV=production` in all production backend containers.
- [ ] **Deploy Private MQTT Broker:** Terminate public HiveMQ sandbox connections. Deploy a private Mosquitto / EMQX cluster requiring TLS 1.3 and x509 mutual certificate authentication (mTLS).
- [ ] **Enforce Private APN SIMs:** Configure cellular modems to communicate over dedicated private APN tunnels terminating within the railway operations intranet.
- [ ] **Restrict CORS Origins:** Remove `localhost` from `CORS_ORIGINS` in production, allowing strictly the internal SCADA domain.
- [ ] **Configure Reverse Proxy:** Terminate HTTPS/WSS traffic at an Nginx / Caddy ingress with HTTP/2 and rate limiting.
- [ ] **Forced Credential Rotation:** Force immediate password updates on default seed user accounts upon first administrative login.
