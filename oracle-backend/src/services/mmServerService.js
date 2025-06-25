const axios = require('axios');
const logger = require('../utils/logger');

class MMServerService {
  constructor() {
    this.baseURL = process.env.MM_SERVER_URL || 'http://localhost:3000';
    this.apiKey = process.env.MM_API_KEY || 'ibUmPmZRVgTP4zgaNl1n5SSHNdfugSjU';
    this.timeout = 30000; // 30 seconds
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      }
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('MM Server API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get a price quote from MM Server
   * @param {Object} params - Quote parameters
   * @param {string} params.sellToken - Token to sell (contract address)
   * @param {string} params.buyToken - Token to buy (contract address)  
   * @param {string} params.sellAmount - Amount to sell in wei
   * @param {string} params.userWallet - User's wallet address for receiving tokens
   * @returns {Promise<Object>} Quote response
   */
  async getQuote(params) {
    const { sellToken, buyToken, sellAmount, userWallet } = params;
    
    try {
      logger.info('Getting quote from MM Server', { sellToken, buyToken, sellAmount, userWallet });
      
      const response = await this.withRetry(async () => {
        return await this.client.get('/api/quote', {
          params: {
            sellToken,
            buyToken,
            sellAmount,
            userWallet
          }
        });
      });
      
      logger.info('Quote received successfully', {
        sellAmount: response.data.sellAmount,
        buyAmount: response.data.buyAmount,
        feeAmount: response.data.feeAmount
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get quote from MM Server:', error);
      throw new Error(`MM Server quote failed: ${error.message}`);
    }
  }

  /**
   * Execute a trade via MM Server
   * @param {Object} params - Trade parameters
   * @param {string} params.sellToken - Token to sell (contract address)
   * @param {string} params.buyToken - Token to buy (contract address)
   * @param {string} params.sellAmount - Amount to sell in wei
   * @param {string} params.userWallet - User's wallet address for receiving tokens
   * @param {number} params.slippagePercent - Maximum acceptable slippage
   * @param {number} params.validitySeconds - Order validity period
   * @returns {Promise<Object>} Trade response with orderUid
   */
  async executeTrade(params) {
    const { 
      sellToken, 
      buyToken, 
      sellAmount, 
      userWallet, 
      slippagePercent = 0.5,
      validitySeconds = 1800 
    } = params;
    
    try {
      logger.info('Executing trade via MM Server', { sellToken, buyToken, sellAmount, userWallet });
      
      const response = await this.withRetry(async () => {
        return await this.client.post('/api/trade', {
          sellToken,
          buyToken,
          sellAmount,
          userWallet,
          slippagePercent,
          validitySeconds
        });
      });
      
      logger.info('Trade executed successfully', {
        orderUid: response.data.orderUid,
        estimatedExecutionTime: response.data.estimatedExecutionTime
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to execute trade via MM Server:', error);
      throw new Error(`MM Server trade execution failed: ${error.message}`);
    }
  }

  /**
   * Get order status from MM Server
   * @param {string} orderUid - CoW Protocol order UID
   * @returns {Promise<Object>} Order status response
   */
  async getOrderStatus(orderUid) {
    try {
      logger.info('Getting order status from MM Server', { orderUid });
      
      const response = await this.withRetry(async () => {
        return await this.client.get(`/api/order-status/${orderUid}`);
      });
      
      logger.info('Order status retrieved', {
        orderUid,
        status: response.data.status,
        executedSellAmount: response.data.executedSellAmount,
        executedBuyAmount: response.data.executedBuyAmount
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get order status from MM Server:', error);
      throw new Error(`MM Server order status check failed: ${error.message}`);
    }
  }

  /**
   * Cancel an order via MM Server
   * @param {string} orderUid - CoW Protocol order UID
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelOrder(orderUid) {
    try {
      logger.info('Cancelling order via MM Server', { orderUid });
      
      const response = await this.withRetry(async () => {
        return await this.client.post(`/api/cancel-order/${orderUid}`);
      });
      
      logger.info('Order cancelled successfully', {
        orderUid,
        cancellationTxHash: response.data.cancellationTxHash
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to cancel order via MM Server:', error);
      throw new Error(`MM Server order cancellation failed: ${error.message}`);
    }
  }

  /**
   * Check MM Server health
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('MM Server health check failed:', error);
      throw new Error(`MM Server is not healthy: ${error.message}`);
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  async withRetry(operation, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.retryAttempts) {
        throw error;
      }
      
      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`MM Server operation failed, retrying in ${delay}ms (attempt ${attempt}/${this.retryAttempts}):`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.withRetry(operation, attempt + 1);
    }
  }

  /**
   * Validate if MM Server is connected and working
   */
  async validateConnection() {
    try {
      await this.checkHealth();
      logger.info('MM Server connection validated successfully');
      return true;
    } catch (error) {
      logger.error('MM Server connection validation failed:', error);
      return false;
    }
  }
}

module.exports = MMServerService;