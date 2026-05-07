# EV CSMS - Quick Reference & Implementation Guide

## PART I: QUICK FACTS ABOUT THE SYSTEM

### The 5-Minute Summary

**What it does**: Manages electric vehicle charging stations (charge points). Users swipe RFIDs to charge, portal admins monitor from a web dashboard.

**Key Technologies**:
- OCPP 1.6J (WebSocket protocol for charge points)
- FastAPI (REST API for web UI)
- Redis (runtime state: sessions, TX status, commands)
- JSON files (persistent: users, RFIDs, orgs, charge points, transactions)

**Core Concepts**:
1. **Organizations** - Multi-tenant; each org owns charge points and users
2. **RFIDs** - Cards used to start charging; each bound to an org + user email
3. **Transactions** - Charging sessions with start/stop meter readings
4. **Role-Based Access** - portal_admin > org_admin > user

**Architecture**:
- API service (port 8000) - REST endpoints
- OCPP-WS service (port 9000) - WebSocket for charge points
- Redis service (port 6379) - Shared state
- UI service (port 8080) - Web frontend
- All services share `/data` volume (persistent JSON files)

---

## PART II: CRITICAL CONTROL FLOWS

### When User Swipes RFID

```
CP (physical charger)
  ↓ Card swipe
  ↓ CP creates Authorize message with RFID tag
  ↓ WS → ocpp_ws.py::on_authorize()
  ├─ Check: is tag in auth_tags.json? (allowlist check)
  ├─ Check: tag.org == cp.org? (org match)
  └─ Return: Accept or Reject to CP
  ↓ (if accepted)
  ↓ CP sends StartTransaction
  ↓ WS → ocpp_ws.py::on_start_transaction()
  ├─ Generate tx_id (INCR Redis counter)
  ├─ Create transaction record
  ├─ Snapshot org/user metadata
  ├─ Store in Redis open_tx:{id}
  ├─ Append to transactions.json
  └─ Return transaction_id to CP
  ↓ (charging happens)
  ↓ CP sends StopTransaction with meterStop
  ↓ WS → ocpp_ws.py::on_stop_transaction()
  ├─ Fetch transaction from Redis
  ├─ Update with stop time/meter
  ├─ Delete from Redis open_tx
  ├─ Update transactions.json
  └─ Transaction complete!
```

**Key File Interactions**:
- Read: `auth_tags.json`, `rfids.json`, `cps.json`
- Write: `transactions.json`
- Redis reads/writes: `connected_cps`, `connector_status:*`, `open_tx:*`, `next_tx_id`

---

### When Portal Admin Sends Remote Command

```
Portal UI button click
  ↓ JavaScript: POST /api/portal/ocpp/command
  ├─ Body: {cp_id, command: "remote_start_transaction", payload}
  ↓ API → api.py::@app.post("/api/portal/ocpp/command")
  ├─ Check: User is portal_admin ✓
  ├─ Validate command syntax
  ├─ Check: CP in connected_cps (Redis)? ✓
  ├─ Generate command_id = uuid()
  ├─ Create envelope
  ├─ Redis SETEX result cache "ocpp:command_result:{id}" {status: queued}
  ├─ Redis RPUSH "ocpp:commands" {envelope}
  └─ Return: {ok, command_id}
  ↓
  ↓ (Meanwhile...) ocpp_ws.py::command_worker() background loop
  ├─ Redis BLPOP "ocpp:commands" → {envelope}
  ├─ cp = connected_clients[cp_id]
  ├─ request = build_ocpp_call(command, payload)
  ├─ response = await cp.call(request) ← SENDS TO CHARGER
  ├─ Redis SETEX result cache {status: success, response}
  └─ Continue loop
  ↓
  ↓ Portal UI polls: GET /api/portal/ocpp/command/{command_id}
  └─ Redis GET "ocpp:command_result:{id}" → return result
```

**Key File Interactions**:
- Read: `cps.json` (CP org validation)
- Redis reads/writes: `connected_cps`, `ocpp:commands`, `ocpp:command_result:*`

---

## PART III: DATABASE SCHEMAS

### auth_tags.json (The Allowlist)

```json
[
  "8B3D028A",
  "ADMIN",
  "ABC12345"
]
```

**Purpose**: Fast allowlist check. If tag not here → always blocked.
**Updated by**: AuthStore (when RFID created/activated/deactivated)
**Loaded at**: Startup + cached in memory

---

### rfids.json (RFID Master Registry)

