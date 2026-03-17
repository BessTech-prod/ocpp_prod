# =====================================================================
# app/main.py  —  v7 (stabil, korrekt, granskad)
# RFID bundet till organisation + automap av omappade CP till "default"
# =====================================================================

from __future__ import annotations

# -------- Standardbibliotek --------
import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Optional, List, Set

# -------- Tredjeparts --------
import websockets
from fastapi import FastAPI, HTTPException, Query, Request, Response, Depends
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# -------- OCPP 1.6J --------
from ocpp.v16 import ChargePoint as CP
from ocpp.v16 import call_result
from ocpp.v16.enums import Action, AuthorizationStatus, RegistrationStatus
from ocpp.routing import on   # <-- Viktigt: dekoratorn för OCPP-händelser

# -------- Internt --------
from app.auth_store import AuthStore   # RFID-allowlist (din befintliga klass)


# =====================================================================
# LOGGNING
# =====================================================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("csms")


# =====================================================================
# KONFIGURATION / ENV
# =====================================================================
APP_SECRET = os.getenv("APP_SECRET", "dev-secret-change-me").encode("utf-8")
SESSION_TTL_MIN = int(os.getenv("SESSION_TTL_MIN", "720"))  # 12 timmar

# Portal-admin override: får ladda på alla CP oavsett org
PORTAL_TAGS_GLOBAL = os.getenv("PORTAL_TAGS_GLOBAL", "false").lower() in ("1", "true", "yes")

# Bootstrap för admin vid tom users.json
BOOTSTRAP_EMAIL = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@example.com")
BOOTSTRAP_FIRST = os.getenv("ADMIN_BOOTSTRAP_FIRST_NAME", "Portal")
BOOTSTRAP_LAST  = os.getenv("ADMIN_BOOTSTRAP_LAST_NAME", "Admin")
BOOTSTRAP_PW    = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "BytMig123!")
BOOTSTRAP_RFID  = os.getenv("ADMIN_BOOTSTRAP_RFID", "ADMIN")
BOOTSTRAP_ORG   = os.getenv("ADMIN_BOOTSTRAP_ORG_ID", "default")


# =====================================================================
# FILTILLGÅNG / PERSISTENS
# =====================================================================
BASE = Path("/data")
TRANSACTIONS_FILE = BASE / "transactions.json"
AUTH_FILE         = BASE / "config" / "auth_tags.json"
USERS_FILE        = BASE / "config" / "users.json"
ORGS_FILE         = BASE / "config" / "orgs.json"
CPS_FILE          = BASE / "config" / "cps.json"

# Se till att mapparna finns
for p in [TRANSACTIONS_FILE, USERS_FILE, ORGS_FILE, CPS_FILE]:
    p.parent.mkdir(parents=True, exist_ok=True)

# Initiera saknade filer
if not TRANSACTIONS_FILE.exists(): TRANSACTIONS_FILE.write_text("[]", encoding="utf-8")
if not USERS_FILE.exists(): USERS_FILE.write_text("{}", encoding="utf-8")
if not ORGS_FILE.exists(): ORGS_FILE.write_text("{}", encoding="utf-8")
if not CPS_FILE.exists(): CPS_FILE.write_text("{}", encoding="utf-8")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_transactions() -> List[dict]:
    return load_json(TRANSACTIONS_FILE, [])


def save_transactions(txs: List[dict]):
    save_json(TRANSACTIONS_FILE, txs)


def load_users_map() -> dict:
    return load_json(USERS_FILE, {})


def save_users_map(d: dict):
    save_json(USERS_FILE, d)


def load_orgs() -> dict:
    return load_json(ORGS_FILE, {})


def save_orgs(d: dict):
    save_json(ORGS_FILE, d)


def load_cps_map() -> dict:
    return load_json(CPS_FILE, {})


def save_cps_map(d: dict):
    save_json(CPS_FILE, d)


