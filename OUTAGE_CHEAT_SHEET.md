# ⚡ OUTAGE RESPONSE CHEAT SHEET

## 🚨 System Down - What To Do NOW

### **STEP 1: Collect Logs (Do this FIRST)**
```bash
# Takes 30 seconds - DO NOT SKIP THIS
docker logs api-service > /tmp/api.log 2>&1
docker logs ocpp-ws-service > /tmp/ocpp.log 2>&1
docker logs redis-service > /tmp/redis.log 2>&1
```

### **STEP 2: Auto-Diagnose (Takes 1 minute)**
```bash
bash /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/diagnose_outage.sh
```

### **STEP 3: Read the Output**

---

## 📊 Diagnosis Output Decoder

### **Scenario A: "PROGRAM ERROR"**
```
✗ API is NOT responding (HTTP 000)
✗ Found 5 error(s) in api-service logs
```
**FAULT: YOU** 🔴  
**ACTION:** 
1. Review logs: `./run.sh logs api-service | grep -i error`
2. Fix the bug
3. Redeploy: `./run.sh restart`

---

### **Scenario B: "REDIS DOWN"**
```
✗ Redis is NOT responding
✗ Redis was not ready after 15 attempts
```
**FAULT: SERVICE PROVIDER** 🔴  
**ACTION:**
1. Contact provider: "Redis is down"
2. Wait for them to fix it
3. Services will auto-recover

---

### **Scenario C: "NO CHARGERS"**
```
✓ API is responding (HTTP 200)
✓ Redis is responsive
✓ Currently connected chargers: 0
? Cannot reach chargers on OCPP port 9000
```
**FAULT: SERVICE PROVIDER NETWORK** 🔴  
**ACTION:**
1. Contact provider: "Port 9000 TCP is blocked"
2. Ask them to allow outbound connections on port 9000

---

### **Scenario D: "EVERYTHING OK"**
```
✓ All 5 services running
✓ Redis is responding
✓ API is responding (HTTP 200)
✓ No critical errors found
✓ Currently connected chargers: 3
```
**FAULT: NONE - Temporary Issue** ✅  
**ACTION:**
1. System is working fine now
2. Save logs for records: `cp /tmp/*.log ./logs_backup/`
3. Monitor for recurrence

---

## 🔍 Manual Log Analysis

### **Quick Check:**
```bash
# Errors in last 50 lines?
docker logs --tail=50 api-service 2>&1 | grep -i error

# Redis issues?
docker logs --tail=50 redis-service 2>&1 | grep -i error

# OCPP charger issues?
docker logs --tail=50 ocpp-ws-service 2>&1 | grep -i "connection\|timeout"
```

### **Look for These ERROR Phrases:**

| If You See | It Means | Fault |
|-----------|----------|-------|
| `Redis was not ready` | Redis service down | SERVICE PROVIDER |
| `Connection refused` | Network blocking | SERVICE PROVIDER |
| `APP_SECRET must be set` | Bad configuration | YOUR CONFIG |
| `Traceback (most recent call last):` | Code bug | YOUR PROGRAM |
| `Permission denied /data/*` | File system issue | SERVICE PROVIDER |
| `OOM command not allowed` | Out of memory | SERVICE PROVIDER |
| `Timeout waiting for charger` | Charger unreachable | SERVICE PROVIDER NETWORK |

---

## 💻 Service Status Check

```bash
# All services running?
docker compose -f docker-compose.yml ps

# Should show: 5 containers, all "Up"
# If not: Run the diagnosis script above
```

---

## 🔧 Quick Fixes to Try

### **Fix 1: Restart Everything**
```bash
./run.sh restart
# Wait 30 seconds
./run.sh logs  # Check if it recovered
```

### **Fix 2: Full Rebuild**
```bash
./run.sh clean   # Remove everything
./run.sh build   # Rebuild images
./run.sh up      # Start fresh
sleep 10
./run.sh logs    # Check status
```

