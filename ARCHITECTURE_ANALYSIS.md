# EV CSMS - Complete Architecture Analysis

## 1. SYSTEM OVERVIEW

This is a multi-service, microservices-based EV Charging Station Management System (CSMS) that implements OCPP 1.6J protocol.

### Core Technology Stack
- **Backend**: Python 3.11 + FastAPI (REST API), websockets (OCPP)
- **Frontend**: HTML5 + Bootstrap 5 + Vanilla JavaScript
- **Data Layer**: JSON files (persistent) + Redis (runtime state)
- **Infrastructure**: Docker Compose with 5 services
- **Protocols**: OCPP 1.6J (WebSocket), HTTP/REST, JSON, HMAC-SHA256

### Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     UI-SERVICE (Port 8080)                   │
│              (Nginx static + proxy to API)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ├──────────────────────┐
                         ▼                      ▼
        ┌──────────────────────────┐  ┌──────────────────────┐
        │   API-SERVICE (8000)      │  │ OCPP-WS (9000)      │
        │  (REST endpoints)         │  │ (OCPP protocol)     │
        └────────────┬──────────────┘  └──────────┬──────────┘
                     │                            │
                     └──────────────┬─────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │    REDIS-SERVICE (6379)        │
                    │  (Runtime state + sessions)    │
                    └────────────────────────────────┘

DATA LAYER (Docker volumes: /data)
├── /data/config/
│   ├── auth_tags.json        → RFID allowlist
│   ├── rfids.json            → RFID metadata + org binding
│   ├── users.json            → User accounts + auth
│   ├── orgs.json             → Organization definitions
│   └── cps.json              → Charge point org mapping
├── /data/
│   └── transactions.json     → All charging sessions
└── /data/backups/            → Backup state
```

---

## 2. DATA MODEL AND PERSISTENCE

### Core JSON Data Structures

#### A. **auth_tags.json** - RFID Allowlist
```json
[
  "8B3D028A",
  "4BC5918A",
  "ADMIN",
  ...
]
```
**Purpose**: Fast allowlist check. Tags not here → authorization blocked  
**Source of Truth**: AuthStore (in-memory set)  
**Write Operations**: When RFID activated/deactivated

---

#### B. **rfids.json** - RFID Master Registry
```json
{
  "8B3D028A": {
    "alias": "S1",
    "org_id": "Takorama_Storås",
    "user_email": "hugo@takorama.se",
    "active": true,
    "updated_at": "2026-03-25T06:21:26.303821Z"
  }
}
```
**Purpose**: Central RFID metadata + org binding  
**Key Fields**:
- `alias`: Display name
- `org_id`: Organization membership (critical for access control)
- `user_email`: Link to user (enables per-user filtering)
- `active`: Enablement flag

---

#### C. **users.json** - User Account Registry
```json
{
  "8B3D028A": {
    "first_name": "Hugo",
    "last_name": "Danielsson",
    "name": "Hugo Danielsson",
    "email": "hugo@takorama.se",
    "role": "org_admin",
    "org_id": "Takorama_Storås",
    "pwd_salt": "Y1qyNGXOXz7fRgMkUzuEMA",
    "pwd_hash": "GjJMtdrB6jBM8SBHof3L9P4ik7HpR3ZucuFk_YojPAE"
  }
}
```
**Purpose**: User login + role/org assignments  
**Key Fields**:
- `role`: "user" | "org_admin" | "portal_admin"
- `org_id`: Organization membership
- `pwd_salt` / `pwd_hash`: PBKDF2 (200k iterations)

---

#### D. **cps.json** - Charge Point Registry
```json
{
  "ocpp/laddbox_kontor": {
    "org_id": "Takorama_Storås",
    "alias": "Laddare 1 baksida"
  }
}
```
**Purpose**: CP → Organization binding + metadata  
**Critical**: Determines org membership for access control

---

#### E. **orgs.json** - Organization Directory
```json
{
  "default": { "name": "Default" },
  "Takorama_Storås": { "name": "Takorama Storås" },
  "kaefer_std": { "name": "Kaefer Stora Höga" }
}
```
**Purpose**: Org metadata (display names)

---

#### F. **transactions.json** - Charging Session Log
```json
[
  {
    "transaction_id": 1,
    "charge_point": "ocpp/laddbox_kontor",
    "connectorId": 2,
    "id_tag": "8B3D028A",
    "tag_alias": "S1",
    "user_email": "hugo@takorama.se",
    "start_time": "2026-04-09T11:27:05Z",
    "meter_start": 5000000,
    "stop_time": "2026-04-09T11:35:22Z",
    "meter_stop": 5123000,
    "org_id": "Takorama_Storås",
    "org_name": "Takorama Storås",
    "charge_point_alias": "Laddare 1 baksida",
    "user_name": "Hugo Danielsson"
  }
]
```
**Purpose**: Persistent charging history  
**Enrichment**: On start_transaction, system adds org/user metadata snapshot

---

### Redis Runtime State

```
connected_cps                          → SET of connected CP IDs
  └─ Members: ["ocpp/laddbox_kontor", ...]

