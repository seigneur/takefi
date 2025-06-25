"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Bitcoin, RefreshCw, ArrowRight, CheckCircle, Clock, TrendingUp, Wallet, Globe, Zap } from "lucide-react"
import { ChainlinkPriceTicker } from "@/components/chainlink-price-ticker"
import BitcoinPaymentChecker from "@/components/bitcoin-payment-checker"

// API imports
import { 
  oracleAPI, 
  generateOffersFromQuotes, 
  btcToSatoshis,
  type MarketMakerOffer,
  type CreatePreimageResponse 
} from "@/lib/api"

// Bitcoin wallet integration
import { useBitcoinWallet, formatBitcoinAddress } from "@/hooks/use-bitcoin-wallet"
import BitcoinFunding from "@/components/bitcoin-funding-component"

const swapSteps = [
  { id: 1, name: "Offer Confirmed", status: "pending", icon: CheckCircle },
  { id: 2, name: "Bitcoin Script Created", status: "pending", icon: Bitcoin },
  { id: 3, name: "BTC Locked", status: "pending", icon: Wallet },
  { id: 4, name: "Oracle Processing", status: "pending", icon: Globe },
  { id: 5, name: "RWA Tokens Received", status: "pending", icon: TrendingUp },
]

// Chainlink Price Feed Integration
const CHAINLINK_BTC_USD_FEED = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c" // Mainnet BTC/USD
const CHAINLINK_API_KEY = process.env.NEXT_PUBLIC_CHAINLINK_API_KEY || "demo"

const fetchChainlinkPrice = async (feedAddress: string) => {
  try {
    // Using Chainlink's price feed API (in production, you'd use Web3 to read directly from contract)
    const response = await fetch(`https://api.chain.link/v1/feeds/${feedAddress}`)
    const data = await response.json()
    return data.answer / 100000000 // Chainlink returns price with 8 decimals
  } catch (error) {
    console.error("Error fetching Chainlink price:", error)
    return null
  }
}

// Mock Chainlink Service
const chainlinkService = {
  getAllPrices: async () => {
    // Simulate fetching prices from Chainlink
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          BTC: { price: 43250, lastUpdated: new Date() },
          COW: { price: 0.25, lastUpdated: new Date() },
        })
      }, 500)
    })
  },
  getNetworkStatus: async () => {
    // Simulate fetching network status
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          blockNumber: 1234567,
          gasPrice: "50",
        })
      }, 300)
    })
  },
}

