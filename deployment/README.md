# TakeFi Production Deployment Guide

Complete deployment setup for TakeFi on AWS EC2 with takefi.xyz domain.

## Quick Start

### 1. Launch EC2 Instance
- **Instance Type**: t3.medium or larger
- **OS**: Ubuntu 22.04 LTS
- **Security Groups**: Allow ports 22, 80, 443
- **Storage**: 20GB+ SSD

### 2. Initial Server Setup
```bash
# Connect to your EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Clone the repository
git clone <your-repo-url> /home/ubuntu/takefi
cd /home/ubuntu/takefi

# Run the EC2 setup script
sudo ./deployment/scripts/setup-ec2.sh admin@takefi.xyz
```

### 3. Deploy Applications
```bash
# Deploy backend services
takefi-deploy start

# Setup SSL certificates
takefi-deploy ssl admin@takefi.xyz
```

### 4. Configure DNS
Point your domain to the EC2 instance:
```
takefi.xyz    A    YOUR_EC2_IP
www.takefi.xyz A   YOUR_EC2_IP
```

## File Structure

```
deployment/
├── nginx/
│   └── takefi.conf              # Nginx reverse proxy config
├── scripts/
│   ├── setup-ec2.sh            # Complete EC2 setup
│   ├── setup-ssl.sh            # SSL/Certbot automation
│   ├── deploy-backends.sh       # Backend deployment (existing)
│   └── check-status.sh          # Health monitoring (existing)
├── configs/
│   └── production.env           # Production environment template
└── README.md                    # This file
```

## Architecture

### Domain Routing
- `https://takefi.xyz/` → Frontend (port 3002)
- `https://takefi.xyz/api/oracle/*` → Oracle Backend (port 3001)
- `https://takefi.xyz/api/mm/*` → MM Server (port 3000)
- `https://takefi.xyz/ws` → WebSocket (MM Server)

### Security Features
- SSL/TLS encryption with Let's Encrypt
- Rate limiting (100 req/min for APIs, 1000 req/min general)
- Security headers (HSTS, XSS protection, etc.)
- Firewall configuration (UFW)
- Automatic certificate renewal

## Management Commands

The setup script installs a `takefi-deploy` helper command:

```bash
# Service management
takefi-deploy start      # Start all services
takefi-deploy stop       # Stop all services  
takefi-deploy restart    # Restart all services
takefi-deploy status     # Show service status
takefi-deploy logs       # View service logs
takefi-deploy health     # Check service health

# SSL management
takefi-deploy ssl [email]  # Setup/renew SSL certificates

# Service updates (with automatic rollback on failure)
takefi-deploy update all        # Update all services
takefi-deploy update frontend   # Update frontend only
takefi-deploy update fe         # Alias for frontend
takefi-deploy update oracle     # Update oracle backend only
takefi-deploy update mm-server  # Update MM server only
takefi-deploy update mm         # Alias for mm-server
```

## Monitoring

### Health Checks
- Automatic service monitoring every 5 minutes
- Auto-restart failed services
- Logs saved to `/var/log/takefi-monitor.log`

### Manual Monitoring
```bash
# Check service health
takefi-monitor

# View PM2 processes
pm2 status

# Check nginx status
systemctl status nginx

# View logs
pm2 logs
tail -f /var/log/takefi-monitor.log
```

## Configuration

### Environment Variables
Edit `/home/ubuntu/takefi/.env.production`:
```bash
# Oracle Backend
ORACLE_AWS_REGION=us-east-1
ORACLE_BITCOIN_NETWORK=testnet
ORACLE_CORS_ORIGIN=https://takefi.xyz

# MM Server  
MM_API_KEY=your-secure-api-key
MM_CORS_ORIGINS=https://takefi.xyz

# Required secrets
EXECUTOR_PRIVATE_KEY=your-wallet-private-key
BITCOIN_RPC_URL=your-bitcoin-rpc-endpoint
```

### SSL Certificates
- Automatically obtained from Let's Encrypt
- Auto-renewal configured via cron
- Certificates stored in `/etc/letsencrypt/live/takefi.xyz/`

## 🔧 **Production Update Workflow**

### **Single Service Update**
```bash
# 1. Push your changes to main branch
git push origin main

# 2. SSH to your server  
ssh -i your-key.pem ubuntu@your-ec2-ip

# 3. Update specific service
takefi-deploy update frontend   # Just frontend
takefi-deploy update oracle     # Just oracle backend  
takefi-deploy update mm-server  # Just MM server

# 4. Monitor the update
takefi-deploy logs             # Check logs
takefi-deploy health           # Verify health
```

### **Full Platform Update**
```bash
# Update all services at once
takefi-deploy update all
```

### **Update Features**
- ✅ **Automatic git pull** from main branch
- ✅ **Dependency installation** (if package.json changed)
- ✅ **Build step** (for TypeScript services)
- ✅ **Graceful restart** with PM2
- ✅ **Health checks** after restart
- ✅ **Automatic rollback** if update fails
- ✅ **Zero downtime** deployment

## Troubleshooting

### Service Issues
```bash
# Check service status
takefi-deploy status

# View detailed logs
pm2 logs oracle-backend
pm2 logs mm-server

# Restart services
takefi-deploy restart
```

### SSL Issues
```bash
# Test SSL configuration
curl -I https://takefi.xyz

# Renew certificates manually
sudo certbot renew --nginx

# Check certificate expiry
sudo certbot certificates
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Check status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log
```

## Security Considerations

### Firewall
- Only ports 22, 80, 443 are open
- SSH access should use key-based authentication
- Consider changing SSH port from default 22

### Secrets Management
- Use AWS Secrets Manager for sensitive data
- Never commit private keys to repository
- Rotate API keys regularly

### Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js dependencies
cd /home/ubuntu/takefi && npm update

# Restart services after updates
takefi-deploy restart
```

## Scaling Considerations

### Horizontal Scaling
- Use Application Load Balancer for multiple instances
- Configure PM2 clustering in `ecosystem.config.js`
- Consider Redis for session storage

### Monitoring & Alerts
- Set up CloudWatch for AWS monitoring
- Configure email alerts for service failures
- Use log aggregation (ELK stack, CloudWatch Logs)

### Database
- Current setup uses in-memory storage
- Consider PostgreSQL/MySQL for persistence
- Use RDS for managed database solution

## Cost Optimization

### Instance Types
- **Development**: t3.micro (1 vCPU, 1GB RAM)
- **Production**: t3.medium (2 vCPU, 4GB RAM)
- **High Traffic**: c5.large (2 vCPU, 4GB RAM)

### Storage
- Use GP3 SSD for better price/performance
- Enable EBS encryption
- Set up automated backups

## Support

For deployment issues:
1. Check service logs: `takefi-deploy logs`
2. Run health check: `takefi-deploy health` 
3. Review monitoring logs: `tail -f /var/log/takefi-monitor.log`
4. Verify DNS configuration
5. Test SSL certificates