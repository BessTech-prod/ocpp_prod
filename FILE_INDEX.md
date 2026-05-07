# EV CSMS - Complete File Index & Purpose Guide

## Directory Structure with File Purposes

```
/evcsms/
├── README.md                          → Quick start guide for deployment
├── requirements.txt                   → Python dependencies (ocpp, fastapi, redis, websockets, openpyxl)
├── run.sh                             → Deployment orchestration script
├── docker-compose.yml                 → 5-service stack definition (api, ocpp-ws, ui, redis, backup)
│
├── api.py                             ★ MAIN: REST API server (FastAPI)
│                                        - Auth endpoints (login, logout, me)
│                                        - Org management
│                                        - RFID management (CRUD + audit + import/export)
│                                        - User management
│                                        - CP (charge point) management
│                                        - History/reporting
│                                        - OCPP command interface
│
├── ocpp_ws.py                         ★ MAIN: OCPP WebSocket server (asyncio + websockets)
│                                        - CP connection handler (on_connect)
│                                        - OCPP message handlers (@on decorators)
│                                        - Authorization logic (is_tag_allowed_on_cp)
│                                        - Transaction lifecycle (start/stop)
│                                        - Background command worker
│                                        - Redis state management
│
├── app/                               → Application utilities namespace
│   ├── __init__.py
│   ├── auth_store.py                  ★ RFID Allowlist Manager
│   │                                   - In-memory set + disk (JSON) sync
│   │                                   - Thread-safe (RLock)
│   │                                   - Methods: load(), save(), add(), remove(), contains(), all()
│   │
│   ├── redis_config.py                → Redis client factory
│   │                                   - Handles REDIS_URL or explicit host/port/password
│   │                                   - Called by api.py and ocpp_ws.py
│   │
│   ├── history_export.py              ★ Transaction Data Processing
│   │                                   - enrich_transaction_snapshot() - adds org/user metadata
│   │                                   - build_backup_rows() - export format
│   │                                   - Transaction summary/manifest generation
│   │                                   - Excel workbook building
│   │
│   └── main.py                        → Legacy/alternate main (not currently used)
│
├── docker/                            → Docker build context
│   ├── Dockerfile.api                 → Python 3.11 + api.py
│   ├── Dockerfile.ocpp_ws             → Python 3.11 + ocpp_ws.py
│   ├── Dockerfile.ui                  → Nginx static + proxy setup
│   ├── Dockerfile.backup              → Backup service (charge history export)
│   ├── Dockerfile.single              → (Alternative: monolithic)
│   ├── nginx.ui.conf                  → Nginx config (proxy /api to api-service)
│   ├── nginx.single.conf              → (Alternative)
│   ├── supervisord.single.conf        → (Alternative)
│   ├── entrypoint.single.sh           → (Alternative)
│   │
│   └── tools/
│       ├── charge_history_backup.py   → Background backup worker
│       ├── seed_demo_data.py          → Generate demo transactions for testing
│       └── simulate_demo_chargers.py  → WebSocket client simulator (for testing)
│
├── web/                               → Frontend (HTML/JS/CSS frontend files)
│   ├── index.html                     → Redirect to login
│   ├── login.html                     → Login page (email + password)
│   ├── robots.txt                     → robots.txt for web crawlers
│   │
│   ├── portal/                        → Portal admin pages
│   │   ├── index.html                 → Dashboard (orgs, CPs, live status)
│   │   ├── add_user.html              → Create new user/RFID
│   │   ├── cps.html                   → Charge point management
│   │   ├── live_ops.html              → Remote commands (start/stop charging)
│   │   └── rfid.html                  → RFID management
│   │
│   ├── org/                           → Organization admin pages
│   │   ├── index.html                 → Dashboard (users, RFIDs in org)
│   │   ├── add_user.html              → Add user to org
│   │   ├── users.html                 → List org users
│   │   ├── my.html                    → My profile
│   │   ├── history.html               → Org's charging history
│   │   └── rfid.html                  → Manage RFIDs in org
│   │
│   ├── user/                          → End-user pages
│   │   ├── index.html                 → My charging dashboard
│   │   └── my.html                    → My profile
│   │
│   └── assets/                        → Static files (JS, CSS, images)
│       ├── style.css                  → Bootstrap overrides + custom styles
│       ├── login.js                   ★ Login + role-based redirect logic
│       ├── ui-common.js               ★ Shared utilities (auth, fetch, notifications)
│       │
│       ├── portal_index.js            → Portal dashboard logic
│       ├── portal_live_ops.js         ★ Remote command UI (start/stop)
│       ├── portal_cps.js              → CP management UI
│       ├── portal_add_user.js         → User creation UI
│       │
│       ├── org_index.js               → Org dashboard logic
│       ├── org_users.js               → Org user management UI
│       ├── org_my.js                  → Org admin profile UI
│       ├── org_history.js             → Org history filter/export
│       │
│       ├── user_index.js              → User dashboard logic
│       ├── user_my.js                 → User profile UI
│       ├── users_history.js           → User history view
│       ├── rfid_manager.js            → RFID CRUD UI
│       ├── nav.js                     → Navigation/navbar logic
│       │
│       └── images/
│           ├── logo.png
│           ├── logo_trans_vit.png
│           └── logo_transparent.png
│
├── config/                            ★ PERSISTENT JSON CONFIG FILES
│   ├── auth_tags.json                 → Array of whitelisted RFID tags (allowlist)
│   │                                   Usage: AuthStore, auth check, allowlist validation
│   │
│   ├── rfids.json                     ★ Master RFID registry
│   │                                   Keys: tag (normalized uppercase)
│   │                                   Values: {alias, org_id, user_email, active, updated_at}
│   │                                   CRITICAL: org_id determines access control
│   │
│   ├── users.json                     ★ User account registry
│   │                                   Keys: tag (RFID tag or UUID)
│   │                                   Values: {email, name, role, org_id, pwd_salt, pwd_hash}
│   │
│   ├── cps.json                       ★ Charge point → org mapping
│   │                                   Keys: cp_id (normalized path like "ocpp/laddbox_kontor")
│   │                                   Values: {org_id, alias}
│   │                                   CRITICAL: org_id must match RFID org_id
│   │
│   └── orgs.json                      → Organization definitions
│                                       Keys: org_id
│                                       Values: {name}
│
├── data/                              ★ PERSISTENT RUNTIME DATA
│   ├── transactions.json              ★ All charging sessions
│   │                                   Array: [{transaction_id, cp_id, id_tag, start_time, stop_time, meter_start, meter_stop, org_id, ...}]
│   │                                   Updated: On StartTransaction (append) + StopTransaction (update)
│   │                                   Snapshots metadata to preserve history accuracy
│   │
│   ├── rfid_audit.json                → RFID change audit log
│   │                                   Array: [{at, actor_email, action, tag, details}]
│   │                                   Kept to latest 5000 entries
│   │
│   ├── backups/                       → Offsite backup staging
│   │   ├── git-worktree/
│   │   │   └── charge-history/        → Git worktree for backup repo
│   │   └── test-backup-remote.git/    → Test backup destination
│   │
│   └── config/ → symlink to ../config (for backup worker)
│
├── secrets/                           → (Optional) SSH keys for GitHub backup access
│   ├── backup_git_ed25519             → SSH private key (deploy key for backup repo)
│   └── github_known_hosts             → SSH known_hosts for github.com
│
├── LOGGING_QUICK_START.md             → Logging configuration notes
├── LOGGING_SUMMARY.md                 → Log analysis guide
├── SYSTEM_ARCHITECTURE_LOGGING.md     → Detailed logging architecture
├── OUTAGE_TROUBLESHOOTING_GUIDE.md    → Production troubleshooting
├── OUTAGE_CHEAT_SHEET.md              → Quick outage recovery steps
├── DEPLOY_PRODUCTION_TAKORAMACHARGE.md → Production deployment (Nginx + Certbot)
│
└── ARCHITECTURE_ANALYSIS.md           ← GENERATED: Complete system architecture
    CALL_FLOWS_DETAILED.md             ← GENERATED: Detailed call flow diagrams
    QUICK_REFERENCE.md                 ← GENERATED: Developer quick reference
    FILE_INDEX.md                      ← YOU ARE HERE

```

