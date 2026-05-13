# app/auth_store.py
from __future__ import annotations
import json
import os
import uuid
from pathlib import Path
from threading import RLock
from typing import Set, List

class AuthStore:
    """
    Trådsäker RFID-allow list på disk (JSON).
    Använder RLock för att undvika deadlock när add()/remove() skriver fil.
    """
    def __init__(self, path: Path):
        self._path = path
        self._lock = RLock()
        self._tags: Set[str] = set()
        self.load()

    def load(self) -> None:
        with self._lock:
            if not self._path.exists():
                self._tags = set()
                return
            try:
                content = self._path.read_text(encoding="utf-8").strip()
                if not content:
                    self._tags = set()
                    return
                data = json.loads(content)
                self._tags = {str(t).strip() for t in data}
            except Exception as e:
                # If file exists but is corrupted, we don't want to continue and risk wiping it
                raise RuntimeError(f"Auth file {self._path} exists but is corrupted: {e}")

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(f".tmp.{uuid.uuid4().hex}")
        try:
            tmp_path.write_text(json.dumps(sorted(self._tags), indent=2), encoding="utf-8")
            os.replace(tmp_path, self._path)
        except Exception:
            if tmp_path.exists():
                try: tmp_path.unlink()
                except: pass
            raise

    def save(self) -> None:
        with self._lock:
            self._save_unlocked()

    def all(self) -> List[str]:
        with self._lock:
            return sorted(self._tags)

    def contains(self, tag: str) -> bool:
        t = str(tag).strip()
        with self._lock:
            return t in self._tags

    def add(self, tag: str) -> None:
        t = str(tag).strip()
        with self._lock:
            if t not in self._tags:
                self._tags.add(t)
                self._save_unlocked()

    def remove(self, tag: str) -> None:
        t = str(tag).strip()
        with self._lock:
            if t in self._tags:
                self._tags.remove(t)
                self._save_unlocked()
