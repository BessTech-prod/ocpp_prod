# System Architecture & Logging Points

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR SERVERS / VM / DOCKER HOST              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Docker Container Network                    │  │
│  │  (Internal: no port exposure except to host)             │  │
│  │                                                           │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │  │
│  │  │ REDIS SERVICE  │  │   API SERVICE  │  │ OCPP WS    │ │  │
│  │  │                │  │                │  │ SERVICE    │ │  │
│  │  │ Port: 6379     │  │ Port: 8000     │  │ Port: 9000 │ │  │
│  │  │ (internal)     │  │ HTTP/REST      │  │ WebSocket  │ │  │
│  │  │                │◄──┼────────────────┼──┤            │ │  │
│  │  │ [logger:redis] │  │ [logger:api]   │  │[logger:    │ │  │
│  │  │ Stores:        │  │ Handles:       │  │ocpp-ws]    │ │  │
│  │  │ - Sessions     │  │ - User auth    │  │ Handles:   │ │  │
│  │  │ - Caches       │  │ - CP mgmt      │  │ - Chargers │ │  │
│  │  │ - Commands     │  │ - Transactions │  │ - OCPP cmd │ │  │
│  │  │                │  │ - Health (/h)  │  │ - Charging │ │  │
│  │  └────────────────┘  └────────────────┘  └────────────┘ │  │
│  │           ▲                   ▲                  ▲        │  │
│  │           └───────────────────┴──────────────────┘        │  │
│  │            (All share Redis for state)                    │  │
│  │                                                           │  │
│  │  ┌────────────────────┐        ┌────────────────────┐   │  │
│  │  │   UI SERVICE       │        │  BACKUP SERVICE    │   │  │
│  │  │   Port: 8080       │        │  (Background)      │   │  │
│  │  │   Static HTML/CSS  │        │                    │   │  │
│  │  │   [Nginx]          │        │  [logger:history-  │   │  │
│  │  │                    │        │   backup]          │   │  │
│  │  └────────────────────┘        │  Git pushes to     │   │  │
│  │                                │  backup repo       │   │  │
│  │                                └────────────────────┘   │  │
│  │                                                         │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │         Docker Volumes (Persistent Data)        │   │  │
│  │  │ /data/                                          │   │  │
│  │  │  ├─ transactions.json   (charging history)      │   │  │
│  │  │  ├─ config/                                      │   │  │
│  │  │  │  ├─ users.json       (user database)         │   │  │
│  │  │  │  ├─ cps.json         (charger mappings)      │   │  │
│  │  │  │  ├─ orgs.json        (organizations)         │   │  │
│  │  │  │  ├─ auth_tags.json   (RFID allowlist)       │   │  │
│  │  │  │  └─ rfids.json       (RFID details)         │   │  │
│  │  │  ├─ backups/            (scheduled backups)     │   │  │
│  │  │  └─ logs/               (if enabled)            │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  PORT EXPOSURES (to host):                                      │
│  - 127.0.0.1:8000  → API service    (localhost only)            │
│  - 127.0.0.1:9000  → OCPP-WS       (localhost only)             │
│  - 127.0.0.1:8080  → UI service     (localhost only)            │
│                                                                  │
│  If PUBLIC: Use reverse proxy (nginx) to expose safely          │
└─────────────────────────────────────────────────────────────────┘

        ▼ External Connection Points ▼

┌─────────────────────────────────────┐
│  EV CHARGING STATIONS               │
│  (OCPP 1.6J / 2.0.1 chargers)       │
│  Connects to: port 9000             │
│  Sends: heartbeat, status, events   │
└─────────────────────────────────────┘
         │
         │ [WebSocket]
         │
         ▼
    [ocpp-ws-service]
         │
         ├─ Logs charger connects/disconnects
         ├─ Logs OCPP protocol messages
         ├─ Logs authorization checks
         └─ Stores results in Redis

