import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

interface PaymentData {
  txid: string;
  address: string;
  amount: number;
  confirmations: number;
  timestamp: string;
  type: 'confirmed' | 'unconfirmed';
}

interface BitcoinPaymentCheckerProps {
  walletAddress: string;
}

const BitcoinPaymentChecker: React.FC<BitcoinPaymentCheckerProps> = ({ walletAddress }) => {
  const [paymentStatus, setPaymentStatus] = useState('Connecting...');
  const [lastPayment, setLastPayment] = useState<PaymentData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Connect to WebSocket server
    const socketConnection = io('http://localhost:3001', {
      path: '/api/bitcoin/websocket',
      transports: ['websocket', 'polling']
    });

    setSocket(socketConnection);

    socketConnection.on('connect', () => {
      console.log('Connected to Bitcoin WebSocket server');
      setConnectionStatus('connected');
      setPaymentStatus('Watching for payments...');
      setError(null);
      
      // Start watching the wallet address
      socketConnection.emit('watchAddress', walletAddress);
    });

    socketConnection.on('watchingAddress', (data) => {
      console.log('Now watching address:', data);
      setPaymentStatus(`Watching ${walletAddress.substring(0, 10)}...`);
    });

    socketConnection.on('payment', (paymentData: PaymentData) => {
      console.log('Payment received:', paymentData);
      if (paymentData.address === walletAddress) {
        setLastPayment(paymentData);
        setPaymentStatus(`Payment received: ${paymentData.amount} BTC`);
      }
    });

    socketConnection.on('newBlock', (blockData) => {
      console.log('New block:', blockData);
      if (lastPayment && lastPayment.confirmations < 6) {
        setLastPayment(prev => prev ? { ...prev, confirmations: prev.confirmations + 1 } : null);
      }
    });

    socketConnection.on('disconnect', () => {
      console.log('Disconnected from Bitcoin WebSocket server');
      setConnectionStatus('disconnected');
      setPaymentStatus('Disconnected');
    });

    socketConnection.on('error', (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
      setConnectionStatus('disconnected');
    });

    return () => {
      if (socketConnection) {
        socketConnection.emit('unwatchAddress', walletAddress);
        socketConnection.disconnect();
      }
    };
  }, [walletAddress]);

  const getStatusColor = () => {
    if (error) return 'text-red-400';
    if (lastPayment) return 'text-green-400';
    if (connectionStatus === 'connected') return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getConnectionIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'disconnected':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <div className="p-4 bg-white/10 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-2">
        Bitcoin Payment Monitor {getConnectionIndicator()}
      </h3>
      
      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          Address: {walletAddress.substring(0, 20)}...
        </p>
        
        <p className={`text-sm ${getStatusColor()}`}>
          Status: {paymentStatus}
        </p>

        {lastPayment && (
          <div className="mt-4 p-3 bg-white/5 rounded-lg">
            <h4 className="text-sm font-semibold text-green-400">Latest Payment</h4>
            <p className="text-xs text-gray-300">Amount: {lastPayment.amount} BTC</p>
            <p className="text-xs text-gray-300">Confirmations: {lastPayment.confirmations}</p>
            <p className="text-xs text-gray-300">
              TXID: {lastPayment.txid.substring(0, 20)}...
            </p>
            <p className="text-xs text-gray-300">
              Time: {new Date(lastPayment.timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">Error: {error}</p>
        )}
      </div>
    </div>
  );
};

export default BitcoinPaymentChecker;