---

## Key File Relationships

### Authentication Flow (Which Files?)

```
login.js (frontend)
  │
  └──> POST /api/auth/login
        └──> api.py::api_login()
              ├─ load users.json
              ├─ hash_password() with BCP32
              ├─ set_session_cookie()
              └─ Return: {ok}
  
  │
  └──> GET /api/auth/me
        └──> api.py::api_me()
              ├─ verify_token(cookie) <- HMAC check
              ├─ load users.json
              ├─ load orgs.json
              └─ Return: {email, role, org_id, org_name}

Session cookie = HMAC-SHA256(APP_SECRET, payload)
```

### RFID Authorization Flow (Which Files?)

```
CP (charger)
  │
  ├──> Authorize {idTag}
        └──> ocpp_ws.py::on_authorize()
              ├─ auth_store.contains(tag)
              │   └─ In-memory check (from auth_tags.json loaded at startup)
              │
              ├─ is_tag_allowed_on_cp(tag, cp_id)
              │   ├─ load rfids.json
              │   ├─ load cps.json
              │   └─ Check: rfid.org_id == cp.org_id
              │
              └─ Return: Authorize{status}
  
  ├──> StartTransaction {idTag, meterStart, ...}
        └──> ocpp_ws.py::on_start_transaction()
              ├─ Check auth again
              ├─ Get tx_id from Redis INCR
              ├─ enrich_transaction_snapshot()
              │   └─ Snapshot: org_id, user_name, cp_alias (from rfids, users, orgs, cps JSON)
              ├─ Redis SET open_tx:{id}
              ├─ Append to transactions.json
              └─ Return: StartTransaction{txId}
  
  └──> StopTransaction {transactionId, meterStop, ...}
        └──> ocpp_ws.py::on_stop_transaction()
              ├─ Redis GET open_tx:{id}
              ├─ Update with stop_time, meter_stop
              ├─ Redis DEL open_tx:{id}
              ├─ Update transactions.json
              └─ Complete!

Access control files:
- auth_tags.json        (fast path: allowlist)
- rfids.json            (org_id binding + metadata)
- cps.json              (org_id binding)
- users.json            (backup, user role lookup)
```

