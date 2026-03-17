#!/bin/bash

# EV CSMS - Microservices Runner
# This script helps run the microservices architecture locally

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

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed.${NC}"
    exit 1
fi

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
    echo "  $0 up          # Start the entire stack"
    echo "  $0 logs api    # Show logs for API service only"
}

# Main logic
case "${1:-up}" in
    "up")
        echo -e "${YELLOW}Starting all services...${NC}"
        docker-compose up -d
        echo -e "${GREEN}Services started!${NC}"
        echo ""
        echo "Access URLs:"
        echo "  Web UI:     http://localhost/"
        echo "  API:        http://localhost:8000"
        echo "  OCPP WS:    ws://localhost:9000"
        echo "  Redis:      localhost:6379"
        echo ""
        echo "To view logs: $0 logs"
        echo "To stop:      $0 down"
        ;;

    "down")
        echo -e "${YELLOW}Stopping all services...${NC}"
        docker-compose down
        echo -e "${GREEN}Services stopped.${NC}"
        ;;

    "build")
        echo -e "${YELLOW}Building all services...${NC}"
        docker-compose build --no-cache
        echo -e "${GREEN}Build complete.${NC}"
        ;;

    "logs")
        if [ -n "$2" ]; then
            docker-compose logs -f "$2"
        else
            docker-compose logs -f
        fi
        ;;

    "restart")
        echo -e "${YELLOW}Restarting all services...${NC}"
        docker-compose restart
        echo -e "${GREEN}Services restarted.${NC}"
        ;;

    "clean")
        echo -e "${YELLOW}Removing all containers and volumes...${NC}"
        docker-compose down -v --remove-orphans
        docker system prune -f
        echo -e "${GREEN}Cleanup complete.${NC}"
        ;;

    "kill")
        echo -e "${YELLOW}Killing all containers...${NC}"
        docker-compose down --remove-orphans
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
