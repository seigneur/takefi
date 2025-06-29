"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bitcoin,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { chainlinkService, type PriceData } from "@/lib/chainlink";

interface ChainlinkPriceTickerProps {
  onPriceUpdate?: (prices: Record<string, PriceData | null>) => void;
}

export function ChainlinkPriceTicker({
  onPriceUpdate,
}: ChainlinkPriceTickerProps) {
  const [pricesData, setPricesData] = useState<
    Record<string, PriceData | null>
  >({ BTC: null, bCSPX: null });
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>({
    BTC: 0,
    bCSPX: 0,
  });
  const [loading, setLoading] = useState(true);
  const [networkStatus, setNetworkStatus] = useState({
    blockNumber: 0,
    gasPrice: "0",
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      const [newPricesData, netStatus] = await Promise.all([
        chainlinkService.getAllPrices(),
        chainlinkService.getNetworkStatus(),
      ]);

      setPricesData(newPricesData);
      setNetworkStatus(netStatus);

      // Set previous prices for change calculation
      const currentPrices = {
        BTC: newPricesData.BTC?.price || 0,
        bCSPX: newPricesData.bCSPX?.price || 0,
      };
      setPreviousPrices(currentPrices);

      setLoading(false);
      onPriceUpdate?.(newPricesData);
    };

    fetchInitialData();

    // Subscribe to real-time updates
    const unsubscribe = chainlinkService.subscribeToRealTimeUpdates(
      (newPricesData) => {
        setPreviousPrices({
          BTC: pricesData.BTC?.price || 0,
          bCSPX: pricesData.bCSPX?.price || 0,
        });
        setPricesData(newPricesData);
        onPriceUpdate?.(newPricesData);
      }
    );

    return unsubscribe;
  }, []);

  const getPriceChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const PriceItem = ({
    symbol,
    priceData,
    icon: Icon,
    color,
  }: {
    symbol: string;
    priceData: PriceData | null;
    icon: any;
    color: string;
  }) => {
    if (!priceData) {
      return (
        <div className="flex items-center space-x-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <div className="text-sm">
            <span className="text-gray-400">{symbol}:</span>
            <span className="text-red-400 ml-1">Error</span>
          </div>
        </div>
      );
    }

    const change = getPriceChange(priceData.price, previousPrices[symbol]);
    const isPositive = change >= 0;
    const isStale = chainlinkService.isPriceStale(priceData);
    const staleness = chainlinkService.getPriceStaleness(priceData);

    return (
      <motion.div
        initial={{ scale: 1 }}
        animate={{
          scale: priceData.price !== previousPrices[symbol] ? [1, 1.05, 1] : 1,
        }}
        className="flex items-center space-x-2"
      >
        <Icon className={`h-4 w-4 ${color}`} />
        <div className="text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">{symbol}:</span>
            <span className="text-white font-medium">
              {loading ? (
                <div className="inline-block w-16 h-4 bg-white/10 animate-pulse rounded" />
              ) : (
                `$${priceData.price.toLocaleString()}`
              )}
            </span>

            {/* Price change indicator */}
            {!loading && change !== 0 && (
              <span
                className={`text-xs ${
                  isPositive ? "text-green-400" : "text-red-400"
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="inline h-3 w-3" />
                ) : (
                  <TrendingDown className="inline h-3 w-3" />
                )}
                {Math.abs(change).toFixed(2)}%
              </span>
            )}

            {/* Staleness indicator */}
            {!loading && (
              <Badge
                variant="outline"
                className={`text-xs ${
                  isStale
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "bg-green-500/20 text-green-400 border-green-500/30"
                }`}
              >
                {isStale ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Stale
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Live
                  </>
                )}
              </Badge>
            )}
          </div>

          {/* Additional Chainlink metadata */}
          {!loading && (
            <div className="text-xs text-gray-500 mt-1">
              <span>Round: {priceData.roundId.slice(-6)}</span>
              <span className="mx-2">•</span>
              <span>Updated: {formatTimestamp(priceData.timestamp)}</span>
              {staleness < 300000 && ( // Less than 5 minutes
                <>
                  <span className="mx-2">•</span>
                  <span className="text-green-400">
                    {Math.round(staleness / 1000)}s ago
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 space-y-3">
      {/* Price Data */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <PriceItem
            symbol="BTC"
            priceData={pricesData.BTC}
            icon={Bitcoin}
            color="text-orange-500"
          />
          <PriceItem
            symbol="bCSPX"
            priceData={pricesData.bCSPX}
            icon={TrendingUp}
            color="text-blue-400"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs text-gray-400">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          <span>Chainlink</span>
        </div>
      </div>

      {/* Network Status */}
      {!loading && (
        <div className="flex items-center justify-between text-xs text-gray-500 border-t border-white/10 pt-2">
          <div className="flex items-center space-x-4">
            <span>Block: #{networkStatus.blockNumber.toLocaleString()}</span>
            <span>Gas: {networkStatus.gasPrice} gwei</span>
          </div>
          <Badge
            variant="outline"
            className="bg-blue-500/20 text-blue-400 border-blue-500/30"
          >
            <Globe className="h-3 w-3 mr-1" />
            Avalanche C - chain
          </Badge>
        </div>
      )}
    </div>
  );
}