# =====================================================================
# GRUND-FUNKTIONER
# =====================================================================

def ensure_default_org():
    """Se till att org 'default' alltid finns."""
    orgs = load_orgs()
    if "default" not in orgs:
        orgs["default"] = {"name": "Default"}
        save_orgs(orgs)


def org_for_cp(cp_id: str) -> str:
    """Returnera CP-org (om saknas → 'default')."""
    cps = load_cps_map()
    return cps.get(cp_id, "default")


def display_name_for_tag(tag: str, users_map: dict) -> str:
    u = users_map.get(tag, {})
    if u.get("name"):
        return u["name"]
    fn = (u.get("first_name") or "").strip()
    ln = (u.get("last_name") or "").strip()
    return (fn + " " + ln).strip() or tag


# =====================================================================
# OCPP GLOBAL STATE (MÅSTE DELAS MELLAN API OCH WS → workers=1)
# =====================================================================
connected_cps: Dict[str, "CentralSystemCP"] = {}
connector_status: Dict[str, Dict[int, dict]] = {}
open_txs: Dict[int, dict] = {}
next_tx_id: int = 1

# RFID allowlist (din egna klass)
auth_store = AuthStore(AUTH_FILE)


# =====================================================================
# LÖSENORD / SESSIONS
# =====================================================================
def _b64(x: bytes) -> str:
    return base64.urlsafe_b64encode(x).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_password(password: str, salt_b64: str | None = None) -> dict:
    import os
    if not salt_b64:
        salt_b64 = _b64(os.urandom(16))
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt_b64), 200_000, 32)
    return {"pwd_salt": salt_b64, "pwd_hash": _b64(dk)}


def verify_password(password: str, salt_b64: str, pwh_b64: str) -> bool:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt_b64), 200_000, 32)
    return hmac.compare_digest(_b64(dk), pwh_b64)


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def set_session_cookie(resp: Response, *, email: str, role: str, org_id: Optional[str]):
    token_raw = {
        "email": email,
        "role": role,
        "org_id": org_id,
        "exp": (utcnow() + timedelta(minutes=SESSION_TTL_MIN)).isoformat()
    }
    raw = json.dumps(token_raw).encode()
    sig = hmac.new(APP_SECRET, raw, hashlib.sha256).digest()
    token = f"{_b64(raw)}.{_b64(sig)}"

    resp.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="Lax",
        path="/",
        max_age=SESSION_TTL_MIN * 60,
    )


def clear_session_cookie(resp: Response):
    resp.delete_cookie("session", path="/")


def verify_token(token: str) -> dict:
    try:
        raw_b64, sig_b64 = token.split(".")
        raw = _b64d(raw_b64)
        sig = _b64d(sig_b64)
        good = hmac.new(APP_SECRET, raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, good):
            raise ValueError("bad signature")

        data = json.loads(raw)
        exp = datetime.fromisoformat(data["exp"])
        if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
        if utcnow() > exp:
            raise ValueError("expired")
        return data
    except Exception as e:
        raise HTTPException(401, "Invalid/expired session") from e


# =====================================================================
# DEPENDENCIES (auth, roller)
# =====================================================================
def get_session(request: Request):
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(401, "Not authenticated")
    return verify_token(token)


def require_auth(s=Depends(get_session)):
    return s


def require_portal_admin(s=Depends(get_session)):
    if (s.get("role") or "").lower() not in ("portal_admin", "admin"):
        raise HTTPException(403, "Portal admin required")
    return s


def require_org_admin_or_portal(s=Depends(get_session)):
    if (s.get("role") or "").lower() not in ("org_admin", "portal_admin", "admin"):
        raise HTTPException(403, "Admin/org_admin required")
    return s