### Remote Command Flow (Which Files?)

```
Portal UI (portal_live_ops.js)
  │
  └──> POST /api/portal/ocpp/command
        └──> api.py::api_portal_ocpp_command()
              ├─ Load cps.json (validate CP exists)
              ├─ Check: CP in Redis connected_cps
              ├─ Build envelope
              ├─ Redis RPUSH ocpp:commands
              ├─ Redis SETEX ocpp:command_result:{id}
              └─ Return: {command_id}
  
  │ (background)
  │
  └──> ocpp_ws.py::command_worker()
        ├─ Redis BLPOP ocpp:commands
        ├─ build_ocpp_call(command, payload)
        ├─ cp.call(request) → sends to CP
        └─ Redis SETEX ocpp:command_result:{id} {status, response}
  
  │ (poll)
  │
  └──> GET /api/portal/ocpp/command/{command_id}
        └──> api.py::api_portal_ocpp_command_status()
              └─ Redis GET ocpp:command_result:{id} → return

Files involved:
- cps.json              (CP org validation)
- (Redis)               (queue + result caching)
- No persistent files written
```

### History Query Flow (Which Files?)

```
User/Admin accesses: GET /api/users/history
  │
  └──> api.py::api_users_history()
        ├─ Check session (verify_token on cookie)
        ├─ Load transactions.json
        ├─ Load users.json
        ├─ Load rfids.json
        ├─ Call _allowed_tags_for_session()
        │   ├─ If org_admin: filter by session.org_id
        │   ├─ If user: filter by session.email
        │   └─ If portal_admin: show all
        ├─ Filter transactions by:
        │   ├─ Time range (stop_time in [now-days, now])
        │   ├─ Tag (if specified)
        │   └─ Allowed tags (per role)
        └─ Return: [{tag, name, energy_kwh, timestamps, ...}]

Files read (never written to):
- users.json            (for name lookup)
- rfids.json            (for org filtering)
- transactions.json     (the history records)
```

