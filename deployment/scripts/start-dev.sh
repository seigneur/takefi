#!/bin/bash

# BTCFi Development Startup Script
# Starts all services in development mode with proper port configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 BTCFi Development Environment${NC}"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not installed${NC}"
    echo -e "${YELLOW}💡 Please install Node.js 16+ from https://nodejs.org${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not installed${NC}"
    exit 1
fi

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}🔄 Killing process on port $port (PID: $pid)${NC}"
        kill -9 $pid
        sleep 2
    fi
}

# Check and handle port conflicts
echo -e "${YELLOW}🔍 Checking for port conflicts...${NC}"

if check_port 3000; then
    echo -e "${YELLOW}⚠️  Port 3000 is in use${NC}"
    read -p "Kill process on port 3000? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port 3000
    else
        echo -e "${RED}❌ Cannot start MM Server on port 3000${NC}"
        exit 1
    fi
fi

if check_port 3001; then
    echo -e "${YELLOW}⚠️  Port 3001 is in use${NC}"
    read -p "Kill process on port 3001? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port 3001
    else
        echo -e "${RED}❌ Cannot start Oracle Backend on port 3001${NC}"
        exit 1
    fi
fi

if check_port 3002; then
    echo -e "${YELLOW}⚠️  Port 3002 is in use${NC}"
    read -p "Kill process on port 3002? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port 3002
    else
        echo -e "${RED}❌ Cannot start Frontend on port 3002${NC}"
        exit 1
    fi
fi

# Install root dependencies
echo -e "${YELLOW}📦 Installing root dependencies...${NC}"
npm install

# Check if all services are ready
echo -e "${YELLOW}📋 Checking service directories...${NC}"

ORACLE_DIR="oracle-backend"
MM_SERVER_DIR="cow-mm-server"
FRONTEND_DIR="frontend"

for dir in "$ORACLE_DIR" "$MM_SERVER_DIR" "$FRONTEND_DIR"; do
    if [ ! -d "$dir" ]; then
        echo -e "${RED}❌ Directory not found: $dir${NC}"
        exit 1
    fi
    
    if [ ! -f "$dir/package.json" ]; then
        echo -e "${RED}❌ package.json not found in: $dir${NC}"
        exit 1
    fi
done

# Install dependencies for all services
echo -e "${YELLOW}📦 Installing dependencies for all services...${NC}"
npm run install:all

# Build MM Server for development
echo -e "${YELLOW}🏗️  Building MM Server...${NC}"
cd "$MM_SERVER_DIR"
npm run build
cd ..

# Check environment files
echo -e "${YELLOW}📋 Checking environment files...${NC}"

# Oracle Backend
if [ ! -f "$ORACLE_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  Creating Oracle Backend .env from example...${NC}"
    cp "$ORACLE_DIR/.env.example" "$ORACLE_DIR/.env"
    # Update port in Oracle .env
    sed -i '' 's/PORT=3000/PORT=3001/' "$ORACLE_DIR/.env" 2>/dev/null || sed -i 's/PORT=3000/PORT=3001/' "$ORACLE_DIR/.env"
fi

# MM Server
if [ ! -f "$MM_SERVER_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  Creating MM Server .env from example...${NC}"
    cp "$MM_SERVER_DIR/.env.example" "$MM_SERVER_DIR/.env"
fi

# Frontend
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo -e "${YELLOW}⚠️  Frontend .env.local not found${NC}"
    echo -e "${YELLOW}💡 Make sure to create $FRONTEND_DIR/.env.local with API URLs${NC}"
fi

# Create logs directory
mkdir -p logs

# Start services using concurrently
echo -e "${YELLOW}🚀 Starting all services...${NC}"
echo -e "${BLUE}Services will start on:${NC}"
echo "• Oracle Backend: http://localhost:3001"
echo "• MM Server: http://localhost:3000"
echo "• Frontend: http://localhost:3002"
echo ""
echo -e "${YELLOW}💡 Press Ctrl+C to stop all services${NC}"
echo ""

# Use concurrently to start all services
npm run dev