# =====================================================================
# RFID ORG‑BINDNING — KÄRNAN
# =====================================================================
def is_tag_allowed_on_cp(tag: str, cp_id: str) -> bool:
    """
    Policy:
    - Taggen måste vara whitelistaD (auth_store.contains)
    - CP måste tillhöra samma org som användarens org
    - Om PORTAL_TAGS_GLOBAL=true → portal_admin alltid accepterad
    - Om CP saknar mappning → anses vara 'default' (automappning görs vid WS)
    """

    users = load_users_map()
    u = users.get(tag)
    if not u:
        return False

    tag_role = (u.get("role") or "user").lower()
    tag_org  = u.get("org_id")
    cp_org   = org_for_cp(cp_id)

    # Portal-admin override
    if PORTAL_TAGS_GLOBAL and tag_role in ("portal_admin", "admin"):
        return True

    return tag_org == cp_org


# =====================================================================
# OCPP CENTRAL SYSTEM (WS)
# =====================================================================
class CentralSystemCP(CP):

    @on(Action.boot_notification)
    async def on_boot_notification(self, charge_point_vendor, charge_point_model, **kwargs):
        logger.info("[%s] BootNotification", self.id)
        return call_result.BootNotification(
            current_time=iso_now(),
            interval=30,
            status=RegistrationStatus.accepted
        )

    @on(Action.heartbeat)
    async def on_heartbeat(self):
        logger.info("[%s] Heartbeat", self.id)
        return call_result.Heartbeat(current_time=iso_now())

    @on(Action.status_notification)
    async def on_status_notification(self, connector_id, status, error_code, **kwargs):
        connector_id = int(connector_id)
        if self.id not in connector_status:
            connector_status[self.id] = {}
        connector_status[self.id][connector_id] = {
            "status": status,
            "error": error_code,
            "timestamp": iso_now(),
        }
        return call_result.StatusNotification()

    @on(Action.authorize)
    async def on_authorize(self, id_tag, **kwargs):
        allowed = auth_store.contains(id_tag)
        ok = is_tag_allowed_on_cp(id_tag, self.id) if allowed else False
        status = AuthorizationStatus.accepted if ok else AuthorizationStatus.blocked
        logger.info("[%s] Authorize id_tag=%s -> %s", self.id, id_tag, status.value)
        return call_result.Authorize(id_tag_info={"status": status})

    @on(Action.start_transaction)
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        global next_tx_id

        allowed = auth_store.contains(id_tag)
        ok = is_tag_allowed_on_cp(id_tag, self.id) if allowed else False
        status = AuthorizationStatus.accepted if ok else AuthorizationStatus.blocked

        tx_id = next_tx_id
        next_tx_id += 1

        entry = {
            "transaction_id": tx_id,
            "charge_point": self.id,
            "connectorId": int(connector_id),
            "id_tag": id_tag,
            "start_time": timestamp,
            "meter_start": meter_start,
            "stop_time": None,
            "meter_stop": None
        }
        open_txs[tx_id] = entry

        txs = load_transactions()
        txs.append(entry)
        save_transactions(txs)

        return call_result.StartTransaction(
            transaction_id=tx_id,
            id_tag_info={"status": status}
        )


async def on_connect(websocket, path):
    cp_id = path.strip("/")
    logger.info("CP connected: %s", cp_id)

    # AUTOMAPPNING → default
    ensure_default_org()
    cps = load_cps_map()
    if cp_id not in cps:
        cps[cp_id] = "default"
        save_cps_map(cps)
        logger.info("CP '%s' automapped to org 'default'", cp_id)

    cp = CentralSystemCP(cp_id, websocket)
    connected_cps[cp_id] = cp
    try:
        await cp.start()
    finally:
        connected_cps.pop(cp_id, None)
        logger.info("CP disconnected: %s", cp_id)


# =====================================================================
# FASTAPI
# =====================================================================
app = FastAPI(title="EV CSMS – Org‑Aware", version="7.0")


# ---------- MODELLER ----------
class LoginBody(BaseModel):
    email: str
    password: str


class UserMapBody(BaseModel):
    tag: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    org_id: Optional[str] = None
    password: Optional[str] = None


