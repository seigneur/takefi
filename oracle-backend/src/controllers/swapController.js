const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const bitcoinService = require('../services/bitcoinService');
const preimageService = require('../services/preimageService');
const awsSecretsService = require('../services/awsSecretsService');
const logger = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');

/**
 * Validation rules for creating a new preimage
 */
const createPreimageValidation = [
  body('userBtcAddress')
    .isString()
    .trim()
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid Bitcoin address format'),
  
  body('mmPubkey')
    .isString()
    .trim()
    .isLength({ min: 66, max: 66 })
    .matches(/^[0-9a-fA-F]{66}$/)
    .withMessage('Market maker public key must be 66 hex characters (33 bytes)'),
  
  body('btcAmount')
    .isInt({ min: 1, max: parseInt(process.env.MAX_BTC_AMOUNT) || 100000000 })
    .withMessage(`BTC amount must be between 1 and ${process.env.MAX_BTC_AMOUNT || 100000000} satoshis`),
  
  body('timelock')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('Timelock must be between 1 and 65535 blocks')
];

/**
 * @route POST /api/oracle/create-preimage
 * @desc Create a new HTLC with preimage and return swap details
 * @access Public (with rate limiting)
 */
router.post('/create-preimage', createPreimageValidation, validateRequest, async (req, res) => {
  try {
    const { userBtcAddress, mmPubkey, btcAmount, timelock = parseInt(process.env.DEFAULT_TIMELOCK) || 144 } = req.body;

    logger.info('Creating new preimage for swap', {
      userBtcAddress,
      mmPubkey: mmPubkey.substring(0, 10) + '...',
      btcAmount,
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
      hash: preimageData.hash,
      mmPubkey: Buffer.from(mmPubkey, 'hex'),
      userPubkey: addressValidation.pubkey, // Extract from address if possible
      timelock
    });

    // Prepare swap metadata
    const swapMetadata = {
      swapId,
      preimage: preimageData.preimage,
      hash: preimageData.hash,
      userAddress: userBtcAddress,
      mmPubkey,
      btcAmount,
      timelock,
      htlcScript: htlcResult.script.toString('hex'),
      htlcAddress: htlcResult.address,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (timelock * 10 * 60 * 1000)).toISOString(), // Assuming 10 min blocks
      status: 'active'
    };

    // Store in AWS Secrets Manager
    await awsSecretsService.storeSwapSecret(swapId, swapMetadata);

    // Return response without preimage
    const response = {
      success: true,
      data: {
        swapId,
        hash: preimageData.hash,
        htlcScript: htlcResult.script.toString('hex'),
        htlcAddress: htlcResult.address,
        expiresAt: swapMetadata.expiresAt,
        timelock
      }
    };

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
          userAddress: swapData.userAddress,
          mmPubkey: swapData.mmPubkey,
          btcAmount: swapData.btcAmount,
          timelock: swapData.timelock,
          htlcScript: swapData.htlcScript,
          htlcAddress: swapData.htlcAddress,
          createdAt: swapData.createdAt,
          expiresAt: swapData.expiresAt,
          status: swapData.status
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


module.exports = router;
