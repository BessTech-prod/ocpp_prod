import pytest
import os
import json
import hmac
import hashlib
import base64
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Mock environmental variables
os.environ["APP_SECRET"] = "test-secret"
os.environ["BASE_DIR"] = "/tmp/evcsms_test"

# Create test directories
os.makedirs("/tmp/evcsms_test/config", exist_ok=True)
# Also need to make sure the audit log file can be created
# api.py opens it for writing in FileHandler

# Mock Redis before importing api.py
with patch("app.redis_config.build_redis_client") as mock_build:
    mock_redis = MagicMock()
    mock_build.return_value = mock_redis
    from evcsms.api import app, APP_SECRET

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def mock_redis_client():
    with patch("evcsms.api.redis_client") as m:
        yield m

def create_session_token(data: dict):
    # Match the logic in api.py: _b64e(json.dumps(data)) + "." + _b64e(hmac_sig)
    exp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    session_data = {**data, "exp": exp}
    raw = json.dumps(session_data).encode("utf-8")
    raw_b64 = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    
    sig = hmac.new(APP_SECRET, raw, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")
    
    return f"{raw_b64}.{sig_b64}"

@pytest.fixture
def installer_token():
    return create_session_token({"email": "installer@example.com", "role": "installer", "org_id": "default"})

@pytest.fixture
def portal_admin_token():
    return create_session_token({"email": "admin@example.com", "role": "portal_admin", "org_id": "default"})

@pytest.fixture
def org_admin_token():
    return create_session_token({"email": "org_admin@example.com", "role": "org_admin", "org_id": "org1"})

@pytest.fixture
def user_token():
    return create_session_token({"email": "user@example.com", "role": "user", "org_id": "org1"})
