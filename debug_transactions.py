import json
from datetime import datetime, timezone, timedelta

def load_json(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except:
        return {}

def debug_tx():
    txs = load_json('evcsms/data/transactions.json')
    cps = load_json('evcsms/config/cps.json')
    
    org_id = "Takorama_Storås"
    print(f"Analyzing transactions for Org: {org_id}")
    
    count = 0
    skipped_org = 0
    skipped_time = 0
    
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    print(f"Cutoff (1m): {cutoff.isoformat()}")

    for tx in txs:
        cp_id = tx.get("charge_point", "unknown")
        # Same logic as in api.py
        tx_org = tx.get("org_id") or cps.get(cp_id, {}).get("org_id", "default")
        
        if tx_org != org_id:
            skipped_org += 1
            continue
            
        stop_time_str = tx.get("stop_time")
        if not stop_time_str:
            continue
            
        try:
            stop_dt = datetime.fromisoformat(stop_time_str.replace("Z", "+00:00"))
        except:
            continue
            
        if stop_dt < cutoff:
            skipped_time += 1
            # continue # Don't continue for lifetime metrics, but do for energy report
        
        count += 1
        print(f"Matched TX {tx.get('transaction_id')} for {cp_id} at {stop_time_str}")

    print(f"\nSummary:")
    print(f"Total TXs in file: {len(txs)}")
    print(f"Matches for {org_id}: {count}")
    print(f"Skipped (wrong org): {skipped_org}")
    print(f"Skipped (too old for 1m report): {skipped_time}")

if __name__ == "__main__":
    debug_tx()
