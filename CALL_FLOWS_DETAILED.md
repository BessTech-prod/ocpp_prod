# EV CSMS - Detailed Call Flow Diagrams

## 1. LOGIN SEQUENCE DIAGRAM

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          USER LOGIN FLOW                                    │
└────────────────────────────────────────────────────────────────────────────┘

Browser (login.js)              API (api.py)                 Storage
    │                               │                             │
    │ POST /api/auth/login          │                             │
    │ {email, password}             │                             │
    ├──────────────────────────────>│                             │
    │                         (verify_token called?)              │
    │                               │─ load users.json ────────────>│
    │                               │<─────── users dict ─────────│
    │                               │
    │                               ├─ find user by email        │
    │                               │  (must find exactly 1)      │
    │                               │
    │                               ├─ extract pwd_salt, pwd_hash│
    │                               │
    │                               ├─ hash_password(input_pw)   │
    │                               │  (PBKDF2-SHA256 200k iter)  │
    │                               │
    │                               ├─ hmac.compare_digest()     │
    │                               │  (constant-time compare)    │
    │                               │
    │  ✓ Valid Password             │                             │
    │<───────────────────────────────┤                             │
    │ {ok: true, email}             │ set_session_cookie()        │
    │                               │  └─ HMAC-SHA256 sign token  │
    │                               │  └─ Set HttpOnly cookie     │
    │                               │
    │ (cookie now stored)           │                             │
    │                               │                             │
    │ GET /api/auth/me              │                             │
    ├──────────────────────────────>│                             │
    │ (cookie auto-included)        │ get_session() dependency    │
    │                               │  └─ verify_token()         │
    │                               │     ├─ split token         │
    │                               │     ├─ decode base64url    │
    │                               │     ├─ verify signature    │
    │                               │     ├─ check expiry        │
    │                               │     └─ return {email, role}│
    │                               │                             │
    │  {email, role, org_id, name}  │                             │
    │<───────────────────────────────┤                             │
    │                               │                             │
    │ goToRole(me)                  │                             │
    │ ├─ role == "portal_admin"?    │                             │
    │ │  └─ location.href=/portal/  │                             │
    │ ├─ role == "org_admin"?       │                             │
    │ │  └─ location.href=/org/     │                             │
    │ └─ else                       │                             │
    │    └─ location.href=/user/    │                             │
    │                               │                             │

```

---

## 2. AUTHORIZATION DECISION TREE

```
┌────────────────────────────────────────────────────────────────────┐
│         RFID AUTHORIZATION CHECK: is_tag_allowed_on_cp()           │
│      (Called on Authorize, StartTransaction, RemoteStart)          │
└────────────────────────────────────────────────────────────────────┘

INPUT: tag="8B3D028A", cp_id="ocpp/laddbox_kontor"
   │
   ▼
┌─────────────────────────┐
│ Check Allowlist         │
│ auth_store.contains()   │
│  └─ auth_tags.json      │
└────────┬────────────────┘
         │
      ✓ YES              ✗ NO
         │                 │
         ▼                 ▼
       PASS          BLOCKED
              (return False)

         │
         ▼
┌──────────────────────────────────────────┐
│ Load RFID & User Mappings                │
│ ├─ rfids.json[tag]                       │
│ ├─ users.json (by email)                 │
│ └─ orgs.json                             │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Extract RFID Properties                   │
│ ├─ tag_active = rfid.active ✓            │
│ ├─ tag_org = rfid.org_id                 │
│ ├─ user_email = rfid.user_email          │
│ └─ user_role = user.role                 │
└────────┬─────────────────────────────────┘
         │
    ✗ If inactive
         │
         ▼
┌──────────────────────────────────────────┐
│ Check RFID Active                         │
│ if not rfid.active                       │
└────────┬────────────────┬────────────────┘
         │                │
    ✓ ACTIVE      ✗ INACTIVE
         │                │
         ▼                ▼
       PASS          BLOCKED
                  (return False)

         │
         ▼
