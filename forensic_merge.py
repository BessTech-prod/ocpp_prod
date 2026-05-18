import json
import re

def load_git_file(ref, path):
    import subprocess
    try:
        content = subprocess.check_output(['git', 'show', f'{ref}:{path}']).decode('utf-8')
        # Clean markers if present
        content = re.sub(r'<<<<<<<.*?=======', '', content, flags=re.DOTALL)
        content = re.sub(r'>>>>>>>.*', '', content)
        # Fix the Peter Persson issue if in users.json
        if "users.json" in path:
            content = re.sub(r'("pwd_hash": "[^"]*")\s+("pwd_salt":)', r'\1,\n\2', content)
        
        # Try to parse. If it fails, use more aggressive cleaning
        try:
            return json.loads(content)
        except:
            if path.endswith("transactions.json"):
                objects = re.findall(r'\{[^{}]+\}', content, re.DOTALL)
                res = []
                for o in objects:
                    try: res.append(json.loads(o.strip() + '}'))
                    except: continue
                return res
            elif path.endswith("rfids.json") or path.endswith("users.json"):
                pairs = re.findall(r'"([^"]+)":\s*(\{.*?\})(?=\s*[,}]|\s*"|$)', content, re.DOTALL)
                res = {}
                for k, v in pairs:
                    try: res[k] = json.loads(v)
                    except: continue
                return res
            elif path.endswith("auth_tags.json"):
                return list(set(re.findall(r'"([^"]+)"', content)))
            return None
    except:
        return None

print("Loading data from main and debug branch...")
users_main = load_git_file('origin/main', 'evcsms/config/users.json') or {}
users_remote = load_git_file('origin/debug-remote-state', 'evcsms/config/users.json') or {}

txs_main = load_git_file('origin/main', 'evcsms/data/transactions.json') or []
txs_remote = load_git_file('origin/debug-remote-state', 'evcsms/data/transactions.json') or []

rfids_main = load_git_file('origin/main', 'evcsms/config/rfids.json') or {}
rfids_remote = load_git_file('origin/debug-remote-state', 'evcsms/config/rfids.json') or {}

cps_main = load_git_file('origin/main', 'evcsms/config/cps.json') or {}
cps_remote = load_git_file('origin/debug-remote-state', 'evcsms/config/cps.json') or {}

orgs_main = load_git_file('origin/main', 'evcsms/config/orgs.json') or {}
orgs_remote = load_git_file('origin/debug-remote-state', 'evcsms/config/orgs.json') or {}

auth_main = load_git_file('origin/main', 'evcsms/config/auth_tags.json') or []
auth_remote = load_git_file('origin/debug-remote-state', 'evcsms/config/auth_tags.json') or []

# 1. Merge Users
final_users = users_main.copy()
final_users.update(users_remote)
print(f"Users: {len(users_main)} (main) + {len(users_remote)} (remote) -> {len(final_users)} (total)")

# 2. Merge Transactions
# Deduplicate by transaction_id (as string)
all_txs = {}
for tx in txs_main + txs_remote:
    tid = str(tx.get('transaction_id'))
    if tid not in all_txs or len(str(tx)) > len(str(all_txs[tid])):
        all_txs[tid] = tx
final_txs = sorted(all_txs.values(), key=lambda x: str(x.get('start_time', '')))
print(f"Transactions: {len(txs_main)} (main) + {len(txs_remote)} (remote) -> {len(final_txs)} (total)")

# 3. Merge RFIDs
final_rfids = rfids_main.copy()
final_rfids.update(rfids_remote)
print(f"RFIDs: {len(rfids_main)} (main) + {len(rfids_remote)} (remote) -> {len(final_rfids)} (total)")

# 4. Merge CPs
final_cps = cps_main.copy()
final_cps.update(cps_remote)
print(f"CPs: {len(cps_main)} (main) + {len(cps_remote)} (remote) -> {len(final_cps)} (total)")

# 5. Merge Orgs
final_orgs = orgs_main.copy()
final_orgs.update(orgs_remote)
print(f"Orgs: {len(orgs_main)} (main) + {len(orgs_remote)} (remote) -> {len(final_orgs)} (total)")

# 6. Merge Auth Tags
final_auth = list(set(auth_main + auth_remote))
print(f"Auth Tags: {len(auth_main)} (main) + {len(auth_remote)} (remote) -> {len(final_auth)} (total)")

# Save files
def save(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

save('evcsms/config/users.json', final_users)
save('evcsms/data/transactions.json', final_txs)
save('evcsms/config/rfids.json', final_rfids)
save('evcsms/config/cps.json', final_cps)
save('evcsms/config/orgs.json', final_orgs)
save('evcsms/config/auth_tags.json', final_auth)
print("Merge complete.")
