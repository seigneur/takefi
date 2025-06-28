#!/bin/bash

# TakeFi SSL/Certbot Automation Script
# Sets up SSL certificates using Let's Encrypt for takefi.xyz

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="takefi.xyz"
WWW_DOMAIN="www.takefi.xyz"
EMAIL=${1:-"admin@takefi.xyz"}  # Default email, can be overridden
WEBROOT="/var/www/certbot"

echo -e "${BLUE}🔒 TakeFi SSL Setup${NC}"
echo -e "${BLUE}Domain: $DOMAIN${NC}"
echo -e "${BLUE}Email: $EMAIL${NC}"
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root${NC}"
    echo -e "${YELLOW}💡 Run with: sudo $0 [email]${NC}"
    exit 1
fi

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}📦 Installing certbot...${NC}"
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}📦 Installing nginx...${NC}"
    apt-get update
    apt-get install -y nginx
fi

# Create webroot directory for certbot challenges
echo -e "${YELLOW}📁 Creating webroot directory...${NC}"
mkdir -p $WEBROOT
chown -R www-data:www-data $WEBROOT

# Create temporary nginx config for initial certificate generation
echo -e "${YELLOW}🔧 Creating temporary nginx config...${NC}"
cat > /etc/nginx/sites-available/takefi-temp << 'EOF'
server {
    listen 80;
    server_name takefi.xyz www.takefi.xyz;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 200 'TakeFi SSL Setup in Progress';
        add_header Content-Type text/plain;
    }
}
EOF

# Disable default nginx site and enable temporary config
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo -e "${YELLOW}🔧 Disabling default nginx site...${NC}"
    rm -f /etc/nginx/sites-enabled/default
fi

# Enable temporary config
ln -sf /etc/nginx/sites-available/takefi-temp /etc/nginx/sites-enabled/

# Test nginx configuration
echo -e "${YELLOW}🔍 Testing nginx configuration...${NC}"
nginx -t

# Restart nginx
echo -e "${YELLOW}🔄 Restarting nginx...${NC}"
systemctl restart nginx

# Wait for nginx to start
sleep 2

# Check if certificates already exist
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  SSL certificates already exist for $DOMAIN${NC}"
    echo -e "${YELLOW}💡 Do you want to renew them? [y/N]${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo -e "${YELLOW}🔄 Renewing certificates...${NC}"
        certbot renew --nginx
    else
        echo -e "${BLUE}ℹ️  Skipping certificate generation${NC}"
    fi
else
    # Generate SSL certificates
    echo -e "${YELLOW}🔒 Generating SSL certificates...${NC}"
    certbot certonly \
        --webroot \
        --webroot-path=$WEBROOT \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        --domains $DOMAIN,$WWW_DOMAIN
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ SSL certificates generated successfully${NC}"
    else
        echo -e "${RED}❌ Failed to generate SSL certificates${NC}"
        echo -e "${YELLOW}💡 Check that:${NC}"
        echo "• Domain DNS points to this server"
        echo "• Port 80 is open and accessible"
        echo "• No firewall is blocking access"
        exit 1
    fi
fi

# Copy the main nginx configuration
echo -e "${YELLOW}🔧 Installing main nginx configuration...${NC}"
if [ -f "/home/ubuntu/takefi/deployment/nginx/takefi.conf" ]; then
    cp /home/ubuntu/takefi/deployment/nginx/takefi.conf /etc/nginx/sites-available/takefi
elif [ -f "/var/www/takefi/deployment/nginx/takefi.conf" ]; then
    cp /var/www/takefi/deployment/nginx/takefi.conf /etc/nginx/sites-available/takefi
else
    echo -e "${RED}❌ Cannot find takefi.conf nginx configuration${NC}"
    echo -e "${YELLOW}💡 Please ensure the TakeFi repository is cloned in /home/ubuntu/takefi or /var/www/takefi${NC}"
    exit 1
fi

# Remove temporary config and enable main config
rm -f /etc/nginx/sites-enabled/takefi-temp
rm -f /etc/nginx/sites-available/takefi-temp
ln -sf /etc/nginx/sites-available/takefi /etc/nginx/sites-enabled/

# Test nginx configuration
echo -e "${YELLOW}🔍 Testing final nginx configuration...${NC}"
nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
    echo -e "${RED}❌ Nginx configuration has errors${NC}"
    exit 1
fi

# Reload nginx with SSL configuration
echo -e "${YELLOW}🔄 Reloading nginx with SSL configuration...${NC}"
systemctl reload nginx

# Set up automatic certificate renewal
echo -e "${YELLOW}⏰ Setting up automatic certificate renewal...${NC}"
cat > /etc/cron.d/certbot-renewal << 'EOF'
# TakeFi SSL Certificate Auto-Renewal
# Runs twice daily at random minutes to renew certificates
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 */12 * * * root test -x /usr/bin/certbot && perl -e 'sleep int(rand(43200))' && certbot renew --quiet --nginx && systemctl reload nginx
EOF

# Test SSL configuration
echo -e "${YELLOW}🔍 Testing SSL configuration...${NC}"
sleep 5

if curl -fsS https://$DOMAIN/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ SSL is working correctly${NC}"
else
    echo -e "${YELLOW}⚠️  SSL test inconclusive (services may not be running)${NC}"
fi

# Display SSL certificate info
echo -e "${YELLOW}📋 SSL Certificate Information:${NC}"
certbot certificates

echo ""
echo -e "${GREEN}🎉 SSL setup completed successfully!${NC}"
echo "=================================="
echo -e "${BLUE}Domain: https://$DOMAIN${NC}"
echo -e "${BLUE}WWW Domain: https://$WWW_DOMAIN${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Ensure TakeFi services are running with PM2"
echo "2. Update DNS records to point to this server"
echo "3. Configure firewall (ports 80, 443, 22)"
echo ""
echo -e "${YELLOW}📝 Certificate renewal is automated via cron${NC}"
echo -e "${YELLOW}💡 Test renewal with: certbot renew --dry-run${NC}"