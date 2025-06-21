import WebSocket from 'ws';
import { Server } from 'http';
import { WebSocketMessageDto, OrderUpdateDto, OrderStatus } from '../models';
import { CoWService } from './cow.service';

interface ClientConnection {
  ws: WebSocket;
  subscribedOrders: Set<string>;
}

export class WebSocketService {
  private wss: WebSocket.Server;
  private clients: Map<string, ClientConnection> = new Map();
  private cowService: CoWService;
  private orderPollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.cowService = new CoWService();
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      console.log(`WebSocket client connected: ${clientId}`);

      const client: ClientConnection = {
        ws,
        subscribedOrders: new Set()
      };

      this.clients.set(clientId, client);

      // Send connection confirmation
      this.sendMessage(ws, {
        type: 'connectionStatus',
        data: { status: 'connected' },
        timestamp: new Date().toISOString()
      });

      // Handle incoming messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(clientId, data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.handleClientDisconnect(clientId);
      });

      // Handle errors
      ws.on('error', (error: any) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleClientDisconnect(clientId);
      });
    });
  }

  private handleClientMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribeOrder':
        this.subscribeToOrder(clientId, message.orderUid);
        break;
      case 'unsubscribeOrder':
        this.unsubscribeFromOrder(clientId, message.orderUid);
        break;
      case 'ping':
        this.sendMessage(client.ws, {
          type: 'connectionStatus',
          data: { status: 'pong' },
          timestamp: new Date().toISOString()
        });
        break;
      default:
        this.sendError(client.ws, 'Unknown message type');
    }
  }

  private subscribeToOrder(clientId: string, orderUid: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`Client ${clientId} subscribing to order ${orderUid}`);
    client.subscribedOrders.add(orderUid);

    // Start polling for this order if not already polling
    if (!this.orderPollingIntervals.has(orderUid)) {
      this.startOrderPolling(orderUid);
    }

    // Send immediate status
    this.sendOrderUpdate(orderUid);

    // Confirm subscription
    this.sendMessage(client.ws, {
      type: 'connectionStatus',
      data: { status: 'subscribed' },
      timestamp: new Date().toISOString()
    });
  }

  private unsubscribeFromOrder(clientId: string, orderUid: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`Client ${clientId} unsubscribing from order ${orderUid}`);
    client.subscribedOrders.delete(orderUid);

    // Check if any other clients are still subscribed to this order
    const stillSubscribed = Array.from(this.clients.values()).some(c => 
      c.subscribedOrders.has(orderUid)
    );

    if (!stillSubscribed) {
      this.stopOrderPolling(orderUid);
    }
  }

  private startOrderPolling(orderUid: string): void {
    const interval = setInterval(async () => {
      try {
        await this.sendOrderUpdate(orderUid);
      } catch (error) {
        console.error(`Error polling order ${orderUid}:`, error);
      }
    }, 5000); // Poll every 5 seconds

    this.orderPollingIntervals.set(orderUid, interval);
    console.log(`Started polling for order: ${orderUid}`);
  }

  private stopOrderPolling(orderUid: string): void {
    const interval = this.orderPollingIntervals.get(orderUid);
    if (interval) {
      clearInterval(interval);
      this.orderPollingIntervals.delete(orderUid);
      console.log(`Stopped polling for order: ${orderUid}`);
    }
  }

  private async sendOrderUpdate(orderUid: string): Promise<void> {
    try {
      const order = await this.cowService.getOrderStatus(orderUid);
      
      const orderUpdate: OrderUpdateDto = {
        orderUid: order.uid,
        status: order.status,
        executedSellAmount: order.executedSellAmount,
        executedBuyAmount: order.executedBuyAmount,
        txHash: order.txHash,
        timestamp: new Date().toISOString()
      };

      // Send to all subscribed clients
      this.broadcastOrderUpdate(orderUid, orderUpdate);

      // Stop polling if order is in final state
      if (this.isOrderInFinalState(order.status)) {
        this.stopOrderPolling(orderUid);
      }
    } catch (error) {
      console.error(`Failed to get order status for ${orderUid}:`, error);
    }
  }

  private broadcastOrderUpdate(orderUid: string, orderUpdate: OrderUpdateDto): void {
    const message: WebSocketMessageDto = {
      type: 'orderUpdate',
      data: orderUpdate,
      timestamp: new Date().toISOString()
    };

    this.clients.forEach((client, clientId) => {
      if (client.subscribedOrders.has(orderUid) && client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, message);
      }
    });
  }

  private isOrderInFinalState(status: OrderStatus): boolean {
    return [
      OrderStatus.FILLED,
      OrderStatus.CANCELLED,
      OrderStatus.EXPIRED
    ].includes(status);
  }

  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from all orders
    client.subscribedOrders.forEach(orderUid => {
      this.unsubscribeFromOrder(clientId, orderUid);
    });

    // Remove client
    this.clients.delete(clientId);
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessageDto): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    this.sendMessage(ws, {
      type: 'error',
      data: {
        success: false,
        error: {
          code: 'WEBSOCKET_ERROR',
          message: errorMessage
        },
        timestamp: new Date().toISOString()
      } as any,
      timestamp: new Date().toISOString()
    });
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Public method to broadcast system-wide messages
  public broadcastSystemMessage(message: any): void {
    const wsMessage: WebSocketMessageDto = {
      type: 'connectionStatus',
      data: message,
      timestamp: new Date().toISOString()
    };

    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, wsMessage);
      }
    });
  }

  // Cleanup method
  public cleanup(): void {
    // Stop all polling intervals
    this.orderPollingIntervals.forEach(interval => clearInterval(interval));
    this.orderPollingIntervals.clear();

    // Close all client connections
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    });
    this.clients.clear();

    // Close WebSocket server
    this.wss.close();
  }
}