connector_status:cp_id:connector_id    → JSON string
  ├─ Key: connector_status:ocpp/laddbox_kontor:0
  ├─ Value: {status, error, timestamp}
  └─ Used by: /api/status endpoint

open_tx:transaction_id                 → JSON string (active session)
  ├─ Key: open_tx:1
  ├─ Value: Transaction record (partial)
  └─ TTL: Until StopTransaction received

ocpp:commands                          → LIST (command queue)
  ├─ Items: JSON command envelopes
  ├─ Consumer: ocpp_ws command_worker
  └─ Used by: Remote commands (RemoteStartTransaction, etc)

ocpp:command_result:command_id         → JSON string (result cache)
  ├─ Key: ocpp:command_result:abc123
  ├─ Value: {status, response/error, updated_at}
  ├─ TTL: 600 seconds
  └─ Used by: Polling for command results

next_tx_id                             → Integer (counter)
  └─ Incremented on each StartTransaction
```

---

## 3. AUTHENTICATION AND SESSION FLOW

### Login Flow (Complete Call Chain)

```
1. USER VISITS PORTAL
   ↓
2. login.js: DOMContentLoaded
   ├─ Try: GET /api/auth/me (check if already logged in)
   ├─ If 401/error → Show login form
   └─ If success → Redirect to dashboard per role

3. USER SUBMITS LOGIN FORM
   ├─ email: hugo@takorama.se
   └─ password: [plaintext]
   
4. login.js: form submit handler
   ├─ Call: POST /api/auth/login
   │   └─ Body: {email, password}
   │
5. api.py: @app.post("/api/auth/login")
   ├─ Load users.json
   │
   ├─ Search: Find tag where users[tag].email == email
   │   └─ Must find exactly ONE match
   │
   ├─ Extract: pwd_salt, pwd_hash
   │
   ├─ Verify: verify_password(password, salt, hash)
   │   ├─ Hash input: PBKDF2-SHA256(200k iter)
   │   ├─ Compare: hmac.compare_digest(hash_input, hash_stored)
   │   └─ Returns: boolean
   │
   ├─ If valid:
   │   ├─ Extract: role, org_id
   │   ├─ Call: set_session_cookie(response, email, role, org_id)
   │   │   ├─ Build token_raw: {email, role, org_id, exp: +720 minutes}
   │   │   ├─ Serialize: JSON.dumps(token_raw)
   │   │   ├─ Sign: HMAC-SHA256(APP_SECRET, raw)
   │   │   ├─ Encode: base64url(raw) + "." + base64url(sig)
   │   │   └─ Set Cookie: HttpOnly, SameSite=Lax, Secure=true
   │   └─ Return: {ok: true, email}
   │
   └─ If invalid:
       └─ Return: 401 "Felaktig e‑post/lösenord"

6. login.js: After successful POST
   ├─ Call: GET /api/auth/me
   │   (Validates session + gets fresh user data)
   │
7. api.py: @app.get("/api/auth/me")
   ├─ Extract session cookie
   ├─ Verify token (signature + expiry)
   ├─ Load users.json
   ├─ Return: {email, role, org_id, org_name, name}
   │
8. login.js: goToRole(me)
   ├─ If role == "portal_admin" → /portal/index
   ├─ Else if role == "org_admin" → /org/index
   └─ Else → /user/index
```

### Session Validation (Middleware Pattern)

Every protected endpoint calls:
```python
def get_session(request: Request):
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(401, "Not authenticated")
    return verify_token(token)  # Validates signature + expiry

def verify_token(token: str) -> dict:
    # Split: base64url_raw . base64url_sig
    # Decode both
    # Verify: HMAC-SHA256(APP_SECRET, raw) == sig
    # Parse JSON from raw
    # Check expiry
    # Return: {email, role, org_id, exp}