```json
{
  "8B3D028A": {
    "alias": "S1",
    "org_id": "Takorama_Storås",
    "user_email": "hugo@takorama.se",
    "active": true,
    "updated_at": "2026-04-09T..."
  }
}
```

**Columns**:
- `alias`: Display name for UI
- `org_id`: Organization this RFID belongs to (CRITICAL for access control)
- `user_email`: User who owns this RFID (for lookups)
- `active`: Enable/disable flag

**Critical Rule**: `rfid.org_id` MUST match `cp.org_id` for authorization to pass

---

### users.json (User Accounts)

```json
{
  "8B3D028A": {
    "first_name": "Hugo",
    "last_name": "Danielsson",
    "name": "Hugo Danielsson",
    "email": "hugo@takorama.se",
    "role": "org_admin",
    "org_id": "Takorama_Storås",
    "pwd_salt": "...",
    "pwd_hash": "..."
  }
}
```

**Key fields**:
- `role`: "user" | "org_admin" | "portal_admin"
- `org_id`: User's organization
- Passwords: PBKDF2-SHA256 (200k iterations, salted)

---

### cps.json (Charge Point Registry)

```json
{
  "ocpp/laddbox_kontor": {
    "org_id": "Takorama_Storås",
    "alias": "Laddare 1 baksida"
  }
}
```

**Key field**: `org_id` - Determines which users can charge
**Auto-populated**: If CP_AUTOMAP_ON_CONNECT=true, new CPs auto-mapped to "default"

---

### transactions.json (Charging History)

```json
[
  {
    "transaction_id": 1,
    "charge_point": "ocpp/laddbox_kontor",
    "connectorId": 2,
    "id_tag": "8B3D028A",
    "tag_alias": "S1",
    "user_email": "hugo@takorama.se",
    "user_name": "Hugo Danielsson",
    "start_time": "2026-04-09T11:27:05Z",
    "meter_start": 5000000,
    "stop_time": "2026-04-09T11:35:22Z",
    "meter_stop": 5123000,
    "org_id": "Takorama_Storås",
    "org_name": "Takorama Storås",
    "charge_point_alias": "Laddare 1 baksida"
  }
]
```

**What makes it special**: When transaction STARTS, system captures a SNAPSHOT of org/user/cp metadata. This snapshot is stored with the transaction. If you later delete a user or rename an org, history remains accurate.

**Energy calculation**: `(meter_stop - meter_start) / 1000.0` = kWh

---

## PART IV: AUTHORIZATION GATES (Where Access Control Happens)

### Gate 1: Allowlist Check (Fastest)
```python
# Location: ocpp_ws.py::on_authorize()
if not auth_store.contains(tag):
    return BlockedAuthStatus
```
**Data**: In-memory set, loaded from auth_tags.json at startup
**Speed**: O(1), <1ms
**Purpose**: Fast rejection of unknown/suspended RFIDs

---

### Gate 2: Org Match Check (Critical)
```python
# Location: ocpp_ws.py::is_tag_allowed_on_cp()
tag_org = rfid["org_id"]
cp_org = cps.get(cp_id, {}).get("org_id", "default")
if tag_org != cp_org:
    return False  # Different orgs = blocked
```
**Data**: rfids.json, cps.json (disk reads)
**Speed**: O(1) after load, ~2-3ms total
**Purpose**: Prevent users from one org charging on another org's chargers

---

### Gate 3: Session-Based (API Level)
```python
# Location: api.py::@app.get("/api/something")
def endpoint(..., session=Depends(require_auth)):
    session = verify_token(cookie)  # Signature check
    if session["role"] != "org_admin":
        raise 403
```
**Data**: SessionID cookie (HMAC-SHA256 signed)
**Speed**: <1ms (memory operations)
**Purpose**: Validate user identity and check role

---

### Gate 4: Data Filtering (Fine-grained)
```python
# Location: api.py (API business logic)
if role == "org_admin":
    rfids = [r for r in rfids if r["org_id"] == session["org_id"]]
```
**Data**: On-memory list filtering
**Speed**: O(n)
**Purpose**: Ensure org_admin only sees their org's data

---

## PART V: COMMON ERRORS & REMEDIATION

### Error: "Laddare är inte ansluten"
**Meaning**: CP not connected/found
**Root cause**: 
- CP WebSocket connection dropped
- CP ID wrong in request
- Redis `connected_cps` set doesn't have this CP

**Check**:
```bash
# SSH into docker
docker compose exec redis-service redis-cli -a $REDIS_PASSWORD
> SMEMBERS connected_cps
# Should show: ["ocpp/laddbox_kontor", ...]
```

