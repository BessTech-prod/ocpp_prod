# =====================================================================
# ocpp_ws.py — OCPP 1.6J WebSocket Service
# =====================================================================

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import urlsplit, parse_qs
from dataclasses import asdict, is_dataclass

import websockets
from ocpp.routing import on
from ocpp.v16 import ChargePoint as CP
from ocpp.v16.enums import Action, AuthorizationStatus, RegistrationStatus
from ocpp.v16 import call_result, call

from ocpp.v201 import ChargePoint as CP201
from ocpp.v201 import call_result as call_result201
from ocpp.v201 import call as call201
try:
    from ocpp.v201.enums import (
        Action as Action201,
        RegistrationStatusEnumType as RegistrationStatus201,
        AuthorizationStatusEnumType as AuthorizationStatus201,
        MessagePriorityEnumType as MessagePriority201,
        MessageFormatEnumType as MessageFormat201,
    )
except ImportError:
    try:
        from ocpp.v201.enums import (
            Action as Action201,
            RegistrationStatusType as RegistrationStatus201,
            AuthorizationStatusType as AuthorizationStatus201,
            MessagePriorityType as MessagePriority201,
            MessageFormatType as MessageFormat201,
        )
    except ImportError:
        from ocpp.v201.enums import (
            Action as Action201,
            RegistrationStatus as RegistrationStatus201,
            AuthorizationStatus as AuthorizationStatus201,
            MessagePriority as MessagePriority201,
            MessageFormat as MessageFormat201,
        )

# Helper to get enum members that might be lowercase or uppercase
def get_enum_member(cls, name):
    for attr in [name.lower(), name.capitalize(), name.upper()]:
        if hasattr(cls, attr):
            return getattr(cls, attr)
    # If no member found, return capitalized name as string (OCPP spec style)
    return name.capitalize()

from app.auth_store import AuthStore
from app.history_export import enrich_transaction_snapshot
from app.redis_config import build_redis_client

# =====================================================================
# LOGGNING
# =====================================================================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO), format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ocpp-ws")

# =====================================================================
# KONFIGURATION
# =====================================================================
OCPP_PORT = int(os.getenv("OCPP_PORT", "9000"))
CP_AUTOMAP_ON_CONNECT = os.getenv("CP_AUTOMAP_ON_CONNECT", "true").lower() in ("1", "true", "yes")
CP_AUTH_REQUIRED = os.getenv("CP_AUTH_REQUIRED", "false").lower() in ("1", "true", "yes")
CP_SHARED_TOKEN = os.getenv("CP_SHARED_TOKEN", "").strip()

# File paths
BASE = Path("/data")
AUTH_FILE = BASE / "config" / "auth_tags.json"
USERS_FILE = BASE / "config" / "users.json"
ORGS_FILE = BASE / "config" / "orgs.json"
CPS_FILE = BASE / "config" / "cps.json"
TRANSACTIONS_FILE = BASE / "transactions.json"
RFIDS_FILE = BASE / "config" / "rfids.json"
BLOCKED_RFIDS_FILE = BASE / "blocked_rfids.json"

# =====================================================================
# REDIS CLIENT
# =====================================================================
redis_client = build_redis_client()
connected_clients: Dict[str, "CentralSystemCP"] = {}


def result_key(command_id: str) -> str:
    return f"ocpp:command_result:{command_id}"


def set_command_result(command_id: str, payload: dict):
    redis_client.setex(result_key(command_id), 600, json.dumps(make_json_safe(payload), ensure_ascii=False))


