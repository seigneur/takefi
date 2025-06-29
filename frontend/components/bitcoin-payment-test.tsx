import React from 'react';
import BitcoinPaymentChecker from './bitcoin-payment-checker';
import { getBitcoinTestAddresses } from '@/lib/bitcoin-network.config';

/**
 * Simple test component to demonstrate Bitcoin payment monitoring
 * Use this to test the WebSocket integration without complex UI
 */
export default function BitcoinPaymentTest() {
  // Example Bitcoin addresses for testing from centralized config
  const testAddresses = getBitcoinTestAddresses();
  const testAddressList = [
    testAddresses.p2wpkh,
    testAddresses.p2tr,
    "bcrt1qw5km7tqvq5j5yp2lk5z3j5z8r7jz8c5c3k4g2h" // Additional test address
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">
          🔍 Bitcoin Payment Monitor Test
        </h1>
        <p className="text-gray-400 mb-8">
          Testing real-time Bitcoin payment monitoring via WebSocket
        </p>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testAddressList.map((address, index) => (
            <div key={address} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">
                Monitor #{index + 1}
              </h3>
              <BitcoinPaymentChecker walletAddress={address} />
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            🧪 Test Instructions
          </h2>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-start space-x-3">
              <span className="text-green-400 font-bold">1.</span>
              <div>
                <p className="font-medium">Start WebSocket Server</p>
                <code className="text-xs bg-black/30 px-2 py-1 rounded">
                  cd oracle-backend && npm run test:websocket
                </code>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-green-400 font-bold">2.</span>
              <div>
                <p className="font-medium">Watch Connection Status</p>
                <p className="text-sm text-gray-400">
                  🟢 Connected | 🟡 Connecting | 🔴 Disconnected
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-green-400 font-bold">3.</span>
              <div>
                <p className="font-medium">Automatic Test Payment</p>
                <p className="text-sm text-gray-400">
                  Each monitor will receive a simulated payment after 5 seconds
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-green-400 font-bold">4.</span>
              <div>
                <p className="font-medium">Send Real Bitcoin (Optional)</p>
                <p className="text-sm text-gray-400">
                  Use bitcoin-cli to send real transactions to these addresses
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <h3 className="text-yellow-400 font-semibold mb-2">⚠️ Note</h3>
          <p className="text-yellow-300 text-sm">
            Make sure the WebSocket server is running on port 3001 before testing.
            If you see connection errors, check that the server is accessible.
          </p>
        </div>
      </div>
    </div>
  );
}
