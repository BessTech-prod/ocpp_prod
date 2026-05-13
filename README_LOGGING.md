# 📚 Complete Logging & Outage Analysis Documentation Index

## Quick Answer to Your Question

**Q: "Is there any fault logs built into this program?"**

**A: ✅ YES - Complete logging is built in** 

Your EV CSMS system logs all events, errors, and operations in real-time to Docker container output. Logs are easily accessible and fully contain all necessary information to determine whether an outage was your program's fault or your service provider's fault.

---

## 📖 Documentation Files (Read in This Order)

### **1️⃣ START HERE - Quick Reference (5 min read)**
📄 **File:** `LOGGING_QUICK_START.md`
- What gets logged and where
- 3 ways to view logs
- Critical error patterns to watch for
- Quick commands for daily use

**Best for:** Getting started immediately

---

### **2️⃣ DURING AN OUTAGE - Use This (1 min to run)**
🔧 **File:** `diagnose_outage.sh` (executable script)
- Automatically runs all diagnostics
- Tells you: YOUR FAULT or SERVICE PROVIDER FAULT
- Checks 6 critical areas
- Provides clear diagnosis

**Usage:**
```bash
bash /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/diagnose_outage.sh
```

**Best for:** Emergency outage response

---

### **3️⃣ QUICK REFERENCE CARD (Bookmark this)**
⚡ **File:** `OUTAGE_CHEAT_SHEET.md`
- Step-by-step outage response checklist
- Decision trees (what to do based on diagnosis)
- Most common causes ranked
- When to contact service provider
- Common error phrases decoded

**Best for:** Having on your desk during incidents

---

### **4️⃣ EXECUTIVE SUMMARY (10 min read)**
📋 **File:** `LOGGING_SUMMARY.md`
- Complete answer to your question
- How to distinguish YOUR fault vs SERVICE PROVIDER fault
- 4-step outage response plan
- Recommended improvements

**Best for:** Understanding the whole picture

---

### **5️⃣ SYSTEM ARCHITECTURE & LOGGING (15 min read)**
🏗️ **File:** `SYSTEM_ARCHITECTURE_LOGGING.md`
- Visual diagrams of the system
- All 5 services explained
- Where logs come from
- Dependency chain (what happens if service X fails)
- Detailed log examples for each service

**Best for:** Deep understanding of how system works

---

### **6️⃣ COMPREHENSIVE TROUBLESHOOTING GUIDE (30 min read)**
🔍 **File:** `OUTAGE_TROUBLESHOOTING_GUIDE.md`
- 6-step investigation procedure
- Program fault indicators
- Service provider fault indicators
- Log interpretation examples
- Creating persistent logs
- Monitoring checklist

**Best for:** In-depth troubleshooting and learning

---

## 🎯 How to Use This Documentation

### **Scenario 1: "System just went down NOW"**
1. Run: `bash diagnose_outage.sh` (1 minute)
2. Read diagnosis output
3. If unclear: Check `OUTAGE_CHEAT_SHEET.md` decision matrix
4. Take action based on diagnosis

### **Scenario 2: "I want to understand logging"**
1. Read: `LOGGING_QUICK_START.md` (5 min)
2. Read: `SYSTEM_ARCHITECTURE_LOGGING.md` (15 min)
3. Explore: Run `./run.sh logs` to see real logs
4. Reference: `OUTAGE_TROUBLESHOOTING_GUIDE.md` for deep details

### **Scenario 3: "I need to brief my manager"**
1. Share: `LOGGING_SUMMARY.md` sections 1-4
2. Show: Output from `diagnose_outage.sh`
3. Explain: Decision matrix in `OUTAGE_CHEAT_SHEET.md`

### **Scenario 4: "I want to improve logging"**
1. Read: `OUTAGE_TROUBLESHOOTING_GUIDE.md` section 7 (Persistent Logs)
2. Implement: File logging handler
3. Consider: Centralized logging setup

---

## 📊 Decision Tree

```
You're reading this because...
│
├─ "Is there logging?" → START: LOGGING_SUMMARY.md
│
├─ "System is down NOW" → START: diagnose_outage.sh
│
├─ "I want quick reference" → START: OUTAGE_CHEAT_SHEET.md
│
├─ "I want to understand architecture" → START: SYSTEM_ARCHITECTURE_LOGGING.md
│
├─ "I want deep troubleshooting knowledge" → START: OUTAGE_TROUBLESHOOTING_GUIDE.md
│
└─ "I want to set up better logging" → GO TO: OUTAGE_TROUBLESHOOTING_GUIDE.md section 7
```

