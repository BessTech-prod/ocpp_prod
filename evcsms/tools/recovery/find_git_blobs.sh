#!/bin/bash

# find_git_blobs.sh - Forensic tool to find lost JSON data in Git dangling objects.

set -e

echo "----------------------------------------------------"
echo "🔍 Searching for lost JSON data in Git history..."
echo "----------------------------------------------------"

RECOVERY_DIR="recovery_data"
mkdir -p "$RECOVERY_DIR"

# Find all dangling objects that aren't linked to a branch
echo "Collecting dangling blobs..."
blobs=$(git fsck --lost-found 2>/dev/null | grep blob | awk '{print $3}')

if [ -z "$blobs" ]; then
    echo "No dangling blobs found."
    exit 0
fi

count=0
for blob in $blobs; do
    # Check if the blob contains recognizable keywords and looks like JSON
    # Keywords: Takorama (Org), transaction_id (History), email (Users)
    content_sample=$(git show "$blob" 2>/dev/null | head -c 500)
    
    if [[ "$content_sample" == *"{"* ]]; then
        type="unknown"
        if [[ "$content_sample" == *"transaction_id"* ]]; then
            type="transactions"
        elif [[ "$content_sample" == *"email"* ]] || [[ "$content_sample" == *"pwd_hash"* ]]; then
            type="users"
        elif [[ "$content_sample" == *"Takorama"* ]]; then
            type="potential_org"
        elif [[ "$content_sample" == *"id_tag"* ]]; then
            type="rfids"
        fi
        
        if [ "$type" != "unknown" ]; then
            echo "[!] Found potential $type data in blob $blob"
            git show "$blob" > "$RECOVERY_DIR/${type}_${blob:0:8}.json"
            count=$((count + 1))
        fi
    fi
done

echo "----------------------------------------------------"
echo "Done. Recovered $count candidate(s) to the '$RECOVERY_DIR' directory."
echo "Inspect these files and use repair_and_merge.py to restore them."
echo "----------------------------------------------------"
