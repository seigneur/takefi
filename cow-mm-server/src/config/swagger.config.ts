import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './app.config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CoW Protocol Market Maker API',
      version: '1.0.0',
      description: `
# CoW Protocol Market Maker Server

A sophisticated Express.js server that acts as a Market Maker using CoW Protocol for executing trades.

## Features

- 🔄 **Automated Trading**: Execute trades via CoW Protocol with auto-approval
- 📊 **Real-time Tracking**: WebSocket integration for live order updates  
- 🛡️ **Safe Integration**: Support for Safe multisig wallets with pre-signed orders
- 🔐 **Secure Authentication**: API key-based authentication for all trading endpoints
- 📈 **Quote Generation**: Real-time price quotes from CoW Protocol
- ⚡ **Health Monitoring**: Comprehensive health checks for all services

## Authentication

All API endpoints (except \`/health\` and \`/\`) require authentication via API key:

**Header**: \`x-api-key: your-api-key-here\`

## Rate Limiting

- **Limit**: 100 requests per 15 minutes per IP
- **Scope**: All \`/api/*\` endpoints
- **Response**: 429 Too Many Requests when exceeded

## Networks Supported

- **Mainnet** (Chain ID: 1)
- **Gnosis Chain** (Chain ID: 100) 
- **Sepolia Testnet** (Chain ID: 11155111)

## Error Handling

All endpoints return consistent error responses with:
- \`success: false\`
- \`error.code\`: Machine-readable error code
- \`error.message\`: Human-readable description
- \`timestamp\`: ISO timestamp
      `,
      contact: {
        name: 'CoW Protocol Market Maker API',
        url: 'https://cow.fi',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}`,
        description: 'Development server',
      },
      {
        url: 'https://your-production-domain.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for authentication. Required for all /api/* endpoints.',
        },
      },
      schemas: {
        TradeRequest: {
          type: 'object',
          required: ['sellToken', 'buyToken', 'sellAmount', 'userWallet'],
          properties: {
            sellToken: {
              type: 'string',
              pattern: '^0x[a-fA-F0-9]{40}$',
              description: 'Ethereum address of the token to sell',
              example: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            },
            buyToken: {
              type: 'string', 
              pattern: '^0x[a-fA-F0-9]{40}$',
              description: 'Ethereum address of the token to buy',
              example: '0x0625aFB445C3B6B7B929342a04A22599fd5dBB59',
            },
            sellAmount: {
              type: 'string',
              pattern: '^[0-9]+$',
              description: 'Amount to sell in smallest token unit (wei for ETH)',
              example: '1000000000000000000',
            },
            userWallet: {
              type: 'string',
              pattern: '^0x[a-fA-F0-9]{40}$', 
              description: 'Ethereum address of the user wallet to receive bought tokens',
              example: '0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a',
            },
            slippagePercent: {
              type: 'number',
              minimum: 0,
              maximum: 50,
              description: 'Maximum acceptable slippage percentage (optional)',
              example: 0.5,
            },
            validitySeconds: {
              type: 'integer',
              minimum: 60,
              maximum: 3600,
              description: 'Order validity period in seconds (optional, default: 1800)',
              example: 1800,
            },
          },
        },
        TradeResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            orderUid: {
              type: 'string',
              pattern: '^0x[a-fA-F0-9]{114}$',
              description: 'Unique identifier for the created order',
              example: '0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c929d5ab1282ee60d9be352d625a65b4f0939a46a168571885',
            },
            quote: { $ref: '#/components/schemas/Quote' },
            estimatedExecutionTime: {
              type: 'integer',
              description: 'Estimated time until order execution in seconds',
              example: 300,
            },
            message: {
              type: 'string',
              example: 'Order submitted successfully',
            },
          },
        },
        Quote: {
          type: 'object',
          properties: {
            sellToken: {
              type: 'string',
              example: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            },
            buyToken: {
              type: 'string',
              example: '0x0625aFB445C3B6B7B929342a04A22599fd5dBB59',
            },
            sellAmount: {
              type: 'string',
              description: 'Actual sell amount after fees',
              example: '999792643987995',
            },
            buyAmount: {
              type: 'string', 
              description: 'Expected buy amount',
              example: '4988521682908217006',
            },
            feeAmount: {
              type: 'string',
              description: 'CoW Protocol fee amount',
              example: '207356012005',
            },
            validTo: {
              type: 'integer',
              description: 'Unix timestamp when order expires',
              example: 1750538363,
            },
            priceImpact: {
              type: 'string',
              description: 'Price impact percentage',
              example: '0.0',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'ISO timestamp when order expires',
              example: '2025-06-21T20:39:23.000Z',
            },
          },
        },
        OrderStatusResponse: {
          type: 'object',
          properties: {
            uid: {
              type: 'string',
              example: '0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c929d5ab1282ee60d9be352d625a65b4f0939a46a168571885',
            },
            status: {
              type: 'string',
              enum: ['pending', 'open', 'filled', 'cancelled', 'expired', 'partiallyFilled'],
              example: 'open',
            },
            sellToken: { type: 'string' },
            buyToken: { type: 'string' },
            sellAmount: { type: 'string' },
            buyAmount: { type: 'string' },
            executedSellAmount: { type: 'string', nullable: true },
            executedBuyAmount: { type: 'string', nullable: true },
            validTo: { type: 'integer' },
            creationDate: { type: 'string' },
            executionDate: { type: 'string', nullable: true },
            txHash: { type: 'string', nullable: true },
            trades: {
              type: 'array',
              items: { $ref: '#/components/schemas/Trade' },
            },
          },
        },
        Trade: {
          type: 'object',
          properties: {
            blockNumber: { type: 'integer' },
            sellAmount: { type: 'string' },
            buyAmount: { type: 'string' },
            feeAmount: { type: 'string' },
            txHash: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy'],
              example: 'healthy',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-06-21T20:12:06.419Z',
            },
            uptime: {
              type: 'integer',
              description: 'Server uptime in seconds',
              example: 206,
            },
            services: {
              type: 'object',
              properties: {
                cowApi: {
                  type: 'string',
                  enum: ['up', 'down'],
                  example: 'up',
                },
                safeWallet: {
                  type: 'string',
                  enum: ['up', 'down'],
                  example: 'up',
                },
                blockchain: {
                  type: 'string', 
                  enum: ['up', 'down'],
                  example: 'up',
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Machine-readable error code',
                  example: 'INVALID_TOKEN_ADDRESS',
                },
                message: {
                  type: 'string', 
                  description: 'Human-readable error description',
                  example: 'Invalid trade request',
                },
                details: {
                  type: 'array',
                  description: 'Detailed validation errors (optional)',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                      value: { },
                    },
                  },
                },
              },
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-06-21T20:11:27.479Z',
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: [
    './src/controllers/*.ts',
    './src/app.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);