def make_json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if is_dataclass(value):
        return make_json_safe(asdict(value))
    if isinstance(value, dict):
        return {str(k): make_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [make_json_safe(v) for v in value]
    if hasattr(value, "model_dump"):
        return make_json_safe(value.model_dump())
    if hasattr(value, "dict"):
        return make_json_safe(value.dict())
    if hasattr(value, "__dict__"):
        return make_json_safe({k: v for k, v in vars(value).items() if not k.startswith("_")})
    return str(value)


def build_ocpp_call(command: str, payload: dict, version: str = "1.6"):
    command = (command or "").strip().lower()
    payload = payload or {}

    if version == "2.0.1":
        if command == "reset":
            # Map 1.6 reset types to 2.0.1 if possible
            reset_type = "Immediate" if str(payload.get("type")).lower() == "hard" else "OnIdle"
            return call201.Reset(type=reset_type)
        if command == "unlock_connector":
            return call201.UnlockConnector(evse_id=int(payload.get("connector_id", 1)), connector_id=1)
        if command == "set_display_message":
            url = payload.get("url")
            priority = payload.get("priority", "Normal")
            msg_id = int(payload.get("id", 1))
            return call201.SetDisplayMessage(
                message={
                    "id": msg_id,
                    "priority": get_enum_member(MessagePriority201, priority),
                    "message": {
                        "format": get_enum_member(MessageFormat201, "URI"),
                        "content": url
                    }
                }
            )
        if command == "set_variables":
            variables = payload.get("variables", [])
            set_var_data = []
            for v in variables:
                set_var_data.append({
                    "attributeValue": str(v.get("value")),
                    "component": {"name": v.get("component")},
                    "variable": {"name": v.get("variable")}
                })
            return call201.SetVariables(set_variable_data=set_var_data)

        if command == "remote_start_transaction":
            id_tag = str(payload.get("id_tag", ""))
            evse_id = int(payload.get("connector_id", 1))
            return call201.RequestStartTransaction(
                id_token={"id_token": id_tag, "type": "ISO14443"},
                remote_start_id=int(uuid.uuid4().int % 2147483647),
                evse_id=evse_id
            )

        if command == "remote_stop_transaction":
            return call201.RequestStopTransaction(
                transaction_id=str(payload.get("transaction_id", ""))
            )

        if command == "get_base_report":
            rb = payload.get("report_base", "FullInventory")
            req_id = int(payload.get("request_id") or uuid.uuid4().int % 2147483647)
            return call201.GetBaseReport(request_id=req_id, report_base=rb)

        if command == "get_report":
            req_id = int(payload.get("request_id") or uuid.uuid4().int % 2147483647)
            vars_list = payload.get("variables", [])
            cv_data = []
            for v in vars_list:
                cv_data.append({
                    "component": {"name": v.get("component")},
                    "variable": {"name": v.get("variable")}
                })
            return call201.GetReport(request_id=req_id, component_variable=cv_data)

        if command == "get_variables":
            vars_list = payload.get("variables", [])
            gv_data = []
            for v in vars_list:
                gv_data.append({
                    "component": {"name": v.get("component")},
                    "variable": {"name": v.get("variable")}
                })
            return call201.GetVariables(get_variable_data=gv_data)

        if command == "get_transaction_status":
             return call201.GetTransactionStatus(transaction_id=str(payload.get("transaction_id", "")))

        if command == "get_configuration":
            # For 2.0.1, we map 'get_configuration' without keys to 'GetBaseReport'
            # and with keys to 'GetVariables' (if keys are in Component:Variable format)
            keys = payload.get("key")
            if not keys:
                return call201.GetBaseReport(request_id=int(uuid.uuid4().int % 2147483647), report_base="FullInventory")
            
            gv_data = []
            for k in (keys if isinstance(keys, list) else [keys]):
                parts = str(k).split(":", 1)
                comp = parts[0]
                var = parts[1] if len(parts) > 1 else "Enabled" # Default to 'Enabled' if variable missing
                gv_data.append({"component": {"name": comp}, "variable": {"name": var}})
            return call201.GetVariables(get_variable_data=gv_data)

        if command == "get_log":
            req_id = int(payload.get("request_id") or uuid.uuid4().int % 2147483647)
            log_type = payload.get("log_type", "DiagnosticsLog")
            remote_loc = payload.get("remote_location")
            return call201.GetLog(
                request_id=req_id,
                log_type=log_type,
                log={
                    "remote_location": remote_loc,
                    "oldest_timestamp": payload.get("oldest_timestamp"),
                    "latest_timestamp": payload.get("latest_timestamp")
                }
            )

        if command == "update_firmware":
            req_id = int(payload.get("request_id") or uuid.uuid4().int % 2147483647)
            return call201.UpdateFirmware(
                request_id=req_id,
                firmware={
                    "location": payload.get("location"),
                    "retrieve_date_time": payload.get("retrieve_date_time"),
                    "retries": payload.get("retries"),
                    "retry_interval": payload.get("retry_interval")
                }
            )

        if command == "clear_display_message":
            return call201.ClearDisplayMessage(id=int(payload.get("id", 1)))

        if command == "customer_information":
            req_id = int(payload.get("request_id") or uuid.uuid4().int % 2147483647)
            return call201.CustomerInformation(
                request_id=req_id,
                report=payload.get("report", True),
                clear=payload.get("clear", False),
                customer_id=payload.get("customer_id"),
                id_token=payload.get("id_token")
            )

        raise ValueError(f"Command {command} not implemented for OCPP 2.0.1")

    if command == "reset":
        reset_type = str(payload.get("type", "Hard"))
        return call.Reset(type=reset_type)

    if command == "change_availability":
        availability_type = str(payload.get("type", "Operative"))
        connector_id = int(payload.get("connector_id", 0))
        return call.ChangeAvailability(connector_id=connector_id, type=availability_type)

    if command == "trigger_message":
        requested_message = str(payload.get("requested_message", "StatusNotification"))
        connector = payload.get("connector_id")
        if connector is None:
            return call.TriggerMessage(requested_message=requested_message)
        return call.TriggerMessage(requested_message=requested_message, connector_id=int(connector))

    if command == "clear_cache":
        return call.ClearCache()

    if command == "unlock_connector":
        connector_id = int(payload.get("connector_id", 1))
        return call.UnlockConnector(connector_id=connector_id)

    if command == "remote_start_transaction":
        connector_id = payload.get("connector_id")
        if connector_id in (None, ""):
            return call.RemoteStartTransaction(id_tag=str(payload.get("id_tag", "")))
        return call.RemoteStartTransaction(
            id_tag=str(payload.get("id_tag", "")),
            connector_id=int(connector_id),
        )

    if command == "remote_stop_transaction":
        transaction_id = int(payload.get("transaction_id", 0))
        return call.RemoteStopTransaction(transaction_id=transaction_id)

    if command == "get_configuration":
        keys = payload.get("key")
        if not keys:
            return call.GetConfiguration()
        if isinstance(keys, str):
            keys = [k.strip() for k in keys.split(",") if k.strip()]
        return call.GetConfiguration(key=[str(k) for k in keys])

    raise ValueError(f"Unsupported command: {command}")


async def command_worker():
    logger.info("OCPP command worker started")
    while True:
        try:
            popped = await asyncio.to_thread(redis_client.blpop, "ocpp:commands", 1)
            if not popped:
                continue

            _, raw_message = popped
            message = json.loads(raw_message.decode())

            command_id = message.get("command_id") or "unknown"
            cp_id = message.get("cp_id")
            command = message.get("command")
            payload = message.get("payload") or {}

            cp = connected_clients.get(cp_id)
            if not cp:
                set_command_result(
                    command_id,
                    {
                        "command_id": command_id,
                        "cp_id": cp_id,
                        "command": command,
                        "status": "failed",
                        "error": "Charge point is not connected",
                        "updated_at": iso_now(),
                    },
                )
                continue

            try:
                version = getattr(cp, "ocpp_version", "1.6")
                request = build_ocpp_call(command, payload, version)
                response = await cp.call(request)
                logger.info("[%s] Command %s response: %s", cp_id, command, make_json_safe(response))

                # Track tags for remote starts if successful
                status = getattr(response, "status", "")
                if hasattr(status, "value"): status = status.value
                if str(status).lower() == "accepted":
                    if command == "remote_start_transaction":
                        id_tag = payload.get("id_tag")
                        connector_id = payload.get("connector_id")
                        if version == "2.0.1":
                            remote_start_id = getattr(request, "remote_start_id", None)
                            if hasattr(cp, "track_remote_start") and remote_start_id is not None:
                                cp.track_remote_start(remote_start_id, id_tag)
                        if hasattr(cp, "track_tag"):
                            cp.track_tag(id_tag, connector_id)

                set_command_result(
                    command_id,
                    {
                        "command_id": command_id,
                        "cp_id": cp_id,
                        "command": command,
                        "status": "success",
                        "response": response,
                        "updated_at": iso_now(),
                    },
                )
            except Exception as exc:
                set_command_result(
                    command_id,
                    {
                        "command_id": command_id,
                        "cp_id": cp_id,
                        "command": command,
                        "status": "failed",
                        "error": str(exc),
                        "updated_at": iso_now(),
                    },
                )
        except Exception as exc:
            logger.exception("Command worker loop failed: %s", exc)
            await asyncio.sleep(1)


async def wait_for_redis(retries: int = 15, delay_seconds: float = 2.0):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            redis_client.ping()
            logger.info("Redis connection ready")
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Redis not ready yet (attempt %d/%d): %s",
                attempt,
                retries,
                exc,
            )
            await asyncio.sleep(delay_seconds)

    raise RuntimeError(f"Redis was not ready after {retries} attempts") from last_error

