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
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
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

def normalize_tag(tag: str) -> str:
    return (tag or "").strip().upper()

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
        tx_key = f"open_tx:{tx_id}"
        self.redis.set(tx_key, json.dumps(entry))

        # Also append to persistent storage
        try:
            txs = load_json(TRANSACTIONS_FILE, [])
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
        tx_id = int(transaction_id)
        tx_key = f"open_tx:{tx_id}"

        # Get transaction from Redis
        tx_data = self.redis.get(tx_key)
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
                    if tx.get("transaction_id") == tx_id:
                        tx.update(entry)
                        break
                else:
                    txs.append(entry)
                save_json(TRANSACTIONS_FILE, txs)
            except Exception as e:
                logger.error("Failed to update transaction: %s", e)

        return call_result.StopTransaction()


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
        if id_tag:
            self._last_id_tag = id_tag
            if evse_id is not None:
                self._evse_tags[int(evse_id)] = id_tag

    def track_remote_start(self, remote_start_id, id_tag):
        self._remote_start_tags[int(remote_start_id)] = normalize_tag(id_tag)

    @on(Action201.boot_notification)
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        cs_dict = make_json_safe(charging_station)
        vendor = cs_dict.get("vendor_name") or cs_dict.get("vendorName") or "Unknown"
        logger.info("[%s] BootNotification (v2.0.1) from %s", self.id, vendor)
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
        evse_id = int(evse_id)
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
        evse_id = kwargs.get("evse_id")
        self.track_tag(id_tag, evse_id)
        ok = is_tag_allowed_on_cp(id_tag, self.id)
        status = get_enum_member(AuthorizationStatus201, "accepted") if ok else get_enum_member(AuthorizationStatus201, "blocked")
        masked_tag = (id_tag[:4] + "***") if id_tag else "***"
        logger.info("[%s] Authorize (v2.0.1) id_tag=%s -> %s", self.id, masked_tag, getattr(status, "value", status))
        return call_result201.Authorize(id_token_info={"status": status})

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
        evse_data = kwargs.get("evse") or {}
        evse_id = int(evse_data.get("id", 1))

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
            id_token = kwargs.get("id_token")
            token_dict = make_json_safe(id_token) if id_token else {}

            remote_start_id = kwargs.get("remote_start_id")
            remote_tag = self._remote_start_tags.get(int(remote_start_id)) if remote_start_id is not None else None

            # Priority: 1. idToken in message, 2. remoteStartId association, 3. EVSE-specific tag, 4. last global tag
            id_tag = normalize_tag(
                token_dict.get("id_token") or 
                token_dict.get("idToken") or 
                remote_tag or
                self._evse_tags.get(evse_id) or 
                self._last_id_tag or 
                "unknown"
            )
            
            # Track it for future events in this transaction if needed
            self.track_tag(id_tag, evse_id)

            # Perform authorization check
            ok = is_tag_allowed_on_cp(id_tag, self.id)
            status = get_enum_member(AuthorizationStatus201, "accepted") if ok else get_enum_member(AuthorizationStatus201, "blocked")
            id_token_info = {"status": status}
            
            masked_tag = (id_tag[:4] + "***") if id_tag != "UNKNOWN" else "UNKNOWN"
            logger.info("[%s] Transaction Started (v2.0.1) id_tag=%s -> %s", self.id, masked_tag, getattr(status, "value", status))

            meter_start = 0.0
            meter_values = kwargs.get("meter_value") or []
            for mv in meter_values:
                for sampled in (mv.get("sampled_value") or mv.get("sampledValue") or []):
                    measurand = sampled.get("measurand", "Energy.Active.Import.Register")
                    if measurand == "Energy.Active.Import.Register":
                        try:
                            meter_start = float(sampled.get("value", 0))
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

            self.redis.set(f"open_tx:{tx_id}", json.dumps(entry))
            try:
                txs = load_json(TRANSACTIONS_FILE, [])
                txs.append(entry)
                save_json(TRANSACTIONS_FILE, txs)
            except Exception as e:
                logger.error("Failed to save 2.0.1 transaction: %s", e)

        elif event_type == "Ended":
            tx_key = f"open_tx:{tx_id}"
            tx_data = self.redis.get(tx_key)
            if tx_data:
                entry = json.loads(tx_data)
                entry["stop_time"] = timestamp
                
                meter_stop = entry.get("meter_start", 0.0)
                meter_values = kwargs.get("meter_value") or []
                for mv in meter_values:
                    for sampled in (mv.get("sampled_value") or mv.get("sampledValue") or []):
                        measurand = sampled.get("measurand", "Energy.Active.Import.Register")
                        if measurand == "Energy.Active.Import.Register":
                            try:
                                meter_stop = float(sampled.get("value", 0))
                            except (ValueError, TypeError): pass
                
                entry["meter_stop"] = meter_stop
                self.redis.delete(tx_key)
                try:
                    txs = load_json(TRANSACTIONS_FILE, [])
                    for tx in txs:
                        if str(tx.get("transaction_id")) == str(tx_id):
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

    if CP_AUTH_REQUIRED:
        cps = load_json(CPS_FILE, {})
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
        ping_interval=20,
        ping_timeout=20,
    )
    asyncio.create_task(command_worker())
    logger.info("OCPP WebSocket server ready at ws://0.0.0.0:%d/<ChargeBoxId>", OCPP_PORT)
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
