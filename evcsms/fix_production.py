import json
import os
import hashlib
import base64
import hmac
import re
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

def clean_content(content):
    lines = content.splitlines()
    new_lines = []
    in_ours = False
    in_theirs = False
    
    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            new_lines.append(line)
            continue

        # Conflict markers
        if trimmed.startswith('<<<<<<<'):
            in_ours = True
            continue
        if trimmed.startswith('======='):
            in_ours = False
            in_theirs = True
            continue
        if trimmed.startswith('>>>>>>>'):
            in_theirs = False
            continue
            
        if in_theirs:
            continue
        
        # Garbage filter: standalone hex hashes (often 7-40 chars) with no JSON syntax
        if re.match(r'^[0-9a-f]{7,40}$', trimmed) and not any(c in line for c in '{}:,"[]'):
            print(f"  🗑️ Filtering garbage line: {trimmed}")
            continue
            
        new_lines.append(line)
    return "\n".join(new_lines)

def heal_json(content):
    # Try to parse
    try:
        return json.loads(content), content
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON Error: {e}")
        lines = content.splitlines()
        
        # Aggressive cleaning: remove the line with the error if it looks like garbage
        err_line_idx = e.lineno - 1
        if 0 <= err_line_idx < len(lines):
            bad_line = lines[err_line_idx].strip()
            # If it doesn't look like JSON (no quotes, no braces, no colon)
            if bad_line and not any(c in bad_line for c in '{}:,"[]'):
                print(f"  ⚠️ Removing likely garbage at line {e.lineno}: {bad_line}")
                lines.pop(err_line_idx)
                content = "\n".join(lines)
                try:
                    return json.loads(content), content
                except: pass

        # Missing comma fix
        new_lines = []
        for i in range(len(lines)-1):
            curr = lines[i].rstrip()
            nxt = lines[i+1].lstrip()
            if (curr.endswith('}') or curr.endswith('"') or (curr and curr[-1].isdigit())) and nxt.startswith('"') and not curr.endswith(','):
                 new_lines.append(lines[i].rstrip() + ",")
            else:
                 new_lines.append(lines[i])
        new_lines.append(lines[-1])
        content = "\n".join(new_lines)
        
        try:
            return json.loads(content), content
        except Exception as e2:
            return None, content

def fix():
    config_dir = None
    possible_dirs = [
        Path("config"),
        Path("evcsms/config"),
        Path("~/ocpp_prod/evcsms/config").expanduser()
    ]
    for d in possible_dirs:
        if d.exists() and d.is_dir():
            config_dir = d
            break
    
    if not config_dir:
        print("❌ Could not find config directory.")
        return

    print(f"✅ Found config directory at: {config_dir}")
    files = ["users.json", "api_keys.json", "auth_tags.json", "rfids.json"]
    
    for filename in files:
        p = config_dir / filename
        if not p.exists():
            continue
        
        print(f"🔍 Checking {filename}...")
        try:
            content = p.read_text(encoding="utf-8")
            # 1. Clean conflict markers and garbage
            cleaned = clean_content(content)
            # 2. Try to parse and heal
            data, final_content = heal_json(cleaned)
            
            if data is not None:
                print(f"  ✅ {filename} is now valid.")
                p.write_text(final_content, encoding="utf-8")
                
                if filename == "users.json":
                    admin_email = "admin@takorama.se"
                    admin_tag = None
                    for tag, u in data.items():
                        if u.get("email") == admin_email:
                            admin_tag = tag
                            break
                    if not admin_tag:
                        admin_tag = "8Y2OJPDQIHH2"
                        data[admin_tag] = {"email": admin_email, "role": "portal_admin", "org_id": "default"}
                    
                    salt, pwh = hash_password("password123")
                    data[admin_tag]["pwd_salt"] = salt
                    data[admin_tag]["pwd_hash"] = pwh
                    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
                    print(f"  🚀 SUCCESS: Reset admin@takorama.se password to: password123")
            else:
                print(f"  ❌ Failed to automatically fix {filename}. Please check it manually.")
        except Exception as e:
            print(f"  ❌ Error processing {filename}: {e}")

if __name__ == "__main__":
    fix()
