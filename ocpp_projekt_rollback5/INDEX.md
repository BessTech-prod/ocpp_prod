# 📚 EV CSMS Documentation Index - Amazon Linux 2 Edition

## Quick Navigation

**🚀 START HERE:** [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md) (5 min read)

---

## 📖 Documentation Files Overview

### 1. **AMAZON_LINUX_QUICK_REFERENCE.md** ⭐ START HERE
- **Purpose:** Quick copy & paste commands for fast deployment
- **Time to Read:** 5 minutes
- **Best For:** First-time deployment, quick reference
- **Contains:**
  - Step-by-step setup commands (26 min total)
  - Common day-to-day operations
  - Troubleshooting quick fixes
  - Important paths and URLs

### 2. **manual1.md** - COMPREHENSIVE GUIDE
- **Purpose:** Complete deployment and operations manual
- **Lines:** 2,295
- **Size:** 60 KB
- **Version:** 2.0 (Amazon Linux 2 Edition)
- **Best For:** Detailed reference, troubleshooting, understanding architecture
- **Contains:**
  - 16 main sections
  - 13 appendices
  - AWS setup instructions
  - Networking configuration
  - Backup & recovery procedures
  - Detailed troubleshooting (7 issues)
  - **NEW: Appendix B** - Amazon Linux 2 Specific Information

### 3. **MANUAL_UPDATE_CHANGELOG.md** - WHAT CHANGED
- **Purpose:** Track all changes from Ubuntu version to AL2 version
- **Best For:** Understanding what was modified
- **Contains:**
  - 10 categories of updates
  - Command reference before/after
  - Verification checklist
  - Compatibility notes

### 4. **UPDATE_SUMMARY.md** - EXECUTIVE SUMMARY
- **Purpose:** High-level overview of what was done
- **Time to Read:** 5 minutes
- **Best For:** Quick understanding of deliverables
- **Contains:**
  - Files created/updated
  - Update statistics
  - Quality assurance checklist
  - Next steps

---

## 🎯 How to Use This Documentation

### For First-Time Deployment (Fastest Path)
```
1. Read: AMAZON_LINUX_QUICK_REFERENCE.md (5 min)
2. Execute: Sections 1-7 (26 min total)
3. Verify: Test deployment
4. Bookmark: manual1.md for reference
```

### For Detailed Understanding
```
1. Read: UPDATE_SUMMARY.md (5 min overview)
2. Read: manual1.md Section 1-3 (Architecture & Requirements)
3. Follow: manual1.md Sections 4-8 (Setup & Deployment)
4. Reference: manual1.md Sections 9-13 as needed
```

### For Troubleshooting
```
1. Check: manual1.md Section 12 (Troubleshooting Guide)
2. Review: manual1.md Appendix B (AL2 Specific Issues)
3. Use: AMAZON_LINUX_QUICK_REFERENCE.md (Quick Fixes)
```

### For Understanding What Changed
```
1. Read: MANUAL_UPDATE_CHANGELOG.md (2 categories of changes)
2. Reference: Command reference before/after
3. Check: Compatibility notes for your use case
```

---

## 📊 Key Statistics

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| manual1.md | 2,295 | 60 KB | Complete manual |
| AMAZON_LINUX_QUICK_REFERENCE.md | 429 | 8.5 KB | Quick reference |
| UPDATE_SUMMARY.md | 326 | 9.2 KB | Executive summary |
| MANUAL_UPDATE_CHANGELOG.md | 261 | 8.3 KB | Change tracking |
| **TOTAL** | **3,311** | **85.5 KB** | **Complete docs** |

---

## 🔍 Finding Information

### I need to...

**Deploy the service for the first time**
→ Read [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md)

**Understand the system architecture**
→ Read [`manual1.md`](./manual1.md) Section 1

**Set up AWS EC2 instance**
→ Read [`manual1.md`](./manual1.md) Section 3

**Install Docker**
→ Read [`manual1.md`](./manual1.md) Section 5

**Configure firewall**
→ Read [`manual1.md`](./manual1.md) Section 9

**Troubleshoot an issue**
→ Read [`manual1.md`](./manual1.md) Section 12 or Appendix B

**Set up backups**
→ Read [`manual1.md`](./manual1.md) Section 13

**See what was updated**
→ Read [`MANUAL_UPDATE_CHANGELOG.md`](./MANUAL_UPDATE_CHANGELOG.md)

**Understand Amazon Linux 2 differences**
→ Read [`manual1.md`](./manual1.md) Appendix B

**Get AWS CLI commands**
→ Read [`manual1.md`](./manual1.md) Quick Reference Section

---

## 📋 Deployment Checklist

Quick checklist from [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md):

```
☐ Initial Server Setup (5 min)
☐ Install Docker (2 min)
☐ Configure Firewall (1 min)
☐ Clone Repository (1 min)
☐ Configure Environment (2 min)
☐ Build & Deploy (5 min)
☐ Verify Deployment (3 min)
─────────────────────────────
  TOTAL: ~26 minutes
```

---

## 🔐 Important Notes

### Amazon Linux 2 Specific
- **User:** `ec2-user` (not `ubuntu`)
- **Package Manager:** `yum` / `dnf` (not `apt-get`)
- **Firewall:** `firewalld` (not `ufw`)
- **Home Directory:** `/home/ec2-user/`
- **Docker Source:** Amazon Linux Extras (recommended)

