"""
Tests for user history filtering: users should only see their own sessions,
not all sessions in their organization.
"""
import os
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

# Ensure env vars are set before importing api
os.environ.setdefault("APP_SECRET", "test-secret")
os.environ.setdefault("BASE_DIR", "/tmp/evcsms_test")
os.makedirs("/tmp/evcsms_test/config", exist_ok=True)

# Mock Redis before importing api
with patch("app.redis_config.build_redis_client") as mock_build:
    mock_build.return_value = MagicMock()
    from evcsms.api import _history_rows_for_session


def _make_tx(tag, org_id, charge_point="cp1", energy_wh=5000, minutes_ago=60):
    """Helper: create a completed transaction dict."""
    stop = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    start = stop - timedelta(minutes=30)
    return {
        "transaction_id": f"tx_{tag}_{minutes_ago}",
        "id_tag": tag,
        "org_id": org_id,
        "charge_point": charge_point,
        "connectorId": 1,
        "start_time": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stop_time": stop.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meter_start": 0,
        "meter_stop": energy_wh,
    }


RFIDS = {
    "TAG_USER1": {"user_email": "user1@example.com", "org_id": "org1", "alias": "User1 tag"},
    "TAG_USER2": {"user_email": "user2@example.com", "org_id": "org1", "alias": "User2 tag"},
}

USERS_MAP = {}

ORGS = {"org1": {"name": "Org 1"}}

CPS = {"cp1": {"org_id": "org1", "alias": "Charger 1"}}

TRANSACTIONS = [
    _make_tx("TAG_USER1", "org1", minutes_ago=30),
    _make_tx("TAG_USER2", "org1", minutes_ago=60),
]


class TestUserHistoryFilter(unittest.TestCase):

    @patch("evcsms.api.normalize_cps_map", side_effect=lambda x: x)
    @patch("evcsms.api.load_cps_map", return_value=CPS)
    @patch("evcsms.api.load_orgs", return_value=ORGS)
    @patch("evcsms.api.load_rfids_map", return_value=RFIDS)
    @patch("evcsms.api.load_users_map", return_value=USERS_MAP)
    @patch("evcsms.api.load_transactions", return_value=TRANSACTIONS)
    def test_user_sees_only_own_sessions(self, *mocks):
        """A user should only see their own charging sessions, not all in the org."""
        session = {"email": "user1@example.com", "role": "user", "org_id": "org1"}
        rows = _history_rows_for_session(30, None, session)

        tags = [r["tag"] for r in rows]
        self.assertEqual(len(rows), 1, f"Expected 1 session, got {len(rows)}: {tags}")
        self.assertEqual(rows[0]["tag"], "TAG_USER1")

    @patch("evcsms.api.normalize_cps_map", side_effect=lambda x: x)
    @patch("evcsms.api.load_cps_map", return_value=CPS)
    @patch("evcsms.api.load_orgs", return_value=ORGS)
    @patch("evcsms.api.load_rfids_map", return_value=RFIDS)
    @patch("evcsms.api.load_users_map", return_value=USERS_MAP)
    @patch("evcsms.api.load_transactions", return_value=TRANSACTIONS)
    def test_org_admin_sees_all_org_sessions(self, *mocks):
        """An org_admin should see all sessions in their organization."""
        session = {"email": "admin@example.com", "role": "org_admin", "org_id": "org1"}
        rows = _history_rows_for_session(30, None, session)

        tags = {r["tag"] for r in rows}
        self.assertEqual(len(rows), 2, f"Expected 2 sessions, got {len(rows)}: {list(tags)}")
        self.assertIn("TAG_USER1", tags)
        self.assertIn("TAG_USER2", tags)

    @patch("evcsms.api.normalize_cps_map", side_effect=lambda x: x)
    @patch("evcsms.api.load_cps_map", return_value=CPS)
    @patch("evcsms.api.load_orgs", return_value=ORGS)
    @patch("evcsms.api.load_rfids_map", return_value=RFIDS)
    @patch("evcsms.api.load_users_map", return_value=USERS_MAP)
    @patch("evcsms.api.load_transactions", return_value=TRANSACTIONS)
    def test_user_with_no_tags_sees_nothing(self, *mocks):
        """A user whose email doesn't match any RFID tag should see no sessions."""
        session = {"email": "nobody@example.com", "role": "user", "org_id": "org1"}
        rows = _history_rows_for_session(30, None, session)

        self.assertEqual(len(rows), 0, f"Expected 0 sessions, got {len(rows)}")


if __name__ == "__main__":
    unittest.main()