```

---

## 4. AUTHORIZATION MODEL - ORG-BASED ACCESS CONTROL

### A. RFID Authorization (OCPP Level)

**Location**: `ocpp_ws.py::is_tag_allowed_on_cp(tag, cp_id)`

```python
def is_tag_allowed_on_cp(tag: str, cp_id: str) -> bool:
    # Step 1: Check allowlist
    allowed = auth_store.contains(tag)
    if not allowed:
        return False  # Not whitelisted
    
    # Step 2: Load org mappings
    rfids = load_rfids_map()
    rfid = rfids.get(normalize_tag(tag))
    
    if rfid:
        # RFID-based access control
        if not bool(rfid.get("active", True)):
            return False  # Disabled RFID
        
        user_email = (rfid.get("user_email") or "").strip().lower()
        if not user_email:
            return False  # RFID not assigned to user
        
        # Find user by email
        users = load_users_map()
        user = find_user_by_email(users, user_email)
        if not user:
            return False  # User not found
        
        tag_role = (user.get("role") or "user").lower()
        tag_org = rfid.get("org_id") or user.get("org_id")
    else:
        # Legacy: users keyed by RFID tag (backwards compat)
        users = load_users_map()
        user = users.get(tag)
        if not user:
            return False
        tag_role = (user.get("role") or "user").lower()
        tag_org = user.get("org_id")
    
    # Step 3: Get CP's organization
    cp_org = org_for_cp(cp_id)  # Returns CP's org_id or "default"
    
    # Step 4: Portal admin global access (if enabled)
    portal_global = os.getenv("PORTAL_TAGS_GLOBAL", "false").lower() in ("1", "true", "yes")
    if portal_global and tag_role in ("portal_admin", "admin"):
        return True  # Portal admin can charge anywhere
    
    # Step 5: Org match check
    return tag_org == cp_org  # CRITICAL: must be same org
```

**Call Sites**:
1. `ocpp_ws.py::on_authorize()` - User swipes RFID
2. `ocpp_ws.py::on_start_transaction()` - Transaction starts
3. `api.py::validate_ocpp_command_payload()` - For RemoteStartTransaction

---

### B. User Role Hierarchy

```
portal_admin (global admin)
├─ Can: Manage all orgs, users, CPs, RFIDs
├─ View: All data across all orgs
├─ Access: All CPs globally (if PORTAL_TAGS_GLOBAL=true)
└─ Session: org_id = None

org_admin (organization admin)
├─ Can: Add users, manage RFIDs within own org
├─ View: Own org data only
├─ Access: Only CPs in own org
└─ Session: org_id = "Takorama_Storås"

user (regular user)
├─ Can: View own charging history
├─ View: Only own sessions
├─ Access: Charge on own org's CPs
└─ Session: org_id = "Takorama_Storås"
```

---

### C. Data Access Control (API Level)

#### Endpoint: `GET /api/rfids`
```python
# Org_admin sees only RFIDs in their org
if role == "org_admin":
    filtered = [r for r in rfids if r.org_id == session.org_id]

# Portal_admin sees all
# Users can't access
```

#### Endpoint: `GET /api/cps`
```python
# Org_admin sees only CPs assigned to their org
def allowed_cps_for_session(session):
    if role in ("portal_admin", "admin"):
        return None  # All CPs
    
    oid = session.get("org_id")
    cps = normalize_cps_map(load_cps_map())
    return {cp for cp, meta in cps.items() if meta.get("org_id") == oid}
```

#### Endpoint: `GET /api/users/history`
```python
# User sees only own history
# Org_admin sees org's users' history
# Portal_admin sees all

def _allowed_tags_for_session(session, users_map):
    role = session.get("role")
    if role in ("portal_admin", "admin"):
        return None  # All tags
    if role == "org_admin":
        oid = session.get("org_id")
        rfids = load_rfids_map()
        return {t for t, r in rfids.items() if r.org_id == oid}
    
    # Regular user: only own email
    email = session.get("email").lower()
    rfids = load_rfids_map()
    return {t for t, r in rfids.items() 
            if (r.user_email or "").lower() == email}
```

---

## 5. OCPP PROTOCOL FLOW - CHARGING SESSION LIFECYCLE

### Phase 1: Charge Point Connection

```
1. CP CONNECTS via WebSocket
   URL: ws://localhost:9000/ocpp/laddbox_kontor?token=...
   Prototool: ocpp1.6

