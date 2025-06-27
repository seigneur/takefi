#!/bin/bash

# BTCFi Backend Services Deployment Script
# Deploys Oracle Backend and MM Server using PM2

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-"development"} # development, production
ORACLE_DIR="oracle-backend"
MM_SERVER_DIR="cow-mm-server"

echo -e "${BLUE}🚀 BTCFi Backend Deployment${NC}"
echo -e "${BLUE}Environment: $ENVIRONMENT${NC}"
echo "=================================="

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 not installed${NC}"
    echo -e "${YELLOW}💡 Installing PM2...${NC}"
    npm install -g pm2
fi

# Check directories
if [ ! -d "$ORACLE_DIR" ]; then
    echo -e "${RED}❌ Oracle backend directory not found: $ORACLE_DIR${NC}"
    exit 1
fi

if [ ! -d "$MM_SERVER_DIR" ]; then
    echo -e "${RED}❌ MM Server directory not found: $MM_SERVER_DIR${NC}"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Install dependencies for Oracle Backend
echo -e "${YELLOW}📦 Installing Oracle Backend dependencies...${NC}"
cd "$ORACLE_DIR"
npm ci
cd ..

# Install dependencies and build MM Server
echo -e "${YELLOW}📦 Installing MM Server dependencies...${NC}"
cd "$MM_SERVER_DIR"
npm ci

echo -e "${YELLOW}🏗️  Building MM Server...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ MM Server build successful${NC}"
else
    echo -e "${RED}❌ MM Server build failed${NC}"
    exit 1
fi

cd ..

# Check environment files
echo -e "${YELLOW}📋 Checking environment configuration...${NC}"

if [ ! -f "$ORACLE_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  Oracle Backend .env not found, creating from example...${NC}"
    cp "$ORACLE_DIR/.env.example" "$ORACLE_DIR/.env"
    echo -e "${YELLOW}💡 Please update $ORACLE_DIR/.env with your configuration${NC}"
fi

if [ ! -f "$MM_SERVER_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  MM Server .env not found, creating from example...${NC}"
    cp "$MM_SERVER_DIR/.env.example" "$MM_SERVER_DIR/.env"
    echo -e "${YELLOW}💡 Please update $MM_SERVER_DIR/.env with your configuration${NC}"
fi

# Stop existing PM2 processes
echo -e "${YELLOW}🛑 Stopping existing processes...${NC}"
pm2 delete all 2>/dev/null || echo "No existing processes to stop"

# Start services with PM2
echo -e "${YELLOW}🚀 Starting services with PM2...${NC}"

if [ "$ENVIRONMENT" = "production" ]; then
    pm2 start ecosystem.config.js --env production
else
    pm2 start ecosystem.config.js --env development
fi

# Wait a moment for services to start
sleep 5

# Check service status
echo -e "${YELLOW}🔍 Checking service status...${NC}"
pm2 status

# Health checks
echo -e "${YELLOW}🏥 Performing health checks...${NC}"

# Check Oracle Backend health
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Oracle Backend healthy (http://localhost:3001)${NC}"
else
    echo -e "${RED}❌ Oracle Backend health check failed${NC}"
    echo -e "${YELLOW}💡 Check logs with: pm2 logs oracle-backend${NC}"
fi

# Check MM Server health
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MM Server healthy (http://localhost:3000)${NC}"
else
    echo -e "${RED}❌ MM Server health check failed${NC}"
    echo -e "${YELLOW}💡 Check logs with: pm2 logs mm-server${NC}"
fi

# Save PM2 configuration
pm2 save
pm2 startup

echo ""
echo -e "${GREEN}🎉 Backend deployment completed!${NC}"
echo "=================================="
echo -e "${BLUE}Services:${NC}"
echo "• Oracle Backend: http://localhost:3001"
echo "• MM Server: http://localhost:3000"
echo ""
echo -e "${BLUE}Management commands:${NC}"
echo "• View status: pm2 status"
echo "• View logs: pm2 logs"
echo "• Restart all: pm2 restart all"
echo "• Stop all: pm2 stop all"
echo ""
echo -e "${YELLOW}📝 Note: Configure your firewall to allow traffic on ports 3000 and 3001${NC}"