import json
import uuid
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Add the parent directory to sys.path so we can import app
sys.path.append(str(Path(__file__).parent.parent))

from app.redis_config import build_redis_client

def iso_now():
    return datetime.now(timezone.utc).isoformat()

def main():
    if len(sys.argv) < 3:
        print("Usage: python send_ocpp_command.py <cp_id> <command> [payload_json]")
        print("Example: python send_ocpp_command.py 55Z00A10H set_variables '{\"variables\": [{\"component\": \"TxCtrlr\", \"variable\": \"TxStartPoint\", \"value\": \"Authorized\"}]}'")
        sys.exit(1)

    cp_id = sys.argv[1]
    command = sys.argv[2]
    payload = {}
    
    if len(sys.argv) > 3:
        try:
            payload = json.loads(sys.argv[3])
        except Exception as e:
            print(f"Error parsing payload JSON: {e}")
            sys.exit(1)

    try:
        redis_client = build_redis_client()
        command_id = str(uuid.uuid4())
        
        envelope = {
            "command_id": command_id,
            "cp_id": cp_id,
            "command": command,
            "payload": payload,
            "requested_by": "terminal_tool",
            "requested_at": iso_now(),
        }
        
        # Set initial result status
        result_key = f"ocpp:command_result:{command_id}"
        redis_client.setex(
            result_key,
            600,
            json.dumps({
                "command_id": command_id,
                "status": "queued",
                "cp_id": cp_id,
                "command": command,
                "requested_at": envelope["requested_at"],
            }),
        )
        
        # Push to command queue
        redis_client.rpush("ocpp:commands", json.dumps(envelope))
        print(f"✅ Command '{command}' successfully queued for charger '{cp_id}'.")
        print(f"   Command ID: {command_id}")
        print(f"   Status: Queued")
        
    except Exception as e:
        print(f"❌ Error sending command: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
