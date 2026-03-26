from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import time
from urllib.parse import urlparse, unquote
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from app.history_export import build_backup_manifest, build_backup_rows, build_history_workbook, iso_now, load_backup_source


logger = logging.getLogger("history-backup")


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class BackupConfig:
    enabled: bool
    git_url: str
    git_branch: str
    git_user_name: str
    git_user_email: str
    repo_target_dir: str
    interval_seconds: int
    run_on_startup: bool
    data_dir: Path
    config_dir: Path
    git_worktree: Path
    git_ssh_command: str
    git_ssh_key_path: Path | None
    git_known_hosts_path: Path | None
    git_strict_host_key_checking: bool

    @classmethod
    def from_env(cls) -> "BackupConfig":
        data_dir = Path(os.getenv("BACKUP_DATA_DIR", "/data")).expanduser()
        config_dir = Path(os.getenv("BACKUP_CONFIG_DIR", str(data_dir / "config"))).expanduser()
        git_worktree = Path(os.getenv("BACKUP_GIT_WORKTREE", str(data_dir / "backups" / "git-worktree"))).expanduser()
        interval_seconds = max(60, int(os.getenv("BACKUP_INTERVAL_SECONDS", "172800")))
        target_dir = (os.getenv("BACKUP_REPO_TARGET_DIR", "charge-history") or "charge-history").strip().strip("/") or "charge-history"
        ssh_key_raw = (os.getenv("BACKUP_GIT_SSH_KEY_PATH", "") or "").strip()
        known_hosts_raw = (os.getenv("BACKUP_GIT_KNOWN_HOSTS_PATH", "") or "").strip()
        return cls(
            enabled=_env_flag("BACKUP_ENABLED", False),
            git_url=(os.getenv("BACKUP_GIT_URL", "") or "").strip(),
            git_branch=(os.getenv("BACKUP_GIT_BRANCH", "main") or "main").strip(),
            git_user_name=(os.getenv("BACKUP_GIT_USER_NAME", "EVCSMS Backup Bot") or "EVCSMS Backup Bot").strip(),
            git_user_email=(os.getenv("BACKUP_GIT_USER_EMAIL", "evcsms-backup@example.invalid") or "evcsms-backup@example.invalid").strip(),
            repo_target_dir=target_dir,
            interval_seconds=interval_seconds,
            run_on_startup=_env_flag("BACKUP_RUN_ON_STARTUP", True),
            data_dir=data_dir,
            config_dir=config_dir,
            git_worktree=git_worktree,
            git_ssh_command=(os.getenv("BACKUP_GIT_SSH_COMMAND", "") or "").strip(),
            git_ssh_key_path=Path(ssh_key_raw).expanduser() if ssh_key_raw else None,
            git_known_hosts_path=Path(known_hosts_raw).expanduser() if known_hosts_raw else None,
            git_strict_host_key_checking=_env_flag("BACKUP_GIT_STRICT_HOST_KEY_CHECKING", True),
        )


class BackupError(RuntimeError):
    pass


class GitRepoMirror:
    def __init__(self, config: BackupConfig):
        self.config = config
        self.worktree = config.git_worktree

    def _git_env(self) -> dict[str, str]:
        env = os.environ.copy()
        ssh_command = (self.config.git_ssh_command or "").strip()
        if not ssh_command:
            parts = ["ssh"]
            if self.config.git_ssh_key_path:
                parts.extend(["-i", str(self.config.git_ssh_key_path)])
                parts.extend(["-o", "IdentitiesOnly=yes"])
            if self.config.git_strict_host_key_checking:
                if self.config.git_known_hosts_path:
                    parts.extend(["-o", f"UserKnownHostsFile={self.config.git_known_hosts_path}"])
                    parts.extend(["-o", "StrictHostKeyChecking=yes"])
            else:
                parts.extend(["-o", "StrictHostKeyChecking=no"])
                parts.extend(["-o", "UserKnownHostsFile=/dev/null"])
            ssh_command = " ".join(parts)
        env["GIT_SSH_COMMAND"] = ssh_command
        return env

    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        command = ["git", *args]
        logger.info("Running git command: %s", " ".join(command))
        return subprocess.run(
            command,
            cwd=self.worktree if self.worktree.exists() else None,
            check=check,
            capture_output=True,
            text=True,
            env=self._git_env(),
        )

    def _run_in(self, cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        command = ["git", *args]
        logger.info("Running git command: %s", " ".join(command))
        return subprocess.run(command, cwd=cwd, check=check, capture_output=True, text=True, env=self._git_env())

    def _local_repo_path(self) -> Path | None:
        git_url = (self.config.git_url or "").strip()
        if not git_url:
            return None
        parsed = urlparse(git_url)
        if parsed.scheme == "file":
            return Path(unquote(parsed.path or "")).expanduser()
        if parsed.scheme:
            return None
        path = Path(git_url).expanduser()
        if path.is_absolute() or git_url.startswith("."):
            return path.resolve(strict=False)
        return None

    def _trust_local_repo_if_needed(self):
        local_repo = self._local_repo_path()
        if not local_repo:
            return
        logger.info("Marking local backup repo as safe.directory: %s", local_repo)
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", str(local_repo)],
            check=True,
            capture_output=True,
            text=True,
            env=self._git_env(),
        )

    def prepare(self):
        self._trust_local_repo_if_needed()
        self.worktree.parent.mkdir(parents=True, exist_ok=True)
        if not (self.worktree / ".git").exists():
            if self.worktree.exists():
                shutil.rmtree(self.worktree)
            logger.info("Cloning backup repository: %s", self.config.git_url)
            subprocess.run(
                ["git", "clone", self.config.git_url, str(self.worktree)],
                check=True,
                capture_output=True,
                text=True,
                env=self._git_env(),
            )
        else:
            self._run("remote", "set-url", "origin", self.config.git_url)

        self._run("fetch", "origin", "--prune", check=False)
        remote_branch = f"origin/{self.config.git_branch}"
        remote_exists = self._run("show-ref", "--verify", f"refs/remotes/{remote_branch}", check=False).returncode == 0
        if remote_exists:
            self._run("checkout", "-B", self.config.git_branch, remote_branch)
            self._run("pull", "--ff-only", "origin", self.config.git_branch, check=False)
        else:
            self._run("checkout", "-B", self.config.git_branch)

        self._run("config", "user.name", self.config.git_user_name)
        self._run("config", "user.email", self.config.git_user_email)

    def commit_and_push(self, message: str) -> str:
        self._run("add", self.config.repo_target_dir)
        status = self._run("status", "--porcelain")
        if not status.stdout.strip():
            logger.info("No git changes detected after writing backup files")
            return ""
        self._run("commit", "-m", message)
        self._run("push", "origin", f"HEAD:{self.config.git_branch}")
        head = self._run("rev-parse", "HEAD")
        return head.stdout.strip()


