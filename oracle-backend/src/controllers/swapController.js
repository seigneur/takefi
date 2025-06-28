const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const bitcoinService = require('../services/bitcoinService');
const preimageService = require('../services/preimageService');
const awsSecretsService = require('../services/awsSecretsService');
const MMServerService = require('../services/mmServerService');
const BitcoinMonitoringService = require('../services/bitcoinMonitoringService');
const cowOrderTracker = require('../services/cowOrderTracker');
const logger = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');

// Initialize services
const mmServerService = new MMServerService();
const bitcoinMonitoringService = new BitcoinMonitoringService();

/**
 * Validation rules for creating a new preimage
 */
const createPreimageValidation = [
  body('userBtcAddress')
    .isString()
    .trim()
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid Bitcoin address format'),
  
  body('userEthWallet')
    .isString()
    .trim()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid Ethereum wallet address'),
  
  body('mmPubkey')
    .isString()
    .trim()
    .isLength({ min: 66, max: 66 })
    .matches(/^[0-9a-fA-F]{66}$/)
    .withMessage('Market maker public key must be 66 hex characters (33 bytes)'),
  
  body('btcAmount')
    .isInt({ min: 1, max: parseInt(process.env.MAX_BTC_AMOUNT) || 100000000 })
    .withMessage(`BTC amount must be between 1 and ${process.env.MAX_BTC_AMOUNT || 100000000} satoshis`),
  
  body('targetToken')
    .optional()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid target token address'),
  
  body('timelock')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('Timelock must be between 1 and 65535 blocks')
];

/**
 * Validation rules for triggering a swap
 */
const triggerSwapValidation = [
  param('swapId').isUUID().withMessage('Invalid swap ID format'),
  body('btcTxHash')
    .optional()
    .isString()
    .withMessage('Bitcoin transaction hash must be a string'),
  body('forceExecute')
    .optional()
    .isBoolean()
    .withMessage('forceExecute must be a boolean')
];

/**
 * @route POST /api/oracle/create-preimage
 * @desc Create a new HTLC with preimage and return swap details
 * @access Public (with rate limiting)
 */
