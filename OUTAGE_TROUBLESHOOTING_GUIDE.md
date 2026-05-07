# OUTAGE TROUBLESHOOTING & LOG ANALYSIS GUIDE
## EV CSMS (Electric Vehicle Charging Management System)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

Your system runs 5 interconnected Docker services:

```
┌─────────────────────────────────────────────────────────────┐
│                   EV CSMS Services Stack                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  UI Service (Port 8080)                                       │
│  └─ Static web frontend (HTML/JS)                            │
│     └─ Serves: index.html, login.html, dashboard, etc.      │
│                                                               │
│  API Service (Port 8000) ← MAIN BUSINESS LOGIC               │
│  └─ FastAPI/Uvicorn REST endpoints                           │
│     ├─ /health           (Status checks)                     │
│     ├─ /api/cps          (Charger management)                │
│     ├─ /api/users        (User management)                   │
│     ├─ /api/status       (Real-time charger status)          │
│     ├─ /api/transactions (Charging history)                  │
│     └─ ... (many more endpoints)                             │
│                                                               │
│  OCPP WebSocket Service (Port 9000) ← CHARGER COMMUNICATION  │
│  └─ OCPP 1.6J protocol handler                               │
│     └─ Handles charger connections & messages                │
│                                                               │
│  Redis Service (Port 6379, no external expose) ← SHARED STATE│
│  └─ Session storage                                          │
│  └─ Real-time status cache                                   │
│  └─ Command queue (ocpp:commands)                            │
│  └─ Command results (ocpp:command_result:*)                  │
│                                                               │
│  Backup Service (No port) ← BACKGROUND WORKER                │
│  └─ Scheduled charge history backups                         │
│  └─ Pushes to Git repository                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

All services depend on **Redis**. If Redis fails = entire system fails.

---

## 2. BUILT-IN LOGGING SYSTEM

### What Logs Are Captured?

The system uses **Python's standard `logging` module** with **console-based logging only** (no persistent log files by default).

**Log streams from each service:**

| Service | Logger Name | What It Logs |
|---------|------------|-------------|
| `api.py` | `"api"` | REST API requests, health checks, user auth, configuration errors |
| `ocpp_ws.py` | `"ocpp-ws"` | WebSocket connections, charger messages, OCPP protocol events |
| `history_backup.py` | `"history-backup"` | Backup job execution, Git operations, file transfers |

**Log Format:**
```
2026-04-03 14:25:37,123 [INFO] Redis connection ready
2026-04-03 14:26:04,456 [WARNING] Redis not ready yet (attempt 2/15): Connection refused
2026-04-03 14:27:12,789 [ERROR] Critical database error
```

### Where to Find Logs

**There are 3 ways to access logs:**

#### **Option 1: Docker Container Logs (EASIEST - Real-time)**
```bash
# View all service logs (follows all containers)
./run.sh logs

# View specific service logs
./run.sh logs api-service
./run.sh logs ocpp-ws-service
./run.sh logs redis-service
./run.sh logs backup-service

# Follow logs in real-time (like `tail -f`)
docker logs -f api-service
docker logs -f ocpp-ws-service
docker logs -f redis-service
```

#### **Option 2: Using docker compose directly**
```bash
# All logs
docker compose -f docker-compose.yml logs -f

# Specific service
docker compose -f docker-compose.yml logs -f api-service

# Last 100 lines from all services
docker compose -f docker-compose.yml logs --tail=100
```

#### **Option 3: Access Docker container's stdout/stderr**
```bash
# Get container ID
docker ps | grep api-service

# View all output from container
docker logs <CONTAINER_ID>
```

---

## 3. CRITICAL FAILURE INDICATORS

Watch for these log patterns to identify root cause:

### **Redis Connection Failures (Most Common)**
```
[WARNING] Redis not ready yet (attempt 1/15): Connection refused
[WARNING] Redis not ready yet (attempt 2/15): Connection refused
...
[ERROR] RuntimeError: Redis was not ready after 15 attempts
```
**What this means:** Redis service crashed or didn't start
**Possible causes:**
- Out of memory (OOM kill)
- Redis password mismatch (`REDIS_PASSWORD` env var)
- Port 6379 blocked/unavailable
- Corrupt Redis data

**To verify Redis:**
```bash
# Check if Redis is running
docker ps | grep redis-service