┌──────────────────────────────────────────┐
│ Get Charge Point Organization             │
│ ├─ cps.json[cp_id].org_id                │
│ └─ If not found → org = "default"        │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Check Portal Admin Override                │
│ if PORTAL_TAGS_GLOBAL=true AND           │
│    user_role in ("portal_admin", "admin")│
└────────┬────────────────┬────────────────┘
    ✓ YES                  ✗ NO
         │                      │
         ▼                      ▼
    ACCEPTED              ┌─────────────────────┐
  (return True)           │ Check Org Match      │
                          │ tag_org == cp_org?  │
                          └────┬───────┬────────┘
                               │       │
                          ✓ MATCH  ✗ NO MATCH
                               │       │
                               ▼       ▼
                           ACCEPTED BLOCKED
                         (return True) (return False)

OUTCOME: Authorization Status
├─ ✓ ACCEPTED  → allow charge
└─ ✗ BLOCKED   → reject charge (show error)

```

---

## 3. CHARGING SESSION LIFECYCLE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   CHARGING SESSION LIFECYCLE                             │
│            (Complete OCPP message sequence)                              │
└─────────────────────────────────────────────────────────────────────────┘

Charge Point (CP)                    OCPP WS Service
   │                                      │
   │────────────────────────────────────>│
   │   WebSocket Connection               │ on_connect()
   │   ws://server:9000/cp_id            ├─ Parse path
   │                                      ├─ Validate CP ID
   │                                      ├─ Auto-map to org
   │                                      ├─ Connect: sadd("connected_cps", cp_id)
   │                                      ├─ Create CentralSystemCP object
   │                                      └─ Start OCPP handler loop
   │
   │<────────────────────────────────────│
   │  Connection Accepted                │
   │
   │────────────────────────────────────>│
   │   BootNotification                   │ on_boot_notification()
   │   {vendor, model}                    ├─ Log connection
   │                                      └─ Return BootNotification
   │
   │<────────────────────────────────────│
   │  BootNotification Response           │
   │  {currentTime, interval, status}    │
   │
   ├──────┐
   │   (Every 30 sec)
   │
   │────────────────────────────────────>│
   │   Heartbeat                          │ on_heartbeat()
   │                                      ├─ Log heartbeat
   │                                      └─ Return Heartbeat{time}
   │
   │<────────────────────────────────────│
   │  Heartbeat Response                  │
   │
   ├─────────────────────────────────────│
   │  • • •                              │
   ├─────────────────────────────────────│
   │
   │────────────────────────────────────>│
   │   StatusNotification                 │ on_status_notification()
   │   {connectorId, status, timestamp}   ├─ Build key: connector_status:cp:conn
   │                                      ├─ Redis SET
   │                                      └─ Return StatusNotification
   │
   │<────────────────────────────────────│
   │  StatusNotification Response         │ (empty)
   │
   │   [User swipes RFID]                │
   │
   │────────────────────────────────────>│
   │   Authorize                          │ on_authorize(idTag)
   │   {idTag: "8B3D028A"}                ├─ Check allowlist
   │                                      ├─ Check org match
   │                                      ├─ Determine: Accepted | Blocked
   │                                      └─ Return Authorize{status}
   │
   │<────────────────────────────────────│
   │  Authorize Response                  │
   │  {idTagInfo: {status: "Accepted"}}  │
   │
   │────────────────────────────────────>│
   │   StartTransaction                   │ on_start_transaction()
   │   {connectorId, idTag,              ├─ tx_id = INCR("next_tx_id")
   │    meterStart, timestamp}            ├─ Check auth again
   │                                      ├─ Enrich transaction snapshot
   │                                      ├─ Redis SET("open_tx:{id}", tx)
   │                                      ├─ transactions.json append
   │                                      └─ Return StartTransaction{txId, status}
   │
   │<────────────────────────────────────│
   │  StartTransaction Response           │
   │  {transactionId: 1,                 │
   │   idTagInfo: {status: "Accepted"}}  │
   │
   │   [CHARGING IN PROGRESS]            │
   │
   │────────────────────────────────────>│
   │   MeterValues (optional)             │ (received but not stored)
   │   {transactionId, meterValue[]}      │
   │
   │<────────────────────────────────────│
   │  MeterValues Response                │
   │
   │────────────────────────────────────>│
   │   StatusNotification                 │
   │   {connectorId: Charging/Unavailable}│
   │
   │<────────────────────────────────────│
   │  (repeats as status changes)        │
   │
   │   [CHARGING COMPLETE]               │
   │
   │────────────────────────────────────>│
   │   StopTransaction                    │ on_stop_transaction()
   │   {transactionId, meterStop,        ├─ Redis GET("open_tx:1")
   │    timestamp}                        ├─ Update with stop data
   │                                      ├─ Redis DEL("open_tx:1")
   │                                      ├─ transactions.json update
   │                                      └─ Return StopTransaction
   │
   │<────────────────────────────────────│
   │  StopTransaction Response            │ (empty)
   │   (charging recorded!)               │
   │
   │────────────────────────────────────>│
   │   StatusNotification                 │
   │   {connectorId: Available}           │ on_status_notification()
   │
   │<────────────────────────────────────│
   │  StatusNotification Response         │

```