---

## File Access Patterns

### Files that are READ FREQUENTLY (cache candidates)

| File | Read By | Frequency | Size |
|------|---------|-----------|------|
| auth_tags.json | is_tag_allowed_on_cp | Per RFID swipe (100+/day) | Small (<10KB) ✓cached |
| rfids.json | is_tag_allowed_on_cp, API RFID endpoints | Per auth + API (50+/day) | Medium (50-500KB) |
| cps.json | org_for_cp, CP endpoints | Per auth + UI poll (100+/day) | Small (<10KB) |
| users.json | find_user_by_email, login, API | Per auth + API (50+/day) | Medium (50-200KB) |
| orgs.json | Org name lookups | Per API call (10+/day) | Small (<5KB) ✓cache-friendly |

**Caching Strategy**:
- `auth_tags.json` - **CACHED in memory** (AuthStore) @ startup
- Others - **Not cached** (reload on each read for consistency)

### Files that are WRITTEN CAREFULLY

| File | Written By | Frequency | Atomicity |
|------|-----------|-----------|-----------|
| auth_tags.json | AuthStore.add/remove | Per RFID create/delete (1-10/day) | atomic file write |
| rfids.json | api_rfids_* endpoints | Per RFID change (1-10/day) | atomic file write |
| users.json | api_users_* endpoints | Per user change (1-5/day) | atomic file write |
| cps.json | api_cps_* endpoints + OCPP on_connect | Per CP change (on startup) | atomic file write |
| transactions.json | ocpp_ws.on_start/stop | Per transaction (100+/day) | atomic append/update |

**Note**: All JSON writes use atomic `path.write_text()`. If service crashes between load/save, data is not corrupted (worst case: last transaction lost).

---

## Environment Variables Flow

```
.env or .env.demo
  │
  ├──> REDIS_PASSWORD, REDIS_HOST, REDIS_PORT
  │     └──> redis_config.py::build_redis_client()
  │          │
  │          ├──> api.py (redis_client object)
  │          └──> ocpp_ws.py (redis_client object)
  │
  ├──> APP_SECRET
  │     └──> api.py, ocpp_ws.py (session token signing)
  │          └─ set_session_cookie()
  │          └─ verify_token()
  │
  ├──> SESSION_TTL_MIN
  │     └──> api.py (session expiry)
  │
  ├──> CP_AUTH_REQUIRED, CP_SHARED_TOKEN, CP_AUTOMAP_ON_CONNECT, PORTAL_TAGS_GLOBAL
  │     └──> ocpp_ws.py (OCPP behavior)
  │
  ├──> API_PORT, OCPP_PORT
  │     └──> Uvicorn / Websockets bind ports
  │
  └──> BACKUP_* variables
        └──> Backup service (if enabled)
```

---

## Critical Dependencies Between Services

### api.py ←→ redis-service
```
Purpose: Session caching, OCPP command queue, results
Calls:
- redis_client.setex()        (sessions, command results)
- redis_client.get()          (load sessions, results)
- redis_client.smembers()     (connected CPs)
- redis_client.rpush()        (queue commands)
```

### ocpp_ws.py ←→ redis-service
```
Purpose: CP connections, transaction state, commands
Calls:
- redis_client.sadd()         (register CP connection)
- redis_client.srem()         (unregister CP)
- redis_client.blpop()        (command worker loop)
- redis_client.set()          (connector status, transaction state)
- redis_client.incr()         (transaction ID counter)
```

