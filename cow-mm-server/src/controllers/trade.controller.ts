import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { 
  TradeRequestDto, 
  TradeResponseDto, 
  OrderStatusResponseDto,
  QuoteDto,
  OrderKind,
  SigningScheme,
  SellTokenSource,
  BuyTokenDestination,
  ERROR_CODES,
  Quote
} from '../models';
import { CoWService } from '../services/cow.service';
import { SafeService } from '../services/safe.service';
import { validateTradeRequest, validateOrderUid } from '../utils/validators';
import { createAppError } from '../middleware/errorHandler';
import { config } from '../config/app.config';

export class TradeController {
  private cowService: CoWService;
  private safeService: SafeService;

  constructor() {
    this.cowService = new CoWService();
    this.safeService = new SafeService();
  }

  /**
   * @swagger
   * /api/trade:
   *   post:
   *     summary: Execute a trade via CoW Protocol
   *     description: |
   *       Executes a trade by creating an order on CoW Protocol. The server automatically:
   *       - Checks token balances
   *       - Ensures token approvals are in place (auto-approves if needed)
   *       - Gets a quote from CoW Protocol
   *       - Signs the order with the MM wallet
   *       - Submits the order to CoW Protocol
   *       
   *       The order will be executed by CoW Protocol solvers when optimal conditions are met.
   *     tags:
   *       - Trading
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/TradeRequest'
   *           examples:
   *             WETH_to_COW:
   *               summary: Swap WETH for COW tokens
   *               value:
   *                 sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
   *                 buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59"
   *                 sellAmount: "1000000000000000000"
   *                 userWallet: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a"
   *                 slippagePercent: 0.5
   *             Small_Trade:
   *               summary: Small test trade
   *               value:
   *                 sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
   *                 buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59"
   *                 sellAmount: "10000000000000000"
   *                 userWallet: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a"
   *     responses:
   *       200:
   *         description: Trade order created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TradeResponse'
   *       400:
   *         description: Invalid request parameters
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *             examples:
   *               invalid_token:
   *                 summary: Invalid token address
   *                 value:
   *                   success: false
   *                   error:
   *                     code: "INVALID_TOKEN_ADDRESS"
   *                     message: "Invalid trade request"
   *                     details:
   *                       - field: "sellToken"
   *                         message: "Invalid sell token address"
   *                         value: "0xInvalidAddress"
   *                   timestamp: "2025-06-21T20:11:27.479Z"
   *       401:
   *         description: Authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async executeTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tradeRequest: TradeRequestDto = req.body;

      // Validate request
      const validationErrors = validateTradeRequest(tradeRequest);
      if (validationErrors.length > 0) {
        throw createAppError(
          'Invalid trade request',
          400,
          ERROR_CODES.INVALID_TOKEN_ADDRESS,
          validationErrors
        );
      }

      console.log('Processing trade request:', tradeRequest);

      // Calculate validity period
      const validitySeconds = tradeRequest.validitySeconds || config.cow.defaultValidityPeriod;
      const validTo = Math.floor(Date.now() / 1000) + validitySeconds;

      // Get quote from CoW Protocol
      const quote = await this.cowService.getQuote({
        sellToken: tradeRequest.sellToken,
        buyToken: tradeRequest.buyToken,
        sellAmountBeforeFee: tradeRequest.sellAmount,
        from: config.wallet.mmWalletAddress,
        receiver: tradeRequest.userWallet, // Direct to user wallet
        kind: OrderKind.SELL,
        partiallyFillable: false,
        sellTokenBalance: SellTokenSource.ERC20,
        buyTokenBalance: BuyTokenDestination.ERC20,
        signingScheme: SigningScheme.EIP712,
        validTo,
        appData: '0x0000000000000000000000000000000000000000000000000000000000000000'
      });

      console.log('Quote received:', {
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        feeAmount: quote.feeAmount
      });

      // 🚀 AUTO-APPROVAL: Ensure sell token is approved before trading
      console.log('🔍 Ensuring sell token approval for trading...');
      const totalSellAmount = ethers.BigNumber.from(quote.sellAmount).add(quote.feeAmount).toString();
      
      // Check token balance first (optional but good for diagnostics)
      const tokenBalance = await this.cowService.getTokenBalance(quote.sellToken, config.wallet.mmWalletAddress);
      console.log(`💰 MM wallet balance for ${quote.sellToken}: ${ethers.utils.formatUnits(tokenBalance, 18)} tokens`);
      
      // Ensure sufficient approval for the trade
      await this.cowService.ensureTokenApproval(quote.sellToken, totalSellAmount);
      console.log('✅ Token approval confirmed - proceeding with trade execution');

      let orderUid: string;

      // Check if using Safe wallet for MM
      if (config.safe.address && config.safe.address !== '') {
        console.log('Using Safe wallet - creating pre-signed order');
        
        // Create pre-signed order for Safe wallet
        orderUid = await this.createSafePreSignedOrder(quote);
      } else {
        console.log('Using regular wallet - signing order with private key');
        
        // Sign the order with regular wallet
        const signedOrder = await this.cowService.signOrder(quote);
        console.log('Order signed successfully');

        // Submit order to CoW Protocol
        orderUid = await this.cowService.submitOrder(signedOrder);
      }

      console.log('Order submitted with UID:', orderUid);

      // Format response
      const quoteResponse: QuoteDto = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        feeAmount: quote.feeAmount,
        validTo: quote.validTo,
        priceImpact: '0.0', // TODO: Calculate actual price impact
        expiresAt: new Date(quote.validTo * 1000).toISOString()
      };

      const response: TradeResponseDto = {
        success: true,
        orderUid,
        quote: quoteResponse,
        estimatedExecutionTime: 300, // 5 minutes estimated
        message: 'Order submitted successfully'
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Creates a pre-signed order for Safe wallet
   * This involves submitting the order to CoW API first, then setting pre-signature on settlement contract
   */
  private async createSafePreSignedOrder(quote: Quote): Promise<string> {
    try {
      // Create pre-signed order structure for Safe wallet
      const preSignedOrder = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        validTo: quote.validTo,
        appData: quote.appData,
        feeAmount: quote.feeAmount,
        kind: quote.kind,
        partiallyFillable: quote.partiallyFillable,
        sellTokenBalance: quote.sellTokenBalance,
        buyTokenBalance: quote.buyTokenBalance,
        signingScheme: SigningScheme.PRESIGN,
        signature: '0x', // Empty signature for pre-signed orders
        from: config.safe.address, // Use Safe wallet address as the from address
        receiver: quote.receiver
      };

      console.log('Submitting pre-signed order to CoW API...');
      
      // Submit to CoW API first to get orderUid
      const orderUid = await this.cowService.submitOrder(preSignedOrder);
      
      console.log(`Order submitted to CoW API with UID: ${orderUid}, now setting pre-signature...`);
      
      // Then set pre-signature on settlement contract
      await this.safeService.setPreSignature(orderUid, true);
      
      console.log(`Pre-signature set successfully for order: ${orderUid}`);
      
      return orderUid;
    } catch (error) {
      console.error('Failed to create Safe pre-signed order:', error);
      throw createAppError(
        'Failed to create pre-signed order for Safe wallet',
        500,
        ERROR_CODES.SAFE_TRANSACTION_FAILED,
        error
      );
    }
  }

  /**
   * @swagger
   * /api/order-status/{orderUid}:
   *   get:
   *     summary: Get the status of an order
   *     description: |
   *       Retrieves the current status and execution details of an order from CoW Protocol.
   *       
   *       Order statuses:
   *       - `pending`: Order is being processed
   *       - `open`: Order is live and waiting for execution
   *       - `filled`: Order has been completely executed
   *       - `partiallyFilled`: Order has been partially executed
   *       - `cancelled`: Order was cancelled
   *       - `expired`: Order expired without execution
   *     tags:
   *       - Trading
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderUid
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^0x[a-fA-F0-9]{112}$'
   *         description: The unique identifier of the order (114 characters including 0x)
   *         example: "0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c929d5ab1282ee60d9be352d625a65b4f0939a46a168571885"
   *     responses:
   *       200:
   *         description: Order status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/OrderStatusResponse'
   *       400:
   *         description: Invalid order UID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Order not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async getOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderUid } = req.params;

      // Validate order UID format
      if (!validateOrderUid(orderUid)) {
        throw createAppError(
          'Invalid order UID format',
          400,
          ERROR_CODES.INVALID_TOKEN_ADDRESS
        );
      }

      console.log('Getting order status for:', orderUid);

      // Get order details from CoW Protocol
      const order = await this.cowService.getOrderStatus(orderUid);
      
      // Get trades for this order
      const trades = await this.cowService.getTrades(orderUid);

      // Format response
      const response: OrderStatusResponseDto = {
        uid: order.uid,
        status: order.status,
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        sellAmount: order.sellAmount,
        buyAmount: order.buyAmount,
        executedSellAmount: order.executedSellAmount,
        executedBuyAmount: order.executedBuyAmount,
        validTo: order.validTo,
        creationDate: order.creationDate,
        executionDate: order.txHash ? new Date().toISOString() : undefined,
        txHash: order.txHash,
        trades: trades.map(trade => ({
          blockNumber: trade.blockNumber,
          sellAmount: trade.sellAmount,
          buyAmount: trade.buyAmount,
          feeAmount: trade.feeAmount,
          txHash: trade.txHash || '',
          timestamp: trade.timestamp
        }))
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/quote:
   *   get:
   *     summary: Get a price quote for a token swap
   *     description: |
   *       Retrieves a real-time price quote from CoW Protocol for the specified token swap.
   *       This endpoint provides pricing information without executing a trade.
   *       
   *       The quote includes:
   *       - Exact sell and buy amounts
   *       - CoW Protocol fees
   *       - Quote expiration time
   *       - Current price impact
   *     tags:
   *       - Trading
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: query
   *         name: sellToken
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^0x[a-fA-F0-9]{40}$'
   *         description: Ethereum address of the token to sell
   *         example: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
   *       - in: query
   *         name: buyToken
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^0x[a-fA-F0-9]{40}$'
   *         description: Ethereum address of the token to buy
   *         example: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59"
   *       - in: query
   *         name: sellAmount
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^[0-9]+$'
   *         description: Amount to sell in smallest token unit (wei for ETH)
   *         example: "1000000000000000000"
   *       - in: query
   *         name: userWallet
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^0x[a-fA-F0-9]{40}$'
   *         description: Ethereum address of the user wallet
   *         example: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a"
   *     responses:
   *       200:
   *         description: Price quote retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Quote'
   *       400:
   *         description: Invalid request parameters
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async getQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sellToken, buyToken, sellAmount, userWallet } = req.query;

      // Basic validation
      if (!sellToken || !buyToken || !sellAmount || !userWallet) {
        throw createAppError(
          'Missing required parameters: sellToken, buyToken, sellAmount, userWallet',
          400,
          ERROR_CODES.INVALID_TOKEN_ADDRESS
        );
      }

      console.log('Getting quote for:', { sellToken, buyToken, sellAmount, userWallet });

      const validTo = Math.floor(Date.now() / 1000) + config.cow.defaultValidityPeriod;

      // Get quote from CoW Protocol
      const quote = await this.cowService.getQuote({
        sellToken: sellToken as string,
        buyToken: buyToken as string,
        sellAmountBeforeFee: sellAmount as string,
        from: config.wallet.mmWalletAddress,
        receiver: userWallet as string,
        kind: OrderKind.SELL,
        partiallyFillable: false,
        sellTokenBalance: SellTokenSource.ERC20,
        buyTokenBalance: BuyTokenDestination.ERC20,
        signingScheme: SigningScheme.EIP712,
        validTo
      });

      // Format response
      const response: QuoteDto = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        feeAmount: quote.feeAmount,
        validTo: quote.validTo,
        priceImpact: '0.0', // TODO: Calculate actual price impact
        expiresAt: new Date(quote.validTo * 1000).toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * @swagger
   * /api/cancel-order/{orderUid}:
   *   post:
   *     summary: Cancel an order
   *     description: |
   *       Cancels an open order on CoW Protocol. This operation is only possible for orders
   *       that are still open (not yet filled, expired, or already cancelled).
   *       
   *       For regular wallet orders: Creates an off-chain cancellation signature
   *       For Safe wallet orders: Sets the pre-signature to false on the settlement contract
   *       
   *       **Note**: Once cancelled, an order cannot be restored.
   *     tags:
   *       - Trading
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderUid
   *         required: true
   *         schema:
   *           type: string
   *           pattern: '^0x[a-fA-F0-9]{112}$'
   *         description: The unique identifier of the order to cancel
   *         example: "0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c929d5ab1282ee60d9be352d625a65b4f0939a46a168571885"
   *     responses:
   *       200:
   *         description: Order cancelled successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 orderUid:
   *                   type: string
   *                   example: "0x07bd4068befdfa35941b0672a352ec6ca0ce90411c11e404a0ec13d9ca0726c929d5ab1282ee60d9be352d625a65b4f0939a46a168571885"
   *                 cancellationTxHash:
   *                   type: string
   *                   description: Transaction hash of the cancellation (for Safe wallets)
   *                   example: "0x1234567890abcdef..."
   *                 message:
   *                   type: string
   *                   example: "Order cancelled successfully"
   *       400:
   *         description: Invalid order UID format
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Order not found or already in final state
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderUid } = req.params;

      if (!validateOrderUid(orderUid)) {
        throw createAppError(
          'Invalid order UID format',
          400,
          ERROR_CODES.INVALID_TOKEN_ADDRESS
        );
      }

      console.log('Cancelling order:', orderUid);

      // For pre-signed orders (Safe wallet), cancel via Safe service
      const txHash = await this.safeService.cancelPreSignedOrder(orderUid);

      res.json({
        success: true,
        orderUid,
        cancellationTxHash: txHash,
        message: 'Order cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}
