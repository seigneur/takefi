#!/bin/bash

# TakeFi Service Update Script
# Updates and deploys individual services or all services

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/ubuntu/takefi"
APP_USER="ubuntu"
SERVICE=${1:-"all"}

echo -e "${BLUE}🔄 TakeFi Service Update${NC}"
echo -e "${BLUE}Service: $SERVICE${NC}"
echo "=================================="

# Check if running as correct user or root
if [ "$USER" != "root" ] && [ "$USER" != "$APP_USER" ]; then
    echo -e "${RED}❌ This script must be run as root or $APP_USER${NC}"
    exit 1
fi

# Function to run commands as app user
run_as_user() {
    if [ "$USER" = "root" ]; then
        sudo -u $APP_USER bash -c "$1"
    else
        bash -c "$1"
    fi
}

# Function to update git repository
update_repo() {
    echo -e "${YELLOW}📥 Pulling latest code...${NC}"
    cd $APP_DIR
    
    # Store current commit for rollback
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "Current commit: $CURRENT_COMMIT"
    
    # Pull latest changes
    if run_as_user "cd $APP_DIR && git pull origin main"; then
        NEW_COMMIT=$(git rev-parse HEAD)
        echo -e "${GREEN}✅ Updated to commit: $NEW_COMMIT${NC}"
        if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
            echo -e "${YELLOW}ℹ️  No new changes to deploy${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to pull latest code${NC}"
        exit 1
    fi
}

# Function to install dependencies
install_deps() {
    local dir=$1
    echo -e "${YELLOW}📦 Installing dependencies in $dir...${NC}"
    
    if [ -f "$APP_DIR/$dir/package.json" ]; then
        if run_as_user "cd $APP_DIR/$dir && npm ci"; then
            echo -e "${GREEN}✅ Dependencies installed${NC}"
        else
            echo -e "${RED}❌ Failed to install dependencies${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  No package.json found in $dir${NC}"
    fi
}

# Function to build service
build_service() {
    local service=$1
    local dir=$2
    
    echo -e "${YELLOW}🏗️  Building $service...${NC}"
    
    case $service in
        "mm-server")
            if run_as_user "cd $APP_DIR/$dir && npm run build"; then
                echo -e "${GREEN}✅ $service built successfully${NC}"
            else
                echo -e "${RED}❌ Failed to build $service${NC}"
                return 1
            fi
            ;;
        "frontend")
            if run_as_user "cd $APP_DIR/$dir && npm run build"; then
                echo -e "${GREEN}✅ $service built successfully${NC}"
            else
                echo -e "${RED}❌ Failed to build $service${NC}"
                return 1
            fi
            ;;
        "oracle")
            echo -e "${BLUE}ℹ️  Oracle backend doesn't require build step${NC}"
            ;;
    esac
}

# Function to restart service
restart_service() {
    local service=$1
    local pm2_name=$2
    
    echo -e "${YELLOW}🔄 Restarting $service...${NC}"
    
    if run_as_user "pm2 restart $pm2_name"; then
        echo -e "${GREEN}✅ $service restarted${NC}"
        
        # Wait for service to start
        sleep 3
        
        # Health check
        case $service in
            "oracle")
                if curl -sf http://localhost:3001/health > /dev/null; then
                    echo -e "${GREEN}✅ $service health check passed${NC}"
                else
                    echo -e "${RED}❌ $service health check failed${NC}"
                    return 1
                fi
                ;;
            "mm-server")
                if curl -sf http://localhost:3000/health > /dev/null; then
                    echo -e "${GREEN}✅ $service health check passed${NC}"
                else
                    echo -e "${RED}❌ $service health check failed${NC}"
                    return 1
                fi
                ;;
            "frontend")
                if curl -sf http://localhost:3002/health > /dev/null 2>&1 || curl -sf http://localhost:3002 > /dev/null 2>&1; then
                    echo -e "${GREEN}✅ $service health check passed${NC}"
                else
                    echo -e "${RED}❌ $service health check failed${NC}"
                    return 1
                fi
                ;;
        esac
    else
        echo -e "${RED}❌ Failed to restart $service${NC}"
        return 1
    fi
}

# Function to update a specific service
update_specific_service() {
    local service=$1
    local dir=$2
    local pm2_name=$3
    
    echo -e "${BLUE}🔄 Updating $service${NC}"
    echo "=================================="
    
    # Install dependencies if needed
    install_deps $dir || return 1
    
    # Build if needed
    build_service $service $dir || return 1
    
    # Restart service
    restart_service $service $pm2_name || return 1
    
    echo -e "${GREEN}✅ $service updated successfully${NC}"
}

# Function to rollback on failure
rollback() {
    echo -e "${RED}🔙 Rolling back to previous commit...${NC}"
    cd $APP_DIR
    if run_as_user "cd $APP_DIR && git reset --hard $CURRENT_COMMIT"; then
        echo -e "${YELLOW}⚠️  Rolled back to: $CURRENT_COMMIT${NC}"
        echo -e "${YELLOW}💡 Please restart services manually: takefi-deploy restart${NC}"
    else
        echo -e "${RED}❌ Rollback failed - manual intervention required${NC}"
    fi
}

# Main update logic
cd $APP_DIR

# Trap to handle failures
trap 'rollback' ERR

case "$SERVICE" in
    "all")
        echo -e "${BLUE}🔄 Updating all services${NC}"
        update_repo
        
        # Update Oracle Backend
        update_specific_service "oracle" "oracle-backend" "oracle-backend"
        
        # Update MM Server
        update_specific_service "mm-server" "cow-mm-server" "mm-server"
        
        # Update Frontend
        update_specific_service "frontend" "frontend" "frontend"
        
        echo -e "${GREEN}🎉 All services updated successfully!${NC}"
        ;;
        
    "frontend"|"fe")
        update_repo
        update_specific_service "frontend" "frontend" "frontend"
        ;;
        
    "oracle")
        update_repo
        update_specific_service "oracle" "oracle-backend" "oracle-backend"
        ;;
        
    "mm-server"|"mm")
        update_repo
        update_specific_service "mm-server" "cow-mm-server" "mm-server"
        ;;
        
    *)
        echo -e "${RED}❌ Invalid service: $SERVICE${NC}"
        echo ""
        echo "Usage: $0 {all|frontend|fe|oracle|mm-server|mm}"
        echo ""
        echo "Services:"
        echo "  all       - Update all services"
        echo "  frontend  - Update frontend only"
        echo "  fe        - Alias for frontend"
        echo "  oracle    - Update oracle backend only"
        echo "  mm-server - Update MM server only"
        echo "  mm        - Alias for mm-server"
        exit 1
        ;;
esac

# Clear trap
trap - ERR

echo ""
echo -e "${GREEN}🎉 Update completed successfully!${NC}"
echo "=================================="
echo -e "${BLUE}Service status:${NC}"
run_as_user "pm2 status"

echo ""
echo -e "${YELLOW}💡 Useful commands:${NC}"
echo "• takefi-deploy status  - Check service status"
echo "• takefi-deploy logs    - View service logs"
echo "• takefi-deploy health  - Run health checks"