---

### Error: RFID shows "Blocked" when swiped
**Root cause**:
- Tag not in `auth_tags.json` (allowlist)
- Tag in `rfids.json` but org mismatch
- RFID marked inactive

**Debug**:
```bash
# Check allowlist
jq '.[]' config/auth_tags.json | grep "8B3D028A"

# Check RFID registration
jq '."8B3D028A"' config/rfids.json

# Check CP assignment
jq '."ocpp/laddbox_kontor"' config/cps.json

# Both must have same org_id!
```

---

### Error: Remote command returns "failed"
**Root cause**: CP not connected or command malformed

**Check logs**:
```bash
docker logs --tail 50 ocpp-ws-service | grep -i "command\|error"
```

---

## PART VI: KEY ENV VARIABLES (Per Service)

### ocpp-ws-service
```
CP_AUTH_REQUIRED=false          # Validate CP connection token?
CP_AUTOMAP_ON_CONNECT=true      # Auto-assign unknown CPs to "default"?
PORTAL_TAGS_GLOBAL=false        # Allow portal_admin to charge anywhere?
```

### api-service
```
SESSION_COOKIE_SECURE=true      # Set Secure flag on cookies?
MAX_IMPORT_FILE_BYTES=2097152   # Max file upload size
```

### ALL services
```
REDIS_PASSWORD=<required>       # Redis auth
APP_SECRET=<required>           # Session token signing key
```

---

## PART VII: CRITICAL FUNCTIONS TO UNDERSTAND

### Core Auth Check
```python
def is_tag_allowed_on_cp(tag: str, cp_id: str) -> bool:
    # This is THE decision point for all charging
    # Called from on_authorize() and on_start_transaction()
```

### Entry Point: RFID Swipe
```python
async def on_authorize(self, id_tag, **kwargs):
    # Called when user swipes RFID (before charging starts)
    # Returns: Authorize{idTagInfo{status: Accepted|Blocked}}
```

### Entry Point: Charge Starts
```python
async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
    # Called when charging physically starts
    # Stores transaction record
```

### Entry Point: Remote Command
```python
# Frontend → /api/portal/ocpp/command (POST)
# Background worker → command_worker()
# Sends to CP via: cp.call(ocpp_call_object)
```

---

## PART VIII: IMPLEMENTATION CHECKLIST

When implementing a NEW feature, verify you handle:

- [ ] **Authentication**: Does user need to be logged in? Use `Depends(require_auth)`
- [ ] **Authorization**: What role/org is allowed? Use `Depends(require_org_admin_or_portal)`
- [ ] **Data Filtering**: Are we filtering results by org/email? Check `_allowed_tags_for_session()`
- [ ] **Persistence**: Are we saving to JSON files? Check all `save_*_map()` calls
- [ ] **Redis State**: Are we updating runtime state? Check Redis keys
- [ ] **Error Messages**: Are they in Swedish? (System is Swedish-first)
- [ ] **Logging**: Did we log the action? Use `logger.info()`
- [ ] **Audit Trail**: Should this be recorded? See `append_rfid_audit()`
- [ ] **Frontend**: Does frontend need to poll or subscribe?

---

## PART IX: DECISION TREES FOR DEBUGGING

### "Tag shows Blocked" Flow

```
Question: Why is auth_store.contains() returning False?
├─ A. Tag is not in auth_tags.json
│   └─ Solution: AuthStore.add(tag) or POST /api/rfids
├─ B. Tag is in auth_tags.json but RFID marked inactive
│   └─ Solution: PATCH /api/rfids/{tag} {active: true}
└─ C. Tag is active but different org from CP
    ├─ Check: rfids.json[tag].org_id
    ├─ Check: cps.json[cp_id].org_id
    └─ Solution: Update org_id to match or PATCH /api/cps/map

Question: Is CP configured to the right org?
├─ No → POST /api/cps/map {cp_id, org_id: "Takorama_Storås"}
└─ Yes → Verify RFID org matches
```

### "API Endpoint Returns 403" Flow

```
Question: What role does user have?
└─ GET /api/auth/me → check "role" field

Question: Does endpoint require portal_admin?
└─ If "org_admin" but endpoint requires "portal_admin"
   └─ User cannot access; must be portal_admin

Question: If org_admin, is filtering by org working?
└─ _allowed_tags_for_session(session, users_map)
   ├─ Portal_admin: Returns None (all data)
   ├─ Org_admin: Returns {tags in same org}
   └─ User: Returns {only own tags}
```