2. ocpp_ws.py::on_connect(websocket, path)
   ├─ Parse path: cp_id = "ocpp/laddbox_kontor"
   ├─ Parse query: token = (from URL)
   │
   ├─ Validate CP ID:
   │   └─ If CP_AUTH_REQUIRED=true:
   │       ├─ Check: cp_id in cps.json keys
   │       └─ If CP_SHARED_TOKEN set:
   │           └─ Check: query token == CP_SHARED_TOKEN
   │
   ├─ Auto-map to org:
   │   └─ If CP_AUTOMAP_ON_CONNECT=true:
   │       ├─ Load cps.json
   │       └─ If cp_id not in cps:
   │           └─ Create: cps[cp_id] = {org_id: "default", alias: cp_id}
   │
   ├─ Redis: sadd("connected_cps", cp_id)
   │
   ├─ Create: cp = CentralSystemCP(cp_id, websocket)
   ├─ Track: connected_clients[cp_id] = cp
   │
   ├─ Call: cp.start()  ← Start OCPP handler loop
   │
   └─ Finally block:
       ├─ Redis: srem("connected_cps", cp_id)
       └─ Cleanup: connected_clients.pop(cp_id)
```

### Phase 2: Boot Notification

```
1. CP sends: BootNotification
   {
     "chargePointVendor": "Wallbox",
     "chargePointModel": "Copper SB"
   }

2. ocpp_ws.py::on_boot_notification()
   └─ Return: BootNotification
       {
         "currentTime": "2026-04-09T11:25:14.000Z",
         "interval": 30,
         "status": "Accepted"
       }
```

### Phase 3: Heartbeat Loop

```
1. CP sends: Heartbeat (every 30 seconds)

2. ocpp_ws.py::on_heartbeat()
   └─ Return: Heartbeat {currentTime: now}
```

### Phase 4: Status Notifications

```
1. CP sends: StatusNotification
   {
     "connectorId": 2,
     "status": "Available",
     "errorCode": "NoError",
     "timestamp": "2026-04-09T11:27:05.000Z"
   }

2. ocpp_ws.py::on_status_notification()
   ├─ Build key: "connector_status:ocpp/laddbox_kontor:2"
   ├─ Redis SET:
   │   value = {status, error, timestamp}
   │   TTL = none (persistent in Redis)
   │
   └─ Return: StatusNotification (empty)

3. API polls: GET /api/status
   ├─ Load: All connector_status:*:* keys
   ├─ Parse and return
   └─ UI renders: Green dot = Available, Yellow = Preparing, etc
