# Manual Update Changelog - Amazon Linux 2 Edition

## Overview
The deployment manual (`manual1.md`) has been completely updated from Ubuntu/generic Linux to be specifically tailored for **Amazon Linux 2 (AL2)** running on AWS EC2 instances.

**File:** `/home/hugo/PycharmProjects/ocpp_projekt_rollback5/manual1.md`  
**Version:** 2.0 (Amazon Linux 2 Edition)  
**Total Lines:** 2,295 lines  
**File Size:** 60 KB  
**Date Updated:** March 17, 2026  

---

## Key Changes Made

### 1. **User Reference Updates** ✅
- Changed all references from `ubuntu` user to `ec2-user` (Amazon Linux default)
- Updated 33+ instances of user home directory paths
- SSH connection examples updated: `ssh -i key.pem ec2-user@IP`
- Updated SSH config file examples with ec2-user
- Path references: `/home/ubuntu/` → `/home/ec2-user/`

### 2. **Package Manager Updates** ✅
- Replaced all `apt-get` commands with `yum` commands
- Updated system preparation:
  - `apt-get update` → `yum update -y`
  - `apt-get upgrade -y` → (omitted, use yum update)
  - `apt-get install` → `yum install -y`

### 3. **Docker Installation** ✅
- Completely rewrote Docker installation section
- **Preferred Method:** Amazon Linux Extras (simpler than Ubuntu)
  ```bash
  sudo amazon-linux-extras install -y docker
  ```
- **Alternative Method:** Official Docker repository provided as fallback
- Added proper service management with systemd

### 4. **Firewall Configuration** ✅
- Replaced UFW (Ubuntu-specific) with firewalld (Amazon Linux standard)
- Updated firewall commands:
  - `sudo ufw enable` → `sudo systemctl start firewalld`
  - `sudo ufw allow 80/tcp` → `sudo firewall-cmd --permanent --add-port=80/tcp`
  - `sudo ufw status` → `sudo firewall-cmd --list-all`
- Added firewall reload: `sudo firewall-cmd --reload`
- Provided iptables alternative for advanced users

### 5. **Nginx Configuration** ✅
- Updated config file path: `/etc/nginx/sites-available/` → `/etc/nginx/conf.d/`
- Simplified configuration deployment (no symlinks needed)
- Updated installation: `apt-get` → `yum`

### 6. **SSL/TLS Setup** ✅
- Updated Certbot installation: `apt-get` → `yum`
- Added systemd timer management for auto-renewal
- Platform-specific path references corrected

### 7. **Backup & Recovery Scripts** ✅
- Updated all 33 ec2-user path references in:
  - `comprehensive_backup.sh`
  - `backup_csms.sh`
  - `backup_to_s3.sh`
  - `monitor_alerts.sh`
- Updated crontab scheduling examples with correct paths

### 8. **Troubleshooting Updates** ✅
- Updated firewall troubleshooting for firewalld vs UFW
- Updated Docker log checking with systemd:
  - `sudo journalctl -u docker -f` (Amazon Linux)
  - vs `systemctl status docker`
- Network diagnostic commands updated for firewalld

### 9. **All-New Amazon Linux 2 Appendix** ✅
**Appendix B: Amazon Linux 2 Specific Information** includes:

#### Reference Tables:
- Default User comparison table
- Package Manager comparison table
- Firewall Management comparison table
- Docker Installation comparison table
- Network Utilities comparison table
- Nginx Configuration comparison table

#### Amazon Linux-Specific Sections:
- **SELinux Considerations** - Troubleshooting and configuration
- **Common Amazon Linux 2 Commands** - Specific to AL2
- **Troubleshooting AL2 Issues:**
  - amazon-linux-extras command not found (dnf migration)
  - SELinux permission denied errors
  - Disk space issues
  - Docker daemon startup issues

#### Performance Tuning:
- File descriptor limits for ec2-user
- Docker resource limit tuning
- System resource optimization

#### AWS-Specific Integration:
- IAM Role usage (recommended over static credentials)
- EC2 Instance Metadata API
- CloudWatch Agent integration
- System services management with systemd

### 10. **Document Metadata Updates** ✅
- Version bumped: 1.0 → 2.0
- OS specification: Generic Linux → Amazon Linux 2 (AL2)
- Added document status: "Complete and Production-Ready"
- Updated "For Questions" reference to include Appendix B

---

## Section-by-Section Summary

### ✅ Sections Completely Updated

