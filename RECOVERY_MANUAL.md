# Data Recovery Manual

This manual provides procedures for recovering lost charge transactions, user data, and configuration files in the event of an accidental overwrite or system failure.

---

## 🛡️ Prevention: The "Data Shield"
Before attempting recovery, ensure that your production environment is protected from future Git overwrites.

1. **Verify .gitignore**: Ensure `evcsms/config/*.json` and `evcsms/data/*.json` are ignored.
2. **Mandatory Backups**: Always run a manual backup before performing any system update:
   ```bash
   mkdir -p ~/evcsms_backups/$(date +%Y%m%d)
   cp evcsms/config/*.json evcsms/data/*.json ~/evcsms_backups/$(date +%Y%m%d)/
   ```

---

## 🛠️ Recovery Scenarios

### Scenario A: Git Overwrite (Lost local changes)
If a `git pull` or branch switch overwrote local JSON files that were previously tracked, the data still exists in Git's internal database as "dangling objects."

**Step 1: Scan for lost data**
Run the search tool to find any "blobs" in the Git database containing transaction or organization data:
```bash
./evcsms/tools/recovery/find_git_blobs.sh
```
This script will create a `recovery_data/` folder containing any JSON fragments it finds.

**Step 2: Inspect the results**
Check the `recovery_data/` folder for files like `transactions_abc123.json`. Look for the largest or most recent file.

---

### Scenario B: Database Loss (Recovery from Redis)
If the JSON files are lost or empty but the system was running, the data often still exists in the Redis Append-Only File (AOF).

**Step 1: Extract transactions from Redis logs**
Run the extraction tool:
```bash
sudo python3 evcsms/tools/recovery/extract_from_redis.py
```
This script reads the live Redis transaction log and reconstructs a `recovered_history.json` file.

---

### Scenario C: Normalizing & Merging
Recovered files often have "null" stop times (if the session was cut off) or special character encoding issues (e.g., `\u00e5` instead of `å`).

**Step 1: Repair the recovered data**
Run the master repair script to fix stop times, estimate meter values, and fix "å" encoding:
```bash
python3 evcsms/tools/recovery/repair_and_merge.py --repair recovered_history.json
```
This produces `recovered_history_final.json`.

**Step 2: Merge into production**
To safely merge the recovered data into your live `transactions.json` without losing existing records:
```bash
sudo python3 evcsms/tools/recovery/repair_and_merge.py --merge recovered_history_final.json
```

---

## 🔄 Restarting the Service
After restoring any JSON file, you must restart the containers to apply the changes:

```bash
docker compose down
docker compose up -d
```

---

## 📂 Recovery Tools Directory
All tools are located in `evcsms/tools/recovery/`:
- `find_git_blobs.sh`: Forensic search of Git history.
- `extract_from_redis.py`: Reconstructs transactions from Redis AOF logs.
- `repair_and_merge.py`: Fixes encoding, estimates missing data, and safely merges files.
