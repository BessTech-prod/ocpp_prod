#!/bin/bash
#
# OUTAGE QUICK DIAGNOSTIC SCRIPT
# Usage: bash diagnose_outage.sh
#
# This script quickly identifies whether the outage was caused by:
# 1. Your program (application errors)
# 2. Service provider (infrastructure/network)
# 3. Configuration issues
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}EV CSMS - OUTAGE DIAGNOSTIC REPORT${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# 1. SERVICE STATUS
# ============================================
echo -e "${YELLOW}[1/6] Checking Service Status...${NC}"
echo ""

STATUS_OUTPUT=$(docker compose -f docker-compose.yml ps 2>/dev/null || echo "ERROR")

if [ "$STATUS_OUTPUT" = "ERROR" ]; then
    echo -e "${RED}✗ Cannot access docker-compose. Is Docker running?${NC}"
    echo "  Run: sudo systemctl start docker"
    exit 1
fi

echo "$STATUS_OUTPUT"
echo ""

# Count running services
RUNNING=$(echo "$STATUS_OUTPUT" | grep -i "Up" | wc -l)
TOTAL_SERVICES=5

if [ $RUNNING -eq $TOTAL_SERVICES ]; then
    echo -e "${GREEN}✓ All $TOTAL_SERVICES services running${NC}"
else
    echo -e "${RED}✗ Only $RUNNING/$TOTAL_SERVICES services running${NC}"
    echo -e "  ${YELLOW}Services might have crashed. Check restart policies.${NC}"
fi
echo ""

# ============================================
# 2. REDIS CONNECTIVITY
# ============================================
echo -e "${YELLOW}[2/6] Testing Redis Connectivity...${NC}"

if docker exec redis-service redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is responding${NC}"
    REDIS_INFO=$(docker exec redis-service redis-cli INFO server | grep redis_version | cut -d: -f2 | tr -d '\r')
    echo "  Version: $REDIS_INFO"
else
    echo -e "${RED}✗ Redis is NOT responding${NC}"
    echo -e "  ${YELLOW}This causes complete system failure.${NC}"
    echo ""
    echo "  Trying to restart Redis..."
    docker restart redis-service 2>/dev/null || echo "  Failed to restart"
    sleep 2
    if docker exec redis-service redis-cli ping > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Redis restarted successfully${NC}"
    else
        echo -e "  ${RED}✗ Redis still not responding - CHECK PROVIDER${NC}"
    fi
fi
echo ""

# ============================================
# 3. API HEALTH CHECK
# ============================================
echo -e "${YELLOW}[3/6] Testing API Health Endpoint...${NC}"

API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "000")

if [ "$API_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ API is responding (HTTP $API_RESPONSE)${NC}"
    curl -s http://localhost:8000/health | jq . 2>/dev/null | head -10
else
    echo -e "${RED}✗ API not responding (HTTP $API_RESPONSE)${NC}"
    echo -e "  ${YELLOW}Checking API service logs...${NC}"
    echo ""
    docker logs --tail=20 api-service 2>&1 | tail -10
fi
echo ""

# ============================================
# 4. ERROR LOG ANALYSIS
# ============================================
echo -e "${YELLOW}[4/6] Analyzing Error Logs...${NC}"
echo ""

SERVICES=("api-service" "ocpp-ws-service" "redis-service" "backup-service")
ERROR_FOUND=0

for SERVICE in "${SERVICES[@]}"; do
    ERROR_COUNT=$(docker logs --tail=200 $SERVICE 2>&1 | grep -i "error\|exception\|failed\|crashed" | wc -l)
    if [ $ERROR_COUNT -gt 0 ]; then
        ERROR_FOUND=1
        echo -e "${RED}$SERVICE: Found $ERROR_COUNT error(s)${NC}"
        echo "  Recent errors:"
        docker logs --tail=50 $SERVICE 2>&1 | grep -i "error\|exception\|failed\|crashed" | head -3 | sed 's/^/  /'
    fi
done

if [ $ERROR_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ No critical errors found in logs${NC}"
fi
echo ""

# ============================================
# 5. CHARGER CONNECTIVITY
# ============================================
echo -e "${YELLOW}[5/6] Checking Charger Connections...${NC}"

CHARGER_COUNT=$(curl -s http://localhost:8000/api/status 2>/dev/null | jq '.connected | length' 2>/dev/null || echo "ERROR")

if [ "$CHARGER_COUNT" != "ERROR" ]; then
    echo -e "${GREEN}✓ Currently connected chargers: $CHARGER_COUNT${NC}"
    if [ "$CHARGER_COUNT" = "0" ]; then
        echo "  ${YELLOW}Warning: No chargers connected. Check network connectivity.${NC}"
    fi
else
    echo -e "${YELLOW}? Cannot determine charger status${NC}"
fi
echo ""

# ============================================
# 6. RESOURCE USAGE
# ============================================
echo -e "${YELLOW}[6/6] Checking Resource Usage...${NC}"
echo ""

echo "Memory Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" 2>/dev/null | grep -E "api-service|ocpp-ws-service|redis-service" || echo "  Could not retrieve stats"

echo ""
echo "Disk Usage:"
DF_OUTPUT=$(df -h /data 2>/dev/null | tail -1)
echo "  $DF_OUTPUT"

DISK_PERCENT=$(echo "$DF_OUTPUT" | awk '{print $5}' | tr -d '%')
if [ "$DISK_PERCENT" -gt 90 ]; then
    echo -e "  ${RED}✗ Disk usage is critically high ($DISK_PERCENT%)${NC}"
elif [ "$DISK_PERCENT" -gt 80 ]; then
    echo -e "  ${YELLOW}⚠ Disk usage is high ($DISK_PERCENT%)${NC}"
else
    echo -e "  ${GREEN}✓ Disk usage is normal ($DISK_PERCENT%)${NC}"
fi

echo ""
echo "Data Directory Size:"
du -sh /home/hugo/PycharmProjects/ocpp_prod-main/ocpp_projekt2.0/evcsms/data 2>/dev/null | sed 's/^/  /'

echo ""

# ============================================
# DIAGNOSIS SUMMARY
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DIAGNOSTIC SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

DIAGNOSIS=""

if [ "$API_RESPONSE" = "200" ] && [ "$CHARGER_COUNT" != "0" ] && [ $ERROR_FOUND -eq 0 ]; then
    DIAGNOSIS="✓ SYSTEM APPEARS HEALTHY - Outage may have been temporary"
elif [ "$API_RESPONSE" != "200" ] && [ $ERROR_FOUND -gt 0 ]; then
    DIAGNOSIS="⚠ PROGRAM ERROR - Check above error logs and review code"
elif [ "$API_RESPONSE" = "000" ] || [ "$CHARGER_COUNT" = "0" ]; then
    DIAGNOSIS="⚠ NETWORK/CONNECTIVITY ISSUE - Check SERVICE PROVIDER firewall settings"
else
    DIAGNOSIS="? UNCLEAR - See detailed logs below"
fi

echo -e "$DIAGNOSIS"
echo ""

# ============================================
# NEXT STEPS
# ============================================
echo -e "${BLUE}RECOMMENDED NEXT STEPS:${NC}"
echo ""

if [ "$API_RESPONSE" != "200" ]; then
    echo "1. Restart the API service:"
    echo "   ./run.sh restart"
    echo ""
fi

if [ $ERROR_FOUND -gt 0 ]; then
    echo "2. View full error logs:"
    echo "   ./run.sh logs api-service"
    echo "   ./run.sh logs ocpp-ws-service"
    echo ""
fi

if [ "$CHARGER_COUNT" = "0" ]; then
    echo "3. Test network connectivity:"
    echo "   netstat -tlnp | grep 9000"
    echo "   telnet <your-server-ip> 9000"
    echo ""
fi

echo "4. If issues persist, collect debug info:"
echo "   docker compose -f docker-compose.yml ps > debug_status.txt"
echo "   docker logs api-service >> debug_logs.txt 2>&1"
echo "   docker logs ocpp-ws-service >> debug_logs.txt 2>&1"
echo "   docker logs redis-service >> debug_logs.txt 2>&1"
echo ""
echo "5. Then contact support with debug files."
echo ""