# =====================================================================
# HJÄLPFUNKTIONER
# =====================================================================
def load_json(path: Path, default):
    try:
        if not path.exists():
            return default
        content = path.read_text(encoding="utf-8").strip()
        if not content:
            return default
        return json.loads(content)
    except Exception as e:
        logger.error(f"Failed to load JSON from {path}: {e}")
        if path.exists():
            raise RuntimeError(f"JSON file {path} exists but is corrupted or unreadable") from e
        return default

def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f".tmp.{uuid.uuid4().hex}")
    try:
        tmp_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp_path, path)
    except Exception as e:
        logger.error(f"Failed to save JSON to {path}: {e}")
        if tmp_path.exists():
            try: tmp_path.unlink()
            except: pass
        raise

def normalize_tag(tag: Any) -> str:
    if tag is None:
        return ""
    return str(tag).strip().upper()

def load_rfids_map() -> dict:
    return load_json(RFIDS_FILE, {})

def migrate_rfids_from_users_if_needed() -> int:
    rfids = load_rfids_map()
    users = load_json(USERS_FILE, {})
    changed = 0
    for tag, user in users.items():
        ntag = normalize_tag(tag)
        if not ntag:
            continue
        if ntag not in rfids:
            rfids[ntag] = {
                "alias": ntag,
                "org_id": user.get("org_id") or "default",
                "user_email": (user.get("email") or "").strip().lower() or None,
                "active": True,
                "updated_at": iso_now(),
            }
            changed += 1
    if changed:
        save_json(RFIDS_FILE, rfids)
    return changed

def find_user_by_email(users: dict, email: str) -> Optional[dict]:
    wanted = (email or "").strip().lower()
    if not wanted:
        return None
    for _, u in users.items():
        if (u.get("email") or "").strip().lower() == wanted:
            return u
    return None

def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def ensure_default_org():
    """Se till att org 'default' alltid finns."""
    orgs = load_json(ORGS_FILE, {})
    if "default" not in orgs:
        orgs["default"] = {"name": "Default"}
        save_json(ORGS_FILE, orgs)

def org_for_cp(cp_id: str) -> str:
    """Returnera CP-org (om saknas → 'default')."""
    cps = load_json(CPS_FILE, {})
    entry = cps.get(cp_id)
    if isinstance(entry, dict):
        return (entry.get("org_id") or "default").strip() or "default"
    return (entry or "default").strip() if isinstance(entry, str) else "default"

def log_blocked_rfid(tag: str, cp_id: str):
    """Logga en tagg som nekats auktorisering."""
    tag = normalize_tag(tag)
    if not tag or tag == "UNKNOWN":
        return
    try:
        blocked = load_json(BLOCKED_RFIDS_FILE, [])
        if not isinstance(blocked, list):
            blocked = []
        
        # Spara tidpunkt och CP
        entry = {
            "tag": tag,
            "cp_id": cp_id,
            "timestamp": iso_now()
        }
        
        # Behåll bara de senaste 50 unika nekade taggarna (per tagg+cp kombo eller bara tagg?)
        # Vi kör per tagg och uppdaterar timestamp om den redan finns
        for existing in blocked:
            if existing.get("tag") == tag:
                existing["timestamp"] = entry["timestamp"]
                existing["cp_id"] = cp_id
                break
        else:
            blocked.insert(0, entry)
        
        save_json(BLOCKED_RFIDS_FILE, blocked[:100])
    except Exception as e:
        logger.error("Failed to log blocked RFID: %s", e)

