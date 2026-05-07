# 📋 OUTAGE ANALYSIS SUMMARY & RECOMMENDATIONS

## Answer to Your Question: "Is there any fault logs built into this program?"

### ✅ YES - Complete Answer

Your EV CSMS (Electric Vehicle Charging Management System) **DOES have comprehensive logging built in**, but with an important caveat:

**Logs are stored in Docker container memory (stdout/stderr) and lost if containers restart.**

---

## What's Logged

### **Python Services with Active Logging:**

1. **`api.py`** → Logger name: `"api"`
   - REST API requests and responses
   - User authentication events
   - Session management
   - Configuration loading
   - Database operations (JSON file reads/writes)

2. **`ocpp_ws.py`** → Logger name: `"ocpp-ws"`
   - WebSocket charger connections/disconnections
   - OCPP 1.6J protocol messages
   - Charger status updates
   - Remote command execution
   - Authorization checks

3. **`history_backup.py`** → Logger name: `"history-backup"`
   - Scheduled backup job execution
   - Git operations
   - SSH authentication
   - File sync status

### **Format**
```
[TIMESTAMP] [LEVEL] Message

Example:
2026-04-03 14:25:37,123 [INFO] Redis connection ready
2026-04-03 14:26:04,456 [WARNING] Redis not ready yet (attempt 2/15): Connection refused
```

---

## How to Access Logs

### **Quick Method (Recommended)**
```bash
cd /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms
./run.sh logs                    # All services
./run.sh logs api-service        # Just API
./run.sh logs ocpp-ws-service    # Just OCPP
```

### **Direct Docker Method**
```bash
docker logs -f api-service       # Follow in real-time
docker logs api-service 2>&1 | tail -50   # Last 50 lines
```

### **Search for Errors**
```bash
docker logs api-service 2>&1 | grep -i "error"
docker logs ocpp-ws-service 2>&1 | grep -i "error"
docker logs redis-service 2>&1 | grep -i "error"
```

---

## Automated Diagnosis Tool

I've created a **diagnostic script** that automatically determines if the outage was YOUR FAULT or the SERVICE PROVIDER'S FAULT:

```bash
bash /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/diagnose_outage.sh
```

**This script checks:**
- ✓ Service status (all 5 containers running?)
- ✓ Redis connectivity (can API/OCPP connect?)
- ✓ API health endpoint (responsive?)
- ✓ Error log patterns (exceptions? warnings?)
- ✓ Charger connections (any devices connected?)
- ✓ Resource usage (disk full? out of memory?)

**Output:** Clear diagnosis of root cause

---

## How to Distinguish: YOUR FAULT vs SERVICE PROVIDER FAULT

### **🔴 YOUR PROGRAM FAULT - Look for:**

1. **Python Exceptions in logs:**
   ```
   [ERROR] Exception in api.py
   Traceback (most recent call last):
     File "api.py", line 1234
   TypeError: ...
   ```
   → **Action:** Fix code bug, redeploy

2. **Validation/Logic Errors:**
   ```
   [ERROR] Invalid JSON in users.json
   [ERROR] File permission denied on /data/config/cps.json
   ```
   → **Action:** Check file integrity, fix data

3. **Missing Configuration:**
   ```
   [ERROR] APP_SECRET must be set
   [ERROR] REDIS_PASSWORD must be set
   ```
   → **Action:** Create `.env` file with correct values

4. **Application Hang/Timeout:**
   - Logs suddenly stop (no new messages)
   - Health check endpoint returns 500
   → **Action:** Review code for infinite loops/deadlocks

---

### **🔴 SERVICE PROVIDER FAULT - Look for:**

1. **Redis Connection Failure:**
   ```
   [WARNING] Redis not ready yet (attempt 1/15): Connection refused
   [WARNING] Redis not ready yet (attempt 2/15): Connection refused
   ...
   [ERROR] Redis was not ready after 15 attempts
   ```
   → **Cause:** Service provider's Redis crashed or restarted
   → **Action:** Ask provider to check Redis service

2. **Network Unreachable:**
   ```
   [ERROR] Connection timeout to database server
   [ERROR] Network is unreachable
   ```
   → **Cause:** Service provider's network down
   → **Action:** Ask provider for status page

3. **Chargers Can't Connect:**
   ```
   [INFO] OCPP listening on 0.0.0.0:9000
   [WARNING] No chargers connected (standby mode)
   [WARNING] Timeout waiting for charger connection
   ```
   → **Cause:** Port 9000 blocked by firewall
   → **Action:** Ask provider to allow TCP port 9000

4. **Silent Infrastructure Failure:**
   - All service containers suddenly stop
   - No error messages (silent kill)
   - Restart logs show boot-up again
   → **Cause:** Server crashed, OOM kill, host reboot
   → **Action:** Ask provider for server logs/uptime

---

## The 4-Step Outage Response Plan

### **Step 1: Immediate (0-5 min)**
```bash
# Save current logs BEFORE anything changes
docker logs api-service > /tmp/api_outage.log 2>&1
docker logs ocpp-ws-service > /tmp/ocpp_outage.log 2>&1
docker logs redis-service > /tmp/redis_outage.log 2>&1

# Check what's running
docker compose -f docker-compose.yml ps
```

### **Step 2: Quick Diagnosis (5-15 min)**
```bash
# Run automated diagnostics
bash diagnose_outage.sh

# This tells you: YOUR FAULT or SERVICE PROVIDER FAULT
```

