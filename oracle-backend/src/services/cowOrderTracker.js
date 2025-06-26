const EventEmitter = require('events');
const WebSocket = require('ws');
const MMServerService = require('./mmServerService');
const awsSecretsService = require('./awsSecretsService');
const logger = require('../utils/logger');

class CoWOrderTracker extends EventEmitter {
  constructor() {
    super();
    this.mmServerService = new MMServerService();
    this.activeOrders = new Map(); // swapId -> orderData
    this.ws = null;
    this.pollingIntervals = new Map(); // swapId -> intervalId
    this.wsReconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Start tracking a CoW order for a swap
   */
  async startTracking(swapId, orderUid, orderData) {
    logger.info('Starting CoW order tracking', { swapId, orderUid });
    
    this.activeOrders.set(swapId, {
      orderUid,
      startedAt: new Date(),
      lastChecked: new Date(),
      ...orderData
    });

    // Try WebSocket first, fallback to polling
    const wsConnected = await this.tryWebSocketConnection();
    
    if (wsConnected) {
      this.subscribeToOrderUpdates(swapId, orderUid);
    } else {
      this.startPolling(swapId, orderUid);
    }
  }

  /**
   * Try to establish WebSocket connection to MM Server
   */
  async tryWebSocketConnection() {
    return new Promise((resolve) => {
      try {
        const wsUrl = process.env.MM_SERVER_WS_URL || 'ws://localhost:3000/ws';
        logger.info('Attempting WebSocket connection to:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        const timeout = setTimeout(() => {
          logger.warn('WebSocket connection timeout, falling back to polling');
          resolve(false);
        }, 5000);
        
        this.ws.on('open', () => {
          clearTimeout(timeout);
          logger.info('WebSocket connected to MM Server for order tracking');
          this.wsReconnectAttempts = 0;
          resolve(true);
        });
        
        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          logger.warn('WebSocket connection failed, falling back to polling:', error.message);
          resolve(false);
        });
        
        this.ws.on('close', () => {
          logger.warn('WebSocket connection closed');
          this.handleWebSocketClose();
        });
        
        this.ws.on('message', (data) => {
          this.handleWebSocketMessage(data);
        });
        
      } catch (error) {
        logger.warn('WebSocket setup failed:', error.message);
        resolve(false);
      }
    });
  }

  /**
   * Handle WebSocket close and attempt reconnection
   */
  async handleWebSocketClose() {
    if (this.wsReconnectAttempts < this.maxReconnectAttempts && this.activeOrders.size > 0) {
      this.wsReconnectAttempts++;
      logger.info(`Attempting WebSocket reconnection (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(async () => {
        const reconnected = await this.tryWebSocketConnection();
        if (reconnected) {
          // Re-subscribe to all active orders
          for (const [swapId, orderData] of this.activeOrders) {
            this.subscribeToOrderUpdates(swapId, orderData.orderUid);
          }
        } else {
          this.fallbackToPolling();
        }
      }, 2000 * this.wsReconnectAttempts); // Exponential backoff
    } else {
      logger.warn('WebSocket reconnection attempts exhausted, switching to polling');
      this.fallbackToPolling();
    }
  }

  /**
   * Subscribe to order updates via WebSocket
   */
  subscribeToOrderUpdates(swapId, orderUid) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscribeMsg = {
        type: 'subscribe',
        orderUid: orderUid,
        swapId: swapId
      };
      
      this.ws.send(JSON.stringify(subscribeMsg));
      logger.info('Subscribed to WebSocket updates', { swapId, orderUid });
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'orderUpdate') {
        await this.processOrderUpdate(message.swapId, message.orderStatus);
      } else if (message.type === 'subscriptionConfirmed') {
        logger.info('WebSocket subscription confirmed', { swapId: message.swapId });
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
    }
  }

  /**
   * Start polling for order status (fallback method)
   */
  startPolling(swapId, orderUid) {
    logger.info('Starting polling for order status', { swapId, orderUid });
    
    // Clear any existing polling interval
    if (this.pollingIntervals.has(swapId)) {
      clearInterval(this.pollingIntervals.get(swapId));
    }
    
    const pollInterval = setInterval(async () => {
      try {
        const orderStatus = await this.mmServerService.getOrderStatus(orderUid);
        await this.processOrderUpdate(swapId, orderStatus);
        
        // Update last checked time
        const orderData = this.activeOrders.get(swapId);
        if (orderData) {
          orderData.lastChecked = new Date();
        }
        
      } catch (error) {
        logger.error('Error polling order status:', error);
        
        // If order not found, it might be very new - continue polling for a bit
        if (error.message.includes('Order not found')) {
          const orderData = this.activeOrders.get(swapId);
          if (orderData && Date.now() - orderData.startedAt.getTime() > 300000) { // 5 minutes
            logger.warn('Order not found after 5 minutes, stopping polling', { swapId, orderUid });
            this.stopTracking(swapId);
          }
        }
      }
    }, 10000); // Poll every 10 seconds
    
    this.pollingIntervals.set(swapId, pollInterval);
  }

  /**
   * Process order status update
   */
  async processOrderUpdate(swapId, orderStatus) {
    logger.info('Processing order update', { swapId, status: orderStatus.status });
    
    const orderData = this.activeOrders.get(swapId);
    if (!orderData) {
      logger.warn('Received update for unknown swap', { swapId });
      return;
    }

    const updateData = {
      cowOrderStatus: orderStatus.status,
      lastOrderCheck: new Date().toISOString()
    };

    switch (orderStatus.status) {
      case 'open':
        // Order is still pending
        await awsSecretsService.updateSwapStatus(swapId, 'order_pending', updateData);
        break;
        
      case 'filled':
        // Order completed successfully!
        await awsSecretsService.updateSwapStatus(swapId, 'completed', {
          ...updateData,
          cowOrderStatus: 'filled',
          txHash: orderStatus.txHash,
          executedSellAmount: orderStatus.executedSellAmount,
          executedBuyAmount: orderStatus.executedBuyAmount,
          completedAt: new Date().toISOString(),
          explorerUrl: `https://explorer.cow.fi/sepolia/orders/${orderData.orderUid}`
        });
        
        this.stopTracking(swapId);
        this.emit('orderCompleted', { swapId, orderStatus });
        logger.info('Order completed successfully', { swapId, orderUid: orderData.orderUid });
        break;
        
      case 'cancelled':
      case 'expired':
        // Order failed
        await awsSecretsService.updateSwapStatus(swapId, 'order_failed', {
          ...updateData,
          cowOrderStatus: orderStatus.status,
          failureReason: orderStatus.status,
          failedAt: new Date().toISOString()
        });
        
        this.stopTracking(swapId);
        this.emit('orderFailed', { swapId, orderStatus });
        logger.warn('Order failed', { swapId, status: orderStatus.status });
        break;
        
      case 'partiallyFilled':
        // Partial execution
        await awsSecretsService.updateSwapStatus(swapId, 'order_partial', {
          ...updateData,
          cowOrderStatus: 'partiallyFilled',
          executedSellAmount: orderStatus.executedSellAmount,
          executedBuyAmount: orderStatus.executedBuyAmount
        });
        break;
    }
  }

  /**
   * Stop tracking an order
   */
  stopTracking(swapId) {
    logger.info('Stopping order tracking', { swapId });
    
    // Clear polling interval
    const pollInterval = this.pollingIntervals.get(swapId);
    if (pollInterval) {
      clearInterval(pollInterval);
      this.pollingIntervals.delete(swapId);
    }
    
    // Get order data before removing
    const orderData = this.activeOrders.get(swapId);
    
    // Remove from active orders
    this.activeOrders.delete(swapId);
    
    // Unsubscribe from WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN && orderData) {
      const unsubscribeMsg = {
        type: 'unsubscribe',
        swapId: swapId,
        orderUid: orderData.orderUid
      };
      this.ws.send(JSON.stringify(unsubscribeMsg));
    }
  }

  /**
   * Fallback to polling for all active orders
   */
  fallbackToPolling() {
    logger.info('Falling back to polling for all active orders');
    for (const [swapId, orderData] of this.activeOrders) {
      this.startPolling(swapId, orderData.orderUid);
    }
  }

  /**
   * Get tracking status for a swap
   */
  getTrackingStatus(swapId) {
    const orderData = this.activeOrders.get(swapId);
    return orderData ? {
      isTracking: true,
      method: this.ws && this.ws.readyState === WebSocket.OPEN ? 'websocket' : 'polling',
      startedAt: orderData.startedAt,
      lastChecked: orderData.lastChecked,
      orderUid: orderData.orderUid
    } : { isTracking: false };
  }

  /**
   * Get all active tracking sessions
   */
  getActiveTrackingSessions() {
    const sessions = [];
    for (const [swapId, orderData] of this.activeOrders) {
      sessions.push({
        swapId,
        orderUid: orderData.orderUid,
        startedAt: orderData.startedAt,
        lastChecked: orderData.lastChecked,
        method: this.ws && this.ws.readyState === WebSocket.OPEN ? 'websocket' : 'polling'
      });
    }
    return sessions;
  }

  /**
   * Cleanup and close connections
   */
  cleanup() {
    logger.info('Cleaning up CoW order tracker');
    
    // Clear all polling intervals
    for (const [swapId, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear active orders
    this.activeOrders.clear();
  }
}

// Export singleton instance
module.exports = new CoWOrderTracker();