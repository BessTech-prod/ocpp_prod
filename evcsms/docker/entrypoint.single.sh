#!/bin/sh
set -eu

export REDIS_PASSWORD="${REDIS_PASSWORD:-defaultpassword}"
export APP_SECRET="${APP_SECRET:-dev-secret-change-me}"
export PORTAL_TAGS_GLOBAL="${PORTAL_TAGS_GLOBAL:-false}"

mkdir -p /data /data/config

# Seed persistent data on first boot.
[ -f /data/transactions.json ] || cp /app/data/transactions.json /data/transactions.json
[ -f /data/config/auth_tags.json ] || cp /app/config/auth_tags.json /data/config/auth_tags.json
[ -f /data/config/users.json ] || cp /app/config/users.json /data/config/users.json
[ -f /data/config/orgs.json ] || cp /app/config/orgs.json /data/config/orgs.json
[ -f /data/config/cps.json ] || cp /app/config/cps.json /data/config/cps.json

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.single.conf

