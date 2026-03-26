# EV CSMS - Localhost Demo Stack

This repository copy is prepared for a localhost demo flow where the UI, API, OCPP service, and simulated chargers run together via `docker-compose.yml`.

## Supported Services

The deployment consists of five containers:

1. `redis-service` — shared state, sessions, and runtime coordination
2. `ocpp-ws-service` — OCPP 1.6J WebSocket endpoint on port `9000`
3. `api-service` — REST API and health endpoint on port `8000`
4. `ui-service` — static frontend served internally on port `80`
5. `backup-service` — scheduled offsite charge-history backup worker (disabled until configured)

## Supported Files

- `docker-compose.yml`
- `docker/Dockerfile.api`
- `docker/Dockerfile.ocpp_ws`
- `docker/Dockerfile.ui`
- `api.py`
- `ocpp_ws.py`
- `app/`
- `tools/charge_history_backup.py`
- `web/`

Localhost helpers and simulator tooling are not part of the supported workflow.

## Quick Start

### 1. Prepare environment

For the ready-made demo flow, `run.sh` automatically uses `.env.demo` if `.env` is missing.

If you want to override the demo settings, create your own `.env` in `evcsms/`.

Demo example:

```bash
REDIS_PASSWORD=change-this
APP_SECRET=change-this-too
API_PORT=8000
OCPP_PORT=9000
SESSION_COOKIE_SECURE=true
MAX_IMPORT_FILE_BYTES=2097152
CP_AUTH_REQUIRED=false
CP_SHARED_TOKEN=change-this-ocpp-token
CP_AUTOMAP_ON_CONNECT=false
PORTAL_TAGS_GLOBAL=false
BACKUP_ENABLED=false
BACKUP_GIT_URL=git@github.com:BessTech-prod/ocpp_backups.git
BACKUP_GIT_BRANCH=main
BACKUP_GIT_USER_NAME=EVCSMS Backup Bot
BACKUP_GIT_USER_EMAIL=evcsms-backup@example.invalid
BACKUP_REPO_TARGET_DIR=charge-history
BACKUP_INTERVAL_SECONDS=172800
BACKUP_RUN_ON_STARTUP=true
BACKUP_GIT_SSH_KEY_PATH=/run/secrets/backup_git_ed25519
BACKUP_GIT_KNOWN_HOSTS_PATH=/run/secrets/github_known_hosts
BACKUP_GIT_STRICT_HOST_KEY_CHECKING=true
BACKUP_GIT_SSH_COMMAND=
```

### 2. Build and start the stack

```bash
./run.sh build
./run.sh up
```

### 3. Verify health

```bash
./run.sh seed-demo
./run.sh logs
curl -f http://localhost:8000/health
curl -I http://localhost:8080/
docker compose -f docker-compose.yml ps
```

### 4. Stop the stack

```bash
./run.sh down
```

## Runner Commands

| Command | Description |
|---|---|
| `./run.sh up` | Start the supported multi-service stack |
| `./run.sh down` | Stop the stack |
| `./run.sh build` | Rebuild images |
| `./run.sh seed-demo` | Reset demo data, demo logins, and charging sessions |
| `./run.sh logs` | Tail logs for all services |
| `./run.sh logs <service>` | Tail logs for one service |
| `./run.sh restart` | Restart running services |
| `./run.sh kill` | Remove containers without deleting volumes |
| `./run.sh clean` | Remove containers and volumes |

## Deployment Notes

- `ui-service` is published on `http://localhost:8080` and proxies `/api/*` to the backend for same-origin demo login/session handling.
- `api-service` is reachable on `http://localhost:8000`.
- `ocpp-ws-service` is reachable on `ws://localhost:9000`.
- `redis-service` remains internal-only.
- `CP_AUTH_REQUIRED` is disabled by default for the demo so the five simulated chargers stay easy to demonstrate.
- Runtime state persists through the mounted `data/` and `config/` directories.
- New transactions now store a snapshot of `org_id`, `org_name`, `charge_point_alias`, and `user_name` to make future history backups safer even if org assignments change later.

