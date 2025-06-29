const express = require('express');
const { param, validationResult } = require('express-validator');
const router = express.Router();

const PublicBitcoinRPCClient = require('../../bitcoin-rpc-public');
const logger = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');
const { getCurrentBitcoinNetwork } = require('../config/bitcoin-network.config');

// Initialize Bitcoin RPC client with centralized network config
const bitcoinRPC = new PublicBitcoinRPCClient({ network: getCurrentBitcoinNetwork().name });

/**
 * @route GET /api/bitcoin/check-payment/:address
 * @desc Check if a Bitcoin address has received payments
 * @access Public
 */
router.get('/check-payment/:address', 
  param('address').isString().trim().isLength({ min: 26, max: 62 }).withMessage('Invalid Bitcoin address format'),
  validateRequest,
  async (req, res) => {
    try {
      const { address } = req.params;
      const { minAmount } = req.query; // Optional minimum amount filter

      logger.info('Checking Bitcoin payment for address', { address });

      // Get address balance
      const balance = await bitcoinRPC.getAddressBalance(address);
      
      // Get transactions for the address
      const transactions = await bitcoinRPC.getAddressTransactions(address);
      
      // Filter transactions if minAmount is specified
      let relevantTransactions = transactions;
      if (minAmount) {
        const minAmountSats = parseFloat(minAmount) * 100000000; // Convert BTC to satoshis
        relevantTransactions = transactions.filter(tx => {
          // Calculate received amount for this address
          const receivedAmount = tx.vout
            .filter(output => output.scriptpubkey_address === address)
            .reduce((sum, output) => sum + output.value, 0);
          return receivedAmount >= minAmountSats;
        });
      }

      // Get latest transaction details
      const latestTx = relevantTransactions.length > 0 ? relevantTransactions[0] : null;
      
      // Calculate total received amount
      const totalReceived = relevantTransactions.reduce((total, tx) => {
        const receivedInTx = tx.vout
          .filter(output => output.scriptpubkey_address === address)
          .reduce((sum, output) => sum + output.value, 0);
        return total + receivedInTx;
      }, 0);

      const response = {
        success: true,
        data: {
          address,
          balance, // Current balance in BTC
          balanceSats: Math.round(balance * 100000000), // Current balance in satoshis
          totalReceived: totalReceived / 100000000, // Total received in BTC
          totalReceivedSats: totalReceived, // Total received in satoshis
          transactionCount: relevantTransactions.length,
          hasPayments: relevantTransactions.length > 0,
          latestTransaction: latestTx ? {
            txid: latestTx.txid,
            confirmations: latestTx.status?.confirmed ? 
              (latestTx.status.block_height ? 'confirmed' : 'unconfirmed') : 'unconfirmed',
            blockHeight: latestTx.status?.block_height || null,
            timestamp: latestTx.status?.block_time || null,
            amount: latestTx.vout
              .filter(output => output.scriptpubkey_address === address)
              .reduce((sum, output) => sum + output.value, 0) / 100000000, // Amount in BTC
            explorerUrl: `https://mempool.space/testnet/tx/${latestTx.txid}`
          } : null,
          explorerUrl: `https://mempool.space/testnet/address/${address}`,
          checkedAt: new Date().toISOString()
        }
      };

      logger.info('Bitcoin payment check completed', { 
        address, 
        hasPayments: response.data.hasPayments,
        transactionCount: response.data.transactionCount,
        balance: response.data.balance
      });

      res.json(response);

    } catch (error) {
      logger.error('Error checking Bitcoin payment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check Bitcoin payment',
        details: error.message
      });
    }
  }
);

/**
 * @route GET /api/bitcoin/wait-payment/:address
 * @desc Wait for a Bitcoin payment to arrive (with timeout)
 * @access Public  
 */
router.get('/wait-payment/:address',
  param('address').isString().trim().isLength({ min: 26, max: 62 }).withMessage('Invalid Bitcoin address format'),
  validateRequest,
  async (req, res) => {
    try {
      const { address } = req.params;
      const { minAmount = 0.00001, timeout = 300 } = req.query; // Default 5 minute timeout

      logger.info('Waiting for Bitcoin payment', { address, minAmount, timeout });

      // Use the existing waitForTransaction method
      const received = await bitcoinRPC.waitForTransaction(
        address, 
        parseFloat(minAmount), 
        parseInt(timeout)
      );

      if (received) {
        // Get the actual transaction details
        const transactions = await bitcoinRPC.getAddressTransactions(address);
        const latestTx = transactions[0];

        const response = {
          success: true,
          data: {
            received: true,
            address,
            latestTransaction: {
              txid: latestTx.txid,
              confirmations: latestTx.status?.confirmed ? 'confirmed' : 'unconfirmed',
              blockHeight: latestTx.status?.block_height || null,
              explorerUrl: `https://mempool.space/testnet/tx/${latestTx.txid}`
            },
            waitTime: `${timeout} seconds`,
            checkedAt: new Date().toISOString()
          }
        };

        logger.info('Bitcoin payment received while waiting', { address, txid: latestTx.txid });
        res.json(response);
      } else {
        logger.info('Bitcoin payment timeout reached', { address, timeout });
        res.json({
          success: true,
          data: {
            received: false,
            address,
            timeout: true,
            waitTime: `${timeout} seconds`,
            message: 'No payment received within timeout period',
            checkedAt: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      logger.error('Error waiting for Bitcoin payment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to wait for Bitcoin payment',
        details: error.message
      });
    }
  }
);

module.exports = router;