---

## PART X: ARCHITECTURAL CONSTANTS

| Constant | Value | Purpose |
|----------|-------|---------|
| SESSION_TTL_MIN | 720 | Session expires after 12 hours |
| PBKDF2_ITERATIONS | 200,000 | Password hash strength |
| MAX_IMPORT_FILE_BYTES | 2,097,152 | Max 2MB file upload |
| RFID_AUDIT_LIMIT | 5000 | Keep latest 5000 audit entries |
| OCPP_HEARTBEAT_INTERVAL | 30 | Seconds between heartbeats |
| COMMAND_RESULT_TTL | 600 | 10-minute result cache |
| REDIS_BLPOP_TIMEOUT | 1 | Command worker blocks 1 second |

---

## PART XI: NEW DEVELOPER ONBOARDING

### First Day: Read These (30 min)
1. This file (you're reading it!)
2. `ARCHITECTURE_ANALYSIS.md` - Section 1-3 (system overview, data model, auth flow)

### Second Day: Understand With Code (2 hours)
1. Open `api.py` line 1-300 (initialization)
2. Open `ocpp_ws.py` line 1-100 (imports, setup)
3. Trace one complete flow: User logs in
   - Search for `@app.post("/api/auth/login")`
   - Follow the call chain
   - Note all file reads/writes

### Third Day: Hands-On (4 hours)
1. Start a container: `./run.sh build && ./run.sh up`
2. Log in to UI with demo account
3. Trigger one action: Create a new RFID
   - Watch API logs: `./run.sh logs api | grep rfid`
   - Watch OCPP logs: `./run.sh logs ocpp-ws`
   - Check file: `jq '."<YOUR_TAG>"' config/rfids.json`
4. Explain to yourself: What files changed?

### Fourth Day: Implement Something Simple (4 hours)
1. Add a new endpoint: `GET /api/my/org`
   - Returns current user's org details
   - Use existing `_me()` session lookup
   - Add appropriate role check
   - Test with curl

---

## PART XII: GOTCHAS & ANTI-PATTERNS

### ❌ DON'T: Hardcode org_id
```python
# BAD:
rfids = [r for r in all_rfids if r["org_id"] == "Takorama_Storås"]

# GOOD:
org_id = session.get("org_id")
rfids = [r for r in all_rfids if r["org_id"] == org_id]
```

### ❌ DON'T: Trust tag directly
```python
# BAD:
if auth_store.contains(tag):
    allow_charging()  # What if org doesn't match?

# GOOD:
if is_tag_allowed_on_cp(tag, cp_id):
    allow_charging()  # Checks allowlist + org
```

### ❌ DON'T: Forget to normalize tags
```python
# BAD:
rfid = rfids.get(user_input_tag)  # Might be lowercase!

# GOOD:
tag = normalize_tag(user_input_tag)  # .strip().upper()
rfid = rfids.get(tag)
```

### ❌ DON'T: Forget middleware
```python
# BAD:
@app.get("/api/admin/something")
async def admin_only():
    # Anyone can call this!

# GOOD:
@app.get("/api/admin/something")
async def admin_only(session=Depends(require_portal_admin)):
    # Only portal_admin can call
```

---

## PART XIII: TESTING CHECKLIST

### Before deploying to production:
- [ ] Test login/logout
- [ ] Test RFID creation + activation
- [ ] Test RFID deactivation (should be blocked immediately)
- [ ] Test remote start/stop commands
- [ ] Test user sees only their org's data
- [ ] Test org_admin can't see other orgs
- [ ] Test pagination/filtering on large datasets
- [ ] Test password reset flow
- [ ] Test edge case: deleted user's transactions (should still show)
- [ ] Check Redis doesn't get fragmented (monitor memory)

---

## PART XIV: PERFORMANCE NOTES

| Operation | Latency | Bottleneck |
|-----------|---------|-----------|
| RFID swipe → auth decision | 5-10ms | Disk reads (rfids, cps) |
| Login | 50-100ms | Password hashing (intentional) |
| List RFIDs | 10-50ms | JSON file size |
| Remote command send | <5ms | Redis + WS latency |
| Charging session start-to-stop | N/A | CP-dependent |

**Optimization opportunities**:
- Cache frequently-read files in memory (orgs, CPs)
- Use Redis for RFID metadata hot lookups
- Paginate large result sets

---

**THIS DOCUMENT IS YOUR REFERENCE.**

Keep it handy while reading/modifying code. When confused, check the relevant section.