def is_tag_allowed_on_cp(tag: str, cp_id: str) -> bool:
    """
    Policy:
    - Taggen måste finnas i rfids.json eller users.json
    - Taggen måste vara aktiv
    - CP måste tillhöra samma org som användarens org (eller vara default)
    - Om PORTAL_TAGS_GLOBAL=true → portal_admin alltid accepterad på alla CP
    """
    tag = normalize_tag(tag)
    users = load_json(USERS_FILE, {})
    rfids = load_rfids_map()

    rfid = rfids.get(tag)
    if rfid is not None:
        if not bool(rfid.get("active", True)):
            return False
        user_email = (rfid.get("user_email") or "").strip().lower()
        u = find_user_by_email(users, user_email) if user_email else None
        
        tag_role = (u.get("role") if u else "user").lower()
        tag_org = (rfid.get("org_id") or (u.get("org_id") if u else "default") or "default").strip()
    else:
        # Legacy fallback: users keyed by RFID tag
        u = users.get(tag)
        if not u:
            # Okänd tagg
            return False
        tag_role = (u.get("role") or "user").lower()
        tag_org = (u.get("org_id") or "default").strip()

    cp_org = org_for_cp(cp_id)

    # Portal-admin override
    portal_global = os.getenv("PORTAL_TAGS_GLOBAL", "true").lower() in ("1", "true", "yes")
    if portal_global and tag_role in ("portal_admin", "admin"):
        return True

    return tag_org == cp_org

