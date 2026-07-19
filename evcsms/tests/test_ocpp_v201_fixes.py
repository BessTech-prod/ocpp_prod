
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
        # Updated events now look up the open transaction from Redis;
        # return None to simulate no open tx (safe no-op path).
        mock_redis.get.return_value = None
        
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

    # ── Tests for Updated event handling (the root cause of intermittent reporting) ──

    @patch("ocpp_ws.redis_client")
    def test_updated_event_captures_meter_values(self, mock_redis):
        """Updated events carry periodic meter readings that must be
        stored on the open transaction so the Ended handler can use them."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis

        tx_id = "tx_meter_update"
        open_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "TAG1",
            "meter_start": 1000.0,
            "meter_stop": None,
            "start_time": "2026-07-19T08:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(open_entry).encode()

        import asyncio
        async def run_test():
            await cp.on_transaction_event(
                event_type="Updated",
                timestamp="2026-07-19T08:30:00Z",
                trigger_reason="MeterValuePeriodic",
                seq_no=5,
                transaction_info={"transactionId": tx_id},
                evse={"id": 1},
                meterValue=[{
                    "timestamp": "2026-07-19T08:30:00Z",
                    "sampledValue": [
                        {"measurand": "Energy.Active.Import.Register", "value": 5500.0}
                    ]
                }]
            )

        asyncio.run(run_test())

        # The open transaction in Redis must now have meter_stop = 5500.0
        set_call = mock_redis.set.call_args_list
        # Find the call that writes back the open_tx key
        tx_writes = [c for c in set_call if f"open_tx:test_cp:{tx_id}" in str(c)]
        self.assertTrue(len(tx_writes) > 0, "Updated event should write back to Redis")
        saved = json.loads(tx_writes[-1][0][1])
        self.assertEqual(saved["meter_stop"], 5500.0)

    @patch("ocpp_ws.redis_client")
    def test_updated_event_keeps_highest_meter_value(self, mock_redis):
        """Multiple Updated events: meter_stop should always reflect the
        highest reading (cumulative register)."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis

        tx_id = "tx_cumulative"
        open_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "TAG1",
            "meter_start": 0.0,
            "meter_stop": 3000.0,       # already accumulated from a previous Updated event
            "start_time": "2026-07-19T08:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(open_entry).encode()

        import asyncio
        async def run_test():
            # Send a reading lower than the current meter_stop — should be ignored
            await cp.on_transaction_event(
                event_type="Updated",
                timestamp="2026-07-19T09:00:00Z",
                trigger_reason="MeterValuePeriodic",
                seq_no=10,
                transaction_info={"transactionId": tx_id},
                evse={"id": 1},
                meterValue=[{
                    "sampledValue": [
                        {"measurand": "Energy.Active.Import.Register", "value": 2000.0}
                    ]
                }]
            )

        asyncio.run(run_test())

        # meter_stop should NOT have been overwritten with the lower value
        tx_writes = [c for c in mock_redis.set.call_args_list
                     if f"open_tx:test_cp:{tx_id}" in str(c)]
        # Either no write (because nothing changed) or if written, value should stay 3000
        if tx_writes:
            saved = json.loads(tx_writes[-1][0][1])
            self.assertEqual(saved["meter_stop"], 3000.0)

    @patch("ocpp_ws.redis_client")
    @patch("ocpp_ws.load_rfids_map", return_value={"LATE_TAG": {"alias": "Hugo", "user_email": "hugo@example.com"}})
    @patch("ocpp_ws.load_json", return_value={})
    @patch("ocpp_ws.enrich_transaction_snapshot", side_effect=lambda x, **kwargs: x)
    def test_updated_event_resolves_unknown_tag(self, mock_enrich, mock_load, mock_rfids, mock_redis):
        """If the Started event couldn't determine the user (tag=UNKNOWN),
        an Updated event carrying an idToken must fix it."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis

        tx_id = "tx_late_auth"
        open_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "UNKNOWN",
            "meter_start": 0.0,
            "meter_stop": None,
            "start_time": "2026-07-19T08:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(open_entry).encode()

        import asyncio
        async def run_test():
            await cp.on_transaction_event(
                event_type="Updated",
                timestamp="2026-07-19T08:01:00Z",
                trigger_reason="Authorized",
                seq_no=2,
                transaction_info={"transactionId": tx_id},
                evse={"id": 1},
                idToken={"idToken": "late_tag"},
            )

        asyncio.run(run_test())

        tx_writes = [c for c in mock_redis.set.call_args_list
                     if f"open_tx:test_cp:{tx_id}" in str(c)]
        self.assertTrue(len(tx_writes) > 0, "Updated event should write back to Redis when tag resolved")
        saved = json.loads(tx_writes[-1][0][1])
        self.assertEqual(saved["id_tag"], "LATE_TAG")
        self.assertEqual(saved["tag_alias"], "Hugo")

    @patch("ocpp_ws.redis_client")
    def test_updated_event_no_open_tx_is_safe(self, mock_redis):
        """If no open transaction exists in Redis (e.g. after a restart),
        the Updated event must not crash."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis
        mock_redis.get.return_value = None  # no open transaction

        import asyncio
        async def run_test():
            await cp.on_transaction_event(
                event_type="Updated",
                timestamp="2026-07-19T08:30:00Z",
                trigger_reason="MeterValuePeriodic",
                seq_no=5,
                transaction_info={"transactionId": "orphan_tx"},
                evse={"id": 1},
                meterValue=[{
                    "sampledValue": [
                        {"measurand": "Energy.Active.Import.Register", "value": 1234.0}
                    ]
                }]
            )

        # Must not raise
        asyncio.run(run_test())

    @patch("ocpp_ws.redis_client")
    @patch("ocpp_ws.load_rfids_map", return_value={})
    @patch("ocpp_ws.load_json", return_value=[])
    @patch("ocpp_ws.save_json")
    @patch("ocpp_ws.enrich_transaction_snapshot", side_effect=lambda x, **kwargs: x)
    def test_ended_uses_meter_stop_from_updated_events(self, mock_enrich, mock_save, mock_load, mock_rfids, mock_redis):
        """End-to-end: if Updated events accumulated meter_stop in the open
        transaction and the Ended event carries NO meter data, the final
        transaction must still show the correct energy consumption."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis

        tx_id = "tx_e2e"
        # Simulate a transaction where Updated events already set meter_stop
        open_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "TAG1",
            "tag_alias": "Hugo",
            "user_email": "hugo@example.com",
            "meter_start": 1000.0,
            "meter_stop": 8500.0,      # accumulated from Updated events
            "start_time": "2026-07-19T08:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(open_entry).encode()

        import asyncio
        async def run_test():
            # Ended event with NO meterValue — common on some charger firmwares
            await cp.on_transaction_event(
                event_type="Ended",
                timestamp="2026-07-19T10:00:00Z",
                trigger_reason="EVDeparted",
                seq_no=20,
                transaction_info={"transactionId": tx_id},
                evse={"id": 1},
                # NOTE: no meterValue at all
            )

        asyncio.run(run_test())

        txs = mock_save.call_args[0][1]
        entry = txs[-1]
        self.assertEqual(entry["meter_start"], 1000.0)
        self.assertEqual(entry["meter_stop"], 8500.0)
        self.assertEqual(entry["stop_time"], "2026-07-19T10:00:00Z")
        # Energy = (8500 - 1000) / 1000 = 7.5 kWh — provable from the saved data

    @patch("ocpp_ws.redis_client")
    @patch("ocpp_ws.load_rfids_map", return_value={})
    @patch("ocpp_ws.load_json", return_value=[])
    @patch("ocpp_ws.save_json")
    @patch("ocpp_ws.enrich_transaction_snapshot", side_effect=lambda x, **kwargs: x)
    def test_ended_meter_overrides_updated_when_present(self, mock_enrich, mock_save, mock_load, mock_rfids, mock_redis):
        """If the Ended event DOES carry Transaction.End meter data, that
        value should override the one accumulated from Updated events."""
        cp = CentralSystemCP201("test_cp", MagicMock())
        cp.redis = mock_redis

        tx_id = "tx_override"
        open_entry = {
            "transaction_id": tx_id,
            "charge_point": "test_cp",
            "connectorId": 1,
            "id_tag": "TAG1",
            "meter_start": 1000.0,
            "meter_stop": 8500.0,      # from Updated events
            "start_time": "2026-07-19T08:00:00Z",
        }
        mock_redis.get.return_value = json.dumps(open_entry).encode()

        import asyncio
        async def run_test():
            await cp.on_transaction_event(
                event_type="Ended",
                timestamp="2026-07-19T10:00:00Z",
                trigger_reason="EVDeparted",
                seq_no=20,
                transaction_info={"transactionId": tx_id},
                evse={"id": 1},
                meterValue=[{
                    "sampledValue": [{
                        "context": "Transaction.End",
                        "measurand": "Energy.Active.Import.Register",
                        "value": 9000.0
                    }]
                }]
            )

        asyncio.run(run_test())

        txs = mock_save.call_args[0][1]
        entry = txs[-1]
        self.assertEqual(entry["meter_stop"], 9000.0)

if __name__ == "__main__":
    unittest.main()
