#!/bin/bash

# BTCFi Frontend Deployment Script
# Supports Vercel, Netlify, and manual builds

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_DIR="frontend"
BUILD_DIR="$FRONTEND_DIR/.next"
DEPLOYMENT_TARGET=${1:-"build"} # build, vercel, netlify

echo -e "${BLUE}🚀 BTCFi Frontend Deployment${NC}"
echo -e "${BLUE}Target: $DEPLOYMENT_TARGET${NC}"
echo "=================================="

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Frontend directory not found: $FRONTEND_DIR${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Check environment variables
echo -e "${YELLOW}📋 Checking environment configuration...${NC}"
if [ ! -f ".env.local" ]; then
    echo -e "${RED}❌ .env.local not found${NC}"
    echo -e "${YELLOW}💡 Create .env.local with required variables${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm ci

# Build the application
echo -e "${YELLOW}🏗️  Building frontend...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Deployment based on target
case $DEPLOYMENT_TARGET in
    "vercel")
        echo -e "${YELLOW}🚀 Deploying to Vercel...${NC}"
        if command -v vercel &> /dev/null; then
            vercel --prod
            echo -e "${GREEN}✅ Deployed to Vercel${NC}"
        else
            echo -e "${RED}❌ Vercel CLI not installed${NC}"
            echo -e "${YELLOW}💡 Install with: npm install -g vercel${NC}"
            exit 1
        fi
        ;;
    "netlify")
        echo -e "${YELLOW}🚀 Deploying to Netlify...${NC}"
        if command -v netlify &> /dev/null; then
            netlify deploy --prod --dir=out
            echo -e "${GREEN}✅ Deployed to Netlify${NC}"
        else
            echo -e "${RED}❌ Netlify CLI not installed${NC}"
            echo -e "${YELLOW}💡 Install with: npm install -g netlify-cli${NC}"
            exit 1
        fi
        ;;
    "build")
        echo -e "${GREEN}✅ Build completed. Files ready for deployment.${NC}"
        echo -e "${BLUE}📁 Build output: $BUILD_DIR${NC}"
        echo -e "${YELLOW}💡 You can now deploy the build manually or with your preferred service${NC}"
        ;;
    *)
        echo -e "${RED}❌ Unknown deployment target: $DEPLOYMENT_TARGET${NC}"
        echo -e "${YELLOW}💡 Available targets: build, vercel, netlify${NC}"
        exit 1
        ;;
esac

# Display URLs and next steps
echo ""
echo -e "${GREEN}🎉 Frontend deployment completed!${NC}"
echo "=================================="
echo -e "${BLUE}Next steps:${NC}"
echo "1. Update backend API URLs if deploying to production"
echo "2. Configure environment variables for your deployment platform"
echo "3. Set up custom domain if needed"
echo ""
echo -e "${YELLOW}📝 Note: Make sure your backend services are running and accessible${NC}"