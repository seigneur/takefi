import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from 'lucide-react';

interface PaymentData {
  txid: string;
  address: string;
  amount: number;
  confirmations: string;
  blockHeight: number | null;
  explorerUrl: string;
}

interface BitcoinPaymentResponse {
  success: boolean;
  data: {
    address: string;
    balance: number;
    balanceSats: number;
    totalReceived: number;
    totalReceivedSats: number;
    transactionCount: number;
    hasPayments: boolean;
    latestTransaction: PaymentData | null;
    explorerUrl: string;
    checkedAt: string;
  };
}

interface BitcoinPaymentCheckerProps {
  walletAddress: string;
  minAmount?: number; // Minimum amount in BTC to detect
  pollInterval?: number; // Polling interval in milliseconds
}

const BitcoinPaymentChecker: React.FC<BitcoinPaymentCheckerProps> = ({ 
  walletAddress, 
  minAmount = 0.00001, 
  pollInterval = 10000 // 10 seconds default
}) => {
  const [paymentStatus, setPaymentStatus] = useState('Initializing...');
  const [lastPayment, setLastPayment] = useState<PaymentData | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [totalReceived, setTotalReceived] = useState<number>(0);
  const [transactionCount, setTransactionCount] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');

  const checkPayment = useCallback(async () => {
    try {
      setError(null);
      
      console.log(`Checking Bitcoin payment for address: ${walletAddress}`);
      
      const response = await fetch(
        `http://localhost:3001/api/bitcoin/check-payment/${walletAddress}?minAmount=${minAmount}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: BitcoinPaymentResponse = await response.json();
      
      if (data.success) {
        setBalance(data.data.balance);
        setTotalReceived(data.data.totalReceived);
        setTransactionCount(data.data.transactionCount);
        setLastChecked(new Date(data.data.checkedAt).toLocaleTimeString());
        
        if (data.data.hasPayments && data.data.latestTransaction) {
          setLastPayment(data.data.latestTransaction);
          setPaymentStatus(`Payment detected: ${data.data.latestTransaction.amount} BTC`);
        } else {
          setPaymentStatus(`Monitoring... (Balance: ${data.data.balance} BTC)`);
        }
        
        console.log('Payment check result:', data.data);
      } else {
        throw new Error('Failed to check payment');
      }
      
    } catch (err: any) {
      console.error('Error checking Bitcoin payment:', err);
      setError(err.message);
      setPaymentStatus('Error checking payments');
    }
  }, [walletAddress, minAmount]);

  useEffect(() => {
    if (!walletAddress) return;

    // Initial check
    checkPayment();
    setIsPolling(true);
    
    // Set up polling
    const intervalId = setInterval(checkPayment, pollInterval);
    
    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [walletAddress, checkPayment, pollInterval]);

  const getStatusColor = () => {
    if (error) return 'text-red-400';
    if (lastPayment) return 'text-green-400';
    if (balance > 0) return 'text-blue-400';
    return 'text-yellow-400';
  };

  const getConnectionIndicator = () => {
    if (error) return '🔴';
    if (lastPayment) return '🟢';
    if (isPolling) return '🟡';
    return '⚪';
  };

  const handleManualRefresh = () => {
    checkPayment();
  };

  const openExplorer = () => {
    window.open(`https://mempool.space/testnet/address/${walletAddress}`, '_blank');
  };

  return (
    <div className="p-4 bg-white/10 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white">
          Bitcoin Payment Monitor {getConnectionIndicator()}
        </h3>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleManualRefresh}
            className="h-6 px-2"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={openExplorer}
            className="h-6 px-2"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          Address: {walletAddress.substring(0, 16)}...{walletAddress.substring(walletAddress.length - 8)}
        </p>
        
        <p className={`text-sm ${getStatusColor()}`}>
          Status: {paymentStatus}
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
          <div>Balance: {balance.toFixed(8)} BTC</div>
          <div>Received: {totalReceived.toFixed(8)} BTC</div>
          <div>Transactions: {transactionCount}</div>
          <div>Last Check: {lastChecked}</div>
        </div>

        {lastPayment && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <h4 className="text-sm font-semibold text-green-400 mb-2">Latest Payment ✅</h4>
            <div className="space-y-1 text-xs text-gray-300">
              <div>Amount: {lastPayment.amount} BTC</div>
              <div>Status: {lastPayment.confirmations}</div>
              <div>TXID: {lastPayment.txid.substring(0, 16)}...{lastPayment.txid.substring(lastPayment.txid.length - 8)}</div>
              {lastPayment.blockHeight && (
                <div>Block: {lastPayment.blockHeight}</div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(lastPayment.explorerUrl, '_blank')}
                className="h-6 px-2 text-xs mt-2"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View Transaction
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
            Error: {error}
          </div>
        )}
        
        <div className="text-xs text-gray-500">
          Auto-refreshing every {pollInterval / 1000}s • Min amount: {minAmount} BTC
        </div>
      </div>
    </div>
  );
};

export default BitcoinPaymentChecker;