---

## 4. REMOTE COMMAND QUEUE FLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│              REMOTE COMMAND EXECUTION FLOW                               │
│  (Portal Admin sends command, background worker executes)                │
└─────────────────────────────────────────────────────────────────────────┘

Portal (JavaScript)           API Service              OCPP-WS Service
   │                              │                            │
   │ POST /portal/ocpp/command    │                            │
   ├─ {cp_id, command,            │                            │
   │   payload}                    │                            │
   │                              │                            │
   ├─────────────────────────────>│                            │
   │                              │ validate_ocpp_command_payload()
   │                              │ ├─ Check CP connected      │
   │                              │ ├─ Validate command type   │
   │                              │ └─ Normalize payload       │
   │                              │                            │
   │                              │ Generate command_id = uuid4
   │                              │
   │                              │ Build envelope:
   │                              │ {command_id, cp_id,
   │                              │  command, payload, ...}
   │                              │
   │                              │ Redis SETEX (result cache):
   │                              │ key: ocpp:command_result:cmd_id
   │                              │ val: {status: "queued"}
   │                              │ ttl: 600s
   │                              │
   │                              │ Redis RPUSH (command queue):
   │                              │ key: ocpp:commands
   │                              │ val: json(envelope)
   │                              │
   │ {ok, command_id, status}     │                            │
   │<─────────────────────────────┤                            │
   │ ("queued")                   │                            │
   │                              │                            │
   └────────────────────────────────────────────────────────────┘
   
   [Meanwhile, in background loop...]
   
      OCPP-WS Service: command_worker()
         │
         ├─ Infinite loop:
         │
         ├─ blocks: Redis BLPOP("ocpp:commands", timeout=1)
         │
         ├─ popped = {JSON envelope}
         │
         ├─ command_id = envelope.command_id
         ├─ cp_id = envelope.cp_id
         ├─ command = envelope.command
         ├─ payload = envelope.payload
         │
         ├─ Look up: connected_clients[cp_id]?
         │   │
         │   ✗ Not found → NOT CONNECTED
         │   │
         │   └─ Update result:
         │      Redis SETEX(
         │        ocpp:command_result:cmd_id,
         │        600,
         │        {status: "failed", error: "..."}
         │      )
         │      Continue to next command
         │
         ├─ cp = connected_clients[cp_id]
         │
         ├─ Build OCPP call:
         │  request = build_ocpp_call(command, payload)
         │  ├─ command == "remote_start_transaction"
         │  │  └─ call.RemoteStartTransaction(
         │  │       id_tag="8B3D028A", connector_id=2)
         │  ├─ command == "remote_stop_transaction"
         │  │  └─ call.RemoteStopTransaction(transaction_id=X)
         │  └─ ... (other command types)
         │
         ├─ Send to CP:
         │  response = await cp.call(request)
         │      ├─ CP receives OCPP call
         │      ├─ CP processes (e.g., starts charge)
         │      └─ CP sends CallResult back
         │
         ├─ Update result: SUCCESS
         │  Redis SETEX(
         │    ocpp:command_result:cmd_id,
         │    600,
         │    {status: "success", response: {...}}
         │  )
         │
         └─ (Exception handler catches errors)
            └─ Update result: FAILED
               Redis SETEX(
                 ocpp:command_result:cmd_id,
                 600,
                 {status: "failed", error: str(err)}
               )

   Portal polling for result:
   
   │ GET /api/portal/ocpp/command/{command_id}
   ├─────────────────────────────>│                            │
   │                         Load result from Redis:
   │                         Redis GET(
   │                           ocpp:command_result:cmd_id)
   │                         
   │ {status: "queued"}          │
   │<─────────────────────────────┤
   │ (keep polling...)           │
   │
   │ (after 2 seconds)           │
   │ GET /api/portal/ocpp/command/{command_id}
   │                             │
   │                         [command_worker processed]
   │                         [result updated]
   │
   │ {status: "success",         │
   │  response: {...}}           │
   │<─────────────────────────────┤
   │ (display success)           │
   │

