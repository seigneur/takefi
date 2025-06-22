// pages/api/bitcoin/websocket.js
// WebSocket endpoint for real-time Bitcoin payment notifications

import { Server } from 'socket.io';
import BitcoinZMQListener from './zeromq.js';

let io;
let zmqListener;

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log('🚀 Starting Bitcoin WebSocket server...');
    
    io = new Server(res.socket.server, {
      path: '/api/bitcoin/websocket',
      addTrailingSlash: false,
    });

    // Initialize ZMQ listener
    zmqListener = new BitcoinZMQListener();
    
    // Handle WebSocket connections
    io.on('connection', (socket) => {
      console.log('👤 Client connected:', socket.id);

      // Handle address watching
      socket.on('watchAddress', (address) => {
        console.log(`👀 Client ${socket.id} watching address: ${address}`);
        zmqListener.addWatchAddress(address);
        socket.join(`address:${address}`);
        socket.emit('watchingAddress', { address, status: 'watching' });
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
      console.log('💰 Payment detected:', paymentData);
      
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

    // Start the ZMQ listener
    zmqListener.start();

    res.socket.server.io = io;
  }

  res.end();
}

// Configure Next.js API route
export const config = {
  api: {
    bodyParser: false,
  },
}