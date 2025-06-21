# Bitcoin Oracle Backend

A production-ready Node.js backend service that manages Bitcoin Hash Time-Locked Contracts (HTLCs) for cross-chain swap operations. This service provides secure preimage generation, Bitcoin script creation, and AWS Secrets Manager integration for enterprise-grade security.

## Features

- **Bitcoin HTLC Generation**: Create time-locked Bitcoin scripts with multisig and fallback conditions
- **Secure Preimage Management**: Cryptographically secure preimage generation with SHA256 hashing
- **AWS Integration**: Store sensitive data securely using AWS Secrets Manager
- **RESTful API**: Clean, well-documented API endpoints for frontend integration
- **Enterprise Security**: Rate limiting, input validation, and comprehensive error handling
- **Chainlink Functions Ready**: Designed for future Chainlink DON integration

## Architecture

```
oracle-backend/
├── src/
│   ├── controllers/          # API route handlers
│   ├── services/            # Core business logic
│   ├── middleware/          # Authentication, validation, error handling
│   └── utils/              # Utilities and helpers
├── test/                   # Comprehensive test suite
└── docs/                   # API documentation
```

## Quick Start

### Prerequisites

- Node.js 16+ 
- AWS Account with Secrets Manager access
- Bitcoin testnet/mainnet access (for production)

### Installation

```bash
# Clone and navigate to the project
cd oracle-backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Configure your environment variables
nano .env
```

### Environment Configuration

```bash
NODE_ENV=development
PORT=3000
AWS_REGION=us-east-1
AWS_SECRETS_PREFIX=btc-oracle/
BITCOIN_NETWORK=testnet
MAX_BTC_AMOUNT=100000000
DEFAULT_TIMELOCK=144
API_RATE_LIMIT=100
```

### Running the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## API Documentation

### Base URL
```
http://localhost:3000/api/oracle
```

### Create Preimage and HTLC

Create a new Bitcoin HTLC with secure preimage generation.

**Endpoint:** `POST /create-preimage`

**Request Body:**
```json
{
  "userBtcAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
  "btcAmount": 100000000,
  "timelock": 144
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "hash": "a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df2",
    "htlcScript": "63a820...",
    "htlcAddress": "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc",
    "expiresAt": "2025-06-22T12:00:00.000Z",
    "timelock": 144
  }
}
```

### Get Swap Details

Retrieve swap information by ID (preimage not included).

**Endpoint:** `GET /swap/:swapId`

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "hash": "a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df2",
    "userAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "btcAmount": 100000000,
    "status": "active",
    "createdAt": "2025-06-21T12:00:00.000Z",
    "expiresAt": "2025-06-22T12:00:00.000Z"
  }
}
```

### Reveal Preimage (Chainlink Integration)

Reveal the preimage for completed swaps (requires authentication).

**Endpoint:** `POST /reveal-preimage/:swapId`

**Request Body:**
```json
{
  "authToken": "chainlink-don-token",
  "ethTxHash": "0x123...abc"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "preimage": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "revealedAt": "2025-06-21T12:30:00.000Z"
  }
}
```

## Bitcoin HTLC Script Structure

The service generates Bitcoin scripts with the following structure:

```
OP_IF
  OP_SHA256 <hash> OP_EQUALVERIFY
  <market_maker_pubkey> OP_CHECKSIG
OP_ELSE
  <timelock> OP_CHECKLOCKTIMEVERIFY OP_DROP
  <user_pubkey> OP_CHECKSIG
OP_ENDIF
```

This allows:
1. **Immediate spending** by market maker with correct preimage
2. **Fallback spending** by user after timelock expires

## Security Features

### Input Validation
- Bitcoin address format validation (testnet/mainnet)
- Public key format verification (compressed/uncompressed)
- Amount bounds checking (1 satoshi to configurable maximum)
- Timelock range validation (1 to 65535 blocks)

### Rate Limiting
- 100 requests per 15 minutes per IP (configurable)
- Distributed rate limiting support
- Custom rate limiting for different endpoints

### AWS Security
- IAM role-based authentication
- Encryption in transit and at rest
- Secret rotation support
- Access logging and monitoring

### Error Handling
- No internal error exposure in production
- Comprehensive logging with structured format
- Circuit breaker patterns for external services
- Graceful degradation capabilities

## Testing

Comprehensive test suite covering:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "Bitcoin Service"
npm test -- --grep "Preimage Service" 
npm test -- --grep "API Endpoints"

# Generate coverage report
npm run test:coverage
```