# =====================================================================
# OCPP CENTRAL SYSTEM (WS)
# =====================================================================
class CentralSystemCP(CP):
    def __init__(self, cp_id, websocket):
        super().__init__(cp_id, websocket)
        self.redis = redis_client
        self.ocpp_version = "1.6"
        self._last_id_tag = None

    def track_tag(self, id_tag, connector_id=None):
        id_tag = normalize_tag(id_tag)
        if id_tag:
            self._last_id_tag = id_tag
            # Persist in Redis to survive reconnections
            try:
                self.redis.setex(f"last_tag:{self.id}", 3600, id_tag)
            except Exception as e:
                logger.warning("[%s] Failed to persist last_tag in Redis: %s", self.id, e)

    @on(Action.boot_notification)
    async def on_boot_notification(self, charge_point_vendor, charge_point_model, **kwargs):
        logger.info("[%s] BootNotification vendor=%s model=%s", self.id, charge_point_vendor, charge_point_model)
        
        # Store metadata in Redis and update cps.json if needed
        metadata = {
            "vendor": charge_point_vendor,
            "model": charge_point_model,
            "serial": kwargs.get("charge_point_serial_number") or kwargs.get("chargePointSerialNumber") or "Unknown",
            "firmware": kwargs.get("firmware_version") or kwargs.get("firmwareVersion") or "Unknown",
            "ocpp_version": "1.6",
            "last_boot": iso_now(),
        }
        self.redis.set(f"cp_metadata:{self.id}", json.dumps(metadata))
        
        try:
            cps = load_json(CPS_FILE, {})
            existing = cps.get(self.id, {})
            if isinstance(existing, str):
                existing = {"org_id": existing}
            
            # Update metadata in cps.json
            updated = False
            for k, v in metadata.items():
                if existing.get(k) != v:
                    existing[k] = v
                    updated = True
            
            if updated:
                cps[self.id] = existing
                save_json(CPS_FILE, cps)
        except Exception as e:
            logger.error("[%s] Failed to update cps.json with metadata: %s", self.id, e)

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
        logger.info("[%s] StatusNotification connector=%s status=%s", self.id, connector_id, status)
        connector_id = int(connector_id)
        status_key = f"connector_status:{self.id}:{connector_id}"
        status_data = {
            "status": status,
            "error": error_code,
            "timestamp": iso_now(),
        }
        self.redis.set(status_key, json.dumps(status_data))
        return call_result.StatusNotification()

    @on(Action.authorize)
    async def on_authorize(self, id_tag, **kwargs):
        id_tag = normalize_tag(id_tag)
        self.track_tag(id_tag)
        ok = is_tag_allowed_on_cp(id_tag, self.id)
        if not ok:
            log_blocked_rfid(id_tag, self.id)
        status = AuthorizationStatus.accepted if ok else AuthorizationStatus.blocked
        masked_tag = (id_tag[:4] + "***") if id_tag else "***"
        logger.info("[%s] Authorize id_tag=%s -> %s", self.id, masked_tag, status.value)
        return call_result.Authorize(id_tag_info={"status": status})

    @on(Action.start_transaction)
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        # Get next transaction ID from Redis
        tx_id = self.redis.incr("next_tx_id")

        id_tag = normalize_tag(id_tag)
        ok = is_tag_allowed_on_cp(id_tag, self.id)
        if not ok:
            log_blocked_rfid(id_tag, self.id)
        status = AuthorizationStatus.accepted if ok else AuthorizationStatus.blocked

        masked_tag = (id_tag[:4] + "***") if id_tag else "***"
        logger.info("[%s] StartTransaction id_tag=%s -> %s", self.id, masked_tag, status.value)

        rfids = load_rfids_map()
        rfid = rfids.get(normalize_tag(id_tag), {})

        entry = {
            "transaction_id": tx_id,
            "charge_point": self.id,
            "connectorId": int(connector_id),
            "id_tag": id_tag,
            "tag_alias": rfid.get("alias") or normalize_tag(id_tag),
            "user_email": rfid.get("user_email"),
            "start_time": timestamp,
            "meter_start": meter_start,
            "stop_time": None,
            "meter_stop": None
        }

        entry = enrich_transaction_snapshot(
            entry,
            rfids_map=rfids,
            cps_map=load_json(CPS_FILE, {}),
            users_map=load_json(USERS_FILE, {}),
            orgs_map=load_json(ORGS_FILE, {}),
        )

        # Store in Redis for active transactions
        tx_key = f"open_tx:{self.id}:{tx_id}"
        self.redis.set(tx_key, json.dumps(entry))

        # Also append to persistent storage
        try:
            txs = load_json(TRANSACTIONS_FILE, [])
            if not isinstance(txs, list): txs = []
            # Use compound check for safety
            for existing in txs:
                if not isinstance(existing, dict): continue
                if str(existing.get("transaction_id")) == str(tx_id) and existing.get("charge_point") == self.id:
                    existing.update(entry)
                    break
            else:
                txs.append(entry)
            save_json(TRANSACTIONS_FILE, txs)
        except Exception as e:
            logger.error("Failed to save transaction: %s", e)

        return call_result.StartTransaction(
            transaction_id=tx_id,
            id_tag_info={"status": status}
        )

    @on(Action.stop_transaction)
    async def on_stop_transaction(self, transaction_id, meter_stop, timestamp, **kwargs):
        logger.info("[%s] StopTransaction tx_id=%s", self.id, transaction_id)
        tx_id = str(transaction_id)
        
        # Try new key format first, then fallback to legacy format
        tx_key = f"open_tx:{self.id}:{tx_id}"
        tx_data = self.redis.get(tx_key)
        if not tx_data:
            legacy_key = f"open_tx:{tx_id}"
            tx_data = self.redis.get(legacy_key)
            if tx_data:
                tx_key = legacy_key

        # Get transaction from Redis
        if tx_data:
            entry = json.loads(tx_data)
            entry["stop_time"] = timestamp
            entry["meter_stop"] = meter_stop

            # Remove from active transactions
            self.redis.delete(tx_key)

            # Update persistent storage
            try:
                txs = load_json(TRANSACTIONS_FILE, [])
                for tx in txs:
                    if str(tx.get("transaction_id")) == str(tx_id) and tx.get("charge_point") == self.id:
                        tx.update(entry)
                        break
                else:
                    txs.append(entry)
                save_json(TRANSACTIONS_FILE, txs)
            except Exception as e:
                logger.error("Failed to update transaction: %s", e)

        return call_result.StopTransaction()

    @on(Action.meter_values)
    async def on_meter_values(self, connector_id, meter_value, **kwargs):
        logger.info("[%s] MeterValues connector=%s", self.id, connector_id)
        try:
            tx_id = kwargs.get("transaction_id")
            latest_energy = None
            for mv in meter_value:
                # mv can be a dict if coming from library or a dataclass
                mv_dict = make_json_safe(mv)
                sampled_values = mv_dict.get("sampled_value") or mv_dict.get("sampledValue") or []
                for sampled in sampled_values:
                    measurand = sampled.get("measurand", "Energy.Active.Import.Register")
                    if measurand == "Energy.Active.Import.Register":
                        try:
                            latest_energy = float(sampled.get("value", 0))
                        except (ValueError, TypeError): pass

                # Store latest sample in Redis for live view
                self.redis.setex(f"latest_meter:{self.id}:{connector_id}", 3600, json.dumps(mv_dict))

            if tx_id is not None and latest_energy is not None:
                # Try new key format first, then legacy
                tx_id_str = str(tx_id)
                tx_key = f"open_tx:{self.id}:{tx_id_str}"
                tx_data = self.redis.get(tx_key)
                if not tx_data:
                    legacy_key = f"open_tx:{tx_id_str}"
                    tx_data = self.redis.get(legacy_key)
                    if tx_data:
                        tx_key = legacy_key
                else:
                    # tx_data is already fetched, no need to get again inside if
                    pass

                if tx_data:
                    entry = json.loads(tx_data)
                    if entry.get("charge_point") == self.id:
                        entry["meter_stop"] = latest_energy
                        self.redis.set(tx_key, json.dumps(entry))
        except Exception as e:
            logger.error("[%s] Failed to process MeterValues: %s", self.id, e)
        return call_result.MeterValues()

    @on(Action.data_transfer)
    async def on_data_transfer(self, vendor_id, message_id=None, data=None, **kwargs):
        logger.info("[%s] DataTransfer vendor=%s msg=%s", self.id, vendor_id, message_id)
        return call_result.DataTransfer(status="Accepted")

    @on(Action.diagnostics_status_notification)
    async def on_diagnostics_status_notification(self, status, **kwargs):
        logger.info("[%s] DiagnosticsStatusNotification status=%s", self.id, status)
        return call_result.DiagnosticsStatusNotification()

    @on(Action.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logger.info("[%s] FirmwareStatusNotification status=%s", self.id, status)
        return call_result.FirmwareStatusNotification()


class CentralSystemCP201(CP201):
    def __init__(self, cp_id, websocket):
        super().__init__(cp_id, websocket)
        self.redis = redis_client
        self.ocpp_version = "2.0.1"
        self._last_id_tag = None
        self._evse_tags = {}
        self._remote_start_tags = {}

    def track_tag(self, id_tag, evse_id=None):
        id_tag = normalize_tag(id_tag)
        if id_tag and id_tag != "UNKNOWN":
            self._last_id_tag = id_tag
            try:
                # Persist in Redis to survive reconnections
                self.redis.setex(f"last_tag:{self.id}", 3600, id_tag)
                if evse_id is not None:
                    evse_id = int(evse_id)
                    self._evse_tags[evse_id] = id_tag
                    self.redis.setex(f"last_tag:{self.id}:{evse_id}", 3600, id_tag)
                
                # Also store in a rolling buffer of recent tags (last 5) for the charger
                # This helps if Authorize and TransactionEvent have slightly different contexts
                key = f"recent_tags:{self.id}"
                self.redis.lpush(key, id_tag)
                self.redis.ltrim(key, 0, 4)
                self.redis.expire(key, 600) # 10 minutes
            except Exception as e:
                logger.warning("[%s] Failed to persist last_tag in Redis: %s", self.id, e)

    def track_remote_start(self, remote_start_id, id_tag):
        id_tag = normalize_tag(id_tag)
        rid = int(remote_start_id)
        self._remote_start_tags[rid] = id_tag
        try:
            # Persist in Redis
            self.redis.setex(f"remote_tag:{self.id}:{rid}", 3600, id_tag)
        except Exception as e:
            logger.warning("[%s] Failed to persist remote_tag in Redis: %s", self.id, e)

    @on(Action201.boot_notification)
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        cs_dict = make_json_safe(charging_station)
        vendor = cs_dict.get("vendor_name") or cs_dict.get("vendorName") or "Unknown"
        model = cs_dict.get("model") or "Unknown"
        serial = cs_dict.get("serial_number") or cs_dict.get("serialNumber") or "Unknown"
        fw = cs_dict.get("firmware_version") or cs_dict.get("firmwareVersion") or "Unknown"
        
        logger.info("[%s] BootNotification (v2.0.1) from %s (%s) sn:%s fw:%s", self.id, vendor, model, serial, fw)
        
        # Store metadata in Redis and update cps.json if needed
        metadata = {
            "vendor": vendor,
            "model": model,
            "serial": serial,
            "firmware": fw,
            "ocpp_version": "2.0.1",
            "last_boot": iso_now(),
        }
        self.redis.set(f"cp_metadata:{self.id}", json.dumps(metadata))
        
        try:
            cps = load_json(CPS_FILE, {})
            existing = cps.get(self.id, {})
            if isinstance(existing, str):
                existing = {"org_id": existing}
            
            # Update metadata in cps.json
            updated = False
            for k, v in metadata.items():
                if existing.get(k) != v:
                    existing[k] = v
                    updated = True
            
            if updated:
                cps[self.id] = existing
                save_json(CPS_FILE, cps)
        except Exception as e:
            logger.error("[%s] Failed to update cps.json with metadata: %s", self.id, e)

        return call_result201.BootNotification(
            current_time=iso_now(),
            interval=30,
            status=get_enum_member(RegistrationStatus201, "accepted")
        )

    @on(Action201.heartbeat)
    async def on_heartbeat(self):
        logger.info("[%s] Heartbeat (v2.0.1)", self.id)
        return call_result201.Heartbeat(current_time=iso_now())

    @on(Action201.status_notification)
    async def on_status_notification(self, timestamp, connector_status, evse_id, connector_id=None, **kwargs):
        evse_id = int(evse_id or kwargs.get("evseId", 1))
        status_val = make_json_safe(connector_status)
        logger.info("[%s] StatusNotification (v2.0.1) evse=%s status=%s", self.id, evse_id, status_val)
        status_key = f"connector_status:{self.id}:{evse_id}"
        status_data = {
            "status": status_val,
            "error": "NoError",
            "timestamp": timestamp,
        }
        self.redis.set(status_key, json.dumps(status_data))
        return call_result201.StatusNotification()

    @on(Action201.authorize)
    async def on_authorize(self, id_token, **kwargs):
        token_dict = make_json_safe(id_token) if id_token else {}
        id_tag = normalize_tag(token_dict.get("id_token") or token_dict.get("idToken"))
        # evse_id is optional in Authorize
        evse_id = kwargs.get("evse_id") or kwargs.get("evseId")
        self.track_tag(id_tag, evse_id)
        ok = is_tag_allowed_on_cp(id_tag, self.id)
        if not ok:
            log_blocked_rfid(id_tag, self.id)
        status = get_enum_member(AuthorizationStatus201, "accepted") if ok else get_enum_member(AuthorizationStatus201, "blocked")
        masked_tag = (id_tag[:4] + "***") if id_tag else "***"
        logger.info("[%s] Authorize (v2.0.1) id_tag=%s -> %s", self.id, masked_tag, getattr(status, "value", status))
        return call_result201.Authorize(id_token_info={"status": status})

    @on(Action201.data_transfer)
    async def on_data_transfer(self, vendor_id, **kwargs):
        logger.info("[%s] DataTransfer (v2.0.1) vendor=%s data=%s", self.id, vendor_id, kwargs)
        return call_result201.DataTransfer(status="Accepted")

    @on(Action201.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logger.info("[%s] FirmwareStatusNotification (v2.0.1) status=%s", self.id, status)
        return call_result201.FirmwareStatusNotification()

    @on(Action201.log_status_notification)
    async def on_log_status_notification(self, status, **kwargs):
        logger.info("[%s] LogStatusNotification (v2.0.1) status=%s", self.id, status)
        return call_result201.LogStatusNotification()

    @on(Action201.transaction_event)
    async def on_transaction_event(self, event_type, timestamp, trigger_reason, seq_no, transaction_info, **kwargs):
        kwargs = make_json_safe(kwargs)
        tx_dict = make_json_safe(transaction_info)
        tx_id = tx_dict.get("transaction_id") or tx_dict.get("transactionId")
        event_type = make_json_safe(event_type)  # Get 'Started', 'Updated', 'Ended'
        logger.info("[%s] TransactionEvent type=%s tx_id=%s", self.id, event_type, tx_id)

        # Update connector status if chargingState is present for UI compatibility
        charging_state = tx_dict.get("charging_state") or tx_dict.get("chargingState")
        
        # Safely extract evse_id
        evse_data = kwargs.get("evse") or kwargs.get("evseId") or {}
        if isinstance(evse_data, (int, str)):
             evse_id = int(evse_data)
        else:
             evse_id = int(evse_data.get("id") or evse_data.get("evseId") or 1)

        # Track latest meter values for live monitoring
        meter_values = kwargs.get("meter_value") or kwargs.get("meterValue") or []
        if meter_values:
            try:
                self.redis.setex(f"latest_meter:{self.id}:{evse_id}", 3600, json.dumps(make_json_safe(meter_values[0])))
            except: pass

        if charging_state:
            status_map = {
                "Charging": "Charging",
                "EVConnected": "Preparing",
                "SuspendedEV": "SuspendedEV",
                "SuspendedEVSE": "SuspendedEVSE",
                "Idle": "Finishing",
            }
            mapped_status = status_map.get(charging_state, charging_state)
            status_key = f"connector_status:{self.id}:{evse_id}"
            self.redis.set(status_key, json.dumps({
                "status": mapped_status,
                "error": "NoError",
                "timestamp": timestamp,
            }))
        elif event_type == "Ended":
            status_key = f"connector_status:{self.id}:{evse_id}"
            self.redis.set(status_key, json.dumps({
                "status": "Available",
                "error": "NoError",
                "timestamp": timestamp,
            }))

        id_token_info = None
        if event_type == "Started":
            id_token = kwargs.get("id_token") or kwargs.get("idToken")
            token_dict = make_json_safe(id_token) if id_token else {}

            remote_start_id = kwargs.get("remote_start_id") or kwargs.get("remoteStartId")
            remote_tag = None
            if remote_start_id is not None:
                rid = int(remote_start_id)
                remote_tag = self._remote_start_tags.get(rid)
                if not remote_tag:
                    try:
                        val = self.redis.get(f"remote_tag:{self.id}:{rid}")
                        if val: remote_tag = val.decode() if isinstance(val, bytes) else val
                    except: pass
            
            # Priority: 1. idToken in message, 2. remoteStartId association, 3. EVSE-specific tag, 4. last global tag
            fallback_evse = self._evse_tags.get(evse_id)
            if not fallback_evse:
                try:
                    val = self.redis.get(f"last_tag:{self.id}:{evse_id}")
                    if val: fallback_evse = val.decode() if isinstance(val, bytes) else val
                except: pass
            
            fallback_global = self._last_id_tag
            if not fallback_global:
                try:
                    val = self.redis.get(f"last_tag:{self.id}")
                    if val: fallback_global = val.decode() if isinstance(val, bytes) else val
                except: pass

            token_tag = normalize_tag(
                token_dict.get("id_token") or 
                token_dict.get("idToken") or 
                token_dict.get("id_tag") or
                (id_token.id_token if hasattr(id_token, "id_token") else None) or
                (id_token.idToken if hasattr(id_token, "idToken") else None)
            )

            # Last Respite: Check recent tags buffer if still UNKNOWN
            recent_tag = None
            if not token_tag or token_tag == "UNKNOWN":
                 try:
                     # Get the most recent tag from the rolling buffer
                     val = self.redis.lindex(f"recent_tags:{self.id}", 0)
                     if val: recent_tag = val.decode() if isinstance(val, bytes) else val
                 except: pass

            id_tag = (
                token_tag if token_tag and token_tag != "UNKNOWN" else
                remote_tag or
                fallback_evse or 
                fallback_global or 
                recent_tag or
                "UNKNOWN"
            )
            
            logger.info("[%s] v2.0.1 tag resolution: idToken=%s remote=%s evse=%s global=%s recent=%s -> final=%s", 
                        self.id, token_tag, remote_tag, fallback_evse, fallback_global, recent_tag, id_tag)

            # Track it for future events in this transaction if needed
            self.track_tag(id_tag, evse_id)
            
            # Perform authorization check
            ok = is_tag_allowed_on_cp(id_tag, self.id)
            if not ok:
                log_blocked_rfid(id_tag, self.id)
            status = get_enum_member(AuthorizationStatus201, "accepted") if ok else get_enum_member(AuthorizationStatus201, "blocked")
            id_token_info = {"status": status}
            
            masked_tag = (id_tag[:4] + "***") if id_tag != "UNKNOWN" else "UNKNOWN"
            logger.info("[%s] Transaction Started (v2.0.1) id_tag=%s -> %s", self.id, masked_tag, getattr(status, "value", status))

            meter_start = 0.0
            for mv in meter_values:
                for sampled in (mv.get("sampled_value") or mv.get("sampledValue") or []):
                    measurand = sampled.get("measurand", "Energy.Active.Import.Register")
                    if measurand == "Energy.Active.Import.Register":
                        try:
                            val = float(sampled.get("value", 0))
                            context = sampled.get("context")
                            # Prefer Transaction.Begin context if present
                            if context == "Transaction.Begin" or not context:
                                meter_start = val
                        except (ValueError, TypeError): pass

            rfids = load_rfids_map()
            rfid = rfids.get(normalize_tag(id_tag), {})

            entry = {
                "transaction_id": tx_id,
                "charge_point": self.id,
                "connectorId": evse_id,
                "id_tag": id_tag,
                "tag_alias": rfid.get("alias") or normalize_tag(id_tag),
                "user_email": rfid.get("user_email"),
                "start_time": timestamp,
                "meter_start": meter_start,
                "stop_time": None,
                "meter_stop": None
            }

            try:
                entry = enrich_transaction_snapshot(
                    entry,
                    rfids_map=rfids,
                    cps_map=load_json(CPS_FILE, {}),
                    users_map=load_json(USERS_FILE, {}),
                    orgs_map=load_json(ORGS_FILE, {}),
                )
            except Exception as e:
                logger.error("Enrichment failed during 2.0.1 start: %s", e)

            # Use compound key to avoid collisions between chargers
            self.redis.set(f"open_tx:{self.id}:{tx_id}", json.dumps(entry))
            try:
                txs = load_json(TRANSACTIONS_FILE, [])
                if not isinstance(txs, list): txs = []
                # Check if already exists to avoid duplicates on re-sent 'Started' events
                for existing in txs:
                    if not isinstance(existing, dict): continue
                    if str(existing.get("transaction_id")) == str(tx_id) and existing.get("charge_point") == self.id:
                        existing.update(entry)
                        break
                else:
                    txs.append(entry)
                save_json(TRANSACTIONS_FILE, txs)
            except Exception as e:
                logger.error("Failed to save 2.0.1 transaction: %s", e)

        elif event_type == "Ended":
            tx_key = f"open_tx:{self.id}:{tx_id}"
            tx_data = self.redis.get(tx_key)
            if tx_data:
                entry = json.loads(tx_data)
                entry["stop_time"] = timestamp
                
                # In Ended events, some chargers send both Begin and End meter values.
                meter_start = entry.get("meter_start", 0.0)
                meter_stop = entry.get("meter_stop") or meter_start
                for mv in meter_values:
                    for sampled in (mv.get("sampled_value") or mv.get("sampledValue") or []):
                        measurand = sampled.get("measurand", "Energy.Active.Import.Register")
                        if measurand == "Energy.Active.Import.Register":
                            try:
                                val = float(sampled.get("value", 0))
                                context = sampled.get("context")
                                if context == "Transaction.Begin":
                                    meter_start = val
                                elif context == "Transaction.End" or not context:
                                    meter_stop = val
                            except (ValueError, TypeError): pass
                
                entry["meter_start"] = meter_start
                entry["meter_stop"] = meter_stop

                # If the tag is still unknown, try to resolve it from the Ended event's idToken
                if entry.get("id_tag") == "UNKNOWN" or not entry.get("id_tag"):
                    id_token = kwargs.get("id_token") or kwargs.get("idToken")
                    if id_token:
                        token_dict = make_json_safe(id_token)
                        id_tag = normalize_tag(token_dict.get("id_token") or token_dict.get("idToken"))
                        if id_tag and id_tag != "UNKNOWN":
                            entry["id_tag"] = id_tag
                            # Re-enrich with new tag info
                            try:
                                entry = enrich_transaction_snapshot(
                                    entry,
                                    rfids_map=load_rfids_map(),
                                    cps_map=load_json(CPS_FILE, {}),
                                    users_map=load_json(USERS_FILE, {}),
                                    orgs_map=load_json(ORGS_FILE, {}),
                                )
                            except: pass

                self.redis.delete(tx_key)
                try:
                    txs = load_json(TRANSACTIONS_FILE, [])
                    if not isinstance(txs, list): txs = []
                    for tx in txs:
                        if not isinstance(tx, dict): continue
                        if str(tx.get("transaction_id")) == str(tx_id) and tx.get("charge_point") == self.id:
                            tx.update(entry)
                            break
                    else:
                        txs.append(entry)
                    save_json(TRANSACTIONS_FILE, txs)
                except Exception as e:
                    logger.error("Failed to update 2.0.1 transaction: %s", e)

        return call_result201.TransactionEvent(id_token_info=id_token_info)


async def on_connect(websocket, path):
    parsed = urlsplit(path)
    cp_id = parsed.path.strip("/")
    token = (parse_qs(parsed.query).get("token", [""])[0] or "").strip()

    if not cp_id:
        logger.warning("Rejected CP connection with empty charge point id")
        await websocket.close(code=1008, reason="Missing ChargeBoxId")
        return

    # Normalize ID: some chargers might connect without 'ocpp/' prefix even if configured with it,
    # or vice-versa. We check cps.json to find the best match.
    cps = load_json(CPS_FILE, {})
    if cp_id not in cps:
        if f"ocpp/{cp_id}" in cps:
            logger.info("Normalizing CP ID: '%s' -> 'ocpp/%s'", cp_id, cp_id)
            cp_id = f"ocpp/{cp_id}"
        elif cp_id.startswith("ocpp/") and cp_id[5:] in cps:
             logger.info("Normalizing CP ID: '%s' -> '%s'", cp_id, cp_id[5:])
             cp_id = cp_id[5:]

    if CP_AUTH_REQUIRED:
        known_cp = cp_id in cps
        if not known_cp:
            logger.warning("Rejected CP '%s' (unknown charge point id)", cp_id)
            await websocket.close(code=1008, reason="Unknown ChargeBoxId")
            return
        if CP_SHARED_TOKEN and token != CP_SHARED_TOKEN:
            logger.warning("Rejected CP '%s' (invalid token)", cp_id)
            await websocket.close(code=1008, reason="Invalid token")
            return

    logger.info("CP connected: %s", cp_id)

    # Optional auto-map: disable in local test mode to keep CPs unassigned.
    if CP_AUTOMAP_ON_CONNECT:
        ensure_default_org()
        cps = load_json(CPS_FILE, {})
        if cp_id not in cps:
            cps[cp_id] = {"org_id": "default", "alias": cp_id}
            save_json(CPS_FILE, cps)
            logger.info("CP '%s' automapped to org 'default'", cp_id)
    else:
        logger.info("CP '%s' connected without automap (CP_AUTOMAP_ON_CONNECT=false)", cp_id)

    # Track connected CP in Redis
    redis_client.sadd("connected_cps", cp_id)

    if websocket.subprotocol == "ocpp2.0.1":
        cp = CentralSystemCP201(cp_id, websocket)
    else:
        cp = CentralSystemCP(cp_id, websocket)

    connected_clients[cp_id] = cp
    try:
        await cp.start()
    finally:
        redis_client.srem("connected_cps", cp_id)
        connected_clients.pop(cp_id, None)
        logger.info("CP disconnected: %s", cp_id)


async def process_request(path, request_headers):
    """Log incoming WebSocket handshake for debugging."""
    # We only log at INFO if it's a suspicious request, otherwise DEBUG
    ua = request_headers.get("User-Agent", "Unknown")
    subproto = request_headers.get("Sec-WebSocket-Protocol", "None")
    logger.debug("Handshake attempt: path=%s subproto=%s UA=%s", path, subproto, ua)
    return None

async def main():
    await wait_for_redis()
    ensure_default_org()
    migrated = migrate_rfids_from_users_if_needed()
    if migrated:
        logger.info("RFID-migrering: skapade %s poster från users.json", migrated)
    logger.info("Starting OCPP WebSocket server on port %d", OCPP_PORT)
    server = await websockets.serve(
        on_connect,
        host="0.0.0.0",
        port=OCPP_PORT,
        subprotocols=["ocpp1.6", "ocpp2.0.1"],
        process_request=process_request,
        ping_interval=20,
        ping_timeout=20,
    )
    asyncio.create_task(command_worker())
    logger.info("OCPP WebSocket server ready at ws://0.0.0.0:%d/<ChargeBoxId>", OCPP_PORT)
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
