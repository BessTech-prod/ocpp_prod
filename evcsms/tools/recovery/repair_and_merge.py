import json
import argparse
import shutil
from pathlib import Path
from datetime import datetime, timedelta

DEFAULT_LIVE_FILE = "evcsms/data/transactions.json"

def repair_data(input_file, output_file):
    print(f"🛠️ Repairing and normalizing: {input_file}")
    
    with open(input_file, "r", encoding="utf-8", errors="ignore") as f:
        data = json.load(f)

    repaired_count = 0
    for tx in data:
        modified = False
        
        # 1. Fix stop_time (Ensure it's NOT null so it shows in portal)
        if tx.get("stop_time") is None:
            try:
                start_time_str = tx["start_time"]
                # Handle both 'Z' and offset formats
                if start_time_str.endswith('Z'):
                    start_dt = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                else:
                    start_dt = datetime.fromisoformat(start_time_str)
                
                # Estimate 1 hour duration
                tx["stop_time"] = (start_dt + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
                modified = True
            except Exception as e:
                print(f"  Warning: Could not estimate stop_time for {tx.get('transaction_id')}: {e}")

        # 2. Fix meter_stop (Ensure it's NOT null)
        if tx.get("meter_stop") is None:
            tx["meter_stop"] = (tx.get("meter_start") or 0) + 5000 # Estimate 5kWh
            modified = True
            
        # 3. Fix Organization ID normalization (Handle "å" and specific IDs)
        org_id = tx.get("org_id", "")
        if "Takorama_Stor" in org_id:
            tx["org_id"] = "Takorama_Storås"
            tx["org_name"] = "Takorama Storås"
            modified = True
        
        if modified:
            repaired_count += 1

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Repaired {repaired_count} transactions.")
    print(f"Result saved to: {output_file}")

def merge_data(recovered_file, live_file):
    print(f"🔄 Merging {recovered_file} into {live_file}...")
    
    live_path = Path(live_file)
    recovered_path = Path(recovered_file)
    
    if not live_path.exists():
        print(f"⚠️ Live file {live_file} not found. Creating new one.")
        live_data = []
    else:
        with open(live_path, "r", encoding="utf-8") as f:
            live_data = json.load(f)

    with open(recovered_path, "r", encoding="utf-8") as f:
        recovered_data = json.load(f)

    # Backup live file before modification
    if live_path.exists():
        backup_path = live_path.with_suffix(".recovery_bak")
        shutil.copy(live_path, backup_path)
        print(f"💾 Backup created at: {backup_path}")

    # Merge and deduplicate using transaction_id as key
    # Recovered data takes priority if it has newer info
    all_tx = {}
    
    # Load existing live data
    for tx in live_data:
        tx_id = str(tx.get("transaction_id"))
        all_tx[tx_id] = tx
        
    # Overwrite/Add with recovered data
    added = 0
    updated = 0
    for tx in recovered_data:
        tx_id = str(tx.get("transaction_id"))
        if tx_id in all_tx:
            updated += 1
        else:
            added += 1
        all_tx[tx_id] = tx

    # Final list sorted by start_time
    result = list(all_tx.values())
    try:
        result.sort(key=lambda x: str(x.get("start_time", "")))
    except:
        pass
    
    with open(live_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Merge Complete!")
    print(f"   - Added: {added}")
    print(f"   - Updated: {updated}")
    print(f"   - Total records now: {len(result)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Repair and Merge recovered charge transactions.")
    parser.add_argument("--repair", help="Input JSON file to repair/normalize")
    parser.add_argument("--merge", help="Input JSON file to merge into production")
    parser.add_argument("--live-file", default=DEFAULT_LIVE_FILE, help="Path to production transactions.json")
    parser.add_argument("--output", help="Output file for repair (defaults to [input]_final.json)")
    
    args = parser.parse_args()
    
    if args.repair:
        out = args.output or args.repair.replace(".json", "_final.json")
        repair_data(args.repair, out)
        
    if args.merge:
        merge_data(args.merge, args.live_file)
        
    if not args.repair and not args.merge:
        parser.print_help()