```

---

## 5. DATA ACCESS CONTROL FLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MULTI-LEVEL ACCESS CONTROL FOR /api/rfids (Example)                    │
└─────────────────────────────────────────────────────────────────────────┘

1. REQUEST ARRIVES
   GET /api/rfids?org_id=Takorama_Storås
   
2. AUTHENTICATION GATE
   └─ get_session(request.cookies["session"])
      ├─ verify_token() → {email, role, org_id, exp}
      ├─ If validation fails → 401 Unauthorized
      └─ If valid → session payload
   
3. AUTHORIZATION GATE (Role-based)
   └─ @app.get("/api/rfids")
      async def api_rfids(
         ...,
         session=Depends(require_org_admin_or_portal)
      ):
      └─ require_org_admin_or_portal()
         ├─ session.role in ("org_admin", "portal_admin", "admin")?
         ├─ If no → 403 Forbidden
         └─ If yes → proceed
   
4. BUSINESS LOGIC GATE (Org filtering)
   └─ Load rfids.json
   ├─ Load orgs.json
   └─ For each RFID:
      ├─ If role == "portal_admin":
      │   └─ Include all RFIDs
      │
      ├─ Else if role == "org_admin":
      │   ├─ rfid.org_id == session.org_id?
      │   ├─ Yes → Include
      │   └─ No → Filter out
      │
      └─ Else (shouldn't happen, blocked at gate 3):
          └─ 403 (shouldn't reach here)
   
5. RETURN FILTERED DATA
   ├─ items: [
   │   {tag: "8B3D028A", org_id: "Takorama_Storås", ...},
   │   {tag: "4BC5918A", org_id: "Takorama_Storås", ...}
   │ ]
   └─ count: 2

SUMMARY: 3 levels of gate-keeping:
┌─────────────────────────────────────────┐
│  Level 1: AUTHENTICATION                │
│  └─ is request signed properly?         │
│     └─ verify_token() on session cookie │
├─────────────────────────────────────────┤
│  Level 2: COARSE AUTHORIZATION          │
│  └─ does role match endpoint requirement?
│     └─ require_org_admin_or_portal()    │
├─────────────────────────────────────────┤
│  Level 3: FINE-GRAINED FILTERING        │
│  └─ within allowed role, filter by org? │
│     └─ API business logic filter loop   │
└─────────────────────────────────────────┘

```

---

## 6. NEW RFID LIFECYCLE (Create, Activate, Use)

