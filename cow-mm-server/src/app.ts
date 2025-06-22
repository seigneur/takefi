import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import swaggerUi from 'swagger-ui-express';
import { TradeController } from './controllers/trade.controller';
import { HealthController } from './controllers/health.controller';
import { WebSocketService } from './services/websocket.service';
import { errorHandler } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/auth.middleware';
import { config } from './config/app.config';
import { swaggerSpec } from './config/swagger.config';

class App {
  public app: express.Application;
  public server: any;
  private tradeController: TradeController;
  private healthController: HealthController;
  private webSocketService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    
    // Initialize controllers
    this.tradeController = new TradeController();
    this.healthController = new HealthController();
    
    // Initialize WebSocket service
    this.webSocketService = new WebSocketService(this.server);
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: config.server.corsOrigins,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.server.rateLimiting.windowMs,
      max: config.server.rateLimiting.maxRequests,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        },
        timestamp: new Date().toISOString()
      }
    });
    this.app.use('/api/', limiter);

    // Body parser
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check route (no authentication required)
    this.app.get('/health', this.healthController.checkHealth.bind(this.healthController));

    // API Documentation routes (no authentication required)
    this.app.use('/docs', swaggerUi.serve);
    this.app.get('/docs', swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'CoW Protocol Market Maker API',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #1976d2; }
      `,
      customfavIcon: '/favicon.ico',
    }));
    
    // Swagger JSON endpoint
    this.app.get('/docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    // API routes with authentication
    const apiRouter = express.Router();
    
    // Apply API key authentication to all API routes
    apiRouter.use(apiKeyAuth);
    
    // Trade routes (protected by authentication)
    apiRouter.post('/trade', this.tradeController.executeTrade.bind(this.tradeController));
    apiRouter.get('/quote', this.tradeController.getQuote.bind(this.tradeController));
    apiRouter.get('/order-status/:orderUid', this.tradeController.getOrderStatus.bind(this.tradeController));
    apiRouter.post('/cancel-order/:orderUid', this.tradeController.cancelOrder.bind(this.tradeController));

    // Mount API routes
    this.app.use('/api', apiRouter);

    // Root route (no authentication required)
    this.app.get('/', (req, res) => {
      res.json({
        name: 'CoW Protocol Market Maker Server',
        version: '1.0.0',
        status: 'running',
        authentication: 'API Key required for /api/* endpoints (use x-api-key header)',
        documentation: {
          swagger: '/docs',
          json: '/docs.json'
        },
        endpoints: {
          health: '/health',
          trade: 'POST /api/trade',
          quote: 'GET /api/quote',
          orderStatus: 'GET /api/order-status/:orderUid',
          cancelOrder: 'POST /api/cancel-order/:orderUid',
          websocket: 'ws://localhost:3000/ws'
        },
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.originalUrl} not found`
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public listen(): void {
    this.server.listen(config.server.port, () => {
      console.log(`
🚀 CoW Protocol Market Maker Server Started!
📡 Server running on port: ${config.server.port}
🌍 Environment: ${config.server.environment}
🔗 Chain ID: ${config.cow.chainId}
🦄 CoW API: ${config.cow.apiUrl}
💼 MM Wallet: ${config.wallet.mmWalletAddress}
🛡️  Safe Address: ${config.safe.address}
🔐 Authentication: API Key required for /api/* endpoints
📈 WebSocket: ws://localhost:${config.server.port}/ws

📋 Available Endpoints:
  GET  /health                        - Health check (no auth)
  GET  /                             - API documentation (no auth)
  POST /api/trade                    - Execute trade (requires API key)
  GET  /api/quote                    - Get price quote (requires API key)
  GET  /api/order-status/:orderUid   - Check order status (requires API key)
  POST /api/cancel-order/:orderUid   - Cancel order (requires API key)
  WS   /ws                          - WebSocket for real-time updates

🔑 Include 'x-api-key' header with valid API key for protected endpoints
⚡ Ready to process trades!
      `);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public cleanup(): void {
    this.webSocketService.cleanup();
    this.server.close();
  }
}

export default App;
