#!/bin/bash

# BTCFi Platform Status Check Script
# Comprehensive health check for all services and configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 BTCFi Platform Status Check${NC}"
echo "=================================="

# Function to check if a service is running
check_service() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-"/health"}
    
    echo -e "${YELLOW}Checking $service_name (port $port)...${NC}"
    
    if curl -f -s "http://localhost:$port$endpoint" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $service_name is running and healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ $service_name is not responding${NC}"
        return 1
    fi
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Port $port is in use${NC}"
        return 0
    else
        echo -e "${RED}❌ Port $port is not in use${NC}"
        return 1
    fi
}

# Check Node.js and npm
echo -e "${YELLOW}🔍 Checking system requirements...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not installed${NC}"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm $NPM_VERSION${NC}"
else
    echo -e "${RED}❌ npm not installed${NC}"
fi

# Check PM2 if in production mode
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2 installed${NC}"
    echo -e "${YELLOW}PM2 Status:${NC}"
    pm2 status || echo -e "${YELLOW}No PM2 processes running${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 not installed (okay for development)${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 Checking ports...${NC}"

# Check if services are running on expected ports
check_port 3000 && echo -e "${BLUE}  Port 3000: MM Server${NC}"
check_port 3001 && echo -e "${BLUE}  Port 3001: Oracle Backend${NC}"
check_port 3002 && echo -e "${BLUE}  Port 3002: Frontend (dev)${NC}"

echo ""
echo -e "${YELLOW}🏥 Checking service health...${NC}"

# Check service health endpoints
ORACLE_HEALTHY=false
MM_HEALTHY=false

if check_service "Oracle Backend" 3001; then
    ORACLE_HEALTHY=true
fi

if check_service "MM Server" 3000; then
    MM_HEALTHY=true
fi

echo ""
echo -e "${YELLOW}📁 Checking file structure...${NC}"

# Check critical files and directories
FILES_TO_CHECK=(
    "package.json"
    "ecosystem.config.js"
    "oracle-backend/package.json"
    "cow-mm-server/package.json"
    "frontend/package.json"
    "oracle-backend/.env.example"
    "cow-mm-server/.env.example"
    "deployment/scripts/deploy-backends.sh"
    "deployment/scripts/deploy-frontend.sh"
    "deployment/scripts/start-dev.sh"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file not found${NC}"
    fi
done

# Check environment files
echo ""
echo -e "${YELLOW}📋 Checking environment configuration...${NC}"

ENV_FILES=(
    "oracle-backend/.env:Oracle Backend"
    "cow-mm-server/.env:MM Server"
    "frontend/.env.local:Frontend"
)

for env_info in "${ENV_FILES[@]}"; do
    IFS=':' read -r file description <<< "$env_info"
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $description environment file exists${NC}"
    else
        echo -e "${YELLOW}⚠️  $description environment file missing${NC}"
        echo -e "${BLUE}   Create from: ${file}.example${NC}"
    fi
done

# Check build status
echo ""
echo -e "${YELLOW}🏗️  Checking build status...${NC}"

if [ -d "cow-mm-server/dist" ]; then
    echo -e "${GREEN}✅ MM Server is built${NC}"
else
    echo -e "${YELLOW}⚠️  MM Server not built${NC}"
    echo -e "${BLUE}   Run: npm run build:mm${NC}"
fi

if [ -d "frontend/.next" ]; then
    echo -e "${GREEN}✅ Frontend is built${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend not built${NC}"
    echo -e "${BLUE}   Run: npm run build:frontend${NC}"
fi

# Generate summary
echo ""
echo "=================================="
echo -e "${BLUE}📊 Status Summary${NC}"
echo "=================================="

if [ "$ORACLE_HEALTHY" = true ] && [ "$MM_HEALTHY" = true ]; then
    echo -e "${GREEN}🎉 All services are healthy!${NC}"
    STATUS="HEALTHY"
elif [ "$ORACLE_HEALTHY" = true ] || [ "$MM_HEALTHY" = true ]; then
    echo -e "${YELLOW}⚠️  Some services are running${NC}"
    STATUS="PARTIAL"
else
    echo -e "${RED}❌ No services are running${NC}"
    STATUS="DOWN"
fi

echo ""
echo -e "${BLUE}🔗 Service URLs:${NC}"
echo "• Oracle Backend: http://localhost:3001"
echo "• MM Server: http://localhost:3000"
echo "• Frontend (dev): http://localhost:3002"

echo ""
echo -e "${BLUE}📚 Quick Commands:${NC}"
echo "• Start development: npm run dev"
echo "• Check health: npm run health"
echo "• View PM2 status: pm2 status"
echo "• View logs: npm run logs"

if [ "$STATUS" != "HEALTHY" ]; then
    echo ""
    echo -e "${YELLOW}💡 Troubleshooting:${NC}"
    echo "• Check logs: pm2 logs or npm run logs"
    echo "• Restart services: npm run restart"
    echo "• Full setup: ./setup.sh"
    echo "• Start development: ./deployment/scripts/start-dev.sh"
fi

echo ""