### Critical for Success
- ⚠️ Use `ec2-user` when connecting via SSH
- ⚠️ Use `yum` not `apt-get` for packages
- ⚠️ Use `firewall-cmd` not `ufw` for firewall
- ⚠️ Set strong passwords in `.env` file
- ⚠️ Do NOT use these commands on Ubuntu!

---

## 📞 Support Resources

### In This Documentation
- **Architecture Overview:** `manual1.md` Section 1
- **Installation Steps:** `manual1.md` Sections 4-6
- **Troubleshooting:** `manual1.md` Section 12
- **AL2-Specific Help:** `manual1.md` Appendix B
- **Quick Commands:** `AMAZON_LINUX_QUICK_REFERENCE.md`

### External Resources
- [Amazon Linux 2 Documentation](https://docs.aws.amazon.com/amazon-linux-2/)
- [Docker Documentation](https://docs.docker.com/)
- [AWS EC2 Guide](https://docs.aws.amazon.com/ec2/)
- [firewalld Documentation](https://firewalld.org/)

---

## 🚀 Quick Start Path

```
1️⃣  Read (5 min)
    └─ AMAZON_LINUX_QUICK_REFERENCE.md

2️⃣  Execute (26 min)
    └─ Sections 1-7 of Quick Reference

3️⃣  Deploy (5 min)
    └─ Sections 6-7 of Quick Reference

4️⃣  Verify (3 min)
    └─ Section 7 of Quick Reference

✅  DONE! Services running.
```

**Total Time:** ~40 minutes from zero to deployed services

---

## 📝 Document Versions

| Version | Date | OS Target | Status |
|---------|------|-----------|--------|
| 1.0 | Mar 17, 2026 | Ubuntu 22.04 LTS | Archived |
| 2.0 | Mar 17, 2026 | Amazon Linux 2 | **CURRENT** |

---

## ✅ Quality Assurance

All documents have been:
- ✅ Updated for Amazon Linux 2
- ✅ Tested for accuracy
- ✅ Verified for completeness
- ✅ Organized for easy navigation
- ✅ Formatted for clarity
- ✅ Ready for production use

---

## 🎯 Your Action Items

### Immediate (Now)
1. Read [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md)
2. Bookmark all 4 documentation files
3. Review the deployment timeline

### Before Deployment
1. Prepare Amazon Linux 2 EC2 instance
2. Generate secure passwords
3. Have SSH key ready
4. Get GitHub repository URL

### During Deployment
1. Follow [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md)
2. Reference [`manual1.md`](./manual1.md) as needed
3. Check [`manual1.md` Section 12](./manual1.md) if issues arise

---

## 📧 Documentation Maintenance

| Task | Frequency | Owner |
|------|-----------|-------|
| Review manual | Quarterly | System Admin |
| Update for AWS changes | As needed | DevOps |
| Test deployment | Monthly | QA |
| Update for new versions | Per release | Development |

---

## 💾 File Locations

```
/home/hugo/PycharmProjects/ocpp_projekt_rollback5/
├── manual1.md                        ← MAIN MANUAL (Start here!)
├── AMAZON_LINUX_QUICK_REFERENCE.md  ← QUICK START
├── MANUAL_UPDATE_CHANGELOG.md        ← WHAT CHANGED
├── UPDATE_SUMMARY.md                 ← OVERVIEW
├── INDEX.md                          ← THIS FILE
└── evcsms/                           ← SERVICE CODE
    ├── docker-compose.yml
    ├── Dockerfile
    └── ... (application files)
```

---

## 🎓 Learning Path

### Beginner (No AWS/Docker experience)
1. Read: `UPDATE_SUMMARY.md` (understand what we're doing)
2. Read: `manual1.md` Section 1 (learn architecture)
3. Read: `AMAZON_LINUX_QUICK_REFERENCE.md` (learn steps)
4. Execute: Follow quick reference steps

### Intermediate (Some cloud experience)
1. Skim: `AMAZON_LINUX_QUICK_REFERENCE.md` (familiar?)
2. Jump to: Step 1 of quick reference
3. Reference: `manual1.md` as needed
4. Bookmark: Section 12 (troubleshooting)

### Advanced (DevOps background)
1. Quick check: `AMAZON_LINUX_QUICK_REFERENCE.md`
2. Review: Appendix B in `manual1.md` for AL2 specifics
3. Deploy: Follow steps 1-7 of quick reference
4. Customize: Use `manual1.md` Section 9 for advanced networking

---

## 📚 Recommended Reading Order

**For First-Time Users:**
1. This INDEX (you are here!) - 3 min
2. [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md) - 5 min
3. [`manual1.md` Section 1](./manual1.md) - 5 min
4. Start deployment from Quick Reference - 26 min

**Total: ~40 minutes to have system running**

---

## 🏆 Success Criteria

After following this documentation, you should have:

✅ Working EV CSMS service on Amazon Linux 2 EC2  
✅ All 4 microservices running (UI, API, OCPP, Redis)  
✅ Web dashboard accessible at `http://YOUR_IP/`  
✅ REST API available at `http://YOUR_IP:8000/docs`  
✅ OCPP WebSocket ready at `ws://YOUR_IP:9000/`  
✅ Backup strategy configured  
✅ Firewall properly configured  
✅ Default admin user created  

---

**Status:** ✅ Complete and Ready to Deploy

**Last Updated:** March 17, 2026  
**OS Target:** Amazon Linux 2 (AL2)  
**Deployment Time:** ~40 minutes from start to running services

---

**Start here:** [`AMAZON_LINUX_QUICK_REFERENCE.md`](./AMAZON_LINUX_QUICK_REFERENCE.md) 🚀

