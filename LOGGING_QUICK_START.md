# Logging Quick Start Guide

## Yes, This Program HAS Built-in Logs ✅

Your EV CSMS system logs everything that happens in real-time to the **Docker container output**.

---

## How to View Logs (3 Methods)

### **Method 1: Using the Built-in Runner (EASIEST)**
```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms

# Follow all service logs live
./run.sh logs

# Follow specific service
./run.sh logs api-service
./run.sh logs ocpp-ws-service
./run.sh logs redis-service
./run.sh logs backup-service
```

### **Method 2: Using Docker Directly**
```bash
# Follow all logs
docker compose -f docker-compose.yml logs -f

# Last 100 lines
docker compose -f docker-compose.yml logs --tail=100

# Specific service
docker logs -f api-service
docker logs -f ocpp-ws-service
```

### **Method 3: Search Logs for Errors**
```bash
# Find all errors
docker logs api-service 2>&1 | grep -i error

# Find last 20 lines with errors
docker logs api-service 2>&1 | grep -i error | tail -20

# Real-time error monitoring
docker logs -f api-service 2>&1 | grep --line-buffered -i error
```

---

## What Gets Logged

| Service | Logger | What It Tracks |
|---------|--------|----------------|
| **api.py** | `[api]` | REST API calls, authentication, user management, transactions |
| **ocpp_ws.py** | `[ocpp-ws]` | Charger connections, OCPP protocol messages, vehicle charging events |
| **history_backup.py** | `[history-backup]` | Backup job runs, Git pushes, file operations |
| **System logs** | `[system]` | Redis startup, container health checks |

---

## Log Format
```
2026-04-03 14:25:37,123 [INFO] Message text
2026-04-03 14:26:04,456 [WARNING] Warning message
2026-04-03 14:27:12,789 [ERROR] Error occurred
```

---

## Critical Log Patterns to Watch For

### **If You See This... 🚨**

```
[ERROR] Redis was not ready after 15 attempts
```
→ **Problem:** Redis crashed or network connection failed  
→ **Fault:** SERVICE PROVIDER (infrastructure issue)

```
[ERROR] APP_SECRET must be set
```
→ **Problem:** Missing environment variable  
→ **Fault:** YOUR CONFIG (fix .env file)

```
[ERROR] Traceback (most recent call last):
```
→ **Problem:** Your program crashed with an exception  
→ **Fault:** YOUR PROGRAM (code bug)

```
[WARNING] Charge point connection failed: timeout
```
→ **Problem:** Chargers can't reach your OCPP endpoint  
→ **Fault:** SERVICE PROVIDER (firewall/network blocked)

---

## Run Automated Diagnostics

```bash
bash /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/diagnose_outage.sh
```

This script automatically:
- ✓ Checks if all 5 services are running
- ✓ Tests Redis connectivity
- ✓ Tests API health endpoint
- ✓ Scans logs for errors
- ✓ Checks charger connections
- ✓ Reports resource usage
- ✓ Provides diagnosis

---

## During an Outage

**IMMEDIATELY:**
```bash
# 1. Check service status
docker compose -f docker-compose.yml ps

# 2. View last 50 lines from each service
docker logs --tail=50 api-service
docker logs --tail=50 ocpp-ws-service
docker logs --tail=50 redis-service

# 3. Run diagnostics
bash diagnose_outage.sh

# 4. Try restart
./run.sh restart
```

**THEN:**
- If logs show **ERROR** with traceback → YOUR PROGRAM BUG
- If logs show **"Redis not ready"** → SERVICE PROVIDER ISSUE
- If logs show **timeout/connection refused** → SERVICE PROVIDER NETWORK ISSUE
- If logs show **nothing** → Contact service provider (silent infrastructure failure)

---

## Preserve Logs After Outage

Docker logs are stored in container memory and cleared on restart. To preserve them:

```bash
# Save logs to file BEFORE restarting
docker logs api-service > api_service_backup.log 2>&1
docker logs ocpp-ws-service > ocpp_ws_backup.log 2>&1
docker logs redis-service > redis_backup.log 2>&1

# These files remain even after container restart
```

---

## Key Files to Review

| File | Purpose |
|------|---------|
| `/home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/OUTAGE_TROUBLESHOOTING_GUIDE.md` | Complete troubleshooting guide (step-by-step) |
| `/home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/diagnose_outage.sh` | Automated diagnostic script |
| `/home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/api.py` | Main REST API (search for `logger.` to see log points) |
| `/home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/ocpp_ws.py` | Charger communication (search for `logger.` to see log points) |

---

## Summary

✅ **Logging: YES, fully enabled**  
✅ **Access: `./run.sh logs` or `docker logs`**  
✅ **Persistence: NO (stored in memory, lost on restart)**  
✅ **Location: Container stdout/stderr**  
✅ **Diagnostics: Run `diagnose_outage.sh` for auto-analysis**

**Next Step:** When an outage occurs, run `bash diagnose_outage.sh` first, then review the full guide if needed.