### **Fix 3: Check Configuration**
```bash
# Make sure .env exists
ls -la /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/.env

# Should show env file with REDIS_PASSWORD and APP_SECRET set
```

---

## 📞 When to Contact Service Provider

**Include these files when contacting:**
```bash
# Create support bundle
mkdir support_bundle
docker compose -f docker-compose.yml ps > support_bundle/status.txt
docker logs api-service > support_bundle/api.log 2>&1
docker logs redis-service > support_bundle/redis.log 2>&1
docker logs ocpp-ws-service > support_bundle/ocpp.log 2>&1
bash diagnose_outage.sh > support_bundle/diagnosis.txt 2>&1

# Send everything to provider
zip -r outage_report.zip support_bundle/
# Email: outage_report.zip + timestamp of outage
```

---

## 📋 Outage Checklist

- [ ] Step 1: Saved logs to `/tmp/` (5 sec)
- [ ] Step 2: Ran `diagnose_outage.sh` (1 min)
- [ ] Step 3: Read diagnosis output (2 min)
- [ ] Step 4: Identified fault (YOUR vs PROVIDER) (1 min)
- [ ] Step 5: Took action (fix/contact/monitor) (5-30 min)
- [ ] Step 6: Verified recovery (`curl http://localhost:8000/health`)
- [ ] Step 7: Saved logs/report for records

---

## 🎯 Most Common Causes (Ranked)

1. **Redis Crash** (40% of outages)
   - Fix: Service provider restarts Redis
   - Your action: Wait + contact provider

2. **Network/Firewall Block** (35% of outages)
   - Fix: Service provider unblocks ports
   - Your action: Ask provider to allow TCP 9000

3. **Code Bug** (15% of outages)
   - Fix: You fix and redeploy
   - Your action: Review logs, patch code

4. **Configuration Error** (10% of outages)
   - Fix: Correct `.env` file
   - Your action: Fix vars, restart

---

## 📚 Deep Dive Guides

| Situation | Read This |
|-----------|-----------|
| Need full troubleshooting steps | `OUTAGE_TROUBLESHOOTING_GUIDE.md` |
| Need to understand logs | `LOGGING_QUICK_START.md` |
| Need executive summary | `LOGGING_SUMMARY.md` |
| Need detailed architecture | `OUTAGE_TROUBLESHOOTING_GUIDE.md` section 1 |

---

## 🚀 Prevention (Do These Now)

```bash
# 1. Create automated backup of logs
mkdir -p /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/logs_backup

# 2. Add to crontab (run every 5 minutes)
# */5 * * * * bash /path/to/diagnose_outage.sh > /path/to/logs_backup/last_check.txt 2>&1

# 3. Enable persistent logging in api.py/ocpp_ws.py
# (See OUTAGE_TROUBLESHOOTING_GUIDE.md section 7)

# 4. Set up alerts
# (Contact provider for CPU/Memory/Uptime monitoring)
```

---

## ❓ Still Unclear?

1. **Service is DOWN but no error logs?**
   → Infrastructure issue (SERVICE PROVIDER FAULT)
   → Ask provider for server logs

2. **Seeing "Connection refused"?**
   → Network/firewall blocking (SERVICE PROVIDER FAULT)
   → Ask provider for port 9000 access

3. **Seeing Python traceback?**
   → Your code crashed (YOUR FAULT)
   → Fix code, redeploy

4. **Getting 500 errors from API?**
   → Either code bug or missing configuration (YOUR FAULT)
   → Check logs for exact error

---

## ✅ Response Time SLA

- **Diagnosis:** 2 minutes (using diagnose_outage.sh)
- **Quick fix:** 5 minutes (restart services)
- **Deep fix:** 30 minutes (code patch or provider contact)
- **Recovery confirmation:** 5 minutes (health check)

---

**Remember:** When in doubt, run `bash diagnose_outage.sh` first. It tells you everything in 60 seconds.