```

### Phase 5: User Authorization - Swipe RFID

```
1. CP receives: Authorize (from vehicle's RFID)
   {
     "idTag": "8B3D028A"
   }

2. ocpp_ws.py::on_authorize()
   ├─ Load: AuthStore (auth_tags.json)
   ├─ Check: is_tag_allowed_on_cp("8B3D028A", "ocpp/laddbox_kontor")
   │   ├─ Check allowlist ✓
   │   ├─ Check rfid exists ✓
   │   ├─ Check org_id matches ✓ or ✗
   │   └─ Return: bool
   │
   ├─ If allowed:
   │   └─ status = AuthorizationStatus.accepted
   └─ If blocked:
       └─ status = AuthorizationStatus.blocked
   
   └─ Return: Authorize
       {
         "idTagInfo": {
           "status": "Accepted" | "Blocked"
         }
       }

3. Logging:
   "[ocpp/laddbox_kontor] Authorize id_tag=8B3D*** -> Accepted"
```

### Phase 6: Start Transaction

```
1. CP sends: StartTransaction
   {
     "connectorId": 2,
     "idTag": "8B3D028A",
     "meterStart": 5000000,
     "timestamp": "2026-04-09T11:27:05.000Z"
   }

2. ocpp_ws.py::on_start_transaction()
   ├─ Get next tx_id: Redis INCR("next_tx_id")
   │
   ├─ Check auth again:
   │   └─ is_tag_allowed_on_cp("8B3D028A", "ocpp/laddbox_kontor")
   │
   ├─ If blocked: status = "Blocked" but tx_id still issued
   │
   ├─ Build entry:
   │   {
   │     "transaction_id": 1,
   │     "charge_point": "ocpp/laddbox_kontor",
   │     "connectorId": 2,
   │     "id_tag": "8B3D028A",
   │     "start_time": "...",
   │     "meter_start": 5000000,
   │     "stop_time": None,
   │     "meter_stop": None
   │   }
   │
   ├─ Enrich with snapshot:
   │   └─ Call: enrich_transaction_snapshot()
   │       ├─ Load: rfids, cps, users, orgs
   │       ├─ Add: tag_alias, user_email, user_name, org_id, org_name, charge_point_alias
   │       └─ Snapshot these at transaction start (for audit trail)
   │
   ├─ Store in Redis:
   │   Key: "open_tx:1"
   │   Value: JSON (entire entry)
   │   TTL: None (persists until StopTransaction)
   │
   ├─ Persist to transactions.json:
   │   └─ Append entry
   │
   └─ Return: StartTransaction
       {
         "transactionId": 1,
         "idTagInfo": {
           "status": "Accepted" | "Blocked"
         }
       }

3. Log: "StartTransaction: tx_id=1, cp=ocpp/laddbox_kontor, tag=8B3D***"
```

### Phase 7: Meter Values (Optional)

```
CP may send: MeterValues
{
  "connectorId": 2,
  "transactionId": 1,
  "meterValue": [
    {
      "timestamp": "2026-04-09T11:30:00.000Z",
      "sampledValue": [
        {"value": "5050000", "measurand": "Energy.Active.Import.Register"}
      ]
    }
  ]
}
```

(System receives but doesn't store live - only start/stop meters matter)

### Phase 8: Stop Transaction

```
1. CP sends: StopTransaction
   {
     "transactionId": 1,
     "meterStop": 5123000,
     "timestamp": "2026-04-09T11:35:22.000Z"
   }

2. ocpp_ws.py::on_stop_transaction()
   ├─ Look up: Redis GET("open_tx:1")
   │   └─ Retrieve in-memory entry
   │
   ├─ Update entry:
   │   {
   │     ...[from start]...,
   │     "stop_time": "2026-04-09T11:35:22.000Z",
   │     "meter_stop": 5123000
   │   }
   │
   ├─ Remove from active:
   │   └─ Redis DEL("open_tx:1")
   │
   ├─ Update persistent:
   │   └─ Load transactions.json
   │   ├─ Find tx where transaction_id == 1
   │   ├─ Update with stop data
   │   └─ Save transactions.json
   │
   └─ Return: StopTransaction (empty)

3. Log: "StopTransaction: tx_id=1, energy=(meter_stop-meter_start)/1000 kWh"
```

---

## 6. REMOTE COMMAND FLOW (Portal → CP)

### User clicks "Start Charging" on portal

```
1. FRONTEND: portal/live_ops.js
   ├─ Button: "Remote Start Transaction"
   ├─ Prompt: Which connector? Which RFID tag?
   ├─ Post: /api/portal/ocpp/command
   │   Body: {
   │     cp_id: "ocpp/laddbox_kontor",
   │     command: "remote_start_transaction",
   │     payload: {id_tag: "8B3D028A", connector_id: 2}
   │   }

2. API: @app.post("/api/portal/ocpp/command")
   ├─ Require: portal_admin role
   │
   ├─ Validate command:
   │   └─ Call: validate_ocpp_command_payload(command, payload)
   │       ├─ Normalize: id_tag = "8B3D028A"
   │       ├─ Check: connector_id >= 1
   │       └─ Return normalized payload
   │
   ├─ Check: cp_id in connected_cps (Redis SMEMBERS)
   │   └─ If not → 409 "Laddare är inte ansluten"
   │
   ├─ Generate: command_id = uuid4()
   │
   ├─ Build envelope:
   │   {
   │     "command_id": "abc-123",
   │     "cp_id": "ocpp/laddbox_kontor",
   │     "command": "remote_start_transaction",
   │     "payload": {id_tag, connector_id},
   │     "requested_by": "hugo@takorama.se",
   │     "requested_at": "2026-04-09T11:40:00Z"
   │   }
   │
   ├─ Store result placeholder:
   │   Redis SETEX(
   │     "ocpp:command_result:abc-123",
   │     600,  ← 10 minute TTL
   │     {command_id, status: "queued", ...}
   │   )
   │
   ├─ Queue command:
   │   Redis RPUSH("ocpp:commands", json(envelope))
   │
   └─ Return: {ok: true, command_id: "abc-123", status: "queued"}

3. FRONTEND: Poll for status
   GET /api/portal/ocpp/command/abc-123

4. API: @app.get("/api/portal/ocpp/command/{command_id}")
   ├─ Load: Redis GET("ocpp:command_result:abc-123")
   ├─ If hit: Return JSON
   └─ If miss: 404 (expired after 10 min)

5. OCPP-WS COMMAND WORKER: ocpp_ws.py::command_worker()
   ├─ Loop: blocking wait for "ocpp:commands" list items
   │
   ├─ Receive: {command_id, cp_id, command, payload, ...}
   │
   ├─ Look up: cp = connected_clients.get(cp_id)
   │   └─ If not found:
   │       ├─ Set result: status = "failed", error = "not connected"
   │       └─ Continue
   │
   ├─ Build OCPP call:
   │   └─ Call: build_ocpp_call(command, payload)
   │       ├─ command = "remote_start_transaction"
   │       ├─ return: ocpp.v16.call.RemoteStartTransaction(
   │       │     id_tag="8B3D028A",
   │       │     connector_id=2
   │       │   )
   │       └─ These are typed namedtuples from the ocpp library
   │
   ├─ Send to CP:
   │   └─ response = await cp.call(request)
   │       └─ Wait for CP's CallResult response
   │
   ├─ Update result:
   │   Redis SETEX(
   │     "ocpp:command_result:abc-123",
   │     600,
   │     {command_id, status: "success", response: {...}}
   │   )
   │
   └─ Catch exceptions:
       └─ Update result: status = "failed", error = str(exception)

6. CP Processes:
   ├─ Receives: RemoteStartTransaction
   │   {idTag: "8B3D028A", connectorId: 2}
   │
   ├─ Initiates: plug authorization
   │
   ├─ Sends: Authorize message
   │   {idTag: "8B3D028A"}
   │
   └─ (System continues with auth flow from above)
```

---

## 7. FRONTEND ROUTING AND PAGE STRUCTURE

### URL Hierarchy

```
/login.html                    ← Public, no auth required

/                              ← Redirects to /login.html

/portal/index.html             ← Portal admin dashboard
├─ API: GET /api/auth/me       ← Check role (must be portal_admin)
├─ API: GET /api/orgs          ← List all orgs
├─ API: GET /api/portal/live/chargers ← Live charger status
├─ API: GET /api/rfids         ← All RFIDs
├─ API: POST /api/portal/ocpp/command ← Send OCPP commands
└─ Modules:
    ├─ portal_index.js
    ├─ portal_live_ops.js       ← Remote start/stop
    ├─ portal_cps.js            ← Manage charge points
    └─ ...

/org/index.html                ← Org admin dashboard
├─ API: GET /api/auth/me       ← Check role (must be org_admin)
├─ API: GET /api/rfids?org_id=... ← RFIDs in org
├─ API: POST /api/rfids        ← Create new RFID
├─ API: PATCH /api/rfids/{tag} ← Update RFID
└─ Modules:
    ├─ org_index.js
    ├─ org_users.js
    └─ ...

/user/index.html               ← End user dashboard
├─ API: GET /api/auth/me       ← Check role
├─ API: GET /api/users/summary ← My charging summary
├─ API: GET /api/users/history ← My charging history
└─ Modules:
    ├─ user_index.js
    └─ user_my.js
```

### Frontend Auth Guards

Every page loads `ui-common.js`:

```javascript
UI.requireRole(['portal_admin', 'org_admin'])  // or ['user'], etc
├─ Call: GET /api/auth/me
├─ If 401: Redirect to /login
├─ If wrong role: Redirect to dashboard for your role
└─ Return: me {email, role, org_id, org_name, name}
```

---

## 8. CRITICAL CALL CHAINS - END-TO-END FLOWS

### Flow A: User Swipes RFID to Charge

```
1. CP receives RFID card
   ↓
2. CP→WS: Authorize {idTag: "8B3D028A"}
   ↓
3. ocpp_ws.py::on_authorize()
   ├─ auth_store.contains("8B3D028A") → TRUE
   ├─ is_tag_allowed_on_cp("8B3D028A", "ocpp/laddbox_kontor")
   │   ├─ rfids[8B3D028A].org_id = "Takorama_Storås"
   │   ├─ cp[ocpp/laddbox_kontor].org_id = "Takorama_Storås"
   │   └─ Match! → TRUE
   └─ Return: Authorize {idTagInfo: {status: "Accepted"}}
   ↓
4. CP→WS: StartTransaction {connectorId: 2, idTag: "8B3D028A", ...}
   ↓
5. ocpp_ws.py::on_start_transaction()
   ├─ tx_id = Redis INCR("next_tx_id") → 1
   ├─ Check auth again → Accepted
   ├─ enrich_transaction_snapshot() adds org/user snapshots
   ├─ Redis SET("open_tx:1", {entry})
   ├─ transactions.json append
   └─ Return: StartTransaction {transactionId: 1, ...}
   ↓
6. CP charges... (MeterValues, StatusNotifications, etc)
   ↓
7. CP→WS: StopTransaction {transactionId: 1, meterStop: 5123000, ...}
   ↓
8. ocpp_ws.py::on_stop_transaction()
   ├─ Redis GET("open_tx:1") → entry
   ├─ Update entry with stop_time, meter_stop
   ├─ Redis DEL("open_tx:1")
   ├─ transactions.json update
   └─ Complete!
   ↓
9. PORTAL USER VIEWS HISTORY
   ├─ GET /api/users/history?days=30
   ├─ api.py filters by session.org_id
   └─ Returns: [{tag, user_name, energy_kwh, start_time, stop_time, ...}]
```

### Flow B: Portal Admin Sends Remote Start Command

```
1. Portal↔ADMIN clicks "Start Charging" button
   ↓
2. JavaScript:
   POST /api/portal/ocpp/command
   Body: {cp_id: "ocpp/laddbox_kontor", command: "remote_start_transaction", 
           payload: {id_tag: "8B3D028A", connector_id: 2}}
   ↓
3. api.py::@app.post("/api/portal/ocpp/command")
   ├─ Require portal_admin
   ├─ Validate command + payload
   ├─ Check: "ocpp/laddbox_kontor" in connected_cps (Redis)
   ├─ Generate command_id = "abc-123"
   ├─ Redis SETEX("ocpp:command_result:abc-123", 600, {queued})
   ├─ Redis RPUSH("ocpp:commands", {envelope})
   └─ Return: {ok: true, command_id: "abc-123"}
   ↓
4. ocpp_ws.py::command_worker() LOOP
   ├─ Redis BLPOP("ocpp:commands", 1) → envelope
   ├─ cp = connected_clients["ocpp/laddbox_kontor"]
   ├─ request = call.RemoteStartTransaction(id_tag="8B3D028A", connector_id=2)
   ├─ response = await cp.call(request)  ← SENDS TO CP
   ├─ Redis SETEX("ocpp:command_result:abc-123", 600, {success, response})
   └─ Continue loop
   ↓
5. CP receives: RemoteStartTransaction {idTag: "8B3D028A", connectorId: 2}
   ├─ CP implements logic to start charging plug
   ├─ CP→WS: Authorize {idTag: "8B3D028A"}
   └─ (Now follows normal charging flow from Flow A)
   ↓
6. Frontend polls for status:
   GET /api/portal/ocpp/command/abc-123
   ├─ Redis GET("ocpp:command_result:abc-123")
   └─ Return: {command_id, status: "success", response: {...}}
```

### Flow C: Org Admin Creates New RFID User

```
1. OrgAdmin accesses: /org/users.html
   ↓
2. JavaScript:
   ├─ GET /api/orgs → verify session org
   ├─ GET /api/rfids → list org's RFIDs
   ├─ UI renders form: tag, email, org_id, active
   ↓
3. OrgAdmin fills: tag="ABC12345", email="erik@takorama.se", active=true
   ↓
4. JavaScript:
   POST /api/rfids
   Body: {tag: "ABC12345", org_id: "Takorama_Storås", user_email: "erik@takorama.se", active: true}
   ↓
5. api.py::@app.post("/api/rfids")
   ├─ Require org_admin or portal_admin
   ├─ Extract session org_id = "Takorama_Storås"
   ├─ Load rfids.json
   ├─ Load users.json
   ├─ Check: tag not already in use
   ├─ tag = normalize_tag("ABC12345") = "ABC12345"
   ├─ Find user by email:
   │   ├─ search users.json for email="erik@takorama.se"
   │   └─ Must find exactly one
   ├─ Validate: user's org == request org
   ├─ Build entry:
   │   {
   │     "alias": "ABC12345",
   │     "org_id": "Takorama_Storås",
   │     "user_email": "erik@takorama.se",
   │     "active": true,
   │     "updated_at": "2026-04-09T..."
   │   }
   ├─ rfids["ABC12345"] = entry
   ├─ save_rfids_map(rfids)
   ├─ auth_store.add("ABC12345") → adds to auth_tags.json + memory
   ├─ append_rfid_audit(actor="hugo@takorama.se", action="create", tag="ABC12345", ...)
   └─ Return: {ok: true, tag: "ABC12345"}
   ↓
6. Next time user swipes → system checks auth_tags.json and allows!
```

---

## 9. KEY FUNCTIONS AND THEIR SIBLINGS

### Authentication & Sessions
- `hash_password(password, salt)` → PBKDF2-SHA256
- `verify_password(password, salt, hash)` → HMAC constant-time compare
- `set_session_cookie(response, email, role, org_id)` → HMAC-signed JWT-like token
- `verify_token(token)` → Parse, verify signature, check expiry
- `get_session(request)` → Dependency for protected endpoints

### RFID & Authorization
- `normalize_tag(tag)` → Strip + uppercase
- `is_tag_allowed_on_cp(tag, cp_id)` → Core access check
- `AuthStore.contains(tag)` → Check allowlist
- `AuthStore.add(tag)` → Add to allowlist
- `AuthStore.remove(tag)` → Remove from allowlist
- `find_user_by_email(users, email)` → Look up user by email

### Data Persistence
- `load_json(path, default)` → Read JSON file with fallback
- `save_json(path, data)` → Write JSON file
- `load_rfids_map()` / `save_rfids_map()`
- `load_users_map()` / `save_users_map()`
- `load_transactions()` / `save_transactions()`

### Transaction Processing
- `enrich_transaction_snapshot(tx, rfids_map, cps_map, users_map, orgs_map)`
  → Adds org/user metadata to transaction
- `compute_energy_kwh(tx)` → Energy = (meter_stop - meter_start) / 1000
- `compute_duration_minutes(tx)` → Duration from start/stop timestamps

### OCPP Protocol
- `build_ocpp_call(command, payload)` → Create typed OCPP request object
- `command_worker()` → Background loop processing queued commands
- `on_connect(websocket, path)` → WS connection handler
- `on_boot_notification()` → CP boot handler
- `on_authorize()` → RFID swipe handler
- `on_start_transaction()` → Charging start handler
- `on_stop_transaction()` → Charging stop handler
- `on_status_notification()` → Connector status update

### API Endpoints
- **Auth**: POST /api/auth/login, /api/auth/logout, GET /api/auth/me
- **Orgs**: GET/POST/PATCH/DELETE /api/orgs, /api/orgs/{org_id}
- **CPs**: GET /api/cps, /api/cps/map, POST, DELETE
- **RFIDs**: GET/POST /api/rfids, PATCH /api/rfids/{tag}, DELETE, import/export
- **Users**: GET/POST /api/users/map, DELETE, import/export
- **Commands**: POST /api/portal/ocpp/command, GET /api/portal/ocpp/command/{command_id}
- **History**: GET /api/users/history, /api/users/summary, export

---

## 10. ENVIRONMENT CONFIGURATION

### Critical Env Variables

```bash
# Redis
REDIS_HOST=redis-service
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=<must-be-set>

# Auth
APP_SECRET=<must-be-set>  # HMAC key for session tokens
SESSION_TTL_MIN=720

# OCPP
OCPP_PORT=9000
CP_AUTH_REQUIRED=false              # Validate CP identity
CP_SHARED_TOKEN=<optional-token>    # Shared auth token for CPs
CP_AUTOMAP_ON_CONNECT=true          # Auto-assign unknown CPs to "default" org
PORTAL_TAGS_GLOBAL=false            # Allow portal_admin to charge anywhere

# API
API_PORT=8000
SESSION_COOKIE_SECURE=true          # HttpOnly + Secure
MAX_IMPORT_FILE_BYTES=2097152       # 2MB

# Backup (optional)
BACKUP_ENABLED=false
BACKUP_GIT_URL=git@github.com:...
BACKUP_INTERVAL_SECONDS=172800      # 48 hours
```

---

## 11. COMMON ISSUES & ROOT CAUSES

### Issue: RFID Returns "Blocked"
**Root Cause**: `is_tag_allowed_on_cp()` failed
- ✗ Tag not in `auth_tags.json` (allowlist)
- ✗ Tag in `rfids.json` but `org_id != cp.org_id`
- ✗ RFID's `active` flag = false

**Debug**: Check logs for "Authorize id_tag=... -> Blocked"

### Issue: RemoteStartTransaction fails "Laddare är inte ansluten"
**Root Cause**: CP not in Redis `connected_cps` set
- ✗ CP connection dropped
- ✗ CP WebSocket error
- ✗ Channel URL wrong

**Debug**: Redis `SMEMBERS connected_cps` should show CP ID

---

**END OF ARCHITECTURE ANALYSIS**

This document has covered:
1. ✅ System architecture & services
2. ✅ Complete data model
3. ✅ Auth & session flow (full call chain)
4. ✅ Authorization rules & org-based access
5. ✅ OCPP protocol lifecycle
6. ✅ Remote command flow
7. ✅ Frontend routing
8. ✅ End-to-end user flows
9. ✅ Function inventory
10. ✅ Configuration
11. ✅ Common issues

You now have a complete understanding of:
- **How data flows** from user login to charging transaction
- **Where org-based access** is enforced (4 critical gates)
- **How Redis** coordinates runtime state
- **How OCPP** messages are received/sent
- **How remote commands** are queued and executed
- **Frontend-to-backend** integration patterns