# Try to connect
docker exec redis-service redis-cli -a YOUR_PASSWORD ping

# Check Redis logs
docker logs redis-service
```

---

### **API Service Startup Failures**
```
[ERROR] APP_SECRET must be set
[ERROR] RuntimeError: REDIS_PASSWORD must be set when REDIS_URL is not used
```
**What this means:** Missing environment variables
**Solution:**
- Verify `.env` file exists and has correct values
- Check `docker-compose.yml` environment section
- Restart with: `./run.sh restart`

---

### **OCPP WebSocket Connection Issues**
```
[ERROR] Exception during WebSocket handshake
[WARNING] Charge point connection failed: timeout
[ERROR] Command worker loop failed: ...
```
**What this means:** Chargers can't connect to your OCPP endpoint
**Possible causes:**
- Port 9000 blocked/not exposed
- WebSocket handler crashed
- Charger firewall issues (check service provider network)
- Invalid authentication tokens

---

### **Transaction/File I/O Errors**
```
[ERROR] Failed to write transactions.json
[ERROR] Permission denied: /data/config/users.json
```
**What this means:** File system issues
**Possible causes:**
- Docker volume mount failed
- Disk full
- Permission errors in `/data` directory
- Corrupted JSON files

---

### **Backup Service Failures**
```
[ERROR] Git authentication failed
[ERROR] SSH key not found at /run/secrets/backup_git_ed25519
```
**What this means:** Automated backups are failing
**Note:** This doesn't affect core services unless `BACKUP_ENABLED=true` and it's blocking startup

---

## 4. PROGRAM FAULT vs SERVICE PROVIDER FAULT

### **How to Determine Root Cause**

#### **Is it YOUR PROGRAM'S FAULT? Check:**

1. **Look for exceptions in logs:**
   ```bash
   docker logs api-service 2>&1 | grep -i "error\|exception\|traceback"
   docker logs ocpp-ws-service 2>&1 | grep -i "error\|exception\|traceback"
   ```

2. **Check if services are running:**
   ```bash
   docker compose -f docker-compose.yml ps
   # STATUS should be "Up" for all services
   ```

3. **Check health endpoints:**
   ```bash
   curl -v http://localhost:8000/health
   # Should return 200 OK with JSON response
   ```

4. **Check Redis connectivity:**
   ```bash
   docker exec api-service python -c "import redis; r = redis.Redis(host='redis-service', port=6379, password='YOUR_PASSWORD'); print(r.ping())"
   ```

---

#### **Is it SERVICE PROVIDER'S FAULT? Look for:**

1. **Network connectivity issues:**
   ```bash
   # Can your chargers reach your OCPP endpoint?
   # Check if port 9000 is accessible from outside
   
   # From charger's perspective (or simulate):
   nc -zv your-server-ip 9000
   
   # Check if public IP/DNS resolves correctly
   nslookup your-domain.com
   ```

2. **Firewall/Network blocked traffic:**
   - All 5 ports must be accessible (if distributed)
   - Or at least port 9000 for OCPP WebSocket
   - Check service provider's network policy

3. **ISP outage or DNS issues:**
   ```bash
   # Test DNS resolution
   nslookup 8.8.8.8
   
   # Test internet connectivity
   ping -c 3 8.8.8.8
   
   # Check if chargers can reach your domain
   curl -v https://your-server-ip:9000/
   ```

4. **Charger-side authentication:**
   - Check `CP_AUTH_REQUIRED` and `CP_SHARED_TOKEN` settings
   - Verify chargers are using correct tokens
   - Look for `AuthorizationStatus: Rejected` in logs

---

## 5. STEP-BY-STEP OUTAGE INVESTIGATION

### **When the system goes down, follow this:**

#### **Step 1: Assess Damage (0-5 min)**
```bash
# Are any services running?
docker compose -f docker-compose.yml ps

# Get last 50 lines of each service
docker logs --tail=50 api-service
docker logs --tail=50 ocpp-ws-service
docker logs --tail=50 redis-service
docker logs --tail=50 backup-service
```

**Decision:**
- ✅ All "Up" → Go to Step 2
- ❌ Some "Exited" or "Dead" → Go to Step 3

---

#### **Step 2: Check System Health (5-10 min)**
```bash
# Test Redis
docker exec redis-service redis-cli -a "$REDIS_PASSWORD" ping