┌─────────────────────────────────────┐
│  ADMIN / USER WEB BROWSER           │
│  Connects to: port 8080 or 8000     │
│  Actions: Check status, start/stop  │
└─────────────────────────────────────┘
         │
         │ [HTTP/REST]
         │
         ▼
    [api-service]
         │
         ├─ Logs user auth
         ├─ Logs API requests
         ├─ Logs transactions
         └─ Responds with data
```

---

## Logging Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Python Service (api.py, ocpp_ws.py, history_backup.py)         │
│                                                                  │
│  import logging                                                  │
│  logger = logging.getLogger("service_name")                      │
│  logger.info("Message")      → Goes to STDOUT                    │
│  logger.warning("Message")   → Goes to STDERR                    │
│  logger.error("Message")     → Goes to STDERR                    │
│  logger.exception("Message") → Goes to STDERR with traceback     │
└─────────────────────────────────────────────────────────────────┘
         │
         │ [Python's logging module - console stream]
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Docker Container (api-service, ocpp-ws-service)     │
│                                                                  │
│  Captures stdout/stderr as container logs                        │
│  Stores in: /var/lib/docker/containers/<ID>/<ID>-json.log      │
│  (Limited by Docker logging driver - default: json-file)         │
└─────────────────────────────────────────────────────────────────┘
         │
         │ [Docker logging driver]
         │
         ├─ Option 1: View with: docker logs <container>
         ├─ Option 2: View with: ./run.sh logs
         ├─ Option 3: File handler output to /data/logs/*.log
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3 WAYS TO ACCESS LOGS                         │
│                                                                  │
│  [1] ./run.sh logs                 ← EASIEST                    │
│  [2] docker logs <service_name>    ← DIRECT                     │
│  [3] /data/logs/*.log              ← PERSISTENT (if enabled)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Dependency Chain (Impact of Failure)

```
┌──────────────────────────┐
│   REDIS SERVICE          │  ◄─── CRITICAL
│   (In-memory data store) │       If this fails: EVERYTHING fails
└──────────────────────────┘
           ▲
           │ (Required by all)
           │
    ┌──────┴─────┬──────────────┐
    │            │              │
    ▼            ▼              ▼
┌────────┐  ┌────────┐  ┌────────────────┐
│  API   │  │ OCPP   │  │  BACKUP        │
│SERVICE │  │SERVICE │  │  SERVICE       │
└────────┘  └────────┘  └────────────────┘
    ▲            ▲              │
    │            │              │
    └───┬────────┘              │
        │                       │
        ▼                       │
    ┌────────┐                  │
    │ UI     │                  │
    │SERVICE │                  │
    └────────┘                  │
                                ▼
                          ┌──────────────┐
                          │ Git Repo     │
                          │ (optional)   │
                          └──────────────┘

Failure Scenarios:
1. Redis down     → ALL services fail (nothing stores state)
2. API down       → UI broken, but OCPP still works (chargers keep charging)
3. OCPP down      → New chargers can't connect, but API still works
4. UI down        → Admin can't view, but system keeps operating
5. Backup down    → No backups, but system keeps operating
```

---

## What Gets Logged - Detailed Breakdown

### **API Service (api.py)**

```
Startup Logs:
  [INFO] Redis connection ready
  [INFO] Session TTL set to 720 minutes
  [INFO] Starting FastAPI application

User Authentication:
  [INFO] User login: user@example.com
  [WARNING] Failed login attempt for user@example.com (invalid password)
  [ERROR] User not found: nonexistent@example.com

Charger Management:
  [INFO] Registered charger: ABC123
  [INFO] Updated charger: ABC123 → org_id="tesla"
  [ERROR] Cannot update charger - not found

Transactions:
  [INFO] Charging started: tag=RFID123, charger=ABC123
  [INFO] Charging stopped: tag=RFID123, charger=ABC123
  [ERROR] Invalid transaction file format

API Requests:
  [INFO] GET /api/cps → 200 OK
  [INFO] POST /api/users → 201 Created
  [WARNING] GET /api/unknown_endpoint → 404 Not Found
  [ERROR] POST /api/cps → 500 Internal Server Error