### api.py ←→ ocpp_ws.py (indirect via Redis)
```
Purpose: Remote command dispatch
- api.py RPUSH "ocpp:commands"
- ocpp_ws.py BLPOP "ocpp:commands"
- ocpp_ws.py SETEX "ocpp:command_result:{id}"
- api.py GET "ocpp:command_result:{id}"
No direct function calls; all async via Redis queue
```

### Both services ←→ /data (shared volume)
```
Reads:
- config/auth_tags.json
- config/rfids.json
- config/users.json
- config/cps.json
- config/orgs.json

Writes:
- auth_tags.json      (auth_store.py)
- rfids.json          (api_rfids_* endpoints, OCPP auto-map)
- users.json          (api_users_* endpoints)
- cps.json            (api_cps_* OCPP on_connect)
- transactions.json   (ocpp_ws.on_start/stop_transaction)
- rfid_audit.json     (api_rfids_* endpoints)
```

---

## Module Import Hierarchy

```
api.py imports:
├── app.auth_store           (AuthStore class)
├── app.redis_config         (build_redis_client)
└── Standard: FastAPI, Pydantic, UUID, datetime, JSON, etc

ocpp_ws.py imports:
├── app.auth_store           (AuthStore class)
├── app.redis_config         (build_redis_client)
├── app.history_export       (enrich_transaction_snapshot)
├── Websockets, OCPP library
└── Standard: asyncio, JSON, UUID, datetime, etc

app/auth_store.py imports:
├── json, pathlib, threading
└── No external dependencies

app/redis_config.py imports:
├── redis library
└── os (getenv)

app/history_export.py imports:
├── openpyxl (Excel generation)
├── json, datetime, pathlib
└── No web framework dependencies
```

---

## Code Organization Patterns

### API Endpoints Pattern (in api.py)

```python
@app.post("/api/resource")
async def create_resource(body: BodyModel, session=Depends(require_auth)):
    # 1. Extract/validate input
    value = body.field.strip()
    
    # 2. Load relevant JSON files
    data = load_resource_map()
    
    # 3. Check permissions
    if session["role"] not in ("org_admin", "portal_admin"):
        raise HTTPException(403, "...")
    
    # 4. Perform logic
    data["key"] = new_entry
    
    # 5. Persist to disk
    save_resource_map(data)
    
    # 6. Update Redis (if needed)
    redis_client.sadd/set/etc()
    
    # 7. Audit log
    append_audit(session, "action", ...)
    
    return {ok: true, ...}
```

### OCPP Handler Pattern (in ocpp_ws.py)

```python
@on(Action.authorize)
async def on_authorize(self, id_tag, **kwargs):
    # 1. Check allowlist (memory)
    if not auth_store.contains(id_tag):
        return BlockResult
    
    # 2. Check org match (disk reads)
    if not is_tag_allowed_on_cp(id_tag, self.id):
        return BlockResult
    
    # 3. Return OCPP result
    return call_result.Authorize(
        id_tag_info={"status": "Accepted"}
    )
    
    # Log
    logger.info("...")
```

---

## Testing Strategy Per Component

| Component | How to Test | Test File |
|-----------|------------|-----------|
| auth_store.py | Python unittest | (none: used by tests) |
| redis_config.py | Need working Redis | (integration test) |
| api.py | FastAPI TestClient | (not in repo) |
| ocpp_ws.py | WebSocket client + mock CP | tools/simulate_demo_chargers.py |
| Frontend JS | Browser + manual | (manual QA) |
| Integration | Docker + curl | (manual QA) |

---

**END OF FILE INDEX**

This document maps:
- Every file and its purpose
- Key relationships between files
- Data flow through files
- Access patterns (read/write frequency)
- Import dependencies
- Code organization patterns

Use this to navigate the codebase quickly!


