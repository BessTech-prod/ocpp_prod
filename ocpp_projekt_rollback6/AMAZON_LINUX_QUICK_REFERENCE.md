# Amazon Linux 2 - EV CSMS Quick Reference Card

## ⚠️ IMPORTANT: Install Git First (if not already installed)

**If you get "command not found" when running `git clone`, install Git first:**

```bash
sudo yum install -y git
```

## Essential Setup Commands (Copy & Paste Ready)

### 1️⃣ Initial Server Setup (First 5 Minutes)
```bash
# Connect to your instance
ssh -i ev-csms-key.pem ec2-user@YOUR_EC2_IP

# Update system
sudo yum update -y

# Install essentials
sudo yum install -y curl wget git htop net-tools unzip nano gcc make
```

### 2️⃣ Install Docker (2 Minutes)
```bash
# Install Docker from Amazon Linux Extras (recommended)
sudo amazon-linux-extras install -y docker

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 3️⃣ Configure Firewall (1 Minute)
```bash
# Start firewalld service
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Allow required ports
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --permanent --add-port=9000/tcp

# Apply changes
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

### 4️⃣ Clone Repository (1 Minute)
```bash
# Create project directory
mkdir -p ~/projects
cd ~/projects

# Option 1: SSH (Recommended - no authentication needed if SSH keys are set up)
git clone git@github.com:YOUR_USERNAME/ocpp_projekt_rollback5.git

# Option 2: HTTPS (Requires Personal Access Token - NOT password)
# git clone https://github.com/YOUR_USERNAME/ocpp_projekt_rollback5.git
# When prompted for username: enter your GitHub username
# When prompted for password: enter your Personal Access Token (NOT your GitHub password)

# Navigate to service
cd ocpp_projekt_rollback5/evcsms
```

### 5️⃣ Configure Environment (2 Minutes)
```bash
# Create .env file
cat > .env << 'EOF'
REDIS_PASSWORD=your-secure-password
APP_SECRET=$(openssl rand -base64 32)
ADMIN_BOOTSTRAP_EMAIL=admin@yourdomain.com
ADMIN_BOOTSTRAP_PASSWORD=ChangeMe123!
TZ=Europe/Stockholm
EOF

# Generate secure passwords
openssl rand -base64 32   # For APP_SECRET
openssl rand -base64 24   # For REDIS_PASSWORD

# Edit .env with secure values
nano .env
```

### 6️⃣ Build & Deploy (5 Minutes)
```bash
# Build Docker images
docker compose build --no-cache

# Start all services
docker compose up -d

# Verify services are running
docker ps

# Check logs
docker compose logs --tail 20
```

### 7️⃣ Verify Deployment (3 Minutes)
```bash
# Test UI dashboard
curl -s http://localhost/ui/login.html | head -20

# Test API
curl -s http://localhost:8000/docs | head -20

# Check WebSocket port
ss -tuln | grep 9000

# Verify all services healthy
docker compose logs | grep -i "error\|running\|started"
```

---

## Common Day-to-Day Commands

### Service Management
```bash
# Start services
docker compose up -d

# Stop services (preserves data)
docker compose down

# Restart services
docker compose restart

# View real-time logs
docker compose logs -f

# Stop and remove everything (deletes containers!)
docker compose down -v --remove-orphans
```

### Monitoring
```bash
# Show running containers
docker ps

# Check resource usage
docker stats --no-stream

# View container logs (last 50 lines)
docker logs api-service --tail 50

# Follow logs in real-time
docker logs api-service -f

# Check system disk/memory
df -h
free -h
```

### Backup & Recovery
```bash
# Quick backup
tar -czf ~/backup-$(date +%Y%m%d).tar.gz data/

# Full backup script
~/comprehensive_backup.sh

# List backups
ls -lah ~/backups/

# Restore from backup
tar -xzf ~/backups/data-2026-03-17.tar.gz
docker compose down && docker compose up -d
```

### Debugging
```bash
# SSH into container
docker exec -it api-service bash

# Check container details
docker inspect api-service

# View container processes
docker top api-service

# Check port listening
ss -tuln | grep -E "80|8000|9000"

# Test connectivity
curl http://localhost:8000/health
```

---

## Amazon Linux 2 Specific Commands

### System
```bash
# Check AL2 version
cat /etc/os-release

# View available extras
amazon-linux-extras list

# Install from extras
sudo amazon-linux-extras install -y <package>

# Check systemd services
sudo systemctl list-units --type=service

# View system logs
sudo journalctl -xe

# Follow system logs
sudo journalctl -f
```

### Package Management
```bash
# Update all packages
sudo yum update -y

# Install package
sudo yum install -y <package>

# Search for package
yum search <package>

# List installed packages
yum list installed

# Remove package
sudo yum remove -y <package>

# Clean package cache
sudo yum clean all
```

### Firewall
```bash
# Start firewall
sudo systemctl start firewalld

# Check status
sudo firewall-cmd --state

# List all rules
sudo firewall-cmd --list-all

# Add permanent port rule
sudo firewall-cmd --permanent --add-port=PORT/tcp

# Remove permanent rule
sudo firewall-cmd --permanent --remove-port=PORT/tcp

# Reload firewall
sudo firewall-cmd --reload
```

### SSH
```bash
# SSH into instance
ssh -i key.pem ec2-user@IP

# Copy file from local to EC2
scp -i key.pem file.txt ec2-user@IP:~/

# Copy file from EC2 to local
scp -i key.pem ec2-user@IP:~/file.txt ./

# Port forwarding (access localhost:8000 from local machine)
ssh -i key.pem -L 8000:localhost:8000 ec2-user@IP
```

