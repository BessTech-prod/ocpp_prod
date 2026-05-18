import json
import re
import sys

def clean_json_file(path, is_list=False):
    print(f"Cleaning {path}...")
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    cleaned_lines = []
    skip = False
    for line in lines:
        if line.startswith('<<<<<<<') or line.startswith('=======') or line.startswith('>>>>>>>'):
            continue
        cleaned_lines.append(line)
    
    content = "".join(cleaned_lines)
    
    # Specific fix for users.json Peter Persson entry
    if "users.json" in path:
        # Fix missing comma and duplicate fields
        content = re.sub(r'("pwd_hash": "[^"]*")\s+("pwd_salt":)', r'\1,\n\2', content)
    
    # Try to parse it
    try:
        data = json.loads(content)
        print(f"Successfully parsed {path}")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Failed to parse {path}: {e}")
        # For transactions.json, we need a better recovery than just finding strings
        if "transactions.json" in path:
            # Try to extract individual objects
            objects = re.findall(r'\{[^{}]+\}', content, re.DOTALL)
            parsed_objects = []
            for obj_str in objects:
                try:
                    # Fix common issues in extracted objects
                    obj_str = obj_str.strip()
                    if not obj_str.endswith('}'): obj_str += '}'
                    parsed_objects.append(json.loads(obj_str))
                except:
                    continue
            if parsed_objects:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(parsed_objects, f, indent=2, ensure_ascii=False)
                print(f"Recovered {len(parsed_objects)} transactions from {path}")
                return

        # For rfids.json and users.json (objects)
        if path.endswith(".json"):
            # Try to extract key: { ... } patterns
            pairs = re.findall(r'"([^"]+)":\s*(\{.*?\})(?=\s*[,}]|\s*"|$)', content, re.DOTALL)
            parsed_data = {}
            for key, val_str in pairs:
                try:
                    parsed_data[key] = json.loads(val_str)
                except:
                    continue
            if parsed_data:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(parsed_data, f, indent=2, ensure_ascii=False)
                print(f"Recovered {len(parsed_data)} keys from {path}")
                return
            items = re.findall(r'"([^"]+)"', content)
            unique_items = sorted(list(set(items)))
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(unique_items, f, indent=2, ensure_ascii=False)
            print(f"Aggressively cleaned {path} as list")

clean_json_file('evcsms/config/rfids.json')
clean_json_file('evcsms/config/auth_tags.json', is_list=True)
clean_json_file('evcsms/config/users.json')
clean_json_file('evcsms/config/api_keys.json')
clean_json_file('evcsms/data/transactions.json', is_list=True)
