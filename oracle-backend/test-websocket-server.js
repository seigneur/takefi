#!/usr/bin/env node
// Test WebSocket server for Bitcoin payment monitoring
// Run this to test the frontend Bitcoin payment checker

import { Server } from 'socket.io';
import { createServer } from 'http';
import BitcoinZMQListener from '../frontend/zeromq.js';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  },
  path: '/api/bitcoin/websocket'
});

// Initialize ZMQ listener
const zmqListener = new BitcoinZMQListener();

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);

  // Handle address watching
  socket.on('watchAddress', (address) => {
    console.log(`👀 Client ${socket.id} watching address: ${address}`);
    zmqListener.addWatchAddress(address);
    socket.join(`address:${address}`);
    socket.emit('watchingAddress', { address, status: 'watching' });
    
    // Simulate a payment after 5 seconds for testing
    setTimeout(() => {
      const mockPayment = {
        txid: 'abc123def456789',
        address: address,
        amount: 0.5,
        confirmations: 0,
        timestamp: new Date().toISOString(),
        type: 'unconfirmed'
      };
      console.log('🧪 Simulating payment for testing:', mockPayment);
      socket.emit('payment', mockPayment);
    }, 5000);
  });

  // Handle stop watching
  socket.on('unwatchAddress', (address) => {
    console.log(`🚫 Client ${socket.id} stopped watching: ${address}`);
    socket.leave(`address:${address}`);
    
    // Check if any other clients are watching this address
    const room = io.sockets.adapter.rooms.get(`address:${address}`);
    if (!room || room.size === 0) {
      zmqListener.removeWatchAddress(address);
    }
    
    socket.emit('unwatchedAddress', { address, status: 'unwatched' });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('👋 Client disconnected:', socket.id);
  });
});

// ZMQ event handlers
zmqListener.on('payment', (paymentData) => {
  console.log('💰 Real payment detected:', paymentData);
  
  // Emit to all clients watching this address
  io.to(`address:${paymentData.address}`).emit('payment', paymentData);
  
  // Also emit to all connected clients
  io.emit('newPayment', paymentData);
});

zmqListener.on('newBlock', (blockData) => {
  console.log('🧱 New block:', blockData);
  io.emit('newBlock', blockData);
});

zmqListener.on('error', (error) => {
  console.error('❌ ZMQ Error:', error);
  io.emit('error', { message: 'Bitcoin listener error', error: error.message });
});

zmqListener.on('connected', () => {
  console.log('✅ ZMQ listener connected successfully');
});

// Start the server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Bitcoin WebSocket server running on port ${PORT}`);
  console.log(`📡 WebSocket path: /api/bitcoin/websocket`);
  console.log(`🌐 Frontend should connect to: http://localhost:${PORT}`);
  
  // Try to start ZMQ listener (will work if Bitcoin node is running with ZMQ enabled)
  zmqListener.start().catch(error => {
    console.warn('⚠️  ZMQ listener failed to start (Bitcoin node may not be running):', error.message);
    console.log('🧪 Running in test mode - will simulate payments');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
