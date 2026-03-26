#!/bin/bash

# EV CSMS - Deployment Runner
# Supported mode: multi-service Docker Compose stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}EV CSMS - Microservices Architecture${NC}"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Pick compose command (docker-compose or docker compose)
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    exit 1
fi

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ] && [ -f ".env.demo" ]; then
    ENV_FILE=".env.demo"
fi

COMPOSE_STACK="${COMPOSE_CMD} --env-file ${ENV_FILE} -f docker-compose.yml"

# Function to show usage
show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  up          Start all services"
    echo "  down        Stop all services"
    echo "  build       Build all services"
    echo "  logs        Show logs from all services"
    echo "  restart     Restart all services"
    echo "  clean       Remove all containers and volumes"
    echo "  kill        Stop and remove all containers without removing volumes"
    echo ""
    echo "Examples:"
    echo "  $0 up          # Start the localhost demo stack"
    echo "  $0 seed-demo   # Recreate demo sessions and demo users"
    echo "  $0 logs api    # Show logs for API service only"
}

# Main logic
case "${1:-up}" in
    "up")
        echo -e "${YELLOW}Starting all services...${NC}"
        echo "Using env file: ${ENV_FILE}"
        ${COMPOSE_STACK} up -d --remove-orphans
        echo -e "${GREEN}Services started!${NC}"
        echo ""
        echo "Access URLs:"
        echo "  UI:         http://localhost:8080"
        echo "  API:        http://localhost:8000"
        echo "  OCPP WS:    ws://localhost:9000"
        echo "  Health:     http://localhost:8080/health"
        echo ""
        # Demo logins removed for production
        echo "To view logs: $0 logs"
        echo "To stop:      $0 down"
        ;;

    # seed-demo command removed for production

    "down")
        echo -e "${YELLOW}Stopping all services...${NC}"
        ${COMPOSE_STACK} down --remove-orphans
        echo -e "${GREEN}Services stopped.${NC}"
        ;;

    "build")
        echo -e "${YELLOW}Building all services...${NC}"
        ${COMPOSE_STACK} build --no-cache
        echo -e "${GREEN}Build complete.${NC}"
        ;;

    "logs")
        if [ -n "$2" ]; then
            ${COMPOSE_STACK} logs -f "$2"
        else
            ${COMPOSE_STACK} logs -f
        fi
        ;;

    "restart")
        echo -e "${YELLOW}Restarting all services...${NC}"
        ${COMPOSE_STACK} restart
        echo -e "${GREEN}Services restarted.${NC}"
        ;;

    "clean")
        echo -e "${YELLOW}Removing all containers and volumes...${NC}"
        ${COMPOSE_STACK} down -v --remove-orphans
        docker system prune -f
        echo -e "${GREEN}Cleanup complete.${NC}"
        ;;

    "kill")
        echo -e "${YELLOW}Killing all containers...${NC}"
        ${COMPOSE_STACK} down --remove-orphans
        echo -e "${GREEN}All containers killed.${NC}"
        ;;

    "help"|"-h"|"--help")
        show_usage
        ;;

    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac
