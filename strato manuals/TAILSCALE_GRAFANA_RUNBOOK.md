# Tailscale + Grafana Runbook (EVCSMS)

## Scope
This runbook provides secure VPN-only access to Grafana from iPhone using Tailscale, with EVCSMS running locally.

## Known Environment
From `evcsms/.env.demo`:

- `API_PORT=8000`
- `OCPP_PORT=9000`
- `BACKUP_ENABLED=false` (backup service is present but disabled)

---

## 1) One-Time Host Setup

### Start and verify Tailscale

```bash
sudo tailscale up
tailscale status
tailscale ip -4
```

If your org uses auth keys:

```bash
sudo tailscale up --authkey="<YOUR_TAILSCALE_AUTH_KEY>"
```

---

## 2) Start EVCSMS Stack

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
./run.sh up
```

Quick checks:

```bash
curl -f http://localhost:8000/health
curl -I http://localhost:8080/
```

---

## 3) Start Grafana (localhost only)

```bash
docker run -d \
  --name grafana \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD='CHANGE_ME_NOW' \
  -v grafana-data:/var/lib/grafana \
  grafana/grafana-oss
```

Verify:

```bash
curl -I http://localhost:3000/login
docker logs --tail=100 grafana
```

---

## 4) Publish Grafana via Tailscale Serve

```bash
sudo tailscale serve --https=443 http://127.0.0.1:3000
sudo tailscale serve status
```

Use the tailnet URL shown by Tailscale, for example:

- `https://<server-name>.<tailnet>.ts.net`

---

## 5) iPhone Access

1. Install/open Tailscale app on iPhone.
2. Sign in to your company tailnet.
3. Open Safari to your Tailscale Serve URL.
4. Log in to Grafana.

---

## 6) Optional: EVCSMS UI via Tailscale

```bash
sudo tailscale serve --https=4443 http://127.0.0.1:8080
sudo tailscale serve status
```

Open:

- `https://<server-name>.<tailnet>.ts.net:4443`

---

## 7) Operations

### Restart

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
./run.sh restart
docker restart grafana
```

### Stop

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
./run.sh down
docker stop grafana
```

### Logs

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
./run.sh logs
docker logs --tail=200 grafana
```

---

## 8) Troubleshooting

### Tailscale URL not reachable

```bash
tailscale status
sudo tailscale serve status
sudo tailscale serve --https=443 http://127.0.0.1:3000
```

### Grafana not healthy

```bash
docker ps --filter name=grafana
docker logs --tail=200 grafana
```

### EVCSMS not healthy

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
docker compose --env-file .env.demo -f docker-compose.yml ps
./run.sh logs api-service
```

---

## 9) Security Baseline

- Keep Grafana bound to `127.0.0.1`.
- Access via Tailscale only.
- Use strong Grafana credentials.
- Disable anonymous Grafana access.
- Restrict tailnet ACLs to approved users/devices.