---

## 🔑 Key Takeaways

### **What's Logged**
✅ **api.py** → All REST API calls, auth, errors  
✅ **ocpp_ws.py** → All charger events, OCPP messages, errors  
✅ **history_backup.py** → Backup job execution, Git operations  
✅ **System logs** → Container startup, health checks

### **How to Access**
✅ `./run.sh logs` (easiest)  
✅ `docker compose logs <service>` (direct)  
✅ `/data/logs/*.log` (if persistent logging enabled)

### **How to Identify Fault**
✅ **YOUR FAULT:** Look for `[ERROR]` with traceback, config errors  
✅ **SERVICE PROVIDER FAULT:** Look for connection refused, Redis down, timeout

### **What to Do**
✅ Save logs immediately (before container restart)  
✅ Run `diagnose_outage.sh` for automatic analysis  
✅ Check decision tree in `OUTAGE_CHEAT_SHEET.md`  
✅ Take corrective action based on diagnosis  
✅ Contact service provider with report

---

## 📁 File Locations

```
/home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/
├─ LOGGING_QUICK_START.md                    ← Quick start
├─ LOGGING_SUMMARY.md                        ← Executive summary
├─ OUTAGE_CHEAT_SHEET.md                     ← Quick reference
├─ OUTAGE_TROUBLESHOOTING_GUIDE.md          ← Deep dive
├─ SYSTEM_ARCHITECTURE_LOGGING.md            ← Architecture diagrams
│
└─ evcsms/
   ├─ diagnose_outage.sh                     ← Automated diagnostics
   ├─ api.py                                 ← REST API (logs as [api])
   ├─ ocpp_ws.py                             ← OCPP WebSocket (logs as [ocpp-ws])
   ├─ docker-compose.yml                     ← Service definitions
   ├─ run.sh                                 ← Docker runner script
   │
   ├─ app/
   │  ├─ main.py                             ← Main app logic
   │  ├─ history_backup.py                   ← Backup service (logs as [history-backup])
   │  └─ redis_config.py                     ← Redis configuration
   │
   └─ data/                                  ← Persistent volume
      ├─ transactions.json                   ← Charging history
      ├─ config/                             ← Configuration files
      │  ├─ users.json
      │  ├─ cps.json
      │  ├─ orgs.json
      │  ├─ auth_tags.json
      │  └─ rfids.json
      └─ logs/                               ← Log files (if enabled)
```

---

## ⏱️ How Long Will It Take?

| Task | Time | Document |
|------|------|----------|
| Get quick answer | 2 min | This file + LOGGING_SUMMARY.md |
| Run diagnostics during outage | 1 min | diagnose_outage.sh |
| Read quick start | 5 min | LOGGING_QUICK_START.md |
| Have quick reference handy | 10 min | OUTAGE_CHEAT_SHEET.md |
| Understand architecture | 15 min | SYSTEM_ARCHITECTURE_LOGGING.md |
| Full troubleshooting knowledge | 30 min | OUTAGE_TROUBLESHOOTING_GUIDE.md |
| **Total time to be fully prepared** | **~45 min** | **All files** |

---

## 🚀 Recommended Actions (Today)

