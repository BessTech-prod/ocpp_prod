# 📘 EV CSMS - AWS Deployment Manual
## Complete Guide to Commissioning the OCPP Charge Point Management System on AWS

**Document Version:** 2.0  
**Date:** March 2026  
**Service:** EV CSMS (Electric Vehicle Charge Management System) with OCPP 1.6J Protocol  
**Target Platform:** AWS EC2 Amazon Linux 2 Server with SSH Access  
**Updated for:** Amazon Linux 2 (AL2) with yum package manager

---

## 📋 Table of Contents

1. [Service Overview](#service-overview)
2. [Prerequisites & Requirements](#prerequisites--requirements)
3. [AWS EC2 Server Setup](#aws-ec2-server-setup)
4. [SSH Access Configuration](#ssh-access-configuration)
5. [Repository Cloning from GitHub](#repository-cloning-from-github)
6. [Installation & Configuration](#installation--configuration)
7. [Docker Containerization](#docker-containerization)
8. [Service Deployment](#service-deployment)
9. [Network Configuration & Security](#network-configuration--security)
10. [Post-Deployment Verification](#post-deployment-verification)
11. [Monitoring & Maintenance](#monitoring--maintenance)
12. [Troubleshooting Guide](#troubleshooting-guide)
13. [Backup & Recovery](#backup--recovery)

---

## 1. Service Overview

### What is EV CSMS?

**EV CSMS** (Electric Vehicle Charge Station Management System) is a comprehensive OCPP 1.6J-compliant Central Station Management System built with:

- **Python 3.11** with **FastAPI** framework
- **WebSocket Protocol** for real-time charge point communication (OCPP 1.6J)
- **REST API** for administrative operations
- **Redis** for state management and caching
- **Docker & Docker Compose** for containerization

### System Architecture

The service consists of **4 containerized microservices** that work together:

```
┌─────────────────────────────────────────────────────────┐
│                   AWS EC2 Linux Instance                │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  UI Service  │  │  API Service │  │ OCPP WS Srv  │  │
│  │   Port 80    │  │   Port 8000  │  │   Port 9000  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│           │               │                    │         │
│           └───────────────┼────────────────────┘         │
│                           │                              │
│                    ┌──────▼──────┐                       │
│                    │   Redis     │                       │
│                    │  Port 6379  │                       │
│                    └─────────────┘                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Data Storage (/data)                            │  │
│  │  - transactions.json                             │  │
│  │  - users.json                                    │  │
│  │  - orgs.json                                     │  │
│  │  - cps.json                                      │  │
│  │  - auth_tags.json                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ HTTP/HTTPS                        │ WebSocket (OCPP)
         │ (Port 80, 8000)                   │ (Port 9000)
         │                                   │
    ┌────┴────────────────────────────┬──────┴──────┐
    │                                 │             │
    │         Web Browsers        Physical Charge  │
    │      / Admin Dashboard      Point Devices    │
    │                                              │
```

### Key Services

| Service | Port | Purpose | Dockerfile |
|---------|------|---------|-----------|
| **UI Service** | 80 | Web dashboard for managing charge points, users, viewing analytics | `docker/Dockerfile.ui` |
| **API Service** | 8000 | REST API backend, business logic, data management, user authentication | `docker/Dockerfile.api` |
| **OCPP WS Service** | 9000 | WebSocket server for OCPP 1.6J protocol communication with charge point hardware | `docker/Dockerfile.ocpp_ws` |
| **Redis Service** | 6379 | In-memory data store, session management, real-time state synchronization | Alpine Redis 7 |

---

## 2. Prerequisites & Requirements

### AWS Resources Needed

1. **EC2 Instance**
   - **AMI Type:** Amazon Linux 2 (AL2) - Latest version
   - **Instance Type:** `t3.medium` or larger (recommended)
     - vCPU: 2 cores minimum
     - Memory: 4 GB minimum (8 GB recommended for production)
     - Storage: 30 GB minimum (100 GB recommended) - gp3 SSD recommended
   - **Network:** VPC with Internet Gateway
   - **Security Groups:** Allow inbound traffic on ports 80, 8000, 9000, 22 (SSH)
   - **Note:** Amazon Linux 2 uses `ec2-user` as default user (not ubuntu)

2. **GitHub Account**
   - Access to the repository
   - (Optional) SSH keys for passwordless git operations

3. **Local Machine Requirements**
   - SSH client (OpenSSH on Linux/Mac, PuTTY/WSL on Windows)
   - Terminal/Command line access

### Software Requirements (pre-installed on instance)

- **OS:** Amazon Linux 2 (AL2)
- **Package Manager:** yum/dnf (not apt-get)
- **Docker:** Latest stable version (via Amazon Linux Extras)
- **Docker Compose:** v2.0 or higher
- **Python:** 3.11+ (included in Docker images)
- **Git:** For cloning the repository
- **curl/wget:** For health checks and diagnostics

### Port Requirements

| Port | Service | Protocol | Direction | Purpose |
|------|---------|----------|-----------|---------|
| 22 | SSH | TCP | Inbound | Server management |
| 80 | HTTP (UI) | TCP | Inbound | Web dashboard |
| 8000 | HTTP (API) | TCP | Inbound | REST API |
| 9000 | WebSocket | TCP | Inbound | OCPP charge point communication |

---

## 3. AWS EC2 Server Setup

### Step 1: Launch EC2 Instance

#### Via AWS Console

1. Log into your AWS Management Console
2. Navigate to **EC2 Dashboard** → **Instances** → **Launch Instances**
3. **Choose an AMI:**
   ```
   Search: "Amazon Linux 2" 
   Select: Amazon Linux 2 AMI (HVM) - SSD Volume Type
   OR: Directly choose from "Amazon Linux 2" in the Quick Start section
   ```

4. **Choose Instance Type:**
   ```
   Instance Type: t3.medium (or t3.large for production)
   Click: Next: Configure Instance Details
   ```

5. **Configure Instance Details:**
   - **Network:** Select your VPC (or default VPC)
   - **Subnet:** Select any available subnet
   - **Auto-assign Public IP:** Enable
   - **IAM instance profile:** (Optional, only if needed for AWS service access)
   - Click: Next: Add Storage

6. **Add Storage:**
   - **Volume Size:** 30 GB (minimum), 100 GB (recommended)
   - **Volume Type:** gp3 (General Purpose SSD)
   - Click: Next: Add Tags

7. **Add Tags:**
   ```
   Key: Name
   Value: ev-csms-production
   
   Key: Environment
   Value: Production
   
   Key: Service
   Value: EV-Charging-Management
   ```

8. **Configure Security Group:**
   - **Create new security group** or select existing
   - **Security Group Name:** `ev-csms-sg`
   - **Security Group Description:** "EV CSMS service access"

9. **Add Rules to Security Group:**
   ```
   Type              Protocol  Port Range  Source
   ─────────────────────────────────────────────────────
   SSH               TCP       22          0.0.0.0/0      (or your IP only)
   HTTP              TCP       80          0.0.0.0/0
   Custom TCP        TCP       8000        0.0.0.0/0
   Custom TCP        TCP       9000        0.0.0.0/0
   ```

10. **Review and Launch:**
    - Review all settings
    - Click: **Launch**
    - Select or create a key pair:
      ```
      Key pair name: ev-csms-key
      File format: .pem (for OpenSSH)
      Click: Download Key Pair
      ```
    - Click: **Launch Instances**

#### Via AWS CLI

```bash
# Set environment variables
INSTANCE_TYPE="t3.medium"
VOLUME_SIZE=30
KEY_NAME="ev-csms-key"
SECURITY_GROUP_NAME="ev-csms-sg"

# Create security group (if not exists)
aws ec2 create-security-group \
  --group-name $SECURITY_GROUP_NAME \
  --description "EV CSMS service access"

# Get security group ID
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Add inbound rules
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 8000 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 9000 --cidr 0.0.0.0/0

# Launch instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \  # Ubuntu 22.04 LTS (update as needed)
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$VOLUME_SIZE,VolumeType=gp3}" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=ev-csms-production}]"
```

### Step 2: Obtain Instance Details

```bash
# Get instance public IP (use this for SSH access)
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=ev-csms-production" \
  --query 'Reservations[0].Instances[0].[PublicIpAddress,PrivateIpAddress]' \
  --output text

# Output example:
# 54.123.45.67  172.31.0.100
#   ↑ Public IP    ↑ Private IP
```

---

## 4. SSH Access Configuration

### Step 1: Prepare SSH Key

After downloading the `.pem` key file from AWS:

```bash
# On your local machine, navigate to where you saved the key
cd ~/Downloads  # or wherever you saved it

# Set proper permissions (IMPORTANT!)
chmod 600 ev-csms-key.pem

# Verify permissions
ls -l ev-csms-key.pem
# Should show: -rw------- (600)
```

### Step 2: Connect via SSH

#### For Linux/Mac Users

```bash
# Connect to the instance (Amazon Linux uses 'ec2-user' as default user)
ssh -i ev-csms-key.pem ec2-user@54.123.45.67

# Replace:
# - ev-csms-key.pem: your key file path
# - 54.123.45.67: your EC2 instance public IP
# - ec2-user: default user for Amazon Linux 2 AMI

# Expected first connection prompt:
# The authenticity of host '54.123.45.67 (54.123.45.67)' can't be established.
# ECDSA key fingerprint is SHA256:XXXXXXX
# Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
```

#### For Windows Users (Using WSL)

```bash
# If using Windows Subsystem for Linux (WSL)
# Copy your .pem file to WSL home directory
cp /mnt/c/Users/YourUsername/Downloads/ev-csms-key.pem ~/.ssh/

# Set permissions
chmod 600 ~/.ssh/ev-csms-key.pem

# Connect
ssh -i ~/.ssh/ev-csms-key.pem ubuntu@54.123.45.67
```

#### For Windows Users (Using PuTTY)

1. Download and install PuTTY from https://www.putty.org/
2. Download PuTTYgen (included with PuTTY)
3. Open PuTTYgen and load your `.pem` file
4. Click "Save private key" and save as `.ppk` file
5. Open PuTTY:
   - **Host Name:** `ec2-user@54.123.45.67` (Amazon Linux uses ec2-user)
   - **Connection → SSH → Auth:** Select your `.ppk` file
   - **Connection → Data:** Auto-login username: `ec2-user`
   - Click **Open**

### Step 3: Verify SSH Connection

Once connected, you should see:

```bash
[ec2-user@ip-172-31-0-100 ~]$
```

This indicates you're now logged into the EC2 instance as the Amazon Linux default user.

### Step 4: Create SSH Config File (Optional, for convenience)

On your local machine, create/edit `~/.ssh/config`:

```bash
Host ev-csms
    HostName 54.123.45.67
    User ec2-user
    IdentityFile ~/.ssh/ev-csms-key.pem
    StrictHostKeyChecking accept-new
```

Then connect simply with:

```bash
ssh ev-csms
```

---

## 5. Repository Cloning from GitHub

### Step 1: Prepare the Instance

Once SSH'd into your EC2 instance, update the system:

```bash
# Update package lists and upgrade installed packages
sudo yum update -y

# Install essential tools (Amazon Linux uses yum, not apt-get)
sudo yum install -y \
    curl \
    wget \
    git \
    htop \
    net-tools \
    unzip \
    nano \
    gcc \
    make
```

### Step 2: Install Docker

Amazon Linux 2 includes Docker in Amazon Linux Extras, making installation simpler than Ubuntu:

```bash
# Install Docker from Amazon Linux Extras (simplest method)
sudo amazon-linux-extras install -y docker

# Start Docker service
sudo systemctl start docker

# Enable Docker to start on boot
sudo systemctl enable docker

# Add current user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Apply group changes (log out and back in, or use)
newgrp docker

# Verify installation
docker --version
docker compose version

# Expected output:
# Docker version 24.x.x, build xxxxx
# Docker Compose version v2.x.x
```

**Alternative: Install Docker from Official Docker Repository (if needed)**

```bash
# Add Docker repository
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

# Install Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3: Clone Repository from GitHub

#### Via HTTPS (No SSH key setup required)

```bash
# Create a directory for the project
mkdir -p ~/projects
cd ~/projects

# Clone the repository
git clone https://github.com/YOUR_USERNAME/ocpp_projekt_rollback5.git

# Navigate into the project
cd ocpp_projekt_rollback5

# List the contents
ls -la

# Expected output:
# evcsms/
# ReadMe.txt
```

#### Via SSH (Recommended for repeated use)

If you have GitHub SSH keys set up:

```bash
# Clone using SSH
git clone git@github.com:YOUR_USERNAME/ocpp_projekt_rollback5.git

# Navigate into project
cd ocpp_projekt_rollback5
```

#### Setting up GitHub SSH Keys (if needed)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Accept defaults (press Enter for all prompts)

# Copy the public key
cat ~/.ssh/id_ed25519.pub

# Output will look like:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIXxxx your_email@example.com

# 1. Go to GitHub.com
# 2. Click Profile → Settings → SSH and GPG keys
# 3. Click "New SSH key"
# 4. Paste the output above into the "Key" field
# 5. Click "Add SSH key"

# Test connection
ssh -T git@github.com

# Expected output:
# Hi YOUR_USERNAME! You've successfully authenticated, but GitHub does not provide shell access.
```

### Step 4: Verify Repository Structure

```bash
# Check the project structure
cd ~/projects/ocpp_projekt_rollback5
tree -L 2

# Or with ls if tree not installed
find . -maxdepth 2 -type f -o -type d | head -30

# Expected structure:
# ocpp_projekt_rollback5/
# ├── ReadMe.txt
# └── evcsms/
#     ├── api.py
#     ├── docker-compose.yml
#     ├── Dockerfile
#     ├── ocpp_ws.py
#     ├── README.md
#     ├── requirements.txt
#     ├── run.sh
#     ├── app/
#     ├── config/
#     ├── data/
#     └── web/
```

---

## 6. Installation & Configuration

### Step 1: Navigate to Service Directory

```bash
# Change to the evcsms service directory
cd ~/projects/ocpp_projekt_rollback5/evcsms

# List all files
ls -la

# Expected files:
# - docker-compose.yml      (Docker orchestration)
# - Dockerfile              (Main application container)
# - requirements.txt        (Python dependencies)
# - run.sh                  (Helper script)
# - app/                    (Python source code)
# - web/                    (Web UI files)
# - config/                 (Configuration JSONs)
# - data/                   (Persistent data storage)
```

### Step 2: Create Environment Configuration

```bash
# Create .env file for environment variables
cat > .env << 'EOF'
# ============================================
# EV CSMS - Environment Variables
# ============================================

# Redis Configuration
REDIS_PASSWORD=your-secure-redis-password-here

# API Configuration
APP_SECRET=your-secure-app-secret-change-this
SESSION_TTL_MIN=720

# Portal Tags Global (allow portal_admin to access all charge points)
PORTAL_TAGS_GLOBAL=false

# Bootstrap Admin (initial admin account if users.json is empty)
ADMIN_BOOTSTRAP_EMAIL=admin@yourdomain.com
ADMIN_BOOTSTRAP_FIRST_NAME=Portal
ADMIN_BOOTSTRAP_LAST_NAME=Administrator
ADMIN_BOOTSTRAP_PASSWORD=ChangeMe123!
ADMIN_BOOTSTRAP_RFID=ADMIN
ADMIN_BOOTSTRAP_ORG_ID=default

# Timezone
TZ=Europe/Stockholm

# Optional: HTTP Port mappings
HTTP_PORT=80
API_PORT=8000
OCPP_PORT=9000
EOF

# Verify file was created
cat .env
```

**⚠️ IMPORTANT:** For production, replace the following with strong, unique values:
- `APP_SECRET` - Use a cryptographically random string (e.g., `openssl rand -base64 32`)
- `REDIS_PASSWORD` - Strong password
- `ADMIN_BOOTSTRAP_PASSWORD` - Strong password
- `ADMIN_BOOTSTRAP_EMAIL` - Your actual admin email

### Step 3: Generate Secure Secrets

```bash
# Generate a strong APP_SECRET
openssl rand -base64 32
# Output example: xB7kL9pQmN2vW4sX8zY0aB3cD6eF9gH1iJ2kL3mN4oP5q=

# Generate a strong Redis password
openssl rand -base64 24
# Output example: tRx7vL2kN9pW4sM6aB1cD3eF

# Update .env with these values (use nano or your preferred editor)
nano .env
```

### Step 4: Initialize Data Directories

```bash
# Create necessary directories for persistent data
mkdir -p data/config

# Initialize empty JSON configuration files
cat > data/config/users.json << 'EOF'
{}
EOF

cat > data/config/orgs.json << 'EOF'
{}
EOF

cat > data/config/cps.json << 'EOF'
{}
EOF

cat > data/config/auth_tags.json << 'EOF'
{}
EOF

cat > data/transactions.json << 'EOF'
[]
EOF

# Set permissions
chmod 755 data
chmod 755 data/config

# Verify
ls -la data/
ls -la data/config/
```

### Step 5: Validate Configuration

```bash
# Check if all required files exist
echo "=== Checking configuration files ==="
ls -la docker-compose.yml
ls -la Dockerfile
ls -la requirements.txt
ls -la .env
ls -la data/config/

# Check if Docker is running
docker ps

# Check Docker version
docker --version
docker compose version

# You should see Docker containers (initially empty) and version info
```

---

## 7. Docker Containerization

### Step 1: Understand the Docker Setup

Your service uses Docker to containerize the application. The setup includes:

```
📦 Docker Environment
├── docker-compose.yml    (Orchestrates all services)
├── Dockerfile            (Builds the main application image)
├── docker/
│   ├── Dockerfile.ui     (UI service - nginx)
│   ├── Dockerfile.api    (API service - FastAPI)
│   └── Dockerfile.ocpp_ws (OCPP WebSocket service)
└── .env                  (Environment variables)
```

### Step 2: Build Docker Images

```bash
# Navigate to the service directory
cd ~/projects/ocpp_projekt_rollback5/evcsms

# Build all Docker images defined in docker-compose.yml
docker compose build --no-cache

# This process will:
# 1. Download base images (python:3.11-slim, redis:7-alpine, nginx:1.25-alpine)
# 2. Install Python dependencies from requirements.txt
# 3. Copy application code
# 4. Tag images for the services

# Expected output:
# [+] Building 45.3s (12/12) FINISHED
# => [redis-service 1/1] FROM redis:7-alpine
# ...
# => exporting to image
# Successfully tagged ocpp_projekt_rollback5-redis-service:latest
# Successfully tagged ocpp_projekt_rollback5-ocpp-ws-service:latest
# Successfully tagged ocpp_projekt_rollback5-api-service:latest
# Successfully tagged ocpp_projekt_rollback5-ui-service:latest
```

### Step 3: Verify Docker Images

```bash
# List all built images
docker images | grep ocpp

# Expected output:
# REPOSITORY                                   TAG       IMAGE ID      CREATED      SIZE
# ocpp_projekt_rollback5-ui-service             latest    abc123def456  2 minutes    45MB
# ocpp_projekt_rollback5-api-service            latest    def456ghi789  2 minutes    185MB
# ocpp_projekt_rollback5-ocpp-ws-service        latest    ghi789jkl012  2 minutes    185MB
# redis                                         7-alpine  jkl012mno345  2 weeks      38MB
```

### Step 4: Understanding the Docker Compose Configuration

Here's what happens in `docker-compose.yml`:

```yaml
# Service 1: Redis - In-memory data store
redis-service:
  - Runs on port 6379
  - Stores sessions, state, and temporary data
  - Requires password authentication (from .env)
  - Volume: redis_data (persistent storage)

# Service 2: OCPP WebSocket Service
ocpp-ws-service:
  - Runs on port 9000
  - Handles OCPP 1.6J protocol
  - Communicates with physical charge points
  - Depends on Redis for state synchronization

# Service 3: API Service
api-service:
  - Runs on port 8000
  - Provides REST API endpoints
  - Handles user authentication and management
  - Communicates with database (persisted JSON files)
  - Depends on Redis

# Service 4: UI Service
ui-service:
  - Runs on port 80
  - Serves web dashboard (HTML, CSS, JS)
  - Reverse proxy to API and WebSocket services

# All services connect via 'internal' network bridge
# Data persists in /data volume (mounted on host)
```

### Step 5: Pre-flight Checks

```bash
# Check Docker daemon is running
docker ps

# Should output:
# CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
# (empty, no containers running yet)

# Check available disk space
df -h

# You should have at least 5GB free

# Check memory availability
free -h

# Should show several GB available

# Test Docker build capability
docker build --help | head -5

# Should show Docker build documentation
```

---

## 8. Service Deployment

### Step 1: Start All Services

```bash
# Navigate to service directory
cd ~/projects/ocpp_projekt_rollback5/evcsms

# Start all containers in detached mode
docker compose up -d

# This will:
# 1. Create a Docker network
# 2. Start Redis container
# 3. Start OCPP WebSocket service (waits for Redis health check)
# 4. Start API service (waits for Redis health check)
# 5. Start UI service

# Expected output:
# [+] Running 4/4
#  ✔ Network ocpp_projekt_rollback5_evcsms_internal  Created
#  ✔ Container redis-service                          Started
#  ✔ Container ocpp-ws-service                        Started
#  ✔ Container api-service                            Started
#  ✔ Container ui-service                             Started
```

### Step 2: Monitor Service Startup

```bash
# Watch the services start up (takes 30-60 seconds)
watch docker ps

# Or use the run.sh helper script
chmod +x run.sh
./run.sh logs

# To view logs of a specific service
./run.sh logs api
./run.sh logs ocpp-ws-service
./run.sh logs redis-service
./run.sh logs ui-service

# Exit logs with Ctrl+C
```

### Step 3: Verify All Services Are Running

```bash
# List all running containers
docker ps

# Expected output:
# CONTAINER ID  IMAGE                                      STATUS         PORTS
# xxxxxxxx      ocpp_projekt_rollback5-ui-service:latest   Up 2 min       0.0.0.0:80->80/tcp
# xxxxxxxx      ocpp_projekt_rollback5-api-service:latest  Up 2 min       0.0.0.0:8000->8000/tcp
# xxxxxxxx      ocpp_projekt_rollback5-ocpp-ws-service     Up 2 min       0.0.0.0:9000->9000/tcp
# xxxxxxxx      redis:7-alpine                             Up 2 min       6379/tcp

# Check if all containers show "Up" status
# All 4 services should be listed

# Get detailed stats
docker stats --no-stream

# Expected output shows CPU%, Memory, Network I/O for each container
```

### Step 4: Test Service Health

```bash
# Test UI Service (port 80)
curl -s http://localhost/ui/login.html | head -20

# Test API Service (port 8000)
curl -s http://localhost:8000/docs | head -20

# Test API health endpoint
curl -s http://localhost:8000/health || echo "No health endpoint"

# Test OCPP WebSocket (you'll need a WebSocket client, but this shows port is listening)
netstat -tuln | grep 9000

# Or use ss command
ss -tuln | grep 9000

# Expected output should show something like:
# LISTEN 0 128 0.0.0.0:9000 0.0.0.0:*
```

### Step 5: Check Logs for Errors

```bash
# Get the last 50 lines of logs from all services
docker compose logs --tail 50

# Check for any ERROR or CRITICAL messages
docker compose logs | grep -i error

# Get logs from past 5 minutes
docker compose logs --since 5m

# Follow logs in real-time (Ctrl+C to exit)
docker compose logs -f

# Check individual service logs
docker logs redis-service
docker logs ocpp-ws-service | tail -30
docker logs api-service | tail -30
docker logs ui-service | tail -30
```

---

## 9. Network Configuration & Security

### Step 1: AWS Security Group Configuration

Ensure your AWS security group has the correct inbound rules:

```bash
# Get your security group ID
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ev-csms-sg" \
  --query 'SecurityGroups[0].GroupId' \
  --output text

# Set it as a variable for the commands below
SG_ID="sg-xxxxxxxxx"

# Verify current rules
aws ec2 describe-security-groups --group-ids $SG_ID

# Expected inbound rules:
# Port 22 (SSH)    - 0.0.0.0/0
# Port 80 (HTTP)   - 0.0.0.0/0
# Port 8000 (API)  - 0.0.0.0/0
# Port 9000 (OCPP) - 0.0.0.0/0
```

### Step 2: Configure Firewall (on EC2 instance)

**Option 1: Using firewalld (Default on Amazon Linux)**

```bash
# Start firewalld service
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Allow SSH (essential, do this first!)
sudo firewall-cmd --permanent --add-port=22/tcp

# Allow HTTP
sudo firewall-cmd --permanent --add-port=80/tcp

# Allow API
sudo firewall-cmd --permanent --add-port=8000/tcp

# Allow OCPP
sudo firewall-cmd --permanent --add-port=9000/tcp

# Reload firewall to apply changes
sudo firewall-cmd --reload

# Check status
sudo firewall-cmd --list-all

# Expected output:
# public (active)
#   ports: 22/tcp 80/tcp 8000/tcp 9000/tcp
```

**Option 2: Using iptables (if firewalld is not available)**

```bash
# View current rules
sudo iptables -L

# Allow SSH
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP, API, OCPP
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 9000 -j ACCEPT

# Save rules
sudo iptables-save | sudo tee /etc/sysconfig/iptables

# Note: UFW is not available on Amazon Linux. Use firewalld or iptables instead.
```

### Step 3: Configure Docker Network

The services communicate via a Docker bridge network:

```bash
# View the internal network created by Docker Compose
docker network ls | grep ocpp

# Inspect the network details
docker network inspect ocpp_projekt_rollback5_internal

# This shows:
# - Connected containers
# - Network interface details
# - DNS resolution between services
```

### Step 4: Configure Reverse Proxy (Optional)

For production, consider using Nginx as a reverse proxy:

```bash
# Install Nginx on Amazon Linux
sudo yum install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Create Nginx configuration
sudo nano /etc/nginx/conf.d/ev-csms.conf

# Add the following content:
```

**Nginx Configuration for EV CSMS:**

```nginx
# /etc/nginx/conf.d/ev-csms.conf (for Amazon Linux)
# Note: Amazon Linux uses /etc/nginx/conf.d/ instead of /etc/nginx/sites-available/

upstream api_backend {
    server localhost:8000;
}

upstream ocpp_websocket {
    server localhost:9000;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (use Let's Encrypt with Certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/ev-csms-access.log;
    error_log /var/log/nginx/ev-csms-error.log;

    # API endpoint
    location /api/ {
        proxy_pass http://api_backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # OCPP WebSocket endpoint
    location /ocpp/ {
        proxy_pass http://ocpp_websocket/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Static files and UI
    location / {
        proxy_pass http://localhost/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### Step 5: Set Up SSL with Let's Encrypt

```bash
# Install Certbot on Amazon Linux
sudo yum install -y certbot python3-certbot-nginx

# Obtain SSL certificate (replace your-domain.com with your actual domain)
sudo certbot certonly --nginx -d your-domain.com

# This will:
# 1. Validate domain ownership
# 2. Generate SSL certificates
# 3. Save them to /etc/letsencrypt/live/your-domain.com/

# Auto-renewal setup (already automatic with Certbot on Amazon Linux)
sudo systemctl enable certbot.timer

# Test renewal
sudo certbot renew --dry-run

# Reload Nginx to apply SSL changes
sudo systemctl reload nginx
```

---

## 10. Post-Deployment Verification

### Step 1: Access the Web Dashboard

Open your browser and navigate to:

```
http://YOUR_EC2_PUBLIC_IP/
```

**Expected Response:**
- You should be redirected to login page
- URL: `http://YOUR_EC2_PUBLIC_IP/ui/login.html`
- A login form with fields for email and password

### Step 2: First-Time Login

The system bootstraps with a default admin account if `users.json` is empty.

**Default Credentials:**
```
Email:    admin@example.com  (or what you set in ADMIN_BOOTSTRAP_EMAIL)
Password: BytMig123!         (or what you set in ADMIN_BOOTSTRAP_PASSWORD)
```

**Steps:**
1. Enter email address: `admin@example.com`
2. Click "Login"
3. Enter password: `BytMig123!`
4. Click "Sign In"

### Step 3: Verify API Endpoints

```bash
# Get API documentation
curl -s http://YOUR_EC2_PUBLIC_IP:8000/docs | head -50

# Get current user info (after logging in, you'll receive a session cookie)
# This requires authentication; normally done through the web UI

# List all charge points
curl -s http://YOUR_EC2_PUBLIC_IP:8000/api/cps

# Expected output (if no charge points connected yet):
# {"connected": []}

# Get users (requires auth - shown for reference)
# curl -s -H "Cookie: session=YOUR_SESSION_COOKIE" \
#   http://YOUR_EC2_PUBLIC_IP:8000/api/users/map
```

### Step 4: Check Data Persistence

```bash
# Verify data files are being created
ssh -i YOUR_KEY.pem ec2-user@YOUR_EC2_IP

# On the instance:
ls -lah ~/projects/ocpp_projekt_rollback5/evcsms/data/

# Expected to see:
# -rw-r--r-- config/
# -rw-r--r-- transactions.json
# -rw-r--r-- config/users.json
# -rw-r--r-- config/orgs.json
# -rw-r--r-- config/cps.json
# -rw-r--r-- config/auth_tags.json

# Check file contents
cat ~/projects/ocpp_projekt_rollback5/evcsms/data/config/users.json

# Note: ~/ expands to /home/ec2-user on Amazon Linux
```

### Step 5: Test WebSocket Connection

```bash
# From your EC2 instance, test the OCPP WebSocket port

# Check if port is listening
netstat -tuln | grep 9000

# Test with a simple TCP connection
telnet localhost 9000

# Or use nc
nc -zv localhost 9000

# Expected output:
# Connection to localhost 9000 port [tcp/*] succeeded!
```

### Step 6: Monitor Container Health

```bash
# Check container health status
docker ps

# Look for "healthy" status in HEALTH column

# Run detailed health checks
docker inspect --format='{{.State.Health}}' ocpp_projekt_rollback5-api-service

# View specific container details
docker inspect redis-service

# Get container resource usage
docker stats ocpp_projekt_rollback5-api-service --no-stream
```

---

## 11. Monitoring & Maintenance

### Step 1: Set Up Log Monitoring

```bash
# Create a log monitoring script
cat > ~/monitor_logs.sh << 'EOF'
#!/bin/bash

# Monitor logs for errors
echo "=== Last 20 error entries ==="
docker compose logs --tail 100 | grep -i "error\|critical\|fatal" | tail -20

echo ""
echo "=== Last 20 warning entries ==="
docker compose logs --tail 100 | grep -i "warning" | tail -20

echo ""
echo "=== Container status ==="
docker ps

echo ""
echo "=== Resource usage ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
EOF

chmod +x ~/monitor_logs.sh

# Run monitoring script
~/monitor_logs.sh
```

### Step 2: Set Up Automated Backups

```bash
# Create backup script
cat > ~/backup_csms.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/home/ec2-user/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
SERVICE_DIR="/home/ec2-user/projects/ocpp_projekt_rollback5/evcsms"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup data and configuration
tar -czf "$BACKUP_DIR/ev-csms-backup-$DATE.tar.gz" \
    -C "$SERVICE_DIR" data/

# Keep only last 7 backups
cd $BACKUP_DIR
ls -t ev-csms-backup-*.tar.gz | tail -n +8 | xargs -r rm --

# Backup Redis data
docker exec redis-service redis-cli --rdb /data/backup-$DATE.rdb

echo "Backup completed: $BACKUP_DIR/ev-csms-backup-$DATE.tar.gz"
EOF

chmod +x ~/backup_csms.sh

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# Run backup
~/backup_csms.sh

# Schedule automatic daily backups with cron
crontab -e

# Add this line to run backup daily at 2:00 AM:
# 0 2 * * * /home/ec2-user/backup_csms.sh
```

### Step 3: Monitor System Resources

```bash
# Check system resources
df -h                    # Disk usage
free -h                  # Memory usage
top -bn1 | head -20      # CPU usage

# Monitor Docker resources
docker stats --no-stream

# Expected output:
# CONTAINER ID  NAME              CPU %  MEM USAGE / LIMIT    MEM %
# xxxxxxxxx     ocpp-ws-service   0.1%   120MiB / 4GiB        3%
# xxxxxxxxx     api-service       0.2%   150MiB / 4GiB        3%
# xxxxxxxxx     redis-service     0.0%   50MiB / 4GiB         1%
# xxxxxxxxx     ui-service        0.0%   30MiB / 4GiB         0%
```

### Step 4: Regular Maintenance Tasks

**Weekly:**
```bash
# Clean up unused Docker objects
docker system prune -f

# Check logs for warnings/errors
docker compose logs | grep -i "warning\|error" | tail -20
```

**Monthly:**
```bash
# Backup important data
~/backup_csms.sh

# Check for available updates
docker pull python:3.11-slim
docker pull redis:7-alpine
docker pull nginx:1.25-alpine

# Review data usage
du -sh ~/projects/ocpp_projekt_rollback5/evcsms/data/
```

**Quarterly:**
```bash
# Update OS packages (Amazon Linux uses yum)
sudo yum update -y
sudo yum upgrade -y

# Restart services
docker compose down
docker compose up -d

# Verify everything still works
curl -s http://localhost/ui/login.html > /dev/null && echo "UI OK"
curl -s http://localhost:8000/docs > /dev/null && echo "API OK"
```

### Step 5: Set Up Monitoring Alerts

```bash
# Create alert script for critical issues
cat > ~/monitor_alerts.sh << 'EOF'
#!/bin/bash

ALERT_EMAIL="your-email@example.com"

# Check if all services are running
RUNNING=$(docker ps | grep -E "api-service|ocpp-ws|ui-service|redis" | wc -l)

if [ $RUNNING -ne 4 ]; then
    echo "ALERT: Not all services are running!" | \
    mail -s "EV CSMS Alert: Service Down" $ALERT_EMAIL
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "ALERT: Disk usage at ${DISK_USAGE}%" | \
    mail -s "EV CSMS Alert: Disk Space Low" $ALERT_EMAIL
fi

# Check memory usage
MEM_PERCENT=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')
if [ $MEM_PERCENT -gt 85 ]; then
    echo "ALERT: Memory usage at ${MEM_PERCENT}%" | \
    mail -s "EV CSMS Alert: High Memory Usage" $ALERT_EMAIL
fi
EOF

chmod +x ~/monitor_alerts.sh

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# Add to crontab to run every 5 minutes
# */5 * * * * /home/ec2-user/monitor_alerts.sh
```

---

## 12. Troubleshooting Guide

### Issue 1: Cannot Connect to Instance via SSH

**Symptoms:**
```
ssh: connect to host 54.123.45.67 port 22: Connection refused
```

**Solutions:**

```bash
# 1. Verify instance is running
aws ec2 describe-instances --instance-ids i-xxxxxxxxx \
  --query 'Reservations[0].Instances[0].State.Name'

# 2. Check if security group allows SSH
aws ec2 describe-security-groups --group-ids sg-xxxxxxxxx | \
  grep -A 20 "IpPermissions"

# 3. Verify key file permissions
ls -l ~/.ssh/ev-csms-key.pem
# Should show: -rw------- (600)

# 4. Try with verbose output to debug
ssh -vvv -i ev-csms-key.pem ubuntu@54.123.45.67

# 5. Wait a few minutes for instance to fully boot
sleep 60 && ssh -i ev-csms-key.pem ubuntu@54.123.45.67
```

### Issue 2: Docker Services Won't Start

**Symptoms:**
```
Error response from daemon: pull access denied for ocpp_projekt_rollback5-api-service
```

**Solutions:**

```bash
# 1. Check if Docker daemon is running
sudo systemctl status docker

# 2. Start Docker if stopped
sudo systemctl start docker

# 3. Rebuild images
cd ~/projects/ocpp_projekt_rollback5/evcsms
docker compose down
docker compose build --no-cache

# 4. Check for sufficient disk space
df -h /var/lib/docker

# 5. Increase Docker log size limit in daemon.json
sudo nano /etc/docker/daemon.json

# Add these options:
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# Restart Docker
sudo systemctl restart docker
```

### Issue 3: Services Are Running But Dashboard Not Accessible

**Symptoms:**
```
curl: (7) Failed to connect to 54.123.45.67 port 80: Connection refused
```

**Solutions:**

```bash
# 1. Check if services are actually running
docker ps

# 2. Check service-specific logs
docker logs ui-service
docker logs api-service
docker logs ocpp-ws-service

# 3. Check firewall (Amazon Linux uses firewalld by default)
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --permanent --add-port=9000/tcp
sudo firewall-cmd --reload

# 4. Check AWS security group
aws ec2 describe-security-groups --group-ids sg-xxxxxxxxx | \
  grep -A 30 "IpPermissions"

# 5. Test local connectivity (from inside instance)
ssh -i ev-csms-key.pem ec2-user@YOUR_IP
curl -v http://localhost/

# 6. Check if ports are actually listening (Amazon Linux includes ss command)
ss -tuln | grep -E "80|8000|9000"

# Or use netstat if available
netstat -tuln | grep -E "80|8000|9000"
```

### Issue 4: API Service Crashes on Startup

**Symptoms:**
```
api-service exited with code 1
```

**Solutions:**

```bash
# 1. Check detailed logs
docker logs api-service

# 2. Look for common errors
docker logs api-service | grep -i "error\|traceback"

# 3. Common fixes:

# - Redis connection issue
docker logs redis-service

# - Port already in use
ss -tuln | grep 8000
# If something is using port 8000, kill it:
sudo fuser -k 8000/tcp

# - Missing environment variables
cat ~/projects/ocpp_projekt_rollback5/evcsms/.env

# - Python import errors (rebuild images)
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. Increase container resource limits
docker update --memory=2g api-service
docker update --memory=1g ocpp-ws-service
```

### Issue 5: WebSocket Connection Fails

**Symptoms:**
```
WebSocket connection to 'ws://54.123.45.67:9000/test' failed
```

**Solutions:**

```bash
# 1. Check if OCPP service is running
docker ps | grep ocpp-ws

# 2. Check if port is listening
netstat -tuln | grep 9000

# 3. Test websocket locally
ssh -i ev-csms-key.pem ubuntu@54.123.45.67

# Inside instance:
wscat -c ws://localhost:9000/test-charger

# (if wscat not installed: npm install -g wscat)

# 4. Check service logs
docker logs ocpp-ws-service | tail -50

# 5. Verify firewall allows port 9000
sudo ufw status | grep 9000

# 6. Test from outside with curl (to verify port is open)
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://54.123.45.67:9000/test

# 7. Firewall rules in security group
aws ec2 describe-security-groups --group-ids sg-xxxxxxxxx | \
  grep -A 30 "9000"

# If port 9000 is not in the rules, add it
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp --port 9000 --cidr 0.0.0.0/0
```

### Issue 6: High Memory or CPU Usage

**Symptoms:**
```
docker stats shows: api-service CPU 45% MEM 1.2GB
```

**Solutions:**

```bash
# 1. Check what's consuming resources
docker top api-service

# 2. Check for memory leaks
docker inspect api-service | grep -i memory

# 3. Scale down resources (for dev environment)
docker update --memory=512m api-service
docker update --cpus=0.5 api-service

# 4. Restart service to free memory
docker restart api-service

# 5. Check for excessive logging
docker logs api-service | wc -l

# If logs are huge, clean them
docker logs --tail 1000 api-service > ~/logs-backup.txt
# Then truncate Docker log files (as root):
sudo sh -c 'echo "" > $(docker inspect --format='{{.LogPath}}' api-service)'

# 6. Optimize application (check app/main.py for loops/memory leaks)
# This requires code review and modification
```

### Issue 7: Data Not Persisting

**Symptoms:**
```
Data is lost after restarting containers
```

**Solutions:**

```bash
# 1. Check if volumes are mounted correctly
docker inspect api-service | grep -A 5 Mounts

# 2. Verify data directory exists and has permissions
ls -la ~/projects/ocpp_projekt_rollback5/evcsms/data/

# 3. Check volume in docker-compose.yml
cat docker-compose.yml | grep -A 5 "volumes:"

# 4. Don't use 'docker compose down -v' (deletes volumes!)
# Use instead:
docker compose down  # This preserves volumes

# 5. Manually restore backup if data lost
tar -xzf ~/backups/ev-csms-backup-2026-03-17.tar.gz \
  -C ~/projects/ocpp_projekt_rollback5/evcsms/

# 6. Check Redis persistence
docker exec redis-service redis-cli BGSAVE
docker exec redis-service redis-cli LASTSAVE
```

---

## 13. Backup & Recovery

### Step 1: Automated Backup Strategy

**Create comprehensive backup script:**

```bash
cat > ~/comprehensive_backup.sh << 'EOF'
#!/bin/bash

set -e

# Configuration
BACKUP_BASE="/home/ec2-user/backups"
SERVICE_DIR="/home/ec2-user/projects/ocpp_projekt_rollback5/evcsms"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_BASE"

echo "[$(date)] Starting comprehensive backup..."

# 1. Backup application data
echo "[$(date)] Backing up application data..."
tar -czf "$BACKUP_BASE/data-$DATE.tar.gz" \
    --exclude='__pycache__' \
    -C "$SERVICE_DIR" data/

# 2. Backup configuration
echo "[$(date)] Backing up configuration..."
tar -czf "$BACKUP_BASE/config-$DATE.tar.gz" \
    -C "$SERVICE_DIR" config/

# 3. Backup web files
echo "[$(date)] Backing up web UI files..."
tar -czf "$BACKUP_BASE/web-$DATE.tar.gz" \
    -C "$SERVICE_DIR" web/

# 4. Backup environment
echo "[$(date)] Backing up environment..."
cp "$SERVICE_DIR/.env" "$BACKUP_BASE/.env-$DATE"

# 5. Backup Redis data
echo "[$(date)] Backing up Redis..."
docker exec redis-service redis-cli --rdb /backup-$DATE.rdb
docker cp redis-service:/backup-$DATE.rdb "$BACKUP_BASE/redis-$DATE.rdb"

# 6. Backup Docker Compose configuration
echo "[$(date)] Backing up Docker configuration..."
cp "$SERVICE_DIR/docker-compose.yml" "$BACKUP_BASE/docker-compose-$DATE.yml"
cp "$SERVICE_DIR/Dockerfile" "$BACKUP_BASE/Dockerfile-$DATE"

# 7. Clean up old backups (keep only last 30 days)
echo "[$(date)] Cleaning old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_BASE" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_BASE" -name ".env-*" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_BASE" -name "redis-*.rdb" -mtime +$RETENTION_DAYS -delete

# 8. Create checksums
echo "[$(date)] Creating checksums..."
sha256sum "$BACKUP_BASE"/*-$DATE.* > "$BACKUP_BASE/checksums-$DATE.txt"

# 9. Report
echo "[$(date)] Backup completed successfully!"
echo "Backup location: $BACKUP_BASE"
du -sh "$BACKUP_BASE"

# Optional: Upload to S3
# aws s3 cp "$BACKUP_BASE" "s3://your-backup-bucket/" --recursive

EOF

chmod +x ~/comprehensive_backup.sh

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# Test the script
~/comprehensive_backup.sh

# Verify backups were created
ls -lah ~/backups/
```

### Step 2: Scheduled Automated Backups

```bash
# Edit crontab to schedule backups
crontab -e

# Add these lines for daily backup at 2 AM
0 2 * * * /home/ubuntu/comprehensive_backup.sh >> /home/ubuntu/backup.log 2>&1

# Add weekly backup to S3 at 3 AM every Sunday
0 3 * * 0 /home/ubuntu/backup_to_s3.sh >> /home/ubuntu/backup-s3.log 2>&1

# Check crontab
crontab -l
```

### Step 3: Remote Backup to AWS S3

```bash
# Install AWS CLI on Amazon Linux
sudo yum install -y aws-cli

# Configure AWS credentials (use IAM role if on EC2)
aws configure

# OR use IAM role (recommended for EC2)
# Attach policy to EC2 instance role

# Create S3 backup script
cat > ~/backup_to_s3.sh << 'EOF'
#!/bin/bash

BUCKET_NAME="your-backup-bucket"
SERVICE_DIR="/home/ec2-user/projects/ocpp_projekt_rollback5/evcsms"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Create local backup
mkdir -p /tmp/ev-csms-backup
tar -czf /tmp/ev-csms-backup/data-$DATE.tar.gz \
    -C "$SERVICE_DIR" data/

# Upload to S3
aws s3 cp /tmp/ev-csms-backup/data-$DATE.tar.gz \
    s3://$BUCKET_NAME/ev-csms-backups/data-$DATE.tar.gz

# Cleanup local backup
rm -rf /tmp/ev-csms-backup

echo "Backup uploaded to S3"
EOF

chmod +x ~/backup_to_s3.sh

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# Test S3 backup
~/backup_to_s3.sh
```

### Step 4: Recovery Procedures

**Scenario 1: Recover from Local Backup**

```bash
# 1. Stop services
docker compose down

# 2. Remove corrupted data
rm -rf ~/projects/ocpp_projekt_rollback5/evcsms/data/*

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# 3. Extract backup
cd ~/projects/ocpp_projekt_rollback5/evcsms
tar -xzf ~/backups/data-2026-03-17_02-00-00.tar.gz

# 4. Restart services
docker compose up -d

# 5. Verify restoration
docker compose logs | grep -i error
curl http://localhost/ui/login.html
```

**Scenario 2: Recover from S3 Backup**

```bash
# 1. Stop services
docker compose down

# 2. List available backups in S3
aws s3 ls s3://your-backup-bucket/ev-csms-backups/

# 3. Download specific backup
aws s3 cp s3://your-backup-bucket/ev-csms-backups/data-2026-03-17_02-00-00.tar.gz \
    ~/data-restore.tar.gz

# Note: ~/ expands to /home/ec2-user on Amazon Linux

# 4. Remove current data
rm -rf ~/projects/ocpp_projekt_rollback5/evcsms/data/*

# 5. Extract backup
cd ~/projects/ocpp_projekt_rollback5/evcsms
tar -xzf ~/data-restore.tar.gz

# 6. Restart services
docker compose up -d

# 7. Verify
docker ps
curl http://localhost/ui/login.html
```

**Scenario 3: Disaster Recovery (Full System Restore)**

```bash
# 1. Launch new EC2 instance (follow Section 3)

# 2. Connect via SSH
ssh -i ev-csms-key.pem ec2-user@YOUR_NEW_IP

# 3. Repeat installation steps (Sections 4-6)

# 4. From S3 backup, restore environment
aws s3 cp s3://your-backup-bucket/ev-csms-backups/.env-latest .env

# 5. Restore all data
aws s3 cp s3://your-backup-bucket/ev-csms-backups/data-latest.tar.gz .
tar -xzf data-latest.tar.gz

# 6. Rebuild and restart
docker compose build --no-cache
docker compose up -d

# 7. Verify services
docker ps
curl http://YOUR_NEW_IP/
```

---

## Quick Reference Guide

### Common Commands

```bash
# Service Management
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose restart            # Restart all services
docker compose rebuild            # Rebuild images

# Monitoring
docker ps                         # List running containers
docker logs api-service           # View service logs
docker stats                      # Real-time resource usage
docker compose logs -f            # Follow all logs

# Backup & Restore
~/comprehensive_backup.sh         # Create full backup
~/backup_to_s3.sh                # Backup to S3
tar -xzf backup.tar.gz           # Restore from backup

# Troubleshooting
docker inspect api-service        # Get container details
docker exec api-service bash      # Shell into container
docker ps --all                   # Show all containers (including stopped)
docker system prune -f            # Clean up unused resources
```

### AWS Management

```bash
# EC2 Operations
aws ec2 describe-instances        # List instances
aws ec2 reboot-instances          # Reboot instance
aws ec2 stop-instances            # Stop instance
aws ec2 start-instances           # Start instance
aws ec2 terminate-instances       # Delete instance

# Security Group Management
aws ec2 describe-security-groups   # List security groups
aws ec2 authorize-security-group-ingress   # Add inbound rule
aws ec2 revoke-security-group-ingress      # Remove inbound rule

# S3 Operations
aws s3 ls                         # List buckets
aws s3 cp file s3://bucket        # Upload file
aws s3 cp s3://bucket/file .      # Download file
```

### Network Diagnostics

```bash
# Port Testing
netstat -tuln | grep PORT         # Check if port listening
ss -tuln | grep PORT              # Modern ss command (preferred)
telnet localhost 8000             # Test connection
curl http://localhost:8000        # Test HTTP endpoint

# Firewall - Amazon Linux 2 (firewalld)
sudo firewall-cmd --list-all      # Check firewall rules
sudo firewall-cmd --permanent --add-port=PORT/tcp    # Allow port
sudo firewall-cmd --permanent --remove-port=PORT/tcp # Block port
sudo firewall-cmd --reload        # Apply changes

# Alternative - iptables (if firewalld not used)
sudo iptables -L                  # Check iptables rules
sudo iptables -A INPUT -p tcp --dport PORT -j ACCEPT  # Allow port
sudo iptables-save                # Save rules
```

---

## Support & Additional Resources

### Useful Links

- **OCPP Protocol:** https://www.openchargealliance.org/
- **FastAPI Documentation:** https://fastapi.tiangolo.com/
- **Docker Documentation:** https://docs.docker.com/
- **AWS EC2 Guide:** https://docs.aws.amazon.com/ec2/
- **Amazon Linux 2 Guide:** https://docs.aws.amazon.com/amazon-linux-2/

### Getting Help

1. **Check logs first:** `docker compose logs | grep -i error`
2. **Consult troubleshooting guide** (Section 12)
3. **Review configuration** (Section 6)
4. **Test connectivity** (network diagnostics above)

### Contact & Escalation

For issues beyond this manual:
1. Check GitHub repository for issues
2. Review application code in `/home/ec2-user/projects/ocpp_projekt_rollback5/evcsms/app/`
3. Contact system administrator or DevOps team

---

## Appendix A: Complete Deployment Checklist

- [ ] AWS EC2 instance launched with Amazon Linux 2 (t3.medium or larger)
- [ ] Security groups configured for ports 22, 80, 8000, 9000
- [ ] SSH key downloaded and permissions set (600)
- [ ] SSH connection established to instance as ec2-user
- [ ] Git repository cloned from GitHub
- [ ] Docker and Docker Compose installed via amazon-linux-extras
- [ ] `.env` file created with secure passwords
- [ ] Data directories initialized
- [ ] Docker images built successfully
- [ ] All services started and running
- [ ] UI dashboard accessible and login works
- [ ] API endpoints responding correctly
- [ ] OCPP WebSocket port verified listening
- [ ] Backups configured and tested
- [ ] Monitoring scripts in place
- [ ] Firewall (firewalld) rules verified
- [ ] SSL/TLS configured (if using custom domain)
- [ ] Charge points can successfully register

---

## Appendix B: Amazon Linux 2 Specific Information

### Key Differences from Ubuntu

This manual has been updated to reflect Amazon Linux 2 (AL2) specifications. Here are the key differences you should be aware of:

#### 1. Default User

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Default User | `ubuntu` | `ec2-user` |
| SSH Command | `ssh -i key.pem ubuntu@IP` | `ssh -i key.pem ec2-user@IP` |
| Home Directory | `/home/ubuntu` | `/home/ec2-user` |
| Tilde Expansion (~) | `/home/ubuntu` | `/home/ec2-user` |

#### 2. Package Manager

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Package Manager | `apt-get` / `apt` | `yum` / `dnf` |
| Update Command | `apt-get update` | `yum update -y` |
| Install Package | `apt-get install -y <pkg>` | `yum install -y <pkg>` |
| Search Package | `apt-cache search <pkg>` | `yum search <pkg>` |
| Remove Package | `apt-get remove <pkg>` | `yum remove <pkg>` |

#### 3. Firewall Management

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Default Firewall | UFW (Uncomplicated Firewall) | firewalld |
| Enable Firewall | `sudo ufw enable` | `sudo systemctl start firewalld` |
| Add Rule | `sudo ufw allow 80/tcp` | `sudo firewall-cmd --permanent --add-port=80/tcp` |
| Check Status | `sudo ufw status` | `sudo firewall-cmd --list-all` |
| Reload Rules | `ufw` auto-reloads | `sudo firewall-cmd --reload` |

#### 4. Docker Installation

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Installation Method | Official Docker repo | Amazon Linux Extras (simplest) |
| Install Command | `curl + apt-get` | `amazon-linux-extras install docker` |
| Service Name | `docker` | `docker` |
| Enable on Boot | `systemctl enable docker` | `systemctl enable docker` |

#### 5. Network Utilities

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Modern Tools | `ss` (preferred) | `ss` (available) |
| Legacy Tools | `netstat` (available) | `netstat` (available) |
| Install netstat | Via `net-tools` | Via `net-tools` |

#### 6. Nginx Configuration

| Aspect | Ubuntu | Amazon Linux 2 |
|--------|--------|----------------|
| Config Directory | `/etc/nginx/sites-available/` | `/etc/nginx/conf.d/` |
| Config Format | Create symlink in `sites-enabled/` | Drop `.conf` file in `conf.d/` |
| Install Command | `apt-get install -y nginx` | `yum install -y nginx` |

#### 7. SELinux Considerations

Amazon Linux 2 comes with SELinux available (but not always enabled by default). If you encounter permission issues:

```bash
# Check SELinux status
getenforce

# Temporarily disable (for debugging)
sudo setenforce 0

# Permanently disable (edit /etc/selinux/config)
sudo nano /etc/selinux/config
# Change: SELINUX=disabled

# View SELinux denied messages
sudo grep denied /var/log/audit/audit.log
```

### Common Amazon Linux 2 Commands

```bash
# Check Amazon Linux version
cat /etc/os-release
cat /etc/amazon-linux-release

# View available extras
amazon-linux-extras list

# Install from extras
sudo amazon-linux-extras install -y <name>

# Install EPEL (Extra Packages for Enterprise Linux)
sudo amazon-linux-extras install -y epel

# View installed packages
yum list installed

# Check service status (systemd)
sudo systemctl status docker

# Enable service at boot
sudo systemctl enable docker

# View systemd logs
sudo journalctl -u docker -f

# Check system info
hostnamectl
uname -a
```

### Troubleshooting Amazon Linux 2 Specific Issues

#### Issue: "amazon-linux-extras: command not found"

This means you're on a newer version of Amazon Linux 2 that uses `dnf` instead of `yum`. Use:

```bash
sudo dnf install -y docker
sudo systemctl start docker
```

#### Issue: SELinux Permission Denied

If Docker containers can't write to mounted volumes:

```bash
# Check if SELinux is enabled
getenforce

# Temporarily disable
sudo setenforce 0

# Or fix permissions with chcon
sudo chcon -R -u system_u -r object_r -t container_file_t /path/to/data
```

#### Issue: "No space left on device"

Amazon Linux 2 has limited disk space by default. Check and expand:

```bash
# Check disk usage
df -h

# Find large directories
du -sh /* | sort -h

# Expand EBS volume (if applicable)
# This requires AWS console or CLI operations
```

#### Issue: Docker daemon won't start

```bash
# Check logs
sudo journalctl -u docker -f

# Check for conflicts with other container runtimes
ps aux | grep docker

# Clear Docker state and restart
sudo systemctl stop docker
sudo rm -rf /var/lib/docker/*
sudo systemctl start docker
```

### Performance Tuning for Amazon Linux 2

```bash
# Increase file descriptors
sudo nano /etc/security/limits.conf
# Add:
# ec2-user soft nofile 65536
# ec2-user hard nofile 65536

# Increase Docker resource limits
sudo nano /etc/sysctl.conf
# Add:
# vm.max_map_count=262144
# net.ipv4.ip_local_port_range=1024 65535
# net.ipv4.tcp_fin_timeout=30

# Apply changes
sudo sysctl -p
```

### AWS-Specific Integration

#### Using IAM Role for S3 Access (Recommended)

Instead of storing AWS credentials, use an IAM role:

```bash
# Check current IAM role
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/

# No configuration needed! AWS CLI uses role automatically
aws s3 ls

# Verify which role is active
aws sts get-caller-identity
```

#### EC2 Instance Metadata

```bash
# Get instance metadata
curl http://169.254.169.254/latest/meta-data/

# Get specific info
curl http://169.254.169.254/latest/meta-data/instance-id
curl http://169.254.169.254/latest/meta-data/instance-type
curl http://169.254.169.254/latest/meta-data/availability-zone
```

#### CloudWatch Integration

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure and start agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s
```

### Amazon Linux 2 System Services

```bash
# Common services
systemctl list-units --type=service

# Docker-related services
sudo systemctl list-unit-files | grep docker

# Enable Docker to start on reboot
sudo systemctl enable docker

# Start on reboot
sudo systemctl enable docker
sudo systemctl restart docker

# View system logs
sudo journalctl -xe

# Follow logs in real-time
sudo journalctl -f
```

### Additional Resources for Amazon Linux 2

- **Amazon Linux 2 Documentation:** https://docs.aws.amazon.com/amazon-linux-2/
- **Amazon Linux Extras:** https://docs.aws.amazon.com/amazon-linux-2/user-guide/amazon-linux-2-basics.html
- **firewalld Documentation:** https://firewalld.org/documentation/
- **yum Package Manager:** https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system_administrators_guide/chap-working_with_yum

---

## Document Information

**Version:** 2.0 (Amazon Linux 2 Edition)  
**Last Updated:** March 17, 2026  
**Operating System:** Amazon Linux 2 (AL2)  
**Status:** Complete and Production-Ready  
**For Questions:** Refer to the troubleshooting guide or Appendix B (Amazon Linux 2 Specific Information)

---

**END OF MANUAL - Amazon Linux 2 Edition**

