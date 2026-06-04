
import sys
import json
import unittest
from unittest.mock import MagicMock, patch

# 1. Mock all dependencies before importing ocpp_ws
class MockChargePoint:
    def __init__(self, cp_id, websocket):
        self.id = cp_id
        self.websocket = websocket

def mock_on(action):
    def decorator(func):
        return func
    return decorator

mock_routing = MagicMock()
mock_routing.on = mock_on

mock_v201 = MagicMock()
mock_v201.ChargePoint = MockChargePoint

mock_v16 = MagicMock()
mock_v16.ChargePoint = MockChargePoint

sys.modules["ocpp"] = MagicMock()
sys.modules["ocpp.routing"] = mock_routing
sys.modules["ocpp.v16"] = mock_v16
sys.modules["ocpp.v201"] = mock_v201
sys.modules["ocpp.v201.enums"] = MagicMock()
sys.modules["ocpp.v201.call_result"] = MagicMock()
sys.modules["ocpp.v201.call"] = MagicMock()
sys.modules["ocpp.v16.enums"] = MagicMock()
sys.modules["ocpp.v16.call_result"] = MagicMock()
sys.modules["ocpp.v16.call"] = MagicMock()

sys.modules["websockets"] = MagicMock()

sys.modules["app"] = MagicMock()
sys.modules["app.auth_store"] = MagicMock()
sys.modules["app.history_export"] = MagicMock()
sys.modules["app.redis_config"] = MagicMock()

# 2. Import the functions/classes to test
# We need to make sure the project root is in sys.path
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ocpp_ws import normalize_tag, CentralSystemCP201

class TestOCPP201Fixes(unittest.TestCase):
    def test_normalize_tag(self):
        self.assertEqual(normalize_tag("  abc  "), "ABC")
        self.assertEqual(normalize_tag(None), "")
        self.assertEqual(normalize_tag(123), "123")
        self.assertEqual(normalize_tag("ABC"), "ABC")

    @patch("ocpp_ws.redis_client")
    def test_on_status_notification_camelcase(self, mock_redis):
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis
        
        # Simulate call with camelCase evseId in kwargs
        import asyncio
        async def run_test():
            await cp.on_status_notification(timestamp="2024-01-01T00:00:00Z", connector_status="Available", evse_id=None, evseId=2)
        
        asyncio.run(run_test())
        
        # Verify redis key used evseId=2
        args, kwargs = mock_redis.set.call_args
        self.assertIn("connector_status:test_cp:2", args[0])

    @patch("ocpp_ws.redis_client")
    @patch("ocpp_ws.is_tag_allowed_on_cp", return_value=True)
    def test_on_authorize_camelcase(self, mock_auth, mock_redis):
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis
        
        import asyncio
        async def run_test():
            # id_token is a dict in 2.0.1
            id_token = {"idToken": "tag123", "type": "ISO14443"}
            await cp.on_authorize(id_token=id_token, evseId=1)
        
        asyncio.run(run_test())
        
        # Verify track_tag was called with correct tag (normalized)
        mock_redis.setex.assert_any_call("last_tag:test_cp", 3600, "TAG123")

    @patch("ocpp_ws.redis_client")
    def test_on_transaction_event_camelcase(self, mock_redis):
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis
        
        import asyncio
        async def run_test():
            # TransactionEvent with camelCase
            tx_info = {"transactionId": "tx1", "chargingState": "Charging"}
            
            # Test evseId and meterValue (camelCase)
            await cp.on_transaction_event(
                event_type="Updated",
                timestamp="2024-01-01T00:00:00Z",
                trigger_reason="MeterValuePeriodic",
                seq_no=1,
                transaction_info=tx_info,
                evseId=5,
                meterValue=[{"timestamp": "2024...", "sampledValue": [{"value": "100"}]}]
            )
                
            # Check meter value persistence
            mock_redis.setex.assert_any_call("latest_meter:test_cp:5", 3600, '{"timestamp": "2024...", "sampledValue": [{"value": "100"}]}')
                
            # Test idToken and remoteStartId (camelCase)
            mock_redis.reset_mock()
            mock_redis.get.return_value = None # No remote tag in redis
            
            # Mock json.dumps to avoid serializing MagicMocks in entry
            with patch("ocpp_ws.json.dumps", side_effect=lambda x, **kwargs: "{}"):
                await cp.on_transaction_event(
                    event_type="Started",
                    timestamp="2024-01-01T00:00:00Z",
                    trigger_reason="Authorized",
                    seq_no=2,
                    transaction_info=tx_info,
                    evse={"id": 1},
                    idToken={"idToken": "tag789"},
                    remoteStartId=100
                )
            # Should have tracked TAG789
            mock_redis.setex.assert_any_call("last_tag:test_cp", 3600, "TAG789")

        asyncio.run(run_test())

    @patch("ocpp_ws.redis_client")
    @patch("ocpp_ws.load_rfids_map", return_value={})
    @patch("ocpp_ws.load_json", return_value={})
    @patch("ocpp_ws.save_json")
    @patch("ocpp_ws.enrich_transaction_snapshot", side_effect=lambda x, **kwargs: x)
    def test_on_transaction_event_ended_with_begin_meter(self, mock_enrich, mock_save, mock_load, mock_rfids, mock_redis):
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis
        
        tx_id = "tx123"
        initial_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "UNKNOWN",
            "meter_start": 0.0,
            "start_time": "2026-06-04T07:58:35Z"
        }
        mock_redis.get.return_value = json.dumps(initial_entry).encode()
        
        import asyncio
        async def run_test():
            await cp.on_transaction_event(
                event_type="Ended",
                timestamp="2026-06-04T11:03:37Z",
                trigger_reason="EVCommunicationLost",
                seq_no=16,
                transaction_info={"transactionId": tx_id},
                meterValue=[
                    {
                        "sampledValue": [{"context": "Transaction.Begin", "measurand": "Energy.Active.Import.Register", "value": 100.0}]
                    },
                    {
                        "sampledValue": [{"context": "Transaction.End", "measurand": "Energy.Active.Import.Register", "value": 150.0}]
                    }
                ],
                idToken={"idToken": "new_tag"}
            )
        
        asyncio.run(run_test())
        
        # Verify that meter_start was updated and id_tag was updated
        txs = mock_save.call_args[0][1]
        entry = txs[-1]
        self.assertEqual(entry["meter_start"], 100.0)
        self.assertEqual(entry["meter_stop"], 150.0)
        self.assertEqual(entry["id_tag"], "NEW_TAG")

if __name__ == "__main__":
    unittest.main()