class CpAssignBody(BaseModel):
    cp_id: str
    org_id: str


# =====================================================================
# AUTH API
# =====================================================================
@app.post("/api/auth/login")
async def api_login(body: LoginBody, response: Response):
    users = load_users_map()

    matches = [
        (tag, u) for tag, u in users.items()
        if (u.get("email") or "").strip().lower() == body.email.strip().lower()
    ]
    if not matches:
        raise HTTPException(401, "Felaktig e‑post/lösenord")
    if len(matches) > 1:
        raise HTTPException(400, "E‑post används av flera RFID-taggar")

    tag, data = matches[0]
    salt, pwh = data.get("pwd_salt"), data.get("pwd_hash")
    if not salt or not pwh:
        raise HTTPException(401, "Lösenord ej satt")

    if not verify_password(body.password, salt, pwh):
        raise HTTPException(401, "Felaktig e‑post/lösenord")

    role = (data.get("role") or "user").lower()
    org_id = data.get("org_id") if role not in ("portal_admin", "admin") else None

    set_session_cookie(response, email=body.email.strip().lower(), role=role, org_id=org_id)
    return {"ok": True, "email": body.email}


@app.post("/api/auth/logout")
async def api_logout(resp: Response):
    clear_session_cookie(resp)
    return {"ok": True}


@app.get("/api/auth/me")
async def api_me(session=Depends(require_auth)):
    email = session["email"]
    users = load_users_map()
    name = None
    org_id = session.get("org_id")

    if not org_id:
        for _, u in users.items():
            if (u.get("email") or "").lower() == email:
                name = u.get("name") or (f"{u.get('first_name','')} {u.get('last_name','')}".strip())
                org_id = u.get("org_id")
                break
    else:
        for _, u in users.items():
            if (u.get("email") or "").lower() == email:
                name = u.get("name") or (f"{u.get('first_name','')} {u.get('last_name','')}".strip())
                break

    orgs = load_orgs()
    return {
        "email": email,
        "role": session["role"],
        "org_id": org_id,
        "org_name": orgs.get(org_id, {}).get("name"),
        "name": name
    }


# =====================================================================
# ORG API
# =====================================================================
@app.get("/api/orgs")
async def api_orgs(session=Depends(require_auth)):
    orgs = load_orgs()
    role = session.get("role")
    if role in ("portal_admin", "admin"):
        return orgs
    oid = session.get("org_id")
    return {oid: orgs.get(oid)} if oid in orgs else {}


@app.post("/api/orgs")
async def api_orgs_create(payload: dict, session=Depends(require_portal_admin)):
    org_id = (payload.get("org_id") or "").strip()
    name   = (payload.get("name") or "").strip()
    if not org_id or not name:
        raise HTTPException(400, "org_id och name måste anges")
    orgs = load_orgs()
    if org_id in orgs:
        raise HTTPException(409, "Organisation finns redan")
    orgs[org_id] = {"name": name}
    save_orgs(orgs)
    return orgs


