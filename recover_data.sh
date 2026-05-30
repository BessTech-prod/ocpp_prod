#!/bin/bash
# Data Recovery Script for EVCSMS
# This script searches for dangling Git blobs that might contain lost JSON data.

echo "Searching for lost JSON data in Git history..."

# Create a temporary directory for found objects
mkdir -p recovery_data

# Get all dangling blobs
blobs=$(git fsck --lost-found | grep blob | awk '{print $3}')

for blob in $blobs; do
    # Check if blob is JSON and contains Takorama
    if git show $blob | grep -q "Takorama" && git show $blob | head -c 100 | grep -q "{"; then
        # Identify what kind of file it is
        if git show $blob | grep -q "transaction_id"; then
            type="transactions"
        elif git show $blob | grep -q "email"; then
            type="users"
        else
            type="unknown"
        fi
        
        # Save it
        echo "Found potential $type data in blob $blob"
        git show $blob > "recovery_data/${type}_${blob}.json"
    fi
done

echo "Check the 'recovery_data' directory for any recovered files."
ls -lh recovery_data/
