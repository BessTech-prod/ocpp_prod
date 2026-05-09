import pytest
from unittest.mock import patch, MagicMock

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "api"}

def test_installer_access_cps_map(client, installer_token):
    with patch("evcsms.api.load_cps_map", return_value={"cp1": {"org_id": "org1"}}):
        client.cookies.set("session", installer_token)
        response = client.get("/api/cps/map")
        assert response.status_code == 200
        assert "cp1" in response.json()

def test_user_denied_cps_map(client, user_token):
    client.cookies.set("session", user_token)
    response = client.get("/api/cps/map")
    assert response.status_code == 403

def test_installer_assign_cp(client, installer_token):
    with patch("evcsms.api.load_cps_map", return_value={}), \
         patch("evcsms.api.save_cps_map") as mock_save, \
         patch("evcsms.api.load_orgs", return_value={"org1": {"name": "Org 1"}}), \
         patch("evcsms.api.ensure_default_org"):
        client.cookies.set("session", installer_token)
        response = client.post("/api/cps/map", json={"cp_id": "cpnew", "org_id": "org1", "alias": "New CP"})
        assert response.status_code == 200
        mock_save.assert_called_once()

def test_installer_live_chargers(client, installer_token, mock_redis_client):
    with patch("evcsms.api.load_cps_map", return_value={"cp1": {"org_id": "org1"}}):
        mock_redis_client.smembers.return_value = {b"cp1"}
        mock_redis_client.scan.return_value = (0, [b"connector_status:cp1:1"])
        mock_redis_client.get.return_value = b'{"status": "Available"}'
        
        client.cookies.set("session", installer_token)
        response = client.get("/api/portal/live/chargers")
        assert response.status_code == 200
        data = response.json()
        assert any(item["cp_id"] == "cp1" for item in data["items"])

def test_installer_ocpp_command(client, installer_token, mock_redis_client):
    mock_redis_client.smembers.return_value = {b"cp1"}
    client.cookies.set("session", installer_token)
    response = client.post("/api/portal/ocpp/command", json={
        "cp_id": "cp1",
        "command": "reset",
        "payload": {"type": "Soft"}
    })
    assert response.status_code == 200
    assert response.json()["ok"] is True
    mock_redis_client.rpush.assert_called_once()

def test_installer_denied_user_creation(client, installer_token):
    client.cookies.set("session", installer_token)
    response = client.post("/api/users/map", json={
        "tag": "NEWTAG",
        "email": "newuser@example.com",
        "name": "New User",
        "role": "user",
        "org_id": "org1"
    })
    # If it passes auth, it might fail with 400 if org1 is missing, 
    # but we WANT it to be blocked by require_org_admin_or_portal (403).
    assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

def test_org_admin_cannot_create_installer(client, org_admin_token):
    with patch("evcsms.api.load_orgs", return_value={"org1": {"name": "Org 1"}}):
        client.cookies.set("session", org_admin_token)
        response = client.post("/api/users/map", json={
            "tag": "NEWTAG",
            "email": "newinstaller@example.com",
            "name": "New Installer",
            "role": "installer",
            "org_id": "org1"
        })
        # org_admin is allowed by dependency, but blocked by logic in function
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "org_admin får inte skapa" in response.json()["detail"]

def test_portal_admin_can_create_installer(client, portal_admin_token):
    with patch("evcsms.api.load_users_map", return_value={}), \
         patch("evcsms.api.save_users_map"), \
         patch("evcsms.api.load_rfids_map", return_value={}), \
         patch("evcsms.api.save_rfids_map"), \
         patch("evcsms.api.load_orgs", return_value={"org1": {"name": "Org 1"}}):
        client.cookies.set("session", portal_admin_token)
        response = client.post("/api/users/map", json={
            "tag": "NEWTAG",
            "email": "newinstaller@example.com",
            "name": "New Installer",
            "role": "installer",
            "org_id": "org1",
            "password": "Password123!"
        })
        assert response.status_code == 200
