import json
import os
import hashlib
import base64
import hmac
from pathlib import Path

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")

def _b64d(s: str) -> bytes:
    pad = "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def hash_password(password: str):
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000, 32)
    return _b64(salt), _b64(dk)

def fix():
    # Try multiple common paths for users.json on the server
    paths = [
        Path("evcsms/config/users.json"),
        Path("config/users.json"),
        Path("/data/config/users.json"),
        Path("~/ocpp_prod/evcsms/config/users.json").expanduser()
    ]
    
    found_path = None
    for p in paths:
        if p.exists():
            found_path = p
            break
            
    if not found_path:
        print("❌ Could not find users.json in common locations.")
        return

    print(f"✅ Found users.json at: {found_path}")
    
    try:
        content = found_path.read_text(encoding="utf-8")
        if "<<<<<<" in content:
            print("⚠️ Conflict markers found! Attempting to clean them...")
            import re
            content = re.sub(r'<<<<<<<.*?[\n\r](.*?)=======.*?>>>>>>>.*?\n?', r'\1', content, flags=re.DOTALL)
            found_path.write_text(content, encoding="utf-8")
            print("✅ Conflict markers removed.")

        data = json.loads(content)
        print(f"✅ JSON is valid. Found {len(data)} users.")
        
        # Reset admin password
        admin_email = "admin@takorama.se"
        admin_tag = None
        for tag, u in data.items():
            if u.get("email") == admin_email:
                admin_tag = tag
                break
        
        if not admin_tag:
            print(f"⚠️ User {admin_email} not found. Creating it...")
            admin_tag = "8Y2OJPDQIHH2"
            data[admin_tag] = {
                "first_name": "admin",
                "last_name": "User",
                "name": "admin User",
                "email": admin_email,
                "role": "portal_admin",
                "org_id": "default"
            }

        salt, pwh = hash_password("password123")
        data[admin_tag]["pwd_salt"] = salt
        data[admin_tag]["pwd_hash"] = pwh
        
        found_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"🚀 SUCCESS: Password for {admin_email} reset to: password123")
        print("Please restart your Docker containers now.")

    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    fix()
