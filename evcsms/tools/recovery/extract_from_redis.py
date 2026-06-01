import json
import re
import os
import argparse
from pathlib import Path

DEFAULT_AOF_PATH = "evcsms/redis_data/appendonlydir/appendonly.aof.1.incr.aof"
DEFAULT_OUTPUT = "recovered_history.json"

def extract_transactions(aof_path, output_path):
    print(f"----------------------------------------------------")
    print(f"🚀 Extracting transactions from Redis log: {aof_path}")
    print(f"----------------------------------------------------")

    if not os.path.exists(aof_path):
        print(f"❌ Error: AOF file not found at {aof_path}")
        print("Tip: If running on the host, make sure the path is correct.")
        return

    transactions = {}
    count = 0

    try:
        # Use errors='ignore' to handle binary chunks in the Redis log
        with open(aof_path, "r", errors="ignore") as f:
            content = f.read()
            
            # Pattern to match JSON objects containing transaction_id
            # This looks for objects starting with { and ending with } that have a transaction_id key
            matches = re.findall(r'\{"transaction_id":.*?"org_resolution_source":\s*".*?"\}', content)
            
            for m in matches:
                try:
                    tx = json.loads(m)
                    tx_id = str(tx.get("transaction_id"))
                    
                    # Deduplication: Redis logs might contain multiple versions of the same tx
                    # We keep the latest one found in the file
                    transactions[tx_id] = tx
                    count += 1
                except json.JSONDecodeError:
                    continue

        result_list = list(transactions.values())
        # Sort by start_time for convenience
        result_list.sort(key=lambda x: x.get("start_time", ""))

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result_list, f, indent=2, ensure_ascii=False)
        
        print(f"✅ SUCCESS!")
        print(f"Found {count} raw entries, consolidated into {len(result_list)} unique transactions.")
        print(f"Results saved to: {output_path}")
        
        if result_list:
            print(f"Time range: {result_list[0].get('start_time')} to {result_list[-1].get('start_time')}")
            
    except Exception as e:
        print(f"❌ Error during extraction: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract charge transactions from Redis AOF logs.")
    parser.add_argument("--aof", default=DEFAULT_AOF_PATH, help="Path to the Redis AOF file")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output JSON file path")
    
    args = parser.parse_args()
    extract_transactions(args.aof, args.output)
