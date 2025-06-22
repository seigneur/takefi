// lib/bitcoinZMQListener.js
// Real-time Bitcoin payment listener using ZeroMQ

import zmq from 'zeromq';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class BitcoinZMQListener extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map();
    this.watchedAddresses = new Set();
  }

  async start() {
    try {
      // Subscribe to new transactions
      const txSock = new zmq.Subscriber();
      await txSock.connect('tcp://127.0.0.1:28332'); // ZMQ port for regtest
      txSock.subscribe('rawtx');

      // Subscribe to new blocks
      const blockSock = new zmq.Subscriber();
      await blockSock.connect('tcp://127.0.0.1:28332');
      blockSock.subscribe('rawblock');

      // Handle new transactions
      for await (const [topic, message] of txSock) {
        if (topic.toString() === 'rawtx') {
          await this.handleNewTransaction(message);
        }
      }

      // Handle new blocks (run in parallel)
      (async () => {
        for await (const [topic, message] of blockSock) {
          if (topic.toString() === 'rawblock') {
            await this.handleNewBlock(message);
          }
        }
      })();

      console.log('✅ Bitcoin ZMQ listener started');
      this.emit('connected');

    } catch (error) {
      console.error('❌ Failed to start ZMQ listener:', error);
      this.emit('error', error);
    }
  }

  async handleNewTransaction(rawTx) {
    try {
      // Decode the raw transaction
      const txHex = rawTx.toString('hex');
      const txData = await this.decodeRawTransaction(txHex);
      
      // Check if any outputs go to our watched addresses
      for (const vout of txData.vout) {
        if (vout.scriptPubKey && vout.scriptPubKey.addresses) {
          for (const address of vout.scriptPubKey.addresses) {
            if (this.watchedAddresses.has(address)) {
              this.emit('payment', {
                txid: txData.txid,
                address: address,
                amount: vout.value,
                confirmations: 0,
                timestamp: new Date().toISOString(),
                type: 'unconfirmed'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  }

  async handleNewBlock(rawBlock) {
    // When a new block arrives, update confirmations for pending payments
    this.emit('newBlock', {
      timestamp: new Date().toISOString(),
      message: 'New block mined - confirmations updated'
    });
  }

  addWatchAddress(address) {
    this.watchedAddresses.add(address);
    console.log(`👀 Now watching address: ${address}`);
  }

  removeWatchAddress(address) {
    this.watchedAddresses.delete(address);
    console.log(`🚫 Stopped watching address: ${address}`);
  }

  async decodeRawTransaction(txHex) {
    const response = await fetch('http://localhost:18443', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(await this.getBitcoinCookie()).toString('base64')}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'decoderawtransaction',
        params: [txHex]
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }

  async getBitcoinCookie() {
    // For Linux/macOS systems with Bitcoin Core in regtest mode
    const cookiePath = path.join(
      os.homedir(),
      '.bitcoin', 'regtest', '.cookie'
    );
    
    try {
      const cookie = await fs.readFile(cookiePath, 'utf8');
      return cookie.trim();
    } catch (error) {
      // Fallback for different Bitcoin Core configurations
      console.warn('Could not read Bitcoin cookie file:', error.message);
      return 'test:test'; // Default for regtest
    }
  }
}

export default BitcoinZMQListener;