router.post('/create-preimage', createPreimageValidation, validateRequest, async (req, res) => {
  try {
    const { 
      userBtcAddress, 
      userEthWallet,
      mmPubkey, 
      btcAmount, 
      targetToken = '0x0625aFB445C3B6B7B929342a04A22599fd5dBB59', // Default to COW on Sepolia (native token, has liquidity)
      timelock = parseInt(process.env.DEFAULT_TIMELOCK) || 144 
    } = req.body;

    logger.info('Creating new preimage for swap', {
      userBtcAddress,
      userEthWallet,
      mmPubkey: mmPubkey.substring(0, 10) + '...',
      btcAmount,
      targetToken,
      timelock
    });

    // Validate Bitcoin address
    const addressValidation = bitcoinService.validateAddress(userBtcAddress);
    if (!addressValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Bitcoin address',
        details: addressValidation.error
      });
    }

    // Validate public key format
    const pubkeyValidation = bitcoinService.validatePublicKey(mmPubkey);
    if (!pubkeyValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid market maker public key',
        details: pubkeyValidation.error
      });
    }

    // Generate preimage and hash
    const preimageData = preimageService.generatePreimage();
    const swapId = preimageData.swapId;

    // Create HTLC script
    const htlcResult = bitcoinService.createHTLCScript({
      hash: Buffer.from(preimageData.hash, 'hex'),
      mmPubkey: Buffer.from(mmPubkey, 'hex'),
      userPubkey: addressValidation.pubkey, // Extract from address if possible
      timelock
    });

    // Prepare swap metadata
    const swapMetadata = {
      swapId,
      preimage: preimageData.preimage,
      hash: preimageData.hash,
      userBtcAddress: userBtcAddress,
      userEthWallet: userEthWallet,
      mmPubkey,
      btcAmount,
      targetToken,
      timelock,
      htlcScript: htlcResult.script.toString('hex'),
      htlcAddress: htlcResult.segwitAddress, // Use SegWit address
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (timelock * 10 * 60 * 1000)).toISOString(), // Assuming 10 min blocks
      status: 'pending', // Changed from 'active' to 'pending'
      btcTxHash: null,
      cowOrderUid: null,
      cowOrderStatus: null
    };

    // Store in AWS Secrets Manager
    await awsSecretsService.storeSwapSecret(swapId, swapMetadata);

    // Return response - conditionally include preimage for non-production networks
    const response = {
      success: true,
      data: {
        swapId,
        hash: preimageData.hash,
        htlcScript: htlcResult.script.toString('hex'),
        htlcAddress: htlcResult.segwitAddress, // Use SegWit address
        expiresAt: swapMetadata.expiresAt,
        timelock,
        monitoringStarted: true
      }
    };

    // Only include preimage for regtest/testnet environments (not mainnet)
    const bitcoinNetwork = process.env.BITCOIN_NETWORK || 'mainnet';
    if (bitcoinNetwork === 'regtest' || bitcoinNetwork === 'testnet') {
      response.data.preimage = preimageData.preimage;
      logger.warn('Preimage included in response for non-production network', { bitcoinNetwork });
    }

    logger.info('Successfully created swap', { swapId, htlcAddress: htlcResult.address });
    res.status(201).json(response);

  } catch (error) {
    logger.error('Error creating preimage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /api/oracle/swap/:swapId
 * @desc Get swap details by ID (without preimage)
 * @access Public
 */
router.get('/swap/:swapId', 
  param('swapId').isUUID().withMessage('Invalid swap ID format'),
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;

      logger.info('Retrieving swap details', { swapId });

      const swapData = await awsSecretsService.getSwapSecret(swapId);
      
      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: 'Swap not found'
        });
      }

      // Return swap details without preimage
      const response = {
        success: true,
        data: {
          swapId: swapData.swapId,
          hash: swapData.hash,
          userBtcAddress: swapData.userBtcAddress,
          userEthWallet: swapData.userEthWallet,
          mmPubkey: swapData.mmPubkey,
            
          btcAmount: swapData.btcAmount,
          targetToken: swapData.targetToken,
          timelock: swapData.timelock,
          htlcScript: swapData.htlcScript,
          htlcAddress: swapData.htlcAddress,
          createdAt: swapData.createdAt,
          expiresAt: swapData.expiresAt,
          status: swapData.status,
          btcTxHash: swapData.btcTxHash,
          cowOrderUid: swapData.cowOrderUid,
          cowOrderStatus: swapData.cowOrderStatus,
          monitoringStatus: bitcoinMonitoringService.getMonitoringStatus(swapData.swapId)
        }
      };

      res.json(response);

    } catch (error) {
      logger.error('Error retrieving swap:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/oracle/swap/:swapId/hash
 * @desc Get the hash that the market maker needs to sign for HTLC spending
 * @access Public
 */
router.get('/swap/:swapId/hash', [
  param('swapId')
    .isUUID(4)
    .withMessage('Invalid swap ID format')
], validateRequest, async (req, res) => {
  try {
    const { swapId } = req.params;
    
    logger.info('Retrieving hash for MM signature', { swapId });

    // Retrieve swap details from AWS Secrets Manager
    const swapMetadata = await awsSecretsService.getSwapSecret(swapId);
    
    if (!swapMetadata) {
      return res.status(404).json({
        success: false,
        error: 'Swap not found'
      });
    }

    // Check if swap is still active
    if (new Date() > new Date(swapMetadata.expiresAt)) {
      return res.status(410).json({
        success: false,
        error: 'Swap has expired'
      });
    }

    // Return hash and relevant signing information
    const response = {
      success: true,
      data: {
        swapId,
        hash: swapMetadata.hash,
        htlcScript: swapMetadata.htlcScript,
        htlcAddress: swapMetadata.htlcAddress,
        btcAmount: swapMetadata.btcAmount,
        timelock: swapMetadata.timelock,
        expiresAt: swapMetadata.expiresAt,
        status: swapMetadata.status
      }
    };

    logger.info('Successfully retrieved hash for MM signature', { swapId });
    res.status(200).json(response);

  } catch (error) {
    logger.error('Error retrieving hash for MM signature:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /api/oracle/reveal-preimage/:swapId
 * @desc Reveal preimage for completed swap (Future Chainlink integration)
 * @access Protected (requires authentication)
 */
router.post('/reveal-preimage/:swapId',
  param('swapId').isUUID().withMessage('Invalid swap ID format'),
  body('authToken').isString().notEmpty().withMessage('Authentication token required'),
  body('ethTxHash').optional().isString().withMessage('Ethereum transaction hash must be string'),
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;
      const { authToken, ethTxHash } = req.body;

      logger.info('Preimage reveal requested', { swapId, ethTxHash });

      // TODO: Implement Chainlink DON authentication
      // For now, using placeholder authentication
      if (authToken !== 'chainlink-don-token') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const swapData = await awsSecretsService.getSwapSecret(swapId);
      
      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: 'Swap not found'
        });
      }

      if (swapData.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: 'Swap is not active'
        });
      }

      // Check if swap has expired
      if (new Date() > new Date(swapData.expiresAt)) {
        // Update status to expired
        await awsSecretsService.updateSwapStatus(swapId, 'expired');
        
        return res.status(400).json({
          success: false,
          error: 'Swap has expired'
        });
      }

      // TODO: Verify Ethereum transaction confirmations
      // For now, mark as used and return preimage
      await awsSecretsService.updateSwapStatus(swapId, 'used');

      const response = {
        success: true,
        data: {
          swapId,
          preimage: swapData.preimage,
          revealedAt: new Date().toISOString(),
          ethTxHash
        }
      };

      logger.info('Preimage revealed successfully', { swapId, ethTxHash });
      res.json(response);

    } catch (error) {
      logger.error('Error revealing preimage:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route POST /api/oracle/trigger-swap/:swapId
 * @desc Trigger token swap execution via MM Server when BTC is received
 * @access Public (will be called by Bitcoin monitoring system)
 */
router.post('/trigger-swap/:swapId', 
  triggerSwapValidation, 
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;
      const { btcTxHash, forceExecute = false } = req.body;

      logger.info('Swap trigger requested', { swapId, btcTxHash, forceExecute });

      // Get swap data from AWS
      const swapData = await awsSecretsService.getSwapSecret(swapId);
      
      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: 'Swap not found'
        });
      }

      // Check if swap is in correct state
      if (swapData.status !== 'pending' && !forceExecute) {
        return res.status(400).json({
          success: false,
          error: `Swap is not in pending state. Current status: ${swapData.status}`
        });
      }

      // Check if swap has expired
      if (new Date() > new Date(swapData.expiresAt)) {
        await awsSecretsService.updateSwapStatus(swapId, 'expired');
        
        return res.status(400).json({
          success: false,
          error: 'Swap has expired'
        });
      }

      // Update status to indicate BTC received
      await awsSecretsService.updateSwapStatus(swapId, 'btc_received', {
        btcTxHash: btcTxHash,
        btcReceivedAt: new Date().toISOString()
      });

      logger.info('BTC payment confirmed, initiating token swap', { swapId, btcTxHash });

      try {
        // Step 1: Get quote from MM Server
        logger.info('Getting quote from MM Server for swap', { swapId });
        
        // For Sepolia testnet testing: use a fixed WETH amount that has proven liquidity
        // CoW Protocol requires minimum trade sizes (~0.1 ETH) for liquidity routing
        const testnetWethAmount = "100000000000000000"; // 0.1 ETH - proven to work with CoW Protocol
        
        logger.info('Using fixed testnet amount for CoW Protocol compatibility', {
          originalBtcAmount: swapData.btcAmount,
          wethAmountUsed: testnetWethAmount,
          note: 'Fixed amount ensures liquidity availability on testnet'
        });
        
        const quoteParams = {
          sellToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia 
          buyToken: swapData.targetToken,
          sellAmount: testnetWethAmount,
          userWallet: swapData.userEthWallet
        };

        const quote = await mmServerService.getQuote(quoteParams);
        logger.info('Quote received from MM Server', {
          swapId,
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          feeAmount: quote.feeAmount
        });

        // Step 2: Execute trade via MM Server
        logger.info('Executing trade via MM Server', { swapId });
        
        const tradeParams = {
          sellToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
          buyToken: swapData.targetToken,
          sellAmount: testnetWethAmount,
          userWallet: swapData.userEthWallet,
          slippagePercent: 0.5,
          validitySeconds: 1800 // 30 minutes
        };

        const tradeResult = await mmServerService.executeTrade(tradeParams);
        logger.info('Trade executed successfully', {
          swapId,
          orderUid: tradeResult.orderUid,
          estimatedExecutionTime: tradeResult.estimatedExecutionTime
        });

        // Step 3: Update swap with CoW order details
        await awsSecretsService.updateSwapStatus(swapId, 'order_submitted', {
          btcTxHash: btcTxHash,
          btcReceivedAt: new Date().toISOString(),
          cowOrderUid: tradeResult.orderUid,
          cowOrderStatus: 'submitted',
          orderSubmittedAt: new Date().toISOString(),
          quote: quote,
          tradeResult: tradeResult
        });

        // Step 4: Start tracking the CoW order
        await cowOrderTracker.startTracking(swapId, tradeResult.orderUid, {
          swapId,
          orderUid: tradeResult.orderUid,
          sellToken: quote.sellToken,
          buyToken: quote.buyToken,
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          userWallet: swapData.userEthWallet
        });

        const response = {
          success: true,
          data: {
            swapId,
            status: 'order_submitted',
            btcTxHash,
            cowOrderUid: tradeResult.orderUid,
            quote,
            estimatedExecutionTime: tradeResult.estimatedExecutionTime,
            explorerUrl: `https://explorer.cow.fi/sepolia/orders/${tradeResult.orderUid}`,
            message: 'Order submitted to CoW Protocol - tracking execution...'
          }
        };

        logger.info('Swap triggered successfully', { swapId, orderUid: tradeResult.orderUid });
        res.json(response);

      } catch (mmError) {
        logger.error('Failed to execute swap via MM Server:', mmError);
        
        // Update status to indicate MM server failure
        await awsSecretsService.updateSwapStatus(swapId, 'mm_failed', {
          btcTxHash: btcTxHash,
          btcReceivedAt: new Date().toISOString(),
          error: mmError.message,
          failedAt: new Date().toISOString()
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to execute token swap',
          details: mmError.message
        });
      }

    } catch (error) {
      logger.error('Error triggering swap:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/oracle/mm-server-health
 * @desc Check MM Server connectivity and health
 * @access Public
 */
router.get('/mm-server-health', async (req, res) => {
  try {
    logger.info('Checking MM Server health');
    
    const healthResult = await mmServerService.checkHealth();
    const isConnected = await mmServerService.validateConnection();
    
    res.json({
      success: true,
      data: {
        mmServerConnected: isConnected,
        mmServerHealth: healthResult,
        mmServerUrl: process.env.MM_SERVER_URL || 'http://localhost:3000',
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('MM Server health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'MM Server health check failed',
      details: error.message
    });
  }
});

/**
 * @route GET /api/oracle/order-tracking/:swapId
 * @desc Get real-time order tracking status
 * @access Public
 */
router.get('/order-tracking/:swapId',
  param('swapId').isUUID().withMessage('Invalid swap ID format'),
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;
      
      logger.info('Getting order tracking status', { swapId });
      
      const trackingStatus = cowOrderTracker.getTrackingStatus(swapId);
      const swapData = await awsSecretsService.getSwapSecret(swapId);
      
      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: 'Swap not found'
        });
      }

      const response = {
        success: true,
        data: {
          swapId,
          tracking: trackingStatus,
          currentStatus: swapData.status,
          cowOrderUid: swapData.cowOrderUid,
          cowOrderStatus: swapData.cowOrderStatus,
          explorerUrl: swapData.cowOrderUid ? 
            `https://explorer.cow.fi/sepolia/orders/${swapData.cowOrderUid}` : null,
          txHash: swapData.txHash,
          executedAmounts: {
            sell: swapData.executedSellAmount,
            buy: swapData.executedBuyAmount
          },
          timestamps: {
            created: swapData.createdAt,
            orderSubmitted: swapData.orderSubmittedAt,
            completed: swapData.completedAt,
            failed: swapData.failedAt
          }
        }
      };
      
      res.json(response);
    } catch (error) {
      logger.error('Error getting order tracking status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/oracle/tracking-sessions
 * @desc Get all active tracking sessions (for monitoring)
 * @access Public
 */
router.get('/tracking-sessions', async (req, res) => {
  try {
    const sessions = cowOrderTracker.getActiveTrackingSessions();
    
    res.json({
      success: true,
      data: {
        activeSessions: sessions.length,
        sessions: sessions,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error getting tracking sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});


module.exports = router;
