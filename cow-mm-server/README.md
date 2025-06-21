# 🐄 TakeFi CoW Protocol Market Maker

<div align="center">

![TakeFi Logo](https://img.shields.io/badge/TakeFi-CoW%20Protocol-blue?style=for-the-badge&logo=ethereum)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express)](https://expressjs.com/)
[![CoW Protocol](https://img.shields.io/badge/CoW%20Protocol-000000?style=for-the-badge&logo=ethereum&logoColor=white)](https://cow.fi/)

**A sophisticated Express.js server that acts as a Market Maker using CoW Protocol for executing decentralized trades.**

[Features](#-features) • [Quick Start](#-quick-start) • [API Documentation](#-api-documentation) • [Trading Guide](#-trading-guide) • [Configuration](#-configuration)

</div>

---

## 🌟 **What is TakeFi CoW Protocol Market Maker?**

TakeFi's CoW Protocol Market Maker is a production-ready backend service that provides seamless trading functionality through CoW Protocol's intent-based trading system. It handles everything from quote generation to order execution, with intelligent auto-approval and real-time tracking.

### **🎯 Core Value Proposition**
- **🔄 Gasless Trading**: Users get optimal prices through CoW Protocol's batch auctions
- **⚡ Auto-Approval**: Intelligent token approval system - no manual transactions needed
- **🛡️ MEV Protection**: Built-in protection against frontrunning and sandwich attacks
- **📊 Real-Time Tracking**: Live order status updates via WebSocket
- **🔐 Enterprise Security**: API key authentication and rate limiting

---

## ✨ **Features**

### **🚀 Core Trading Features**
- ✅ **Automated Trading** - Execute trades via CoW Protocol with auto-approval
- ✅ **Real-time Quotes** - Get live pricing from CoW Protocol's solver network
- ✅ **Order Management** - Track, monitor, and cancel orders seamlessly
- ✅ **Multi-Network Support** - Mainnet, Gnosis Chain, and Sepolia testnet
- ✅ **Safe Wallet Integration** - Support for Safe multisig wallets with pre-signed orders

### **🛡️ Security & Reliability**
- ✅ **API Key Authentication** - Secure access control for all trading endpoints
- ✅ **Rate Limiting** - Protection against abuse (100 requests per 15 minutes)
- ✅ **Input Validation** - Comprehensive validation for all parameters
- ✅ **Error Handling** - Detailed error responses with actionable information
- ✅ **Health Monitoring** - Multi-service health checks for system reliability

### **👨‍💻 Developer Experience**
- ✅ **Interactive API Documentation** - Swagger UI for testing and exploration
- ✅ **TypeScript Support** - Full type safety and IntelliSense
- ✅ **WebSocket Integration** - Real-time order updates
- ✅ **Comprehensive Logging** - Detailed console output for debugging
- ✅ **Production Ready** - Built for scale with proper error handling

---

## 🚀 **Quick Start**

### **Prerequisites**
- **Node.js 18+** and npm
- **Ethereum wallet** with private key
- **RPC endpoint** (Infura, Alchemy, or similar)
- **Test tokens** for your chosen network

### **Installation**

```bash
# Clone the repository
git clone <your-repository-url>
cd cow-mm-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration (see Configuration section)

# Build the project
npm run build

# Start the server
npm run dev
```

### **⚡ Quick Test**

```bash
# Check server health
curl http://localhost:3000/health

# View API documentation
open http://localhost:3000/docs/

# Get a quote (replace with your API key)
curl "http://localhost:3000/api/quote?sellToken=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14&buyToken=0x0625aFB445C3B6B7B929342a04A22599fd5dBB59&sellAmount=1000000000000000000&userWallet=YOUR_WALLET_ADDRESS" \
  -H "x-api-key: YOUR_API_KEY"
```

---

## 📚 **API Documentation**

### **🌐 Interactive Documentation**
- **Swagger UI**: [`http://localhost:3000/docs/`](http://localhost:3000/docs/)
- **OpenAPI Spec**: [`http://localhost:3000/docs.json`](http://localhost:3000/docs.json)

### **🔗 Endpoints Overview**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/health` | GET | Server and service health check | ❌ |
| `/docs/` | GET | Interactive API documentation | ❌ |
| `/api/quote` | GET | Get real-time price quotes | ✅ |
| `/api/trade` | POST | Execute trades via CoW Protocol | ✅ |
| `/api/order-status/:uid` | GET | Get order status and execution details | ✅ |
| `/api/cancel-order/:uid` | POST | Cancel open orders | ✅ |
| `/ws` | WebSocket | Real-time order updates | ❌ |

### **🔐 Authentication**
All `/api/*` endpoints require API key authentication:
```bash
curl -H "x-api-key: your-api-key-here" http://localhost:3000/api/quote
```

---

## 💹 **Trading Guide**

### **1. Get a Quote**
```bash
curl "http://localhost:3000/api/quote?sellToken=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14&buyToken=0x0625aFB445C3B6B7B929342a04A22599fd5dBB59&sellAmount=1000000000000000000&userWallet=0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a" \
  -H "x-api-key: your-api-key"
```

**Response:**
```json
{
  "sellToken": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  "buyToken": "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59",
  "sellAmount": "999792643987995",
  "buyAmount": "4988521682908217006",
  "feeAmount": "207356012005",
  "validTo": 1750538363,
  "priceImpact": "0.0",
  "expiresAt": "2025-06-21T20:39:23.000Z"
}
```

### **2. Execute a Trade**
```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "sellToken": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    "buyToken": "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59",
    "sellAmount": "1000000000000000000",
    "userWallet": "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
    "slippagePercent": 0.5
  }'
```

**Response:**
```json
{
  "success": true,
  "orderUid": "0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c9...",
  "quote": { ... },
  "estimatedExecutionTime": 300,
  "message": "Order submitted successfully"
}
```

### **3. Track Order Status**
```bash
curl "http://localhost:3000/api/order-status/0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c9..." \
  -H "x-api-key: your-api-key"
```

### **4. Real-Time Updates via WebSocket**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Subscribe to order updates
  ws.send(JSON.stringify({
    type: 'subscribeOrder',
    orderUid: 'your-order-uid'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'orderUpdate') {
    console.log('Order status:', message.data.status);
  }
};
```

---

## ⚙️ **Configuration**

### **Environment Variables**

Create a `.env` file with the following configuration:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Authentication Configuration
API_KEY=your-secure-api-key-at-least-32-characters-long-for-security

# Blockchain Configuration
CHAIN_ID=11155111                    # 1=Mainnet, 100=Gnosis, 11155111=Sepolia
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ETHEREUM_RPC_URL=https://cloudflare-eth.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com

# CoW Protocol Configuration
COW_API_URL=https://api.cow.fi/sepolia/api/v1    # Network-specific
COW_SETTLEMENT_CONTRACT=0x9008D19f58AAbD9eD0D60971565AA8510560ab41
COW_VAULT_RELAYER=0xC92E8bdf79f0507f65a392b0ab4667716BFE0110
DEFAULT_VALIDITY_PERIOD=1800         # 30 minutes
DEFAULT_SLIPPAGE=0.5                 # 0.5%

# Wallet Configuration
EXECUTOR_PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
MM_WALLET_ADDRESS=0x1234567890123456789012345678901234567890

# Safe Wallet Configuration (Optional)
SAFE_WALLET_ADDRESS=0x1234567890123456789012345678901234567890   # Leave empty for regular wallet
SAFE_THRESHOLD=1

# Supported Tokens (Sepolia example)
SUPPORTED_TOKENS=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14,0x0625aFB445C3B6B7B929342a04A22599fd5dBB59
```

### **🌐 Network Configuration**

| Network | Chain ID | CoW API URL |
|---------|----------|-------------|
| **Mainnet** | 1 | `https://api.cow.fi/mainnet/api/v1` |
| **Gnosis Chain** | 100 | `https://api.cow.fi/xdai/api/v1` |
| **Sepolia Testnet** | 11155111 | `https://api.cow.fi/sepolia/api/v1` |

### **🪙 Token Addresses**

#### **Sepolia Testnet**
```bash
WETH=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
COW=0x0625aFB445C3B6B7B929342a04A22599fd5dBB59
```

#### **Mainnet**
```bash
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
COW=0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB
USDC=0xA0b86a33E6180d86Cf755FA8d5Ec052399C86B5E
DAI=0x6B175474E89094C44Da98b954EedeAC495271d0F
```

---

## 🔧 **Development**

### **Available Scripts**

```bash
# Development
npm run dev              # Start development server with hot reload
npm run build            # Build TypeScript to JavaScript
npm start               # Start production server

# Testing
npm test                # Run tests (when implemented)
npm run lint            # Run linting (when configured)
```

### **Project Structure**

```
src/
├── controllers/         # API route handlers
│   ├── trade.controller.ts     # Trading endpoints
│   └── health.controller.ts    # Health monitoring
├── services/           # Business logic
│   ├── cow.service.ts          # CoW Protocol integration
│   ├── safe.service.ts         # Safe wallet operations
│   └── websocket.service.ts    # Real-time updates
├── middleware/         # Express middleware
│   ├── auth.middleware.ts      # API key authentication
│   └── errorHandler.ts         # Error handling
├── models/             # TypeScript interfaces
│   └── index.ts               # Type definitions
├── config/             # Configuration
│   ├── app.config.ts          # App configuration
│   └── swagger.config.ts      # API documentation
├── utils/              # Utility functions
│   └── validators.ts          # Input validation
├── app.ts              # Express application setup
└── server.ts           # Entry point
```

### **🔍 Debugging**

The server provides comprehensive logging for debugging:

```bash
# View real-time logs
npm run dev

# For detached server
screen -S cow-server npm run dev
screen -r cow-server  # Reattach to view logs
```

---

## 🛡️ **Security Features**

### **🔐 Authentication & Authorization**
- **API Key Protection** - All trading endpoints require valid API keys
- **Rate Limiting** - 100 requests per 15 minutes to prevent abuse
- **CORS Protection** - Configurable origin restrictions
- **Input Validation** - Comprehensive validation for all parameters

### **💰 Financial Security**
- **Auto-Approval Management** - Intelligent token approval system
- **Private Key Security** - Secure handling of executor private keys
- **Safe Wallet Support** - Integration with Safe multisig for enhanced security
- **MEV Protection** - Built-in protection through CoW Protocol

### **🔒 Production Security Checklist**
- [ ] Use strong API keys (32+ characters)
- [ ] Configure environment-specific CORS origins
- [ ] Use secure RPC endpoints (HTTPS)
- [ ] Set up proper monitoring and alerting
- [ ] Regular security audits of private key handling
- [ ] Configure rate limiting based on usage patterns

---

## 🚀 **Deployment**

### **Production Deployment**

1. **Environment Setup**
   ```bash
   NODE_ENV=production
   PORT=3000
   # Set production API keys and RPC URLs
   ```

2. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

3. **Process Management (PM2)**
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name "takefi-cow-mm"
   pm2 startup
   pm2 save
   ```

4. **Reverse Proxy (Nginx)**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### **Docker Deployment**

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📊 **Monitoring & Analytics**

### **Health Monitoring**
- **Endpoint**: `GET /health`
- **Services Monitored**: CoW API, Safe Wallet, Blockchain connectivity
- **Response Codes**: 200 (healthy), 503 (unhealthy)

### **WebSocket Monitoring**
- **Connection Status**: Real-time connection monitoring
- **Order Tracking**: Live updates on order status changes
- **Error Reporting**: WebSocket error handling and reporting

### **Performance Metrics**
- **Server Uptime**: Tracked in health endpoint
- **Request Rate**: Rate limiting monitoring
- **Order Success Rate**: Track successful vs failed orders
- **Response Times**: Monitor API response performance

---

## 🤝 **Contributing**

### **Development Workflow**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes with proper TypeScript types
4. Test your changes thoroughly
5. Submit a pull request with detailed description

### **Code Standards**
- **TypeScript**: Strict type checking enabled
- **Linting**: Follow ESLint configuration
- **Formatting**: Use Prettier for code formatting
- **Testing**: Add tests for new features
- **Documentation**: Update API documentation for changes

---

## 📄 **License**

MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **[CoW Protocol](https://cow.fi/)** - For the innovative intent-based trading protocol
- **[Safe](https://safe.global/)** - For secure multisig wallet infrastructure
- **[Express.js](https://expressjs.com/)** - For the robust web framework
- **[TypeScript](https://www.typescriptlang.org/)** - For type safety and developer experience

---

<div align="center">

**Built with ❤️ for the TakeFi ecosystem**

[![GitHub stars](https://img.shields.io/github/stars/username/repo?style=social)](https://github.com/username/repo)
[![Twitter Follow](https://img.shields.io/twitter/follow/takefi?style=social)](https://twitter.com/takefi)

**[Website](https://takefi.io) • [Documentation](http://localhost:3000/docs/) • [Support](mailto:support@takefi.io)**

</div>