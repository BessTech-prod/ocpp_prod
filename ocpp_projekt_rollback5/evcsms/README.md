# EV CSMS - Microservices Architecture

This project has been refactored from a monolithic FastAPI application into a microservices architecture suitable for AWS ECS Fargate deployment.

## Architecture Overview

The system is now split into four decoupled services:

1. **ocpp-ws-service** (Port 9000): Handles OCPP 1.6J WebSocket communication with charge points
2. **api-service** (Port 8000): Provides REST API endpoints for the web UI
3. **ui-service** (Port 80): Serves static web files (HTML, CSS, JS)
4. **redis-service** (Port 6379): Shared data store for session state and inter-service communication

## Quick Start Manual

### 🚀 Getting Started in 5 Minutes

1. **Clone and navigate to the project:**
   ```bash
   cd /path/to/ocpp_projekt_rollback4/evcsms
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings (optional - defaults will work)
   ```

3. **Start all services:**
   ```bash
   ./run.sh up
   ```

4. **Access your application:**
   - **Web Dashboard**: http://localhost/
   - **API Documentation**: http://localhost:8000/docs
   - **Default Login**: admin@takorama.se / sliceorama

5. **Stop when done:**
   ```bash
   ./run.sh kill
   ```

### 📋 Available Commands

| Command | Description |
|---------|-------------|
| `./run.sh up` | Start all services |
| `./run.sh down` | Stop all services |
| `./run.sh kill` | Stop and remove all containers |
| `./run.sh build` | Build all Docker images |
| `./run.sh logs` | Show logs from all services |
| `./run.sh logs api` | Show logs from specific service |
| `./run.sh restart` | Restart all services |
| `./run.sh clean` | Remove containers AND volumes (destructive) |

### 🔧 What Each Service Does

- **UI Service (Port 80)**: Web interface for managing charge points, users, and viewing statistics
- **API Service (Port 8000)**: REST API that handles all business logic and data operations
- **OCPP Service (Port 9000)**: WebSocket server that communicates with physical charge points using OCPP 1.6J protocol
- **Redis (Port 6379)**: In-memory database for caching, sessions, and real-time charge point status

### 🐛 Common Issues & Solutions

**Services won't start:**
```bash
# Check if Docker is running
docker info

# Check logs for errors
./run.sh logs
```

**Can't access web interface:**
- Ensure port 80 is not blocked by firewall
- Check if UI service is running: `docker ps | grep ui`

**Charge points can't connect:**
- Verify OCPP service is running on port 9000
- Check firewall settings for WebSocket connections

**Data not persisting:**
- Use `./run.sh down` instead of `./run.sh kill` to preserve volumes
- Check if Redis container has data volume mounted

**Performance issues:**
- Increase Docker memory allocation in Docker Desktop settings
- Monitor resource usage: `docker stats`

### 🔄 Development Workflow

1. **Make code changes** in the respective service directories
2. **Rebuild services**: `./run.sh build`
3. **Restart**: `./run.sh restart`
4. **Check logs**: `./run.sh logs [service-name]`
5. **Test your changes**

### 📁 Project Structure

```
evcsms/
├── docker/                 # Dockerfiles for each service
├── app/                    # Shared Python modules
├── web/                    # Static web files
├── ocpp_ws.py             # OCPP WebSocket service
├── api.py                 # REST API service
├── docker-compose.yml     # Local development setup
├── run.sh                 # Management script
├── .env.example          # Environment template
└── README.md             # This file
```

## Local Development

### Prerequisites
- Docker and Docker Compose
- Python 3.11+ (for local development without Docker)

### Running with Docker Compose

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access the services:**
   - Web UI: http://localhost/
   - API: http://localhost:8000
   - OCPP WebSocket: ws://localhost:9000
   - Redis: localhost:6379

### Environment Variables

Create a `.env` file in the project root:

```bash
# Redis
REDIS_PASSWORD=your-secure-password

# API Service
APP_SECRET=your-app-secret-key
API_PORT=8000

# OCPP Service
OCPP_PORT=9000
PORTAL_TAGS_GLOBAL=false

# Bootstrap admin (optional)
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=secure-password
```

## AWS ECS Fargate Deployment

### 1. Build and Push Docker Images

```bash
# Build images
docker build -f docker/Dockerfile.ocpp_ws -t your-ecr-repo/ocpp-ws:latest .
docker build -f docker/Dockerfile.api -t your-ecr-repo/api:latest .
docker build -f docker/Dockerfile.ui -t your-ecr-repo/ui:latest .

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-ecr-repo
docker push your-ecr-repo/ocpp-ws:latest
docker push your-ecr-repo/api:latest
docker push your-ecr-repo/ui:latest
```

### 2. Create ECS Task Definitions

Use the provided JSON templates in `ecs-task-*.json` files. Update the ECR repository URLs and create the task definitions in AWS ECS.

### 3. Create ECS Services

Create separate ECS services for each task definition:
- `ocpp-ws-service`: Desired count based on expected charge point connections
- `api-service`: Auto-scaling based on CPU/memory or request rate
- `ui-service`: Auto-scaling based on traffic

### 4. Configure Application Load Balancer

Create an ALB with the following rules:

- **Host-based routing:**
  - `ocpp.example.com` → `ocpp-ws-target-group` (Port 9000)
  - `api.example.com` → `api-target-group` (Port 8000)
  - `app.example.com` → `ui-target-group` (Port 80)

- **Target Groups:**
  - `ocpp-ws-target-group`: Protocol TCP, Port 9000
  - `api-target-group`: Protocol HTTP, Port 8000, Health check `/health`
  - `ui-target-group`: Protocol HTTP, Port 80, Health check `/`

### 5. DNS Configuration

Point your domains to the ALB:
- `ocpp.example.com` → ALB DNS name
- `api.example.com` → ALB DNS name
- `app.example.com` → ALB DNS name

## Service Communication

- **UI ↔ API**: The web UI makes AJAX calls to `/api/*` endpoints, which are routed by the ALB to the API service
- **API ↔ Redis**: Session data, charge point status, and active transactions are stored in Redis
- **OCPP ↔ Redis**: Charge point connections and status updates are tracked in Redis
- **Services are isolated**: No direct service-to-service communication; all coordination happens through Redis

## Scaling Benefits

- **Independent Scaling**: Scale OCPP service based on charge point count, API service based on user requests, UI service based on web traffic
- **Failure Isolation**: If one service fails, others continue operating
- **Resource Optimization**: Each service can use appropriate instance sizes
- **Deployment Independence**: Update services without affecting others

## Monitoring & Logging

- **CloudWatch Logs**: All services log to CloudWatch
- **CloudWatch Metrics**: ECS Container Insights provides CPU/memory metrics
- **Health Checks**: Each service has health check endpoints
- **Distributed Tracing**: Consider AWS X-Ray for request tracing across services

## Migration Notes

- **Data Persistence**: Transaction data is still stored in JSON files on persistent volumes
- **Session Management**: User sessions are now handled by the API service with Redis backing
- **Charge Point State**: Real-time CP status is stored in Redis for fast access
- **Backward Compatibility**: The API endpoints remain the same from the UI perspective

## Troubleshooting

- **Service Discovery**: Services communicate via Redis; ensure Redis connectivity
- **Health Checks**: Monitor `/health` endpoints for service status
- **Logs**: Check CloudWatch logs for detailed error information
- **Network**: Ensure ALB security groups allow traffic to service ports

For production deployment, consider:
- AWS Secrets Manager for sensitive configuration
- AWS RDS for transaction data (instead of JSON files)
- AWS ElastiCache for Redis in production
- AWS WAF for API protection