### **Do These Now (5 minutes)**
- [ ] Read this file (you're already doing it!)
- [ ] Read `LOGGING_QUICK_START.md`
- [ ] Test: `./run.sh logs` (verify it works)
- [ ] Save: `diagnose_outage.sh` location (memorize: bash diagnose_outage.sh)

### **Do This This Week (30 minutes)**
- [ ] Read `OUTAGE_CHEAT_SHEET.md` (print it or bookmark)
- [ ] Read `SYSTEM_ARCHITECTURE_LOGGING.md`
- [ ] Explore: Run `./run.sh logs` and watch real service logs
- [ ] Test: Run `bash diagnose_outage.sh` to see output

### **Do This This Month (optional)**
- [ ] Read full `OUTAGE_TROUBLESHOOTING_GUIDE.md`
- [ ] Implement persistent logging (section 7 of guide)
- [ ] Set up monitoring/alerts
- [ ] Create outage response runbook for your team

---

## 🎓 Learning Path

### **Path 1: "Just Make It Go" (10 min)**
```
LOGGING_QUICK_START.md 
    ↓
Run: ./run.sh logs
    ↓
Bookmark: diagnose_outage.sh
    ↓
Done - You're ready for next outage
```

### **Path 2: "I Want To Understand" (30 min)**
```
LOGGING_SUMMARY.md
    ↓
SYSTEM_ARCHITECTURE_LOGGING.md
    ↓
OUTAGE_CHEAT_SHEET.md
    ↓
Try: bash diagnose_outage.sh
    ↓
Done - You understand the system
```

### **Path 3: "I'm The Expert" (60 min)**
```
All files in order:
1. LOGGING_QUICK_START.md
2. LOGGING_SUMMARY.md
3. SYSTEM_ARCHITECTURE_LOGGING.md
4. OUTAGE_CHEAT_SHEET.md
5. OUTAGE_TROUBLESHOOTING_GUIDE.md
    ↓
Done - You can debug anything
```

---

## ❓ FAQ

**Q: Where are the actual log files?**  
A: Docker container memory (lost on restart) OR `/data/logs/*.log` if persistent logging enabled

**Q: How far back do logs go?**  
A: Only current session (cleared on container restart)

**Q: Can I search historical logs?**  
A: Not by default. Logs are lost on restart. Enable persistent logging to keep them.

**Q: How do I know if it's my fault or provider's fault?**  
A: Run `bash diagnose_outage.sh` → it tells you (takes 60 seconds)

**Q: What if I can't access Docker commands?**  
A: Contact your infrastructure/IT team - you need Docker CLI access

**Q: Can I get alerts on errors?**  
A: Not built-in. Would need to add monitoring (advanced setup in guide)

**Q: Is there a web UI for logs?**  
A: Not built-in. Use command line or set up Grafana Loki (advanced)

---

## 📞 Support Strategy

### **Before Contacting Support, Gather:**
```bash
# 1. Save logs
docker compose logs api-service > support_logs_api.txt 2>&1
docker compose logs ocpp-ws-service > support_logs_ocpp.txt 2>&1
docker compose logs redis-service > support_logs_redis.txt 2>&1

# 2. Run diagnostics
bash diagnose_outage.sh > support_diagnosis.txt 2>&1

# 3. Check status
docker compose ps > support_status.txt

# Send these files to support with timestamp of outage
```

### **If Service Provider Fault:**
- Share: `support_logs_*.txt` files
- Share: `support_diagnosis.txt`
- Describe: Exact time outage started and ended
- Ask: Specific action to resolve

### **If Your Program Fault:**
- Review: Error traceback in logs
- Check: Code that generated error
- Test: Fix locally
- Deploy: Corrected version
- Verify: `curl http://localhost:8000/health` returns OK

---

## ✅ You're Ready When You Can...

- [ ] Explain what gets logged (5 things)
- [ ] Name 3 ways to view logs
- [ ] Run `diagnose_outage.sh` and understand output
- [ ] Point to a log error and say "YOUR FAULT" or "SERVICE PROVIDER FAULT"
- [ ] Take appropriate action (fix code vs contact provider)

**If you can do all 5 → You're ready for production issues!**

---

## 📞 Questions?

1. **"What does this error mean?"** → Check `SYSTEM_ARCHITECTURE_LOGGING.md` section "What Gets Logged - Detailed Breakdown"

2. **"System is down, what do I do?"** → Run `bash diagnose_outage.sh` then check `OUTAGE_CHEAT_SHEET.md`

3. **"I want to improve logging"** → Read `OUTAGE_TROUBLESHOOTING_GUIDE.md` section 7

4. **"How do I know what's normal?"** → Run `./run.sh logs` daily to get familiar with normal output

---

## 🎯 Bottom Line

Your system has **comprehensive logging built in**. You can:
- ✅ See all operations in real-time
- ✅ Identify errors instantly  
- ✅ Determine root cause quickly
- ✅ Distinguish your fault vs provider's fault
- ✅ Take corrective action

**Tools provided:**
- ✅ 6 detailed guides (this index + 5 others)
- ✅ 1 automated diagnostic script
- ✅ Decision trees and checklists
- ✅ Architecture diagrams

**You're fully equipped. Go read `LOGGING_QUICK_START.md` next.**

---

**Last Updated:** 2026-04-03  
**For questions:** Refer to appropriate guide above

