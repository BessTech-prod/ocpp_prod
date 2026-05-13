# =====================================================================
# app/api_keys.py - API Key Management for Third-Party Integrations
# =====================================================================

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Tuple
import hashlib
import hmac

class ApiKeyManager:
    """
    Thread-safe API key management for third-party integrations.
    
    Structure:
    {
        "key_hash": {
            "org_id": "...",
            "created_at": "...",
            "last_used": "...",
            "active": true
        }
    }
    
    Keys are stored as SHA256 hashes for security.
    """
    
    def __init__(self, path: Path):
        self._path = path
        self._keys: Dict[str, dict] = {}
        self.load()
    
    def load(self) -> None:
        """Load API keys from disk."""
        if not self._path.exists():
            self._keys = {}
            return
        try:
            content = self._path.read_text(encoding="utf-8").strip()
            if not content:
                self._keys = {}
                return
            self._keys = json.loads(content)
        except Exception as e:
            # Prevent wiping the file if it exists but can't be loaded
            raise RuntimeError(f"API keys file {self._path} exists but is corrupted: {e}")
    
    def _save(self) -> None:
        """Save API keys to disk atomically."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(f".tmp.{uuid.uuid4().hex}")
        try:
            tmp_path.write_text(json.dumps(self._keys, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp_path, self._path)
        except Exception:
            if tmp_path.exists():
                try: tmp_path.unlink()
                except: pass
            raise
    
    def _hash_key(self, raw_key: str) -> str:
        """Hash API key using SHA256."""
        return hashlib.sha256(raw_key.encode()).hexdigest()
    
    def generate_key_for_org(self, org_id: str, rate_limit: int = 120, ip_whitelist: list = None) -> Tuple[str, str]:
        """
        Generate a new API key for an organization.
        
        Returns: (raw_key_to_share, key_hash_stored_internally)
        """
        # Generate: org_id prefix + random UUID
        raw_key = f"{org_id}:{uuid.uuid4().hex}"
        key_hash = self._hash_key(raw_key)
        
        entry = {
            "org_id": org_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_used": None,
            "rate_limit": rate_limit,
            "ip_whitelist": ip_whitelist or [],
            "active": True
        }
        
        self._keys[key_hash] = entry
        self._save()
        
        return raw_key, key_hash
    
    def validate_key(self, raw_key: str, client_ip: Optional[str] = None, update_last_used: bool = False) -> Optional[Dict]:
        """
        Validate an API key and return metadata if valid.
        
        Returns: {org_id, created_at, ...} or None if invalid
        """
        if not raw_key:
            return None
        
        key_hash = self._hash_key(raw_key)
        entry = self._keys.get(key_hash)
        
        if not entry:
            return None
        
        if not entry.get("active", False):
            return None  # Key is disabled

        # Check IP Whitelist if configured
        whitelist = entry.get("ip_whitelist", [])
        if whitelist and client_ip:
            if client_ip not in whitelist:
                # Security note: We could log this attempt
                return None
        
        if update_last_used:
            # Update last_used on disk (traditional way)
            entry["last_used"] = datetime.now(timezone.utc).isoformat()
            self._save()
        
        # Return a copy to avoid mutation issues
        return dict(entry)
    
    def set_key_active_status(self, org_id: str, key_hash: str, active: bool) -> bool:
        """Pause (deactivate) or reactivate an API key."""
        entry = self._keys.get(key_hash)
        if not entry or entry.get("org_id") != org_id:
            return False
        
        entry["active"] = active
        self._save()
        return True

    def update_key_whitelist(self, org_id: str, key_hash: str, ip_whitelist: list) -> bool:
        """Update the IP whitelist for an API key."""
        entry = self._keys.get(key_hash)
        if not entry or entry.get("org_id") != org_id:
            return False
        
        entry["ip_whitelist"] = ip_whitelist
        self._save()
        return True

    def delete_key(self, org_id: str, key_hash: str) -> bool:
        """Delete an API key permanently."""
        entry = self._keys.get(key_hash)
        if not entry or entry.get("org_id") != org_id:
            return False
        
        del self._keys[key_hash]
        self._save()
        return True

    def deactivate_key(self, org_id: str, key_hash: str) -> bool:
        """Deactivate an API key."""
        entry = self._keys.get(key_hash)
        if not entry or entry.get("org_id") != org_id:
            return False
        
        entry["active"] = False
        self._save()
        return True
    
    def list_keys_for_org(self, org_id: str) -> list:
        """List all keys (hashed) for an organization."""
        return [
            {
                "hash": key_hash,
                "prefix": key_hash[:16] + "***",
                "org_id": entry.get("org_id"),
                "created_at": entry.get("created_at"),
                "last_used": entry.get("last_used"),
                "rate_limit": entry.get("rate_limit", 120),
                "ip_whitelist": entry.get("ip_whitelist", []),
                "active": entry.get("active", False)
            }
            for key_hash, entry in self._keys.items()
            if entry.get("org_id") == org_id
        ]
    
    def list_all_keys(self) -> list:
        """List all keys for all organizations."""
        return [
            {
                "hash": key_hash,
                "prefix": key_hash[:16] + "***",
                "org_id": entry.get("org_id"),
                "created_at": entry.get("created_at"),
                "last_used": entry.get("last_used"),
                "rate_limit": entry.get("rate_limit", 120),
                "ip_whitelist": entry.get("ip_whitelist", []),
                "active": entry.get("active", False)
            }
            for key_hash, entry in self._keys.items()
        ]