## Offsite Charge-History Backup

The stack now includes a dedicated `backup-service` that can export all charging history to an XLSX workbook and push it to a git repository every 48 hours.

### What gets backed up

- one workbook per backup run
- one worksheet per organization
- a `Summary` sheet with counts and energy totals
- a `Metadata` sheet with generation info
- both completed and still-open charging sessions

Each transaction row includes organization, charger alias, connector, RFID tag, user, timestamps, duration, and energy.

### Required configuration to enable it

```bash
BACKUP_ENABLED=true
BACKUP_GIT_URL=git@github.com:BessTech-prod/ocpp_backups.git
BACKUP_GIT_BRANCH=main
BACKUP_GIT_USER_NAME=EVCSMS Backup Bot
BACKUP_GIT_USER_EMAIL=evcsms-backup@example.invalid
BACKUP_REPO_TARGET_DIR=charge-history
BACKUP_INTERVAL_SECONDS=172800
BACKUP_RUN_ON_STARTUP=true
BACKUP_GIT_SSH_KEY_PATH=/run/secrets/backup_git_ed25519
BACKUP_GIT_KNOWN_HOSTS_PATH=/run/secrets/github_known_hosts
BACKUP_GIT_STRICT_HOST_KEY_CHECKING=true
```

### Required SSH files for GitHub

The `backup-service` now mounts `./secrets` into the container as `/run/secrets`.

Create these files locally before enabling backups:

```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
mkdir -p secrets
chmod 700 secrets
ssh-keyscan github.com > secrets/github_known_hosts
chmod 644 secrets/github_known_hosts
# copy your GitHub deploy key with write access to the backup repo:
chmod 600 secrets/backup_git_ed25519
```

Recommended GitHub setup:

- add `secrets/backup_git_ed25519.pub` as a **deploy key with write access** on `BessTech-prod/ocpp_backups`
- keep `BACKUP_ENABLED=false` until the key is installed and tested

### Local test with a file-based git repo

You can test the feature without external credentials by using a local bare repo:

```bash
mkdir -p data/test-backup-remote.git
git init --bare data/test-backup-remote.git
docker compose --env-file .env.demo -f docker-compose.yml run --rm \
  -e BACKUP_ENABLED=true \
  -e BACKUP_GIT_URL=file:///data/test-backup-remote.git \
  backup-service \
  python tools/charge_history_backup.py --once
```

The worker writes these files into the configured git repo directory:

- `charge_history_latest.xlsx`
- timestamped archive copies like `charge_history_20260323T...xlsx`
- `manifest.json`

## Demo Content

- 5 simulated unassigned chargers connect automatically at startup.
- ~25 completed charging sessions are seeded for `Takorama_Storås`.
- Demo password for seeded logins: `sliceorama`
  - `admin@takorama.se`
  - `hugo@takorama.se`
  - `linn@dahlstrom.se`

## Release Checklist

Before deployment:

- verify `.env` values are production-safe
- back up `data/`, `config/`, and `.env`
- rebuild only the services affected by your change when possible
- verify `api-service`, `ocpp-ws-service`, `ui-service`, and `redis-service` are healthy after rollout

## Project Structure

```text
evcsms/
├── app/
├── config/
├── data/
├── docker/
├── web/
├── api.py
├── ocpp_ws.py
├── docker-compose.yml
├── requirements.txt
├── run.sh
└── README.md
```

## Production Hardening Suggestions

- keep secrets out of Git and store them in `.env` or a secret manager
- terminate HTTPS at ALB, nginx, or another reverse proxy
- restrict inbound access to ports `8000`, `9000`, and `6379`
- monitor container logs and health checks after each release
- consider managed storage/services for long-term production scale