# Test API health
curl -s http://localhost:8000/health | jq .

# Check for OOM kills
docker stats --no-stream

# Check container resource limits
docker inspect api-service | grep -i memory
```

**Decision:**
- ✅ All responding → Application level issue (Step 4)
- ❌ Redis down → Container issue (Step 3)

---

#### **Step 3: Container Issues - Restart Strategy**
```bash
# View detailed error logs
docker logs --tail=200 redis-service 2>&1 | grep -i error

# Try graceful restart
./run.sh restart

# If that fails, remove and rebuild
./run.sh clean
./run.sh build
./run.sh up
```

**Decision:**
- ✅ Services come back up → Likely a transient crash (networking, OOM, etc.)
- ❌ Services keep crashing → Go to Step 6

---

#### **Step 4: Application Level Debugging**
```bash
# Check if chargers are connecting
docker logs -f ocpp-ws-service | grep -i "connect\|disconnect"

# Monitor API requests
docker logs -f api-service | grep -i "error\|exception"

# Watch Redis command queue
docker exec redis-service redis-cli -a "$REDIS_PASSWORD" LLEN ocpp:commands
docker exec redis-service redis-cli -a "$REDIS_PASSWORD" KEYS 'ocpp:*' | head -20
```

**Common findings:**
- Chargers not connecting? → Check network/firewall (service provider issue)
- API errors? → Check logs for specific exception types
- Stuck commands in queue? → Manual cleanup needed

---

#### **Step 5: Network/Firewall Analysis (SERVICE PROVIDER CHECK)**
```bash
# From external machine or charger, try to reach OCPP endpoint
telnet your-server-ip 9000
# OR
nc -zv your-server-ip 9000

# Check port exposure
netstat -tlnp | grep 9000
# Should show: LISTEN on 0.0.0.0:9000 or your external IP

# Check if service provider has blocked it
# Contact them and ask for port 9000 TCP access
```

---

#### **Step 6: Data Integrity Check**
```bash
# Check if config files are corrupted
docker exec api-service python -c "
import json
from pathlib import Path
for f in ['/data/transactions.json', '/data/config/users.json', '/data/config/cps.json']:
    try:
        json.loads(Path(f).read_text())
        print(f'✓ {f} is valid JSON')
    except Exception as e:
        print(f'✗ {f} is CORRUPTED: {e}')
"

# Backup corrupted files and restore from last backup
docker exec api-service ls -la /data/backups/

# Check disk space
df -h /data
```

---

## 6. LOG INTERPRETATION EXAMPLES

### **Example 1: Redis OOM Kill (SERVICE PROVIDER → Not Your Fault)**
```
[INFO] Redis connection ready
[INFO] Accepting connections (elapsed=5ms)
[WARNING] maxmemory configured but eviction policy not set
[ERROR] OOM command not allowed when used memory > 'maxmemory'
[ERROR] Redis was not ready after 15 attempts
```
→ **Root Cause:** Service provider's Redis ran out of memory
→ **Action:** Ask provider to increase Redis memory limit

---

### **Example 2: Your Program Bug (YOUR FAULT)**
```
[ERROR] Exception in user creation endpoint
Traceback (most recent call last):
  File "api.py", line 1234, in create_user
    users[tag] = user_data  # KeyError on NoneType
TypeError: 'NoneType' object does not support item assignment
```
→ **Root Cause:** Bug in your code (not validating inputs)
→ **Action:** Fix the code, redeploy

---

### **Example 3: Network/Firewall Issue (SERVICE PROVIDER FAULT)**
```
[INFO] OCPP WebSocket listening on 0.0.0.0:9000
[WARNING] Timeout waiting for charger connection
[WARNING] Timeout waiting for charger connection
[INFO] No chargers connected - standby mode
```
→ **Root Cause:** Chargers can't reach your endpoint
→ **Action:** Ask service provider to verify port 9000 is not blocked

---

### **Example 4: Configuration Issue (YOUR FAULT)**
```
[ERROR] APP_SECRET must be set
SystemExit: 1
```
→ **Root Cause:** Missing .env file or environment variable
→ **Action:** Create proper .env file with correct credentials

---

## 7. CREATING PERSISTENT LOGS (RECOMMENDED)

Currently logs go to stdout/stderr only. To persist logs to disk, create a logging wrapper:

### **Create: `evcsms/logging_config.py`**
```python
import logging
import logging.handlers
from pathlib import Path

