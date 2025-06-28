#!/bin/bash

# TakeFi Configuration Validation Script
# Tests all configuration files for syntax errors

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 TakeFi Configuration Validation${NC}"
echo "=================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"

# Test bash script syntax
echo -e "${YELLOW}📜 Testing bash scripts...${NC}"

scripts=(
    "$SCRIPT_DIR/setup-ec2.sh"
    "$SCRIPT_DIR/setup-ssl.sh"
    "$SCRIPT_DIR/deploy-backends.sh"
    "$SCRIPT_DIR/check-status.sh"
)

for script in "${scripts[@]}"; do
    if [ -f "$script" ]; then
        if bash -n "$script"; then
            echo -e "${GREEN}✅ $(basename "$script") - syntax OK${NC}"
        else
            echo -e "${RED}❌ $(basename "$script") - syntax error${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  $(basename "$script") - not found${NC}"
    fi
done

# Test nginx configuration structure
echo -e "${YELLOW}🌐 Testing nginx configuration...${NC}"
nginx_config="$DEPLOYMENT_DIR/nginx/takefi.conf"

if [ -f "$nginx_config" ]; then
    # Check for required sections
    required_sections=("upstream oracle_backend" "upstream mm_server" "server_name takefi.xyz" "ssl_certificate")
    
    for section in "${required_sections[@]}"; do
        if grep -q "$section" "$nginx_config"; then
            echo -e "${GREEN}✅ Found: $section${NC}"
        else
            echo -e "${RED}❌ Missing: $section${NC}"
            exit 1
        fi
    done
    
    # Check for syntax issues
    if grep -q "DOMAIN_PLACEHOLDER" "$nginx_config"; then
        echo -e "${RED}❌ Found placeholder domains - replace with takefi.xyz${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Nginx config structure OK${NC}"
else
    echo -e "${RED}❌ Nginx config not found${NC}"
    exit 1
fi

# Test environment template
echo -e "${YELLOW}📋 Testing environment template...${NC}"
env_template="$DEPLOYMENT_DIR/configs/production.env"

if [ -f "$env_template" ]; then
    required_vars=("ORACLE_PORT" "MM_PORT" "ORACLE_CORS_ORIGIN" "MM_CORS_ORIGINS")
    
    for var in "${required_vars[@]}"; do
        if grep -q "^$var=" "$env_template"; then
            echo -e "${GREEN}✅ Found: $var${NC}"
        else
            echo -e "${RED}❌ Missing: $var${NC}"
            exit 1
        fi
    done
    
    echo -e "${GREEN}✅ Environment template OK${NC}"
else
    echo -e "${RED}❌ Environment template not found${NC}"
    exit 1
fi

# Test PM2 ecosystem config
echo -e "${YELLOW}⚙️  Testing PM2 configuration...${NC}"
pm2_config="$DEPLOYMENT_DIR/../ecosystem.config.js"

if [ -f "$pm2_config" ]; then
    if node -c "$pm2_config"; then
        echo -e "${GREEN}✅ PM2 config syntax OK${NC}"
    else
        echo -e "${RED}❌ PM2 config syntax error${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  PM2 config not found${NC}"
fi

# Check file permissions
echo -e "${YELLOW}🔐 Checking file permissions...${NC}"

executable_scripts=(
    "$SCRIPT_DIR/setup-ec2.sh"
    "$SCRIPT_DIR/setup-ssl.sh"
    "$SCRIPT_DIR/deploy-backends.sh"
    "$SCRIPT_DIR/check-status.sh"
)

for script in "${executable_scripts[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo -e "${GREEN}✅ $(basename "$script") - executable${NC}"
        else
            echo -e "${YELLOW}⚠️  $(basename "$script") - not executable, fixing...${NC}"
            chmod +x "$script"
            echo -e "${GREEN}✅ Fixed permissions${NC}"
        fi
    fi
done

echo ""
echo -e "${GREEN}🎉 All configuration files validated successfully!${NC}"
echo "=================================="
echo -e "${BLUE}Ready for deployment:${NC}"
echo "1. Scripts are syntactically correct"
echo "2. Nginx config structure is valid"
echo "3. Environment template is complete"
echo "4. File permissions are correct"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "• Upload to EC2 instance"
echo "• Run: sudo ./deployment/scripts/setup-ec2.sh"
echo "• Configure environment variables"
echo "• Point DNS to server"