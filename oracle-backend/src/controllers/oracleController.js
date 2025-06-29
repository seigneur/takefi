const express = require("express");
const { body, param, validationResult } = require("express-validator");
const router = express.Router();

const bitcoinService = require("../services/bitcoinService");
const preimageService = require("../services/preimageService");
const awsSecretsService = require("../services/awsSecretsService");
const BitcoinMonitoringService = require("../services/bitcoinMonitoringService");
const mmServerService = require("../services/mmServerService");

const logger = require("../utils/logger");
const { validateRequest } = require("../middleware/validation");

// Initialize services
const bitcoinMonitoringService = new BitcoinMonitoringService();

/**
 * Validation rules for creating a new preimage
 */
const createPreimageValidation = [
  body("userBtcAddress")
    .isString()
    .trim()
    .isLength({ min: 26, max: 62 })
    .withMessage("Invalid Bitcoin address format"),

  body("userEthWallet")
    .isString()
    .trim()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage("Invalid Ethereum wallet address"),

  body("mmPubkey")
    .isString()
    .trim()
    .isLength({ min: 66, max: 66 })
    .matches(/^[0-9a-fA-F]{66}$/)
    .withMessage(
      "Market maker public key must be 66 hex characters (33 bytes)"
    ),

  body("btcAmount")
    .isInt({ min: 1, max: parseInt(process.env.MAX_BTC_AMOUNT) || 100000000 })
    .withMessage(
      `BTC amount must be between 1 and ${
        process.env.MAX_BTC_AMOUNT || 100000000
      } satoshis`
    ),

  body("targetToken")
    .optional()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage("Invalid target token address"),

  body("timelock")
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage("Timelock must be between 1 and 65535 blocks"),
];

/**
 * Validation rules for triggering a swap
 */
const triggerSwapValidation = [
  param("swapId").isUUID().withMessage("Invalid swap ID format"),
  body("btcTxHash")
    .optional()
    .isString()
    .withMessage("Bitcoin transaction hash must be a string"),
  body("forceExecute")
    .optional()
    .isBoolean()
    .withMessage("forceExecute must be a boolean"),
];

/**
 * @route POST /api/oracle/create-preimage
 * @desc Create a new HTLC with preimage and return swap details
 * @access Public (with rate limiting)
 */
router.post(
  "/create-preimage",
  createPreimageValidation,
  validateRequest,
  async (req, res) => {
    try {
      const {
        userBtcAddress,
        userEthWallet,
        mmPubkey,
        btcAmount,
        targetToken = "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // Default to COW on Sepolia (native token, has liquidity)
        timelock = parseInt(process.env.DEFAULT_TIMELOCK) || 144,
      } = req.body;

      logger.info("Creating new preimage for swap", {
        userBtcAddress,
        userEthWallet,
        mmPubkey: mmPubkey.substring(0, 10) + "...",
        btcAmount,
        targetToken,
        timelock,
      });

      // Validate Bitcoin address
      const addressValidation = bitcoinService.validateAddress(userBtcAddress);
      if (!addressValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Invalid Bitcoin address",
          details: addressValidation.error,
        });
      }

      // Validate public key format
      const pubkeyValidation = bitcoinService.validatePublicKey(mmPubkey);
      if (!pubkeyValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Invalid market maker public key",
          details: pubkeyValidation.error,
        });
      }

      // Generate preimage and hash
      const preimageData = preimageService.generatePreimage();
      const swapId = preimageData.swapId;

      // Create HTLC script
      const htlcResult = bitcoinService.createHTLCScript({
        hash: Buffer.from(preimageData.hash, "hex"),
        mmPubkey: Buffer.from(mmPubkey, "hex"),
        userPubkey: addressValidation.pubkey, // Extract from address if possible
        timelock,
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
        htlcScript: htlcResult.script.toString("hex"),
        htlcAddress: htlcResult.segwitAddress, // Use SegWit address
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + timelock * 10 * 60 * 1000
        ).toISOString(), // Assuming 10 min blocks
        status: "pending", // Changed from 'active' to 'pending'
        btcTxHash: null,
        cowOrderUid: null,
        cowOrderStatus: null,
      };

      // Store in AWS Secrets Manager
      await awsSecretsService.storeSwapSecret(swapId, swapMetadata);

      // Return response - conditionally include preimage for non-production networks
      const response = {
        success: true,
        data: {
          swapId,
          hash: preimageData.hash,
          htlcScript: htlcResult.script.toString("hex"),
          htlcAddress: htlcResult.segwitAddress, // Use SegWit address
          expiresAt: swapMetadata.expiresAt,
          timelock,
          monitoringStarted: true,
        },
      };

      // Only include preimage for regtest/testnet environments (not mainnet)
      const bitcoinNetwork = process.env.BITCOIN_NETWORK || "testnet";
      if (bitcoinNetwork === "regtest" || bitcoinNetwork === "testnet") {
        response.data.preimage = preimageData.preimage;
        logger.warn(
          "Preimage included in response for non-production network",
          { bitcoinNetwork }
        );
      }

      // Start monitoring the HTLC address for Bitcoin payments (non-blocking)
      setImmediate(async () => {
        try {
          logger.info("Starting Bitcoin monitoring for swap", {
            swapId,
            htlcAddress: htlcResult.segwitAddress,
          });
          await bitcoinMonitoringService.startMonitoring(
            swapId,
            htlcResult.segwitAddress,
            Number(btcAmount) / 100000000
          ); // Convert satoshis to BTC
          logger.info("Bitcoin monitoring started successfully", { swapId });
        } catch (monitoringError) {
          logger.error("Failed to start Bitcoin monitoring", {
            swapId,
            error: monitoringError.message,
          });
          // Don't fail the entire request if monitoring fails - the swap is still created
        }
      });

      logger.info("Successfully created swap", {
        swapId,
        htlcAddress: htlcResult.segwitAddress,
      });
      res.status(201).json(response);
    } catch (error) {
      logger.error("Error creating preimage:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

/**
 * @route GET /api/oracle/swap/:swapId
 * @desc Get swap details by ID (without preimage)
 * @access Public
 */
router.get(
  "/swap/:swapId",
  param("swapId").isUUID().withMessage("Invalid swap ID format"),
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;

      logger.info("Retrieving swap details", { swapId });

      const swapData = await awsSecretsService.getSwapSecret(swapId);

      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: "Swap not found",
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
        },
      };

      res.json(response);
    } catch (error) {
      logger.error("Error retrieving swap:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

/**
 * @route POST /api/oracle/trigger-swap/:swapId
 * @desc Trigger a swap execution when Bitcoin payment is confirmed
 * @access Private (called by monitoring service)
 */
router.post(
  "/trigger-swap/:swapId",
  triggerSwapValidation,
  validateRequest,
  async (req, res) => {
    try {
      const { swapId } = req.params;
      const { btcTxHash, confirmations = 1 } = req.body;

      logger.info("Triggering swap execution", {
        swapId,
        btcTxHash,
        confirmations,
      });

      // Get swap details from AWS Secrets Manager
      const swapData = await awsSecretsService.getSwapSecret(swapId);
      if (!swapData) {
        return res.status(404).json({
          success: false,
          error: "Swap not found",
        });
      }

      // Check if swap is already processed
      if (swapData.status === "completed" || swapData.status === "executing") {
        return res.status(400).json({
          success: false,
          error: `Swap is already ${swapData.status}`,
        });
      }

      // Update swap status to executing
      const updatedSwapData = {
        ...swapData,
        status: "executing",
        btcTxHash,
        confirmations,
        executionStarted: new Date().toISOString(),
      };
      await awsSecretsService.storeSwapSecret(swapId, updatedSwapData);

      try {
        // Execute trade via Market Maker
        logger.info("Executing trade via MM service", {
          swapId,
          sellAmount: swapData.btcAmount,
          userWallet: swapData.userEthWallet,
          targetToken: swapData.targetToken,
        });

        // Convert BTC satoshis to WETH wei (1:1 ratio for demo purposes)
        // In production, this would use actual BTC/ETH exchange rate
        const wethAmount = swapData.btcAmount + "00000000000"; // Add 11 zeros to convert satoshis to wei (demo ratio)

        // Get quote first
        const quote = await mmServerService.getQuote({
          sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on testnet
          buyToken: swapData.targetToken,
          sellAmount: wethAmount,
          userWallet: swapData.userEthWallet,
        });

        logger.info("Received quote from MM", {
          swapId,
          btcAmount: swapData.btcAmount,
          wethAmount,
          quote,
        });

        // Execute the trade
        const tradeResult = await mmServerService.executeTrade({
          sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on testnet
          buyToken: swapData.targetToken,
          sellAmount: wethAmount,
          userWallet: swapData.userEthWallet,
          slippagePercent: 0.5, // 0.5% slippage
        });

        logger.info("Trade executed successfully", {
          swapId,
          orderUid: tradeResult.orderUid,
        });

        // Update swap status to completed
        const completedSwapData = {
          ...updatedSwapData,
          status: "completed",
          orderUid: tradeResult.orderUid,
          quote: quote,
          tradeResult: tradeResult,
          completedAt: new Date().toISOString(),
        };
        await awsSecretsService.storeSwapSecret(swapId, completedSwapData);

        res.json({
          success: true,
          data: {
            swapId,
            status: "completed",
            orderUid: tradeResult.orderUid,
            btcTxHash,
            confirmations,
          },
        });
      } catch (tradeError) {
        logger.error("Trade execution failed", {
          swapId,
          error: tradeError.message,
        });

        // Update swap status to failed
        const failedSwapData = {
          ...updatedSwapData,
          status: "failed",
          error: tradeError.message,
          failedAt: new Date().toISOString(),
        };
        await awsSecretsService.storeSwapSecret(swapId, failedSwapData);

        res.status(500).json({
          success: false,
          error: "Trade execution failed",
          details: tradeError.message,
        });
      }
    } catch (error) {
      logger.error("Error triggering swap:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

module.exports = router;