```

### **OCPP WebSocket Service (ocpp_ws.py)**

```
Charger Connections:
  [INFO] Charger connected: id=ABC123, ip=192.168.1.100
  [INFO] Charger disconnected: ABC123
  [WARNING] Connection timeout from charger: ABC123

OCPP Protocol Events:
  [INFO] Received: Heartbeat from ABC123
  [INFO] Received: StartTransaction from ABC123 (RFID: USER456)
  [INFO] Received: StopTransaction from ABC123
  [WARNING] Unknown OCPP message from ABC123
  [ERROR] Protocol error - invalid JSON from charger

Authorization:
  [INFO] Authorizing tag: USER456 on charger: ABC123
  [WARNING] Tag rejected: USER456 (not in allowlist)
  [ERROR] Authorization failed - database error

Remote Commands:
  [INFO] Sending command: Reset to charger ABC123
  [INFO] Command result: SUCCESS
  [ERROR] Command failed: Remote charger not responding
```

### **Backup Service (history_backup.py)**

```
Startup:
  [INFO] Backup service started
  [INFO] Backup enabled: True
  [INFO] Git URL: git@github.com:example/backups.git

Execution:
  [INFO] Starting scheduled backup job
  [INFO] Exporting charge history to Excel
  [INFO] Committing to Git repository
  [INFO] Pushing to remote: origin
  [INFO] Backup completed successfully

Errors:
  [ERROR] SSH key not found: /run/secrets/backup_git_ed25519
  [ERROR] Git authentication failed
  [ERROR] No network connection to Git server
  [WARNING] Backup already in progress - skipping
```

---

## Error Log Severity Levels

```
Level      | Color  | When Used | Severity
-----------|--------|-----------|----------
DEBUG      | White  | Detailed tracing (usually disabled) | Low
INFO       | Green  | Normal operations | Low
WARNING    | Yellow | Recoverable issues | Medium
ERROR      | Red    | Serious issues, service degraded | High
CRITICAL   | Red    | Service failing/unavailable | CRITICAL
```

---

## How to Read a Log Line

```
2026-04-03 14:25:37,123 [INFO] Redis connection ready
│          │          │   │    └─ The actual message
│          │          │   │
│          │          │   └─ Severity level
│          │          │
│          │          └─ Milliseconds
│          │
│          └─ Time (HH:MM:SS)
│
└─ Date (YYYY-MM-DD)
```

---

## Where Logs Go

```
┌─ Production Environment ──────────────────────────────────┐
│                                                           │
│  Docker Container stdout/stderr                          │
│  ├─ Accessed via: docker logs <container>                │
│  ├─ Accessed via: ./run.sh logs                           │
│  └─ Lost on: container restart                           │
│                                                           │
│  Optional: File-based Logging (if enabled)               │
│  ├─ Location: /data/logs/*.log                           │
│  ├─ Persists: Through container restarts                 │
│  ├─ Rotates: Max 10MB per file                           │
│  └─ Keeps: Last 5 rotated files                          │
│                                                           │
│  Optional: Centralized Logging (advanced)                │
│  ├─ Location: External service (Datadog, ELK, etc.)      │
│  ├─ Real-time: Yes                                       │
│  ├─ Searchable: Yes                                      │
│  ├─ Cost: $$ per month                                   │
│  └─ Setup: Requires Docker logging driver config         │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Service-to-Logger Mapping

| Service File | Logger Name | Access via |
|---|---|---|
| api.py | `"api"` | `./run.sh logs api-service` |
| ocpp_ws.py | `"ocpp-ws"` | `./run.sh logs ocpp-ws-service` |
| history_backup.py | `"history-backup"` | `./run.sh logs backup-service` |
| (Redis) | N/A | `./run.sh logs redis-service` |
| (UI) | N/A (Nginx) | `./run.sh logs ui-service` |

---

This architecture means:
- ✅ All logs are **captured in real-time**
- ✅ Logs are **easily accessible** via Docker
- ✅ Logs **reflect** what's actually happening in containers
- ⚠️ Logs are **lost** if containers restart (unless persistent logging enabled)
- ✅ **No external dependencies** needed to access logs