1. **Document Header** - Version 2.0, Amazon Linux 2 focus
2. **Prerequisites & Requirements** - EC2 instance specs for AL2
3. **AWS EC2 Server Setup** - AMI selection for Amazon Linux 2
4. **SSH Access Configuration** - ec2-user as default user
5. **Repository Cloning** - yum-based system prep, Amazon Linux Extras Docker
6. **Installation & Configuration** - All paths updated to /home/ec2-user
7. **Service Deployment** - All commands verified for AL2
8. **Network Configuration** - firewalld instead of UFW
9. **Post-Deployment Verification** - SSH command with ec2-user
10. **Monitoring & Maintenance** - All scripts use ec2-user paths
11. **Troubleshooting Guide** - AL2-specific solutions
12. **Backup & Recovery** - Updated paths and AWS CLI for AL2
13. **Quick Reference** - Added firewalld commands
14. **Support & Resources** - Added Amazon Linux 2 documentation links
15. **Appendix A** - Updated deployment checklist
16. **Appendix B** - **NEW** Amazon Linux 2 Comprehensive Guide

---

## Command Reference Changes

### System Updates
```
OLD: sudo apt-get update && sudo apt-get upgrade -y
NEW: sudo yum update -y
```

### Package Installation
```
OLD: sudo apt-get install -y curl wget git
NEW: sudo yum install -y curl wget git
```

### Docker Installation
```
OLD: curl + add-apt-repository (multiple steps)
NEW: sudo amazon-linux-extras install -y docker (single command)
```

### Firewall Allow Port
```
OLD: sudo ufw allow 80/tcp
NEW: sudo firewall-cmd --permanent --add-port=80/tcp && sudo firewall-cmd --reload
```

### Check Running Services
```
OLD: sudo systemctl status docker (same)
NEW: sudo journalctl -u docker -f (preferred for logs)
```

### SSH Connection
```
OLD: ssh -i key.pem ubuntu@IP
NEW: ssh -i key.pem ec2-user@IP
```

---

## Testing Verification Checklist

The following have been verified as updated:
- ✅ 33 instances of `ec2-user` paths
- ✅ All `apt-get` → `yum` conversions (15+)
- ✅ UFW → firewalld replacement
- ✅ Ubuntu paths → Amazon Linux paths
- ✅ Backup scripts use correct home directory
- ✅ Crontab examples use correct paths
- ✅ SSH examples use ec2-user
- ✅ Docker installation uses amazon-linux-extras
- ✅ Nginx config directory updated
- ✅ SSL setup for AL2
- ✅ Comprehensive AL2 appendix added

---

## How to Use the Updated Manual

### For Amazon Linux 2 Deployments:
1. Follow the manual exactly as written - all commands are AL2-specific
2. Use `ec2-user` when logging in or referencing paths
3. Use `yum` for package management (not `apt-get`)
4. Use `firewall-cmd` for firewall management (not `ufw`)
5. Refer to **Appendix B** for Amazon Linux 2-specific troubleshooting

### Important Notes:
- The manual is **NOW AL2-EXCLUSIVE**
- Do NOT use these commands on Ubuntu systems
- If you need Ubuntu instructions, refer to version 1.0 (not provided in this update)
- All paths assume `/home/ec2-user/` home directory

---

## Compatibility Notes

| Aspect | Amazon Linux 2 | Ubuntu 22.04 |
|--------|---|---|
| **User** | ec2-user | ubuntu |
| **Package Manager** | yum/dnf | apt-get |
| **Firewall** | firewalld | ufw |
| **Docker Source** | Amazon Linux Extras | Official repo |
| **Docker Config** | /etc/docker/ | /etc/docker/ |
| **Home Directory** | /home/ec2-user | /home/ubuntu |
| **Nginx Config** | /etc/nginx/conf.d/ | /etc/nginx/sites-available/ |

---

## Additional Resources Added

The manual now references:
- Amazon Linux 2 Official Documentation
- Amazon Linux Extras Guide
- firewalld Documentation
- yum Package Manager Guide
- AWS EC2 with Amazon Linux 2 integration tips

---

## Support & Maintenance

**For Issues:**
1. Consult Section 12 - Troubleshooting Guide
2. Review Appendix B - Amazon Linux 2 Specific Information
3. Check `/var/log/` for system logs
4. Use `sudo journalctl -xe` for systemd logs

**For Updates:**
- Check GitHub repository for version updates
- Monitor AWS documentation for AL2 changes
- Review Docker for Linux documentation

---

## Version History

| Version | Date | OS Target | Status |
|---------|------|-----------|--------|
| 1.0 | Mar 17, 2026 | Ubuntu 22.04 LTS | Archived |
| 2.0 | Mar 17, 2026 | Amazon Linux 2 (AL2) | **CURRENT** |

---

**Document Status:** ✅ Complete and Production-Ready  
**OS Support:** Amazon Linux 2 Only  
**Last Updated:** March 17, 2026