@app.patch("/api/orgs/{org_id}")
async def api_orgs_rename(org_id: str, payload: dict, session=Depends(require_portal_admin)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name krävs")
    orgs = load_orgs()
    if org_id not in orgs:
        raise HTTPException(404, "Organisation saknas")
    orgs[org_id]["name"] = name
    save_orgs(orgs)
    return orgs


@app.delete("/api/orgs/{org_id}")
async def api_orgs_delete(org_id: str, force: bool = False, session=Depends(require_portal_admin)):
    orgs = load_orgs()
    if org_id not in orgs:
        raise HTTPException(404, "Organisation saknas")

    users = load_users_map()
    used = [t for t, u in users.items() if u.get("org_id") == org_id]
    if used and not force:
        raise HTTPException(409, f"Organisationen har {len(used)} användare")

    if used and force:
        for t in used:
            users[t]["org_id"] = "default"
        save_users_map(users)

    orgs.pop(org_id, None)
    save_orgs(orgs)
    return orgs


# =====================================================================
# CPS (CHARGE POINTS) API
# =====================================================================
@app.get("/api/cps/map")
async def api_cps_map(session=Depends(require_portal_admin)):
    return load_cps_map()


@app.post("/api/cps/map")
async def api_cps_assign(body: CpAssignBody, session=Depends(require_portal_admin)):
    ensure_default_org()
    cp_id = body.cp_id.strip()
    org_id = body.org_id.strip()
    orgs = load_orgs()
    if org_id not in orgs:
        raise HTTPException(400, "Okänd org")
    cps = load_cps_map()
    cps[cp_id] = org_id
    save_cps_map(cps)
    return cps


@app.delete("/api/cps/map")
async def api_cps_unassign(cp_id: str = Query(...), session=Depends(require_portal_admin)):
    cps = load_cps_map()
    if cp_id in cps:
        cps.pop(cp_id)
        save_cps_map(cps)
    return cps


def allowed_cps_for_session(session: dict):
    """Portal_admin → alla CP. Org_admin → CP i egna orgen."""
    role = session.get("role")
    if role in ("portal_admin", "admin"):
        return None
    oid = session.get("org_id")
    cps = load_cps_map()
    return {cp for cp, org in cps.items() if org == oid}


@app.get("/api/cps")
async def api_cps(session=Depends(require_auth)):
    ws_list = list(connected_cps.keys())
    st_list = list(connector_status.keys())
    all_cps = sorted(set(ws_list) | set(st_list))
    allowed = allowed_cps_for_session(session)
    if allowed is None:
        return {"connected": all_cps}
    return {"connected": [cp for cp in all_cps if cp in allowed]}


@app.get("/api/status")
async def api_status(session=Depends(require_auth)):
    allowed = allowed_cps_for_session(session)
    if allowed is None:
        return connector_status
    return {cp: connector_status.get(cp, {}) for cp in allowed}


# =====================================================================
# USERS API
# =====================================================================
@app.get("/api/users/map")
async def api_users_map(session=Depends(require_auth)):
    users = load_users_map()
    role = session.get("role")

    if role in ("portal_admin", "admin"):
        return users
    elif role == "org_admin":
        oid = session.get("org_id")
        return {t: u for t, u in users.items() if u.get("org_id") == oid}
    else:
        email = (session.get("email") or "").strip().lower()
        mine = {}
        for t, u in users.items():
            if (u.get("email") or "").lower() == email:
                mine[t] = u
                break
        return mine


@app.post("/api/users/map")
async def api_users_map_add(body: UserMapBody, req: Request, session=Depends(require_org_admin_or_portal)):
    raw = {}
    try:
        raw = await req.json()
    except:
        pass

    users = load_users_map()
    orgs  = load_orgs()

    email = ((raw.get("email") or body.email or "")).strip().lower()
    if not email:
        raise HTTPException(400, "email krävs")

    full_name = body.name or " ".join([p for p in [body.first_name, body.last_name] if p]).strip()
    if not full_name:
        raise HTTPException(400, "name eller first/last_name krävs")

    role = (body.role or "user").lower()
    if role not in ("user", "org_admin", "portal_admin"):
        raise HTTPException(400, "Ogiltig roll")

    # Portal-admin kan välja org_id. Org_admin är låst till sin egen org.
    if session.get("role") in ("portal_admin", "admin"):
        org_id = (body.org_id or raw.get("org_id") or "").strip()
        if not org_id:
            raise HTTPException(400, "org_id krävs för portal_admin")
        if org_id not in orgs:
            raise HTTPException(400, "Okänd organisation")
    else:
        org_id = session.get("org_id")
        if role == "portal_admin":
            raise HTTPException(403, "org_admin får inte skapa portal_admin")

    # E‑post måste vara unik per tag
    for t, u in users.items():
        if t != body.tag and (u.get("email") or "").lower() == email:
            raise HTTPException(400, "E‑post används redan")

    entry = users.get(body.tag, {})
    entry.update({
        "first_name": body.first_name or entry.get("first_name"),
        "last_name" : body.last_name  or entry.get("last_name"),
        "name"      : full_name,
        "email"     : email,
        "role"      : role,
        "org_id"    : org_id,
    })
    if body.password:
        h = hash_password(body.password)
        entry["pwd_salt"] = h["pwd_salt"]
        entry["pwd_hash"] = h["pwd_hash"]

    users[body.tag] = entry
    save_users_map(users)

    # Lägg till i allowlist om det saknas
    if not auth_store.contains(body.tag):
        auth_store.add(body.tag)

    return users


@app.delete("/api/users/map")
async def api_users_map_del(tag: str = Query(...), session=Depends(require_org_admin_or_portal)):
    users = load_users_map()
    entry = users.get(tag)
    if not entry:
        return users

    if session.get("role") == "org_admin" and entry.get("org_id") != session.get("org_id"):
        raise HTTPException(403, "Får bara ta bort användare i din egen organisation")

    if entry.get("role") in ("portal_admin", "admin"):
        raise HTTPException(403, "Kan inte ta bort portal_admin")

    users.pop(tag)
    save_users_map(users)

    if auth_store.contains(tag):
        auth_store.remove(tag)

    return users


# =====================================================================
# SUMMARY & HISTORY
# =====================================================================
def _allowed_tags_for_session(session: dict, users_map: dict) -> Optional[Set[str]]:
    role = session.get("role")
    if role in ("portal_admin", "admin"):
        return None
    if role == "org_admin":
        oid = session.get("org_id")
        return {t for t, u in users_map.items() if u.get("org_id") == oid}
    email = (session.get("email") or "")
    return {t for t, u in users_map.items() if (u.get("email") or "") == email}


@app.get("/api/users/summary")
async def api_users_summary(days: int = 30, session=Depends(require_auth)):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    txs = load_transactions()
    users_map = load_users_map()
    allowed = _allowed_tags_for_session(session, users_map)

    summary = {}
    for tx in txs:
        stop = tx.get("stop_time")
        if not stop or tx.get("meter_stop") is None:
            continue
        stop_dt = datetime.fromisoformat(stop.replace("Z", "+00:00"))
        if stop_dt < cutoff:
            continue

        tag = tx.get("id_tag")
        if allowed is not None and tag not in allowed:
            continue

        e = (tx["meter_stop"] - tx["meter_start"]) / 1000.0
        nm = display_name_for_tag(tag, users_map)
        row = summary.setdefault(tag, {"kwh": 0.0, "sessions": 0, "name": nm})
        row["kwh"] += max(0.0, e)
        row["sessions"] += 1

    for r in summary.values():
        r["kwh"] = round(r["kwh"], 3)

    return {"period_days": days, "generated_at": iso_now(), "users": summary}


@app.get("/api/users/history")
async def api_users_history(days: int = 30, tag: Optional[str] = None, session=Depends(require_auth)):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    txs = load_transactions()
    users_map = load_users_map()
    allowed = _allowed_tags_for_session(session, users_map)

    rows = []
    for tx in txs:
        stop = tx.get("stop_time")
        if not stop or tx.get("meter_stop") is None:
            continue
        stop_dt = datetime.fromisoformat(stop.replace("Z", "+00:00"))
        if stop_dt < cutoff:
            continue

        tg = tx.get("id_tag")
        if tag and tg != tag:
            continue
        if allowed is not None and tg not in allowed:
            continue

        e = (tx["meter_stop"] - tx["meter_start"]) / 1000.0
        rows.append({
            "tag": tg,
            "name": display_name_for_tag(tg, users_map),
            "charge_point": tx.get("charge_point"),
            "connectorId": tx.get("connectorId"),
            "start_time": tx.get("start_time"),
            "stop_time": tx.get("stop_time"),
            "energy_kwh": round(max(0.0, e), 3),
        })

    rows.sort(key=lambda r: r["stop_time"] or "", reverse=True)
    return {"period_days": days, "items": rows, "count": len(rows)}


# =====================================================================
# MY SUMMARY
# =====================================================================
@app.get("/api/my/summary")
async def api_my_summary(days: int = 30, session=Depends(require_auth)):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    txs = load_transactions()
    users_map = load_users_map()

    email = session.get("email")
    my_tags = {t for t, u in users_map.items() if (u.get("email") or "") == email}

    total = 0.0
    count = 0

    for tx in txs:
        stop = tx.get("stop_time")
        if not stop or tx.get("meter_stop") is None:
            continue
        stop_dt = datetime.fromisoformat(stop.replace("Z", "+00:00"))
        if stop_dt < cutoff:
            continue

        if tx.get("id_tag") not in my_tags:
            continue

        total += max(0.0, (tx["meter_stop"] - tx["meter_start"]) / 1000.0)
        count += 1

    return {
        "period_days": days,
        "generated_at": iso_now(),
        "kwh": round(total, 3),
        "sessions": count
    }


# =====================================================================
# STATIC SERVING
# =====================================================================
WEB = Path(__file__).resolve().parent.parent / "web"
app.mount("/ui", StaticFiles(directory=str(WEB), html=True), name="ui")
app.mount("/assets", StaticFiles(directory=str(WEB / "assets")), name="assets")


@app.get("/")
async def root():
    return RedirectResponse("/ui/login.html")


# =====================================================================
# STARTUP & SHUTDOWN
# =====================================================================
@app.on_event("startup")
async def startup():
    ensure_default_org()

    # Migrera användare (admin → portal_admin, saknat org → default)
    users = load_users_map()
    changed = False
    for t, u in users.items():
        if (u.get("role") or "") == "admin":
            u["role"] = "portal_admin"; changed = True
        if not u.get("org_id"):
            u["org_id"] = "default"; changed = True
    if changed:
        save_users_map(users)

    # Bootstrap om users.json tom
    if not users:
        logger.warning("users.json tom → bootstrapar portal_admin (%s)", BOOTSTRAP_EMAIL)
        h = hash_password(BOOTSTRAP_PW)
        users = {
            BOOTSTRAP_RFID: {
                "first_name": BOOTSTRAP_FIRST,
                "last_name": BOOTSTRAP_LAST,
                "name": f"{BOOTSTRAP_FIRST} {BOOTSTRAP_LAST}".strip(),
                "email": BOOTSTRAP_EMAIL.lower(),
                "role": "portal_admin",
                "org_id": BOOTSTRAP_ORG,
                "pwd_salt": h["pwd_salt"],
                "pwd_hash": h["pwd_hash"],
            }
        }
        save_users_map(users)
        orgs = load_orgs()
        if BOOTSTRAP_ORG not in orgs:
            orgs[BOOTSTRAP_ORG] = {"name": BOOTSTRAP_ORG.capitalize()}
            save_orgs(orgs)

    # Synka allowlist med users.json
    added = 0
    for tag in load_users_map().keys():
        if not auth_store.contains(tag):
            auth_store.add(tag)
            added += 1
    if added:
        logger.info("Allowlist synkad: lade till %s taggar", added)

    # Starta OCPP-WS
    logger.info("startup: starting WS server on :9000")
    app.state.ws_server = await websockets.serve(
        on_connect,
        host="0.0.0.0",
        port=9000,
        subprotocols=["ocpp1.6"],
        ping_interval=20,
        ping_timeout=20,
    )
    logger.info("WS server ready at ws://0.0.0.0:9000/<ChargeBoxId>")


@app.on_event("shutdown")
async def shutdown():
    ws = getattr(app.state, "ws_server", None)
    if ws:
        ws.close()
        await ws.wait_closed()