```
┌─────────────────────────────────────────────────────────────────────────┐
│              RFID LIFECYCLE: From Creation to Usage                      │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1: CREATE RFID (via UI or Import)
   Org Admin:
   └─ POST /api/rfids
      ├─ Body: {tag, org_id, user_email, active}
      │
      └─ api.py::api_rfids_create()
         ├─ Load: rfids.json, users.json, orgs.json
         ├─ Normalize: tag = "8B3D028A"
         ├─ Validate:
         │  ├─ tag not already in rfids
         │  ├─ org_id exists
         │  ├─ user_email valid (must exist)
         │  ├─ user org == rfid org (validation)
         │  └─ max one RFID per email (across all orgs)
         │
         ├─ Create entry:
         │  {
         │    "alias": "8B3D028A",
         │    "org_id": "Takorama_Storås",
         │    "user_email": "hugo@takorama.se",
         │    "active": true,
         │    "updated_at": "2026-04-09T..."
         │  }
         │
         ├─ rfids["8B3D028A"] = entry
         ├─ save_rfids_map(rfids)
         │
         ├─ Activate: auth_store.add("8B3D028A")
         │  └─ Adds to auth_tags.json + memory set
         │
         ├─ Audit: append_rfid_audit(
         │     actor="hugo@takorama.se",
         │     action="create",
         │     tag="8B3D028A",
         │     details={...}
         │   )
         │
         └─ Return: {ok: true, tag: "8B3D028A"}

   Files written:
   ├─ rfids.json               ← entry added
   ├─ auth_tags.json           ← tag added to allowlist
   └─ rfid_audit.json          ← entry appended

STEP 2: ENABLE/DISABLE RFID
   Admin:
   └─ PATCH /api/rfids/8B3D028A
      ├─ Body: {active: false}
      │
      └─ api.py::api_rfids_patch()
         ├─ Load: rfids.json
         ├─ Find entry by tag
         ├─ Set: entry.active = false
         ├─ save_rfids_map(rfids)
         │
         ├─ Remove from allowlist:
         │  └─ auth_store.remove("8B3D028A")
         │     ├─ Remove from memory set
         │     └─ Update auth_tags.json
         │
         └─ Audit entry added

   After this: RFID will be BLOCKED on next swipe
   (auth_store.contains() will return false)

STEP 3: USER SWIPES CARD AT CHARGER
   (Background: OCPP on_authorize)
   │
   └─ is_tag_allowed_on_cp("8B3D028A", "ocpp/laddbox_kontor")
      ├─ Check: auth_store.contains("8B3D028A")
      │   ├─ Checks in-memory set (fast)
      │   ├─ Loaded from auth_tags.json at startup
      │   └─ Returns: bool
      │
      ├─ If false → BLOCKED
      │
      ├─ If true:
      │   ├─ Load: rfids.json
      │   ├─ Find: rfids["8B3D028A"]
      │   ├─ Check: entry.active == true
      │   ├─ Check: entry.org_id == cp.org_id
      │   └─ Return: bool
      │
      └─ Return to CP: Authorize{status}

STEP 4: TRANSACTION RECORDED
   └─ transaction record creation
      ├─ transaction_id: (generated)
      ├─ id_tag: "8B3D028A"
      ├─ tag_alias: (snapshot from rfid.alias)
      ├─ user_email: (snapshot from rfid.user_email)
      ├─ org_id: (snapshot from rfid.org_id)
      ├─ user_name: (lookup + snapshot)
      ├─ charge_point_alias: (snapshot)
      └─ ...

   Snapshots ensure history is accurate even if:
   ├─ RFID is disabled later
   ├─ User is deleted
   ├─ Org is renamed
   └─ CP is moved
   
   (Audit trail remains pristine)

STEP 5: HISTORICAL QUERY
   Admin:
   └─ GET /api/users/history?days=30
      ├─ Filter transactions where:
      │  ├─ stop_time in [now-30days, now]
      │  ├─ allowed_tags_for_session() check
      │  └─ User can only see own org's data
      │
      └─ Return: [{tag, user_name, energy_kwh, timestamps, ...}]

```

---

## 7. REDIS STATE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│           REDIS RUNTIME STATE (Ephemeral vs Persisted)                   │
└─────────────────────────────────────────────────────────────────────────┘

                     REDIS (Volatile)           ←→   DISK (Persistent)
                    ─────────────────                ─────────────────────

Connected State:
└─ connected_cps             SET of strings
   ├─ Members: ["ocpp/laddbox_kontor", ...]
   ├─ TTL: None (persists until CP disconnects)
   ├─ Synced to disk: NO
   ├─ Used by:
   │  ├─ /api/cps endpoint (list connected)
   │  ├─ Command queue (check CP online)
   │  └─ Dashboard (show green dot)
   └─ Lost on: Redis restart, CP disconnect

Connector Status:
└─ connector_status:{cp_id}:{conn_id}    STRING (JSON)
   ├─ Key: connector_status:ocpp/laddbox_kontor:2
   ├─ Value: {status, error, timestamp}
   ├─ TTL: None
   ├─ Synced to disk: NO
   ├─ Used by:
   │  ├─ /api/status endpoint
   │  └─ UI charger status display
   └─ Lost on: Redis restart

Active Transactions:
└─ open_tx:{tx_id}    STRING (JSON)
   ├─ Key: open_tx:1
   ├─ Value: {tx record with start data}
   ├─ TTL: None
   ├─ Synced to disk: PARTIAL (full record on stop)
   ├─ Used by:
   │  ├─ Stop handler (fetch for update)
   │  ├─ Historical queries
   │  └─ Dashboard (active sessions)
   └─ Lost on: Redis restart (but recoverable from transactions.json)