export default function Component() {
  // Bitcoin wallet integration
  const { address: btcAddress, isConnected: btcConnected } = useBitcoinWallet()
  
  // Form inputs
  const [btcAmount, setBtcAmount] = useState("")
  const [userEthAddress, setUserEthAddress] = useState("") // User's Ethereum address for receiving tokens
  
  // Real API data
  const [htlcAddress, setHtlcAddress] = useState("") // Real Bitcoin HTLC address from Oracle
  const [realSwapId, setRealSwapId] = useState("") // Real swap ID from Oracle
  const [selectedOffer, setSelectedOffer] = useState<MarketMakerOffer | null>(null)
  const [offers, setOffers] = useState<MarketMakerOffer[]>([])
  const [isLoadingOffers, setIsLoadingOffers] = useState(false)
  
  // UI state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [swapProgress, setSwapProgress] = useState(swapSteps)
  const [currentStep, setCurrentStep] = useState(0)
  const [isSwapping, setIsSwapping] = useState(false)
  const [swapCompleted, setSwapCompleted] = useState(false)
  
  // Prices
  const [btcPrice, setBtcPrice] = useState(0)
  const [cowPrice, setCowPrice] = useState(0)
  const [priceLoading, setPriceLoading] = useState(true)
  const [lastPriceUpdate, setLastPriceUpdate] = useState(new Date())
  const [btcPriceData, setBtcPriceData] = useState(null)
  const [cowPriceData, setCowPriceData] = useState(null)
  const [networkStatus, setNetworkStatus] = useState({ blockNumber: 0, gasPrice: "0" })

  const fetchRealTimePrices = async () => {
    setPriceLoading(true)
    try {
      const pricesData = await chainlinkService.getAllPrices()

      // Extract price values and check for staleness
      const btcData = pricesData.BTC
      const cowData = pricesData.COW

      if (btcData) {
        setBtcPrice(btcData.price)
        setBtcPriceData(btcData)
      }

      if (cowData) {
        setCowPrice(cowData.price)
        setCowPriceData(cowData)
      }

      setLastPriceUpdate(new Date())

      // Update offers with new prices
      if (btcData && cowData) {
        updateOffersWithRealPrices(btcData.price, cowData.price)
      }
    } catch (error) {
      console.error("Error fetching Chainlink prices:", error)
      // Fallback to demo prices
      setBtcPrice(43250)
      setCowPrice(0.25)
    } finally {
      setPriceLoading(false)
    }
  }

  const updateOffersWithRealPrices = (btcPrice: number, cowPrice: number) => {
    // This function is kept for backward compatibility with Chainlink price updates
    // Real offers are now fetched from the API
  }

  // Validate Ethereum address format
  const isValidEthAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  // Fetch real offers from API
  const refreshOffers = async () => {
    if (!btcAmount || parseFloat(btcAmount) <= 0) {
      setOffers([])
      return
    }

    if (!userEthAddress || !isValidEthAddress(userEthAddress)) {
      setOffers([])
      return
    }

    setIsLoadingOffers(true)
    try {
      console.log('Fetching real offers from API...')
      const realOffers = await generateOffersFromQuotes(btcAmount, userEthAddress)
      setOffers(realOffers)
      console.log('Real offers received:', realOffers)
    } catch (error) {
      console.error('Failed to fetch offers:', error)
      // Keep existing offers on error
    } finally {
      setIsLoadingOffers(false)
    }
  }

  useEffect(() => {
    fetchRealTimePrices()

    // Update prices every 30 seconds
    const priceInterval = setInterval(fetchRealTimePrices, 30000)

    // Fetch network status
    const fetchNetworkStatus = async () => {
      const status = await chainlinkService.getNetworkStatus()
      setNetworkStatus(status)
    }
    fetchNetworkStatus()

    return () => {
      clearInterval(priceInterval)
      // Clean up swap polling if it exists
      if ((window as any).swapPollInterval) {
        clearInterval((window as any).swapPollInterval)
      }
    }
  }, [])

  // Auto-refresh offers when amount or address changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (btcAmount && userEthAddress && isValidEthAddress(userEthAddress)) {
        refreshOffers()
      }
    }, 500) // Debounce for 500ms

    return () => clearTimeout(timeoutId)
  }, [btcAmount, userEthAddress])

  // Poll Oracle for swap status updates
  const pollSwapStatus = async (swapId: string) => {
    try {
      const swapDetails = await oracleAPI.getSwapDetails(swapId)
      console.log('Swap status update:', swapDetails.data.status)
      
      switch (swapDetails.data.status) {
        case 'pending':
          // Still waiting for BTC payment
          updateSwapStep(2, "current")
          setCurrentStep(2)
          break
        case 'btc_received':
          // BTC received, oracle processing
          updateSwapStep(2, "completed")
          updateSwapStep(3, "current")
          setCurrentStep(3)
          break
        case 'tokens_swapped':
          // Swap completed successfully
          updateSwapStep(3, "completed")
          updateSwapStep(4, "completed")
          setCurrentStep(4)
          setSwapCompleted(true)
          setIsSwapping(false)
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval)
            delete (window as any).swapPollInterval
          }
          break
        case 'mm_failed':
          console.error('MM Server failed:', swapDetails.data)
          alert('Swap failed during token exchange. Please contact support.')
          setIsSwapping(false)
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval)
            delete (window as any).swapPollInterval
          }
          break
        case 'expired':
          console.error('Swap expired')
          alert('Swap expired. Please create a new swap.')
          setIsSwapping(false)
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval)
            delete (window as any).swapPollInterval
          }
          break
      }
    } catch (error) {
      console.error('Failed to get swap status:', error)
    }
  }

  const handleSwapConfirm = async () => {
    setShowConfirmModal(false)
    setIsSwapping(true)
    
    try {
      // Step 1: Create preimage via Oracle API
      setCurrentStep(0)
      updateSwapStep(0, "current")
      
      console.log('Creating preimage via Oracle API...')
      const preimageResponse = await oracleAPI.createPreimage({
        // userBtcAddress will be hardcoded in API service for testing
        mmPubkey: "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01", // Default MM pubkey
        btcAmount: btcToSatoshis(parseFloat(btcAmount)),
        timelock: 144,
        userEthAddress: userEthAddress
      })

      console.log('Preimage created:', preimageResponse)
      
      // Store real swap data
      setRealSwapId(preimageResponse.data.swapId)
      setHtlcAddress(preimageResponse.data.htlcAddress)
      
      // Step 2: Show Bitcoin script created
      updateSwapStep(0, "completed")
      updateSwapStep(1, "completed")
      setCurrentStep(1)
      
      // Step 3: Wait for BTC to be locked (this will be manual for now)
      updateSwapStep(2, "current")
      setCurrentStep(2)
      
      console.log('✅ HTLC Created Successfully!')
      console.log(`🎯 Send ${btcAmount} BTC to: ${preimageResponse.data.htlcAddress}`)
      console.log(`🆔 Swap ID: ${preimageResponse.data.swapId}`)
      
      // Start polling for swap status updates
      const pollInterval = setInterval(() => {
        pollSwapStatus(preimageResponse.data.swapId)
      }, 5000) // Poll every 5 seconds
      
      // Store interval ID to clear later
      ;(window as any).swapPollInterval = pollInterval
      
    } catch (error) {
      console.error('Swap creation failed:', error)
      alert(`Failed to create swap: ${error.message}`)
      setIsSwapping(false)
    }
  }

  const updateSwapStep = (stepIndex: number, status: "pending" | "current" | "completed") => {
    setSwapProgress((prev) =>
      prev.map((step, index) => ({
        ...step,
        status: index === stepIndex ? status : step.status,
      }))
    )
  }

  const calculateOutput = (amount, rate) => {
    return (Number.parseFloat(amount) * rate).toFixed(4)
  }

  const formatCurrency = (amount, currency) => {
    return `${amount} ${currency}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="container mx-auto px-4 py-4">
          {/* Top Banner */}
          <div className="flex items-center justify-center py-2 mb-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">T</span>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-slate-900 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                  TakeFi
                </h1>
                <p className="text-xs text-gray-400 -mt-1">Decentralized RWA Trading</p>
              </div>
            </div>
          </div>

          {/* Main Header Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bitcoin className="h-6 w-6 text-orange-500" />
              <span className="text-lg font-semibold text-white">BTC → RWA Swap</span>
            </div>

            {/* Real-time Price Ticker */}
            <div className="hidden lg:block">
              <ChainlinkPriceTicker
                onPriceUpdate={(pricesData) => {
                  if (pricesData.BTC) setBtcPrice(pricesData.BTC.price)
                  if (pricesData.COW) setCowPrice(pricesData.COW.price)
                  setLastPriceUpdate(new Date())
                }}
              />
            </div>

            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                <Bitcoin className="h-3 w-3 mr-1" />
                tb1pmj9...79wnn (Test)
              </Badge>
              <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse" />
                Testing Mode
              </Badge>
              {/* Reown AppKit Connect Button (for future wallet integration) */}
              <w3m-button />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Price Ticker */}
      <div className="lg:hidden border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <ChainlinkPriceTicker
            onPriceUpdate={(pricesData) => {
              if (pricesData.BTC) setBtcPrice(pricesData.BTC.price)
              if (pricesData.COW) setCowPrice(pricesData.COW.price)
              setLastPriceUpdate(new Date())
            }}
          />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {!isSwapping && !swapCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              {/* Main Swap Interface */}
              <Card className="bg-white/10 backdrop-blur-md border-white/20 mb-8">
                <CardHeader>
                  <CardTitle className="text-2xl text-white flex items-center">
                    <Bitcoin className="h-6 w-6 text-orange-500 mr-2" />
                    Swap Bitcoin to RWA Tokens
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* BTC Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-300">Amount to Swap</label>
                      {btcAmount && btcPrice > 0 && (
                        <span className="text-sm text-gray-400">
                          ≈ ${(Number.parseFloat(btcAmount) * btcPrice).toLocaleString()} USD
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Bitcoin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-orange-500" />
                      <Input
                        type="number"
                        placeholder="0.00001"
                        value={btcAmount}
                        onChange={(e) => setBtcAmount(e.target.value)}
                        className="pl-12 text-lg h-14 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-orange-500/50"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">
                        BTC
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 For testing: Use 0.00001 BTC (1000 sats) or smaller amounts for reliable swaps
                    </p>
                  </div>

                  {/* Ethereum Address Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-300">Your Ethereum Address</label>
                      {userEthAddress && !isValidEthAddress(userEthAddress) && (
                        <span className="text-sm text-red-400">Invalid address format</span>
                      )}
                      {userEthAddress && isValidEthAddress(userEthAddress) && (
                        <span className="text-sm text-green-400">Valid address ✓</span>
                      )}
                    </div>
                    <div className="relative">
                      <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-500" />
                      <Input
                        type="text"
                        placeholder="0x1234...5678 (where you'll receive COW tokens)"
                        value={userEthAddress}
                        onChange={(e) => setUserEthAddress(e.target.value)}
                        className={`pl-12 text-lg h-14 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-500/50 ${
                          userEthAddress && !isValidEthAddress(userEthAddress) ? 'border-red-500/50' : ''
                        } ${
                          userEthAddress && isValidEthAddress(userEthAddress) ? 'border-green-500/50' : ''
                        }`}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Enter your Ethereum wallet address where you want to receive the COW tokens
                    </p>
                  </div>

                  {btcAmount && selectedOffer && (
                    <div className="flex justify-between text-sm bg-white/5 rounded-lg p-3">
                      <span className="text-gray-400">Exchange Rate:</span>
                      <span className="text-white">
                        1 BTC = {selectedOffer.rate.toFixed(6)} COW
                      </span>
                    </div>
                  )}

                  {/* Refresh Offers */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Available Offers</h3>
                    <Button
                      onClick={refreshOffers}
                      disabled={isLoadingOffers}
                      variant="outline"
                      size="sm"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingOffers ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>

                  {/* Offers Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {isLoadingOffers
                      ? // Loading skeletons
                        Array.from({ length: 3 }).map((_, i) => (
                          <Card key={i} className="bg-white/5 border-white/10 animate-pulse">
                            <CardContent className="p-4">
                              <div className="h-4 bg-white/10 rounded mb-2" />
                              <div className="h-6 bg-white/10 rounded mb-3" />
                              <div className="space-y-2">
                                <div className="h-3 bg-white/10 rounded" />
                                <div className="h-3 bg-white/10 rounded w-3/4" />
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      : offers.map((offer) => (
                          <motion.div key={offer.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Card
                              className={`cursor-pointer transition-all duration-200 ${
                                offer.isBest
                                  ? "bg-gradient-to-br from-orange-500/20 to-purple-500/20 border-orange-500/50 ring-2 ring-orange-500/30"
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                              } ${selectedOffer?.id === offer.id ? "ring-2 ring-blue-500/50" : ""}`}
                              onClick={() => setSelectedOffer(offer)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-white">{offer.mmName}</span>
                                  <div className="flex items-center space-x-2">
                                    {offer.realTimeRate && (
                                      <Badge
                                        variant="outline"
                                        className="bg-green-500/20 text-green-400 border-green-500/30 text-xs"
                                      >
                                        Live
                                      </Badge>
                                    )}
                                    {offer.mmName.includes('Demo MM') && (
                                      <Badge
                                        variant="outline"
                                        className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs"
                                      >
                                        Demo
                                      </Badge>
                                    )}
                                    {offer.isBest && (
                                      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                                        <Zap className="h-3 w-3 mr-1" />
                                        Best
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Rate:</span>
                                    <span className="text-white font-medium">{offer.rate.toFixed(6)} COW/BTC</span>
                                  </div>

                                  {btcAmount && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">You get:</span>
                                      <span className="text-green-400 font-medium">
                                        {calculateOutput(btcAmount, offer.rate)} COW
                                      </span>
                                    </div>
                                  )}

                                  {btcAmount && cowPrice > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">USD Value:</span>
                                      <span className="text-blue-400 font-medium">
                                        $
                                        {(
                                          Number.parseFloat(calculateOutput(btcAmount, offer.rate)) * cowPrice
                                        ).toFixed(2)}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Fee:</span>
                                    <span className="text-white">{offer.fee}%</span>
                                  </div>

                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Time:</span>
                                    <span className="text-white">{offer.estimatedTime}</span>
                                  </div>

                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Reliability:</span>
                                    <span className="text-green-400">{offer.reliability}%</span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                  </div>

                  {/* Swap Button */}
                  <Button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={
                      !btcAmount || 
                      !userEthAddress || 
                      !selectedOffer || 
                      Number.parseFloat(btcAmount) <= 0 ||
                      !isValidEthAddress(userEthAddress)
                    }
                    className="w-full h-12 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white font-semibold text-lg disabled:opacity-50"
                  >
                    <ArrowRight className="h-5 w-5 mr-2" />
                    {!userEthAddress || !isValidEthAddress(userEthAddress) 
                      ? "Enter valid Ethereum address" 
                      : `Swap ${btcAmount || "0"} BTC → ${selectedOffer ? calculateOutput(btcAmount || "0", selectedOffer.rate) : "0"} COW`
                    }
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Swap Progress */}
          {isSwapping && !swapCompleted && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
              <Card className="bg-white/10 backdrop-blur-md border-white/20">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center">
                    <Clock className="h-5 w-5 mr-2 animate-pulse" />
                    Swap in Progress
                  </CardTitle>
                  <div className="space-y-1">
                    <p className="text-gray-400">Swap ID: {realSwapId || "Creating..."}</p>
                    {htlcAddress && (
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                        <p className="text-orange-400 font-semibold text-sm">🎯 Send Bitcoin to:</p>
                        <p className="text-white font-mono text-xs break-all">{htlcAddress}</p>
                        <p className="text-orange-300 text-xs mt-1">Amount: {btcAmount} BTC</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {swapProgress.map((step, index) => {
                      const Icon = step.icon
                      return (
                        <div key={step.id} className="flex items-center space-x-4">
                          <div
                            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                              step.status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : step.status === "current"
                                  ? "bg-orange-500/20 text-orange-400 animate-pulse"
                                  : "bg-gray-500/20 text-gray-500"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <p
                              className={`font-medium ${
                                step.status === "completed"
                                  ? "text-green-400"
                                  : step.status === "current"
                                    ? "text-orange-400"
                                    : "text-gray-400"
                              }`}
                            >
                              {step.name}
                            </p>
                          </div>
                          {step.status === "completed" && <CheckCircle className="h-5 w-5 text-green-400" />}
                        </div>
                      )
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Progress</span>
                      <span className="text-white">{Math.round(((currentStep + 1) / swapSteps.length) * 100)}%</span>
                    </div>
                    <Progress value={((currentStep + 1) / swapSteps.length) * 100} className="h-2 bg-white/10" />
                  </div>
                </CardContent>
              </Card>

              {/* Bitcoin Funding Component - Disabled for testing mode */}
              {htlcAddress && (
                <div className="mt-6">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-400 font-semibold">Testing Mode - Manual Funding Required</p>
                        <p className="text-sm text-gray-300">
                          Send {btcAmount} BTC manually to the HTLC address below to continue the swap
                        </p>
                        <p className="text-xs text-gray-400 mt-1 font-mono break-all">
                          HTLC Address: {htlcAddress}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bitcoin Payment Monitor */}
              {htlcAddress && (
                <Card className="bg-white/10 backdrop-blur-md border-white/20 mt-6">
                  <CardContent className="p-4">
                    <BitcoinPaymentChecker walletAddress={htlcAddress} />
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Swap Completed */}
          {swapCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto text-center"
            >
              <Card className="bg-gradient-to-br from-green-500/20 to-blue-500/20 backdrop-blur-md border-green-500/30">
                <CardContent className="p-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
                  >
                    <CheckCircle className="h-10 w-10 text-green-400" />
                  </motion.div>

                  <h2 className="text-2xl font-bold text-white mb-2">Swap Completed!</h2>
                  <p className="text-gray-300 mb-6">Your Bitcoin has been successfully swapped for RWA tokens.</p>

                  <div className="bg-white/5 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Swapped</p>
                        <p className="text-white font-medium">{btcAmount} BTC</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Received</p>
                        <p className="text-green-400 font-medium">
                          {selectedOffer ? calculateOutput(btcAmount, selectedOffer.rate) : "0"} COW
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Swap ID</p>
                        <p className="text-white font-mono text-xs">{realSwapId}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Status</p>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => window.location.reload()}
                      className="flex-1 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700"
                    >
                      New Swap
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                    >
                      View Portfolio
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Modal */}
        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className="bg-slate-900/95 backdrop-blur-md border-white/20 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl">Confirm Swap</DialogTitle>
            </DialogHeader>

            {selectedOffer && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">You Pay</p>
                      <p className="text-white font-medium text-lg">{btcAmount} BTC</p>
                    </div>
                    <div>
                      <p className="text-gray-400">You Receive</p>
                      <p className="text-green-400 font-medium text-lg">
                        {calculateOutput(btcAmount, selectedOffer.rate)} COW
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">BTC Address (Test):</span>
                    <span className="text-orange-400 font-mono text-xs">tb1pmj9...79wnn</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your ETH Address:</span>
                    <span className="text-white font-mono text-xs">{userEthAddress.slice(0, 6)}...{userEthAddress.slice(-4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Maker:</span>
                    <span className="text-white">{selectedOffer.mmName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Exchange Rate:</span>
                    <span className="text-white">{selectedOffer.rate.toFixed(6)} COW/BTC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fee:</span>
                    <span className="text-white">{selectedOffer.fee}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Time:</span>
                    <span className="text-white">{selectedOffer.estimatedTime}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSwapConfirm}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700"
                  >
                    Confirm Swap
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