---

## Troubleshooting Quick Fixes

### Git command not found
```bash
# Install Git first
sudo yum install -y git

# Then try cloning again
git clone https://github.com/YOUR_USERNAME/ocpp_projekt_rollback5.git
```

### GitHub authentication failed
```bash
# GitHub no longer supports password authentication
# Use SSH instead (recommended):
git clone git@github.com:YOUR_USERNAME/ocpp_projekt_rollback5.git

# If SSH doesn't work, use HTTPS with Personal Access Token:
git clone https://github.com/YOUR_USERNAME/ocpp_projekt_rollback5.git
# Username: YOUR_USERNAME
# Password: YOUR_PERSONAL_ACCESS_TOKEN (not your GitHub password)

# To create a Personal Access Token:
# 1. Go to GitHub.com → Settings → Developer settings → Personal access tokens
# 2. Generate new token with 'repo' scope
# 3. Use the token as your password when cloning

# To set up SSH keys for GitHub:
# 1. Generate SSH key pair:
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter for all prompts (accept defaults)

# 2. Copy the public key to add to GitHub:
cat ~/.ssh/id_ed25519.pub
# Copy the entire output

# 3. Add to GitHub:
# Go to GitHub.com → Settings → SSH and GPG keys → New SSH key
# Paste the key and save

# 4. Test the connection:
ssh -T git@github.com
# Should show: "Hi YOUR_USERNAME! You've successfully authenticated..."

# 5. Then try cloning again:
git clone git@github.com:YOUR_USERNAME/ocpp_projekt_rollback5.git
```

### Docker won't start
```bash
sudo systemctl start docker
sudo systemctl enable docker
sudo journalctl -u docker -f
```

### Services not responding
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs
```

### Can't connect via SSH
```bash
# Check if instance is running
aws ec2 describe-instances --instance-ids i-xxxxx

# Check security group
aws ec2 describe-security-groups --group-ids sg-xxxxx

# Verify key permissions
chmod 600 ev-csms-key.pem

# Test connection with verbose output
ssh -vvv -i ev-csms-key.pem ec2-user@IP
```

### Port not accessible
```bash
# Check if port is listening
ss -tuln | grep PORT

# Check firewall
sudo firewall-cmd --list-all

# Add firewall rule
sudo firewall-cmd --permanent --add-port=PORT/tcp
sudo firewall-cmd --reload

# Check AWS security group
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

### No disk space
```bash
# Check disk usage
df -h

# Find large files/directories
du -sh /* | sort -h

# Clean Docker data (careful!)
docker system prune -f

# Clean yum cache
sudo yum clean all
```

---

## Important Paths on Amazon Linux 2

```
~/ or $HOME              = /home/ec2-user
Project Directory        = /home/ec2-user/projects/ocpp_projekt_rollback5/evcsms
Data Directory          = /home/ec2-user/projects/ocpp_projekt_rollback5/evcsms/data
Backup Directory        = /home/ec2-user/backups
Config File             = /home/ec2-user/projects/ocpp_projekt_rollback5/evcsms/.env
Docker Compose File     = /home/ec2-user/projects/ocpp_projekt_rollback5/evcsms/docker-compose.yml
Docker Config           = /etc/docker/daemon.json
Nginx Config            = /etc/nginx/conf.d/ev-csms.conf
Firewall Config         = /etc/firewalld/
SSL Certificates        = /etc/letsencrypt/live/your-domain.com/
System Logs             = /var/log/
Docker Logs             = /var/lib/docker/containers/
Cron Jobs               = /var/spool/cron/crontabs/ec2-user
```

---

## Critical Passwords to Generate

```bash
# Generate APP_SECRET (for .env)
openssl rand -base64 32

# Generate REDIS_PASSWORD (for .env)
openssl rand -base64 24

# Generate admin password
openssl rand -base64 12

# Generate any 16-character password
openssl rand -hex 8
```

---

## Full Deployment Timeline

| Step | Command | Time |
|------|---------|------|
| 1 | Initial setup + Docker install | 10 min |
| 2 | Firewall configuration | 2 min |
| 3 | Clone repository | 1 min |
| 4 | Configure environment (.env) | 3 min |
| 5 | Build Docker images | 5 min |
| 6 | Start services | 2 min |
| 7 | Verify deployment | 3 min |
| **TOTAL** | | **~26 minutes** |

---

## Access URLs After Deployment

```
Web Dashboard    http://YOUR_EC2_IP/
API Documentation http://YOUR_EC2_IP:8000/docs
API Endpoint     http://YOUR_EC2_IP:8000/api/
OCPP WebSocket   ws://YOUR_EC2_IP:9000/
Redis (internal) localhost:6379 (not exposed externally)
```

---

## Default Login Credentials

```
Email:    admin@example.com (or set in .env)
Password: BytMig123! (or set in .env)
```

⚠️ **IMPORTANT:** Change these immediately after first login!

---

## Useful Links

- [Manual (Full)](/home/hugo/PycharmProjects/ocpp_projekt_rollback5/manual1.md)
- [Change Log](/home/hugo/PycharmProjects/ocpp_projekt_rollback5/MANUAL_UPDATE_CHANGELOG.md)
- [Amazon Linux 2 Docs](https://docs.aws.amazon.com/amazon-linux-2/)
- [Docker Docs](https://docs.docker.com/)
- [AWS EC2 Docs](https://docs.aws.amazon.com/ec2/)

---

**Version:** 2.0 - Amazon Linux 2 Edition  
**Last Updated:** March 17, 2026  
**Status:** Ready for Production Use