### **Step 3: Based on Diagnosis**

**IF YOUR PROGRAM FAULT:**
- ✓ Fix code/config
- ✓ Rebuild: `./run.sh build`
- ✓ Redeploy: `./run.sh up`
- ✓ Test: `curl http://localhost:8000/health`

**IF SERVICE PROVIDER FAULT:**
- ✓ Collect diagnostics output
- ✓ Contact provider with:
  - Timestamp of outage
  - Output of: `docker compose ps`
  - Output of: `docker logs redis-service | head -50`
  - Output of: `bash diagnose_outage.sh`

### **Step 4: Prevention**
- ✓ Enable persistent logging (see guide)
- ✓ Set up monitoring/alerting
- ✓ Document outage in OUTAGE_TROUBLESHOOTING_GUIDE.md

---

## Current Logging Limitations

⚠️ **Important Issues:**

| Issue | Impact | Solution |
|-------|--------|----------|
| Logs lost on container restart | Can't debug old outages | Created `diagnose_outage.sh` to run immediately |
| No persistent log files | Hard to track patterns | Enable file logging (see guide) |
| No centralized log aggregation | Hard to correlate services | Consider Docker logging drivers or ELK stack |
| No alerting on errors | Silent failures possible | Add monitoring script |

---

## Recommended Improvements

### **1. Enable Persistent Logging (Easy)**
Create `.env` variable for log output:
```bash
LOG_LEVEL=INFO
LOG_DIR=/data/logs
```

Then modify containers to log to `/data/logs/*.log` files

### **2. Add Monitoring (Medium)**
Create a cron job that runs `diagnose_outage.sh` every 5 minutes and stores results

### **3. Centralized Logging (Advanced)**
- Add Docker logging driver to `docker-compose.yml`
- Ship logs to centralized service (Grafana Loki, ELK stack, Datadog)
- Set up alerts on error patterns

---

## Files I've Created for You

### **📄 Main Guides:**

1. **`OUTAGE_TROUBLESHOOTING_GUIDE.md`** (Comprehensive)
   - Complete system architecture explanation
   - Detailed troubleshooting steps
   - Log interpretation examples
   - Decision tree for service provider contact

2. **`LOGGING_QUICK_START.md`** (Quick Reference)
   - How to view logs (3 methods)
   - What gets logged
   - Critical log patterns
   - Quick during-outage checklist

3. **`diagnose_outage.sh`** (Automated Script)
   - Run immediately when outage occurs
   - Automatically checks all 6 diagnostic areas
   - Provides clear diagnosis
   - Executable: `bash diagnose_outage.sh`

---

## Quick Reference Commands

```bash
# ===== DURING OUTAGE =====
./run.sh logs                          # View all logs
bash diagnose_outage.sh                # Auto-diagnose
docker compose -f docker-compose.yml ps # Check status

# ===== DEBUG SPECIFIC SERVICE =====
docker logs -f api-service             # Follow API logs
docker logs -f ocpp-ws-service         # Follow OCPP logs
docker logs redis-service 2>&1 | grep -i error  # Find errors

# ===== SAVE LOGS FOR LATER =====
docker logs api-service > backup_api.log 2>&1
docker logs redis-service > backup_redis.log 2>&1

# ===== TEST CONNECTIVITY =====
curl http://localhost:8000/health      # Test API
docker exec redis-service redis-cli ping  # Test Redis
telnet localhost 9000                  # Test OCPP port

# ===== RESTART SERVICES =====
./run.sh restart                       # Graceful restart
./run.sh down && ./run.sh up           # Full restart
```

---

## Decision Matrix: When to Blame Whom

```
Is the API responding?
├─ YES → Is there error logs?
│  ├─ YES → YOUR PROGRAM BUG
│  └─ NO → Working fine (temporary issue passed)
│
└─ NO → Is Redis working?
   ├─ YES → YOUR PROGRAM BUG
   └─ NO → Is Redis container running?
      ├─ YES → SERVICE PROVIDER (Redis software issue)
      └─ NO → SERVICE PROVIDER (Infrastructure failure)
```

---

## Summary

| Question | Answer |
|----------|--------|
| **Has this program got fault logs?** | ✅ **YES** - Full logging built-in |
| **How to access?** | `./run.sh logs` or `docker logs` |
| **How to know if it's YOUR fault?** | Look for `[ERROR]` with traceback in logs |
| **How to know if it's PROVIDER fault?** | Look for `Redis failed`, `Connection refused`, `Network down` |
| **What to do if unclear?** | Run `bash diagnose_outage.sh` |
| **Can logs be kept permanently?** | ❌ **NO** (in-memory only) → Use diagnose script ASAP |

**When an outage happens:**
1. Run: `bash diagnose_outage.sh` (takes 30 seconds)
2. Script tells you who's at fault
3. If YOUR FAULT: Fix code/config
4. If SERVICE PROVIDER FAULT: Contact them with script output

---

## Next Steps

1. **Read:** `LOGGING_QUICK_START.md` (5 min read)
2. **Bookmark:** `bash diagnose_outage.sh` (for next outage)
3. **Review:** `OUTAGE_TROUBLESHOOTING_GUIDE.md` (if you want deep dive)
4. **Optional:** Implement persistent logging improvements

---

**Questions? Check the relevant guide above or run `bash diagnose_outage.sh` to start troubleshooting immediately.**