**Test Coverage:**
- Unit tests for all services and utilities
- Integration tests for API endpoints
- Security and validation testing
- AWS integration mocking
- Bitcoin script generation verification

## Deployment

### Production Deployment

```bash
# Build for production
NODE_ENV=production npm start

# Using PM2 for process management
npm install -g pm2
pm2 start src/app.js --name bitcoin-oracle

# Monitor with PM2
pm2 status
pm2 logs bitcoin-oracle
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "start"]
```

### AWS Deployment

The service is designed for AWS deployment with:

- **ECS/Fargate**: Containerized deployment
- **Lambda**: Serverless functions (with modifications)
- **EC2**: Traditional server deployment
- **Secrets Manager**: Secure credential storage
- **CloudWatch**: Monitoring and logging

## AWS Setup

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:btc-oracle/*"
    }
  ]
}
```

### Secrets Manager Setup

Secrets are stored with the following structure:

```json
{
  "swapId": "uuid-v4",
  "preimage": "hex_string",
  "hash": "sha256_hex",
  "userAddress": "bitcoin_address",
  "mmPubkey": "public_key_hex",
  "btcAmount": 100000000,
  "createdAt": "2025-06-21T12:00:00.000Z",
  "expiresAt": "2025-06-22T12:00:00.000Z",
  "status": "active"
}
```

## Monitoring and Observability

### Health Checks

```bash
# Service health
curl http://localhost:3000/health

# AWS connectivity
curl http://localhost:3000/api/oracle/stats
```

### Logging

Structured JSON logging in production:

```json
{
  "timestamp": "2025-06-21T12:00:00.000Z",
  "level": "INFO",
  "message": "Successfully created swap",
  "swapId": "123e4567-e89b-12d3-a456-426614174000",
  "htlcAddress": "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc"
}
```

### Metrics

Key metrics to monitor:
- Request rate and response times
- Error rates by endpoint
- AWS Secrets Manager API calls
- Bitcoin script generation time
- Cache hit/miss ratios

## Chainlink Functions Integration

The service is designed for future Chainlink DON integration:

### Authentication
- Token-based authentication for DON requests
- Request signature validation
- IP whitelisting for DON nodes

### Preimage Revelation
- Conditional preimage release based on Ethereum events
- Transaction confirmation verification
- Audit trail for all revelations

### Example Chainlink Function

```javascript
// Chainlink Function to reveal preimage
const swapId = args[0];
const ethTxHash = args[1];

const response = await Functions.makeHttpRequest({
  url: "https://your-oracle.com/api/oracle/reveal-preimage/" + swapId,
  method: "POST",
  headers: {
    "Authorization": "Bearer " + secrets.authToken
  },
  data: {
    authToken: secrets.authToken,
    ethTxHash: ethTxHash
  }
});

return Functions.encodeString(response.data.preimage);
```

## Development

### Code Style
- ESLint configuration for consistent code style
- Prettier for automatic formatting
- JSDoc comments for better IDE support

### Contributing
1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Ensure all tests pass
5. Submit a pull request

### Development Tools

```bash
# Code formatting
npm run format

# Linting
npm run lint

# Type checking (if using TypeScript)
npm run type-check
```

## Performance Considerations

### Optimization Features
- In-memory caching for frequently accessed data
- Connection pooling for AWS services
- Efficient Bitcoin script compilation
- Lazy loading of heavy dependencies

### Scalability
- Stateless service design
- Horizontal scaling support
- Database-agnostic architecture
- CDN-ready static assets

## Security Best Practices

### Implemented Security
- ✅ Input validation and sanitization
- ✅ Rate limiting and DDoS protection
- ✅ Secure secret storage
- ✅ Error message sanitization
- ✅ HTTPS enforcement (in production)
- ✅ Security headers (helmet.js)

### Recommended Additional Security
- Web Application Firewall (WAF)
- API Gateway with additional throttling
- Regular security audits
- Penetration testing
- Dependency vulnerability scanning

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test cases for usage examples

## Version History

- **v1.0.0**: Initial release with core HTLC functionality
- **v1.1.0**: AWS Secrets Manager integration
- **v1.2.0**: Enhanced security and rate limiting
- **v1.3.0**: Chainlink Functions preparation