Command Queue:
└─ ocpp:commands    LIST (JSON strings)
   ├─ RPUSH: New commands appended
   ├─ BLPOP: Worker consumes
   ├─ TTL: None (until consumed)
   ├─ Synced to disk: NO
   ├─ Used by:
   │  ├─ Command enqueue (api.py)
   │  └─ Command worker (ocpp_ws.py)
   └─ Lost on: Redis restart (commands are dropped)

Command Results:
└─ ocpp:command_result:{cmd_id}    STRING (JSON)
   ├─ Key: ocpp:command_result:abc-123
   ├─ Value: {status, response/error}
   ├─ TTL: 600 seconds
   ├─ Synced to disk: NO
   ├─ Used by:
   │  ├─ Portal polling for result
   │  └─ UI status display
   └─ Lost on: Timeout (intended)

Counter:
└─ next_tx_id    INTEGER
   ├─ Used by: StartTransaction (INCR)
   ├─ TTL: None
   ├─ Synced to disk: NO
   ├─ Used by: Transaction ID generation
   └─ Lost on: Redis restart (but reusable)

                                │
                                ▼
                    ─────────────────────────
DISK PERSISTENCE (Survives Redis restart):
                    ─────────────────────────

├─ /data/config/auth_tags.json
│  ├─ []Array of RFID tags
│  ├─ Loaded: At startup (→ AuthStore in-memory set)
│  ├─ Updated: On RFID create/activate/deactivate
│  └─ Used by: is_tag_allowed_on_cp() allowlist check

├─ /data/config/rfids.json
│  ├─ Object: {tag: {org_id, user_email, active, ...}}
│  ├─ Loaded: On each authorization check
│  ├─ Updated: On RFID create/patch/delete
│  └─ Used by: RFID metadata/org lookup

├─ /data/config/users.json
│  ├─ Object: {tag: {email, role, org_id, pwd_*}}
│  ├─ Loaded: On login, auth checks
│  ├─ Updated: On user create/edit
│  └─ Used by: User lookup, password verification

├─ /data/config/cps.json
│  ├─ Object: {cp_id: {org_id, alias}}
│  ├─ Loaded: On CP connect (auto-map)
│  ├─ Updated: On OCPP on_connect
│  └─ Used by: CP → org resolution

├─ /data/config/orgs.json
│  ├─ Object: {org_id: {name}}
│  ├─ Loaded: On startup, org API calls
│  ├─ Updated: On org create/edit
│  └─ Used by: Org name lookup

└─ /data/transactions.json
   ├─ Array: [{tx_id, cp_id, tag, start_time, ...}]
   ├─ Loaded: On history queries
   ├─ Appended: On StartTransaction
   ├─ Updated: On StopTransaction
   └─ Used by: Charging history, reporting

STARTUP SYNCHRONIZATION:
┌──────────────────────────────────────┐
│ On process startup:                  │
├──────────────────────────────────────┤
│ 1. Load auth_tags.json               │
│    └─ Populate AuthStore in-memory   │
│                                      │
│ 2. Migrate RFIDs from users (legacy) │
│    └─ Update rfids.json              │
│                                      │
│ 3. Ensure "default" org exists       │
│    └─ Create if missing in orgs.json │
│                                      │
│ 4. Sync allowlist                    │
│    ├─ For each active RFID in rfids  │
│    └─ Ensure in auth_store           │
└──────────────────────────────────────┘

```

---

## 8. FUNCTION DEPENDENCY GRAPH

```
┌─────────────────────────────────────────────────────────────────────────┐
│         CORE FUNCTION CALL DEPENDENCIES                                  │
│      (Simplified call hierarchy)                                         │
└─────────────────────────────────────────────────────────────────────────┘

==================== AUTHENTICATION LAYER ====================

verify_token(token)
├─ _b64d()                          [base64url decode]
├─ hmac.compare_digest()            [constant-time compare]
├─ json.loads()
└─ datetime.fromisoformat()

set_session_cookie(response, email, role, org_id)
├─ json.dumps()
├─ _b64()                           [base64url encode]
├─ hmac.new().digest()              [HMAC-SHA256]
└─ response.set_cookie()

hash_password(password, salt=None)
├─ os.urandom()                     [if no salt given]
├─ _b64d()
├─ hashlib.pbkdf2_hmac()            [PBKDF2-SHA256 200k]
└─ _b64()


==================== AUTHORIZATION LAYER ====================

is_tag_allowed_on_cp(tag, cp_id)
├─ normalize_tag()
├─ auth_store.contains()
│  └─ AuthStore.__init__() loads auth_tags.json at startup
├─ load_rfids_map()                 [read rfids.json]
├─ load_json(USERS_FILE)            [read users.json]
├─ find_user_by_email()
│  └─ normalize_tag()
├─ org_for_cp(cp_id)
│  └─ load_json(CPS_FILE)
└─ Check: tag_org == cp_org


==================== RFID MANAGEMENT LAYER ====================

api_rfids_create(body, session)
├─ normalize_tag(body.tag)
├─ load_rfids_map()
├─ load_users_map()
├─ find_user_by_email()
├─ sync_users_for_rfid()
│  ├─ normalize_tag()
│  └─ find_user_by_email()
├─ save_rfids_map()
├─ auth_store.add()
│  └─ AuthStore._save_unlocked() writes auth_tags.json
└─ append_rfid_audit()

api_rfids_patch(tag, body, session)
├─ normalize_tag(tag)
├─ load_rfids_map()
├─ sync_users_for_rfid()
├─ save_rfids_map()
├─ auth_store.add()  or  auth_store.remove()
└─ append_rfid_audit()

api_rfids_delete(tag, session)
├─ normalize_tag(tag)
├─ load_rfids_map()
├─ save_rfids_map()
├─ auth_store.remove()
└─ append_rfid_audit()


==================== TRANSACTION LAYER ====================

on_start_transaction(connector_id, id_tag, meter_start, timestamp)
├─ normalize_tag(id_tag)
├─ is_tag_allowed_on_cp()           [auth check]
├─ redis_client.incr("next_tx_id")  [get next ID]
├─ load_rfids_map()
├─ enrich_transaction_snapshot()
│  ├─ load_json(CPS_FILE)
│  ├─ load_json(USERS_FILE)
│  ├─ load_json(ORGS_FILE)
│  └─ resolve_transaction_snapshot()
│     ├─ normalize_tag()
│     ├─ cp_metadata()
│     ├─ find_user_by_email()
│     ├─ org_display_name()
│     └─ display_name_for_tag()
├─ redis_client.set("open_tx:{id}", entry)
└─ save_transactions()

on_stop_transaction(transaction_id, meter_stop, timestamp)
├─ redis_client.get(f"open_tx:{tx_id}")  [fetch active tx]
├─ Update entry: stop_time, meter_stop
├─ redis_client.delete()                  [remove from active]
└─ save_transactions()                    [persist update]


==================== COMMAND LAYER ====================

command_worker() [background loop]
├─ redis_client.blpop("ocpp:commands", timeout)
├─ build_ocpp_call(command, payload)
│  ├─ call.RemoteStartTransaction()
│  ├─ call.RemoteStopTransaction()
│  └─ ... [other OCPP call types]
├─ cp.call(request)                  [async: send to CP]
└─ set_command_result()
   └─ redis_client.setex()


==================== HISTORY/REPORTING LAYER ====================

_history_rows_for_session(days, tag, session)
├─ load_transactions()
├─ load_users_map()
├─ _allowed_tags_for_session()
│  ├─ load_rfids_map()
│  └─ normalize_tag()
├─ normalize_tag(tx.id_tag)
├─ display_name_for_tag()
│  └─ find_user_by_email()
└─ Return filtered rows

api_users_history(days, tag, session)
├─ _history_rows_for_session()
└─ Return: {items: [...], count: n}

api_users_summary(days, session)
├─ load_transactions()
├─ _allowed_tags_for_session()
├─ normalize_tag()
├─ display_name_for_tag()
└─ Aggregate kWh/session counts


==================== BOOTSTRAP/STARTUP ====================

startup()
├─ ensure_default_org()
├─ migrate_rfids_from_users_if_needed()
│  ├─ load_rfids_map()
│  ├─ load_json(USERS_FILE)
│  └─ save_rfids_map()
├─ For each RFID in rfids_map:
│  └─ auth_store.add(tag)
│     └─ save() writes auth_tags.json
└─ Log migrations/allowlist sync

```

---

## 9. DATA FLOW DURING AUTHORIZATION

```
┌─────────────────────────────────────────────────────────────────────────┐
│        DATA FLOW: User swipes RFID → Authorization decision              │
└─────────────────────────────────────────────────────────────────────────┘

USER SWIPES RFID
         │
         ▼
┌─────────────────────────────┐
│ CP receives card/NFC data   │
│ Extracts: idTag="8B3D028A"  │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ CP→WS: Authorize {idTag}                │
│ (OCPP message)                          │
└────────────┬────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│ ocpp_ws.py::on_authorize() handler               │
└────────────┬─────────────────────────────────────┘
             │
             ├─ Step 1: Load allowlist from memory
             │  └─ AuthStore._tags (in-memory set)
             │     └─ Loaded from auth_tags.json at startup
             │
             ▼
    ┌──────────────────────┐
    │ Check in allowlist   │
    │ "8B3D028A" in tags?  │
    └────┬─────────────┬───┘
    ✗NO  │             │ ✓YES
        BLOCK       [continue]
        (return)        │
                        ▼
                ┌──────────────────────┐
                │ Step 2: Load RFID    │
                │ registry from disk   │
                └────────┬─────────────┘
                         │
                    (read rfids.json)
                         │
                         ▼
                ┌──────────────────────────────────┐
                │ Lookup: rfids["8B3D028A"]        │
                │ Extract: org_id, user_email, etc │
                └─────────┬────────────────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │ Step 3: Check active │
                │ flag                 │
                └────┬─────────────┬───┘
            ✗FALSE   │             │ ✓TRUE
                BLOCK          [continue]
                (return)            │
                                    ▼
                            ┌──────────────────────────┐
                            │ Step 4: Get CP's org_id  │
                            └────────┬─────────────────┘
                                     │
                                (read cps.json)
                                     │
                                     ▼
                            ┌──────────────────────┐
                            │ cps["ocpp/laddbox"]  │
                            │ .org_id =            │
                            │ "Takorama_Storås"    │
                            └────────┬─────────────┘
                                     │
                                     ▼
                            ┌──────────────────────────────┐
                            │ Step 5: Compare orgs         │
                            │                              │
                            │ tag_org ==                   │
                            │ "Takorama_Storås"            │
                            │                              │
                            │ cp_org ==                    │
                            │ "Takorama_Storås"            │
                            │                              │
                            │ Match?                       │
                            └────┬──────────────┬──────────┘
                        ✗NO      │              │ ✓YES
                            BLOCK          ACCEPT
                            (return)       (return)
             
             ▼
┌──────────────────────────────────────┐
│ Return Authorize response             │
│ {idTagInfo: {status: "Accepted"      │
│  or "Blocked"}}                      │
└────────────┬────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│ CP receives response                  │
│ ├─ "Accepted" → Connect plug         │
│ └─ "Blocked" → Deny charging         │
└──────────────────────────────────────┘


TIMELINE OF DATA ACCESS:

Timestamp | Source      | Data Access
──────────┼─────────────┼──────────────────────────────────
T+0ms     | Memory      | AuthStore._tags (allowlist)
          |             | [preloaded at startup]
          |
T+1ms     | Disk        | rfids.json (read & parse)
          |             | Contains: org_id, user_email, active
          |
T+2ms     | Disk        | cps.json (read & parse)
          |             | Contains: org_id for CP
          |
T+3ms     | Comparison  | tag_org == cp_org check
          |             | (in-memory calculation)
          |
T+4ms     | Network     | Send response to CP

TOTAL LATENCY: ~4-5ms (mostly disk I/O)

KEY INSIGHT: All "cold" checks (disk reads) happen AFTER
the "hot" check (memory allowlist), so invalid tags fail fast.

```

---

This completes the detailed call flow visualizations. You now have:
- Authentication sequence
- Authorization decision tree
- Charging lifecycle
- Remote command queue flow
- Access control multi-stage gates
- RFID lifecycle
- Redis state diagram
- Function dependency graph
- Detailed authorization data flow

**Ready to build the next feature!**