def setup_file_logging(service_name: str, log_dir: Path = Path("/data/logs")):
    """Configure logging to both console and file."""
    log_dir.mkdir(parents=True, exist_ok=True)
    
    logger = logging.getLogger(service_name)
    logger.setLevel(logging.INFO)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s"
    ))
    logger.addHandler(console_handler)
    
    # File handler (rotating, max 10MB per file, keep 5 backups)
    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / f"{service_name}.log",
        maxBytes=10_000_000,
        backupCount=5
    )
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    ))
    logger.addHandler(file_handler)
    
    return logger
```

Then in `api.py` and `ocpp_ws.py`:
```python
from logging_config import setup_file_logging

logger = setup_file_logging("api")
# ... rest of code
```

---

## 8. MONITORING CHECKLIST

### **Daily Health Checks:**
```bash
#!/bin/bash
# Name: check_health.sh

echo "=== SERVICE STATUS ==="
docker compose -f docker-compose.yml ps

echo "=== REDIS CONNECTIVITY ==="
docker exec redis-service redis-cli -a "$REDIS_PASSWORD" ping

echo "=== API HEALTH ==="
curl -s http://localhost:8000/health | jq .

echo "=== CONNECTED CHARGERS ==="
curl -s http://localhost:8000/api/status | jq '.connected | length'

echo "=== RECENT ERRORS (LAST 30 LINES) ==="
for svc in api-service ocpp-ws-service redis-service; do
    echo "--- $svc ---"
    docker logs --tail=30 $svc 2>&1 | grep -i "error\|failed\|exception" || echo "No errors"
done

echo "=== DISK USAGE ==="
df -h /data
```

---

## 9. QUICK REFERENCE: COMMAND SUMMARY

```bash
# ===== LOGS =====
./run.sh logs                           # Follow all logs
./run.sh logs api-service               # Follow API service
docker logs --tail=100 api-service      # Last 100 lines

# ===== SERVICES =====
./run.sh up                             # Start all
./run.sh down                           # Stop all
./run.sh restart                        # Restart all
./run.sh build                          # Rebuild images
docker compose ps                       # Check status

# ===== DEBUGGING =====
docker exec redis-service redis-cli ping  # Test Redis
curl http://localhost:8000/health       # Test API
docker stats                            # Monitor resources
docker inspect api-service              # Detailed info

# ===== CLEANUP =====
./run.sh clean                          # Remove everything
docker volume ls                        # List volumes
docker volume rm ocpp_projekt2.0_*      # Remove volumes
```

---

## 10. SUPPORT CONTACT DECISION TREE

```
Did the outage happen?
│
├─ YES, and logs show "Redis was not ready"
│  └─ Contact: SERVICE PROVIDER (Redis issue)
│
├─ YES, and logs show API/OCPP exceptions
│  └─ Contact: YOUR DEVELOPMENT TEAM (Code bug)
│
├─ YES, and logs show "Connection refused" from chargers
│  └─ Contact: SERVICE PROVIDER (Network/Firewall)
│
├─ YES, and no error logs at all
│  └─ → Docker containers might have crashed silently
│  └─ → Contact: SERVICE PROVIDER (Infrastructure issue)
│
└─ YES, but unclear
   └─ → Provide service provider with:
       1. Output of: docker compose ps
       2. Output of: docker logs api-service | head -200
       3. Output of: docker logs ocpp-ws-service | head -200
       4. Output of: docker logs redis-service | head -200
       5. Timestamp of outage
```

---

## Summary

✅ **Built-in logging: YES** - Console-based real-time logs
✅ **Accessible via:** `./run.sh logs` or `docker logs <service>`
✅ **Key indicators:** Look for "error", "exception", "failed", "timeout"
✅ **Program fault indicators:** Python traceback, validation errors, config missing
✅ **Service provider fault indicators:** Connection refused, timeout, network errors

**Next step:** Run `./run.sh logs` now and share output if issues appear.

