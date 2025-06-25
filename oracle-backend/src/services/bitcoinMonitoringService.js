const PublicBitcoinRPCClient = require('../../bitcoin-rpc-public');
const awsSecretsService = require('./awsSecretsService');
const axios = require('axios');
const logger = require('../utils/logger');

class BitcoinMonitoringService {
  constructor() {
    this.rpcClient = new PublicBitcoinRPCClient({ network: process.env.BITCOIN_NETWORK || 'testnet' });
    this.activeMonitors = new Map(); // swapId -> monitoring promise
    this.oracleBaseUrl = process.env.ORACLE_BASE_URL || 'http://localhost:3001';
    this.monitoringInterval = 30000; // 30 seconds
    this.maxMonitoringTime = 3600000; // 1 hour
  }

  /**
   * Start monitoring a Bitcoin address for payments
   * @param {string} swapId - The swap ID to monitor
   * @param {string} htlcAddress - Bitcoin address to monitor
   * @param {number} expectedAmount - Expected amount in BTC
   * @param {number} timeoutMs - Maximum monitoring time in milliseconds
   */
  async startMonitoring(swapId, htlcAddress, expectedAmount, timeoutMs = this.maxMonitoringTime) {
    if (this.activeMonitors.has(swapId)) {
      logger.warn('Already monitoring swap', { swapId });
      return;
    }

    logger.info('Starting Bitcoin payment monitoring', {
      swapId,
      htlcAddress,
      expectedAmount,
      timeoutMs
    });

    const monitoringPromise = this.monitorPayment(swapId, htlcAddress, expectedAmount, timeoutMs);
    this.activeMonitors.set(swapId, monitoringPromise);

    // Clean up monitoring promise when complete
    monitoringPromise.finally(() => {
      this.activeMonitors.delete(swapId);
    });

    return monitoringPromise;
  }

  /**
   * Monitor a Bitcoin address for payments and trigger swap when received
   * @param {string} swapId - The swap ID
   * @param {string} htlcAddress - Bitcoin address to monitor
   * @param {number} expectedAmount - Expected amount in BTC
   * @param {number} timeoutMs - Maximum monitoring time
   */
  async monitorPayment(swapId, htlcAddress, expectedAmount, timeoutMs) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting payment monitoring loop', {
        swapId,
        htlcAddress,
        expectedAmount: expectedAmount,
        timeout: timeoutMs
      });

      while (Date.now() - startTime < timeoutMs) {
        try {
          // Check for payment using the same logic as the E2E test
          const payment = await this.checkForPayment(htlcAddress, expectedAmount);
          
          if (payment.received) {
            logger.info('Bitcoin payment detected!', {
              swapId,
              htlcAddress,
              amount: payment.amount,
              txHash: payment.txHash,
              blockHeight: payment.blockHeight
            });

            // Trigger the swap via Oracle API
            await this.triggerSwapExecution(swapId, payment.txHash);
            
            return {
              success: true,
              payment,
              message: 'Payment received and swap triggered'
            };
          }

          // Wait before next check
          await this.sleep(this.monitoringInterval);

        } catch (checkError) {
          logger.error('Error checking for payment:', checkError);
          await this.sleep(this.monitoringInterval);
        }
      }

      // Timeout reached
      logger.warn('Bitcoin payment monitoring timeout reached', {
        swapId,
        htlcAddress,
        timeoutMs
      });

      return {
        success: false,
        message: 'Monitoring timeout - no payment received'
      };

    } catch (error) {
      logger.error('Bitcoin payment monitoring failed:', error);
      throw error;
    }
  }

  /**
   * Check if payment has been received at the given address
   * @param {string} address - Bitcoin address to check
   * @param {number} expectedAmount - Expected amount in BTC
   * @returns {Promise<Object>} Payment status
   */
  async checkForPayment(address, expectedAmount) {
    try {
      // Get address balance
      const balance = await this.rpcClient.getAddressBalance(address);
      
      if (balance >= expectedAmount) {
        // Get transaction details
        const transactions = await this.rpcClient.getAddressTransactions(address);
        
        if (transactions.length > 0) {
          const latestTx = transactions[0];
          
          return {
            received: true,
            amount: balance,
            txHash: latestTx.txid,
            blockHeight: latestTx.status?.block_height,
            confirmed: latestTx.status?.confirmed || false,
            transaction: latestTx
          };
        }
      }

      return {
        received: false,
        amount: balance
      };

    } catch (error) {
      logger.error('Error checking for payment:', error);
      throw error;
    }
  }

  /**
   * Trigger swap execution via Oracle API
   * @param {string} swapId - The swap ID
   * @param {string} btcTxHash - Bitcoin transaction hash
   */
  async triggerSwapExecution(swapId, btcTxHash) {
    try {
      logger.info('Triggering swap execution', { swapId, btcTxHash });

      const response = await axios.post(
        `${this.oracleBaseUrl}/api/oracle/trigger-swap/${swapId}`,
        {
          btcTxHash,
          forceExecute: false
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      logger.info('Swap execution triggered successfully', {
        swapId,
        btcTxHash,
        response: response.data
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to trigger swap execution:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring a specific swap
   * @param {string} swapId - The swap ID to stop monitoring
   */
  stopMonitoring(swapId) {
    if (this.activeMonitors.has(swapId)) {
      logger.info('Stopping Bitcoin monitoring for swap', { swapId });
      this.activeMonitors.delete(swapId);
      return true;
    }
    return false;
  }

  /**
   * Get monitoring status for a swap
   * @param {string} swapId - The swap ID
   */
  getMonitoringStatus(swapId) {
    return {
      isMonitoring: this.activeMonitors.has(swapId),
      activeMonitors: this.activeMonitors.size
    };
  }

  /**
   * Start monitoring all pending swaps from AWS
   */
  async startMonitoringAllPendingSwaps() {
    try {
      logger.info('Starting monitoring for all pending swaps');
      
      // This would require implementing a method to list all pending swaps
      // For now, this is a placeholder for future implementation
      logger.info('Pending swaps monitoring initialization complete');
      
    } catch (error) {
      logger.error('Failed to start monitoring pending swaps:', error);
    }
  }

  /**
   * Auto-start monitoring when a new swap is created
   * @param {Object} swapData - The swap data object
   */
  async autoStartMonitoring(swapData) {
    const { swapId, htlcAddress, btcAmount } = swapData;
    const expectedAmountBTC = btcAmount / 100000000; // Convert satoshis to BTC
    
    logger.info('Auto-starting Bitcoin monitoring for new swap', {
      swapId,
      htlcAddress,
      expectedAmountBTC
    });

    // Start monitoring in background
    this.startMonitoring(swapId, htlcAddress, expectedAmountBTC)
      .then((result) => {
        logger.info('Bitcoin monitoring completed', { swapId, result });
      })
      .catch((error) => {
        logger.error('Bitcoin monitoring failed', { swapId, error });
      });
  }

  /**
   * Utility function for sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up all active monitors
   */
  cleanup() {
    logger.info('Cleaning up Bitcoin monitoring service');
    this.activeMonitors.clear();
  }
}

module.exports = BitcoinMonitoringService;