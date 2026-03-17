# app/auth_store.py
from __future__ import annotations
import json
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
            if self._path.exists():
                try:
                    data = json.loads(self._path.read_text(encoding="utf-8"))
                    self._tags = {str(t).strip() for t in data}
                except Exception:
                    self._tags = set()
            else:
                self._tags = set()

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(sorted(self._tags), indent=2), encoding="utf-8")

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
