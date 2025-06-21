"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Bitcoin, TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { chainlinkService } from "@/lib/chainlink"

interface PriceTickerProps {
  onPriceUpdate?: (prices: Record<string, number>) => void
}

export function PriceTicker({ onPriceUpdate }: PriceTickerProps) {
  const [prices, setPrices] = useState<Record<string, number>>({ BTC: 0, XTSLA: 0 })
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>({ BTC: 0, XTSLA: 0 })
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    const fetchInitialPrices = async () => {
      setLoading(true)
      const newPrices = await chainlinkService.getAllPrices()
      setPrices(newPrices)
      setPreviousPrices(newPrices)
      setLastUpdate(new Date())
      setLoading(false)
      onPriceUpdate?.(newPrices)
    }

    fetchInitialPrices()

    // Subscribe to real-time updates
    const unsubscribe = chainlinkService.subscribeToRealTimeUpdates((newPrices) => {
      setPreviousPrices(prices)
      setPrices(newPrices)
      setLastUpdate(new Date())
      onPriceUpdate?.(newPrices)
    })

    return unsubscribe
  }, [])

  const getPriceChange = (current: number, previous: number) => {
    if (previous === 0) return 0
    return ((current - previous) / previous) * 100
  }

  const PriceItem = ({
    symbol,
    price,
    icon: Icon,
    color,
  }: {
    symbol: string
    price: number
    icon: any
    color: string
  }) => {
    const change = getPriceChange(price, previousPrices[symbol])
    const isPositive = change >= 0

    return (
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: price !== previousPrices[symbol] ? [1, 1.05, 1] : 1 }}
        className="flex items-center space-x-2"
      >
        <Icon className={`h-4 w-4 ${color}`} />
        <div className="text-sm">
          <span className="text-gray-400">{symbol}:</span>
          <span className="text-white font-medium ml-1">
            {loading ? (
              <div className="inline-block w-16 h-4 bg-white/10 animate-pulse rounded" />
            ) : (
              `$${price.toLocaleString()}`
            )}
          </span>
          {!loading && change !== 0 && (
            <span className={`ml-2 text-xs ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
              {Math.abs(change).toFixed(2)}%
            </span>
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex items-center space-x-6 bg-white/5 rounded-lg px-4 py-2">
      <PriceItem symbol="BTC" price={prices.BTC} icon={Bitcoin} color="text-orange-500" />
      <PriceItem symbol="XTSLA" price={prices.XTSLA} icon={TrendingUp} color="text-blue-400" />

      <div className="flex items-center space-x-2 text-xs text-gray-400">
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
      </div>
    </div>
  )
}