LATEST_FILENAME = "charge_history_latest.xlsx"
MANIFEST_FILENAME = "manifest.json"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def run_backup_once(config: BackupConfig) -> Dict[str, Any]:
    if not config.enabled:
        raise BackupError("BACKUP_ENABLED=false")
    if not config.git_url:
        raise BackupError("BACKUP_GIT_URL is required when backup is enabled")

    generated_at = iso_now()
    source = load_backup_source(config.data_dir, config.config_dir)
    rows = build_backup_rows(source)
    source_signature = _sha256_json(rows)
    workbook_bytes = build_history_workbook(rows, generated_at)
    workbook_sha256 = _sha256_bytes(workbook_bytes)
    manifest = build_backup_manifest(rows, generated_at)
    manifest["workbook_sha256"] = workbook_sha256
    manifest["source_signature"] = source_signature

    repo = GitRepoMirror(config)
    repo.prepare()

    target_dir = repo.worktree / config.repo_target_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = target_dir / MANIFEST_FILENAME
    current_manifest = {}
    if manifest_path.exists():
        try:
            current_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            current_manifest = {}

    current_source_signature = current_manifest.get("source_signature")
    if current_source_signature == source_signature:
        logger.info("Backup source data unchanged; skipping commit")
        return {
            "status": "unchanged",
            "generated_at": generated_at,
            "organizations": manifest["totals"]["organizations"],
            "sessions": manifest["totals"]["sessions_total"],
            "source_signature": source_signature,
            "workbook_sha256": current_manifest.get("workbook_sha256") or workbook_sha256,
            "target_dir": str(target_dir),
        }

    latest_path = target_dir / LATEST_FILENAME
    current_sha256 = _sha256_bytes(latest_path.read_bytes()) if latest_path.exists() else None
    if current_sha256 == workbook_sha256:
        logger.info("Backup workbook unchanged; skipping commit")
        return {
            "status": "unchanged",
            "generated_at": generated_at,
            "organizations": manifest["totals"]["organizations"],
            "sessions": manifest["totals"]["sessions_total"],
            "source_signature": source_signature,
            "workbook_sha256": workbook_sha256,
            "target_dir": str(target_dir),
        }

    timestamp = generated_at.replace(":", "").replace("-", "")
    timestamp = timestamp.replace(".", "_")
    archive_name = f"charge_history_{timestamp}.xlsx"
    archive_path = target_dir / archive_name
    archive_path.write_bytes(workbook_bytes)
    latest_path.write_bytes(workbook_bytes)
    (target_dir / MANIFEST_FILENAME).write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    commit_message = (
        f"backup: charge history {generated_at} "
        f"({manifest['totals']['organizations']} orgs, {manifest['totals']['sessions_total']} sessions)"
    )
    commit_hash = repo.commit_and_push(commit_message)

    return {
        "status": "pushed" if commit_hash else "written",
        "generated_at": generated_at,
        "organizations": manifest["totals"]["organizations"],
        "sessions": manifest["totals"]["sessions_total"],
        "source_signature": source_signature,
        "workbook_sha256": workbook_sha256,
        "archive_path": str(archive_path),
        "latest_path": str(latest_path),
        "target_dir": str(target_dir),
        "commit_hash": commit_hash,
    }


def run_scheduler(config: BackupConfig):
    if config.run_on_startup and config.enabled:
        try:
            result = run_backup_once(config)
            logger.info("Initial backup result: %s", result)
        except Exception as exc:
            logger.exception("Initial backup run failed: %s", exc)
    elif config.run_on_startup and not config.enabled:
        logger.info("Initial backup run skipped because BACKUP_ENABLED=false")

    while True:
        time.sleep(config.interval_seconds)
        try:
            if not config.enabled:
                logger.info("Backup worker is disabled; sleeping for %s seconds", config.interval_seconds)
                continue
            result = run_backup_once(config)
            logger.info("Scheduled backup result: %s", result)
        except Exception as exc:
            logger.exception("Scheduled backup run failed: %s", exc)

