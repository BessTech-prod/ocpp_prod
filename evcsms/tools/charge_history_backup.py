#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# This file is for local/demo development only. Not needed in production unless you use the backup service in production.

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.history_backup import BackupConfig, run_backup_once, run_scheduler


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("charge-history-backup")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Back up EVCSMS charging history to a git repository as an XLSX workbook with one sheet per organization."
    )
    parser.add_argument("--once", action="store_true", help="Run a single backup immediately and exit")
    parser.add_argument("--print-config", action="store_true", help="Print effective configuration and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = BackupConfig.from_env()

    if args.print_config:
        print(
            json.dumps(
                {
                    "enabled": config.enabled,
                    "git_url": config.git_url,
                    "git_branch": config.git_branch,
                    "repo_target_dir": config.repo_target_dir,
                    "interval_seconds": config.interval_seconds,
                    "run_on_startup": config.run_on_startup,
                    "data_dir": str(config.data_dir),
                    "config_dir": str(config.config_dir),
                    "git_worktree": str(config.git_worktree),
                    "git_ssh_key_path": str(config.git_ssh_key_path) if config.git_ssh_key_path else None,
                    "git_known_hosts_path": str(config.git_known_hosts_path) if config.git_known_hosts_path else None,
                    "git_strict_host_key_checking": config.git_strict_host_key_checking,
                    "git_ssh_command_set": bool(config.git_ssh_command),
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    if args.once:
        result = run_backup_once(config)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    logger.info("Starting charge history backup scheduler")
    run_scheduler(config)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logger.exception("Charge history backup failed: %s", exc)
        raise SystemExit(1) from exc
