const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const bitcoinService = require('../services/bitcoinService');
const preimageService = require('../services/preimageService');
const awsSecretsService = require('../services/awsSecretsService');
const MMServerService = require('../services/mmServerService');
const BitcoinMonitoringService = require('../services/bitcoinMonitoringService');
const chainlinkFunctionsService = require('../services/chainlinkFunctionsService');
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


module.exports = router;
