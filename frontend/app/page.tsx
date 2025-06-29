"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Bitcoin,
  RefreshCw,
  ArrowRight,
  CheckCircle,
  Clock,
  TrendingUp,
  Wallet,
  Globe,
  Zap,
  ExternalLink,
  QrCode,
  Copy,
} from "lucide-react";
import { ChainlinkPriceTicker } from "@/components/chainlink-price-ticker";
import BitcoinPaymentChecker from "@/components/bitcoin-payment-checker";
import QRCode from "qrcode";

// API imports
import {
  oracleAPI,
  generateOffersFromQuotes,
  btcToSatoshis,
  type MarketMakerOffer,
  type CreatePreimageResponse,
} from "@/lib/api";

// Bitcoin wallet integration
import {
  useBitcoinWallet,
  formatBitcoinAddress,
} from "@/hooks/use-bitcoin-wallet";
// import BitcoinFunding from "@/components/bitcoin-funding-component"

const swapSteps = [
  { id: 1, name: "Offer Confirmed", status: "pending", icon: CheckCircle },
  {
    id: 2,
    name: "HTLC Script and Pre-image Created",
    status: "pending",
    icon: Bitcoin,
  },
  { id: 3, name: "BTC Payment Received", status: "pending", icon: Wallet },
  { id: 4, name: "Order Submitted to CoW", status: "pending", icon: Globe },
  { id: 5, name: "Tokens Delivered", status: "pending", icon: TrendingUp },
];

// Chainlink Price Feed Integration
const CHAINLINK_BTC_USD_FEED = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"; // Mainnet BTC/USD
const CHAINLINK_API_KEY = process.env.NEXT_PUBLIC_CHAINLINK_API_KEY || "demo";

const fetchChainlinkPrice = async (feedAddress: string) => {
  try {
    // Using Chainlink's price feed API (in production, you'd use Web3 to read directly from contract)
    const response = await fetch(
      `https://api.chain.link/v1/feeds/${feedAddress}`
    );
    const data = await response.json();
    return data.answer / 100000000; // Chainlink returns price with 8 decimals
  } catch (error) {
    console.error("Error fetching Chainlink price:", error);
    return null;
  }
};

// Mock Chainlink Service
const chainlinkService = {
  getAllPrices: async () => {
    // Simulate fetching prices from Chainlink
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          BTC: { price: 43250, lastUpdated: new Date() },
          bCSPX: { price: 0.25, lastUpdated: new Date() },
        });
      }, 500);
    });
  },
  getNetworkStatus: async () => {
    // Simulate fetching network status
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          blockNumber: 1234567,
          gasPrice: "50",
        });
      }, 300);
    });
  },
};

export default function Component() {
  // Bitcoin wallet integration
  const { address: btcAddress, isConnected: btcConnected } = useBitcoinWallet();

  // Form inputs
  const [btcAmount, setBtcAmount] = useState("");
  const [userEthAddress, setUserEthAddress] = useState(""); // User's Ethereum address for receiving tokens

  // Real API data
  const [htlcAddress, setHtlcAddress] = useState(""); // Real Bitcoin HTLC address from Oracle
  const [realSwapId, setRealSwapId] = useState(""); // Real swap ID from Oracle
  const [selectedOffer, setSelectedOffer] = useState<MarketMakerOffer | null>(
    null
  );
  const [offers, setOffers] = useState<MarketMakerOffer[]>([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);

  // UI state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeDataURL, setQrCodeDataURL] = useState("");
  const [swapProgress, setSwapProgress] = useState(swapSteps);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapCompleted, setSwapCompleted] = useState(false);

  // Order tracking data
  const [orderTrackingData, setOrderTrackingData] = useState<any>(null);

  // Prices
  const [btcPrice, setBtcPrice] = useState(0);
  const [bcspxPrice, setBcspxPrice] = useState(0);
  const [priceLoading, setPriceLoading] = useState(true);
  const [lastPriceUpdate, setLastPriceUpdate] = useState(new Date());
  const [btcPriceData, setBtcPriceData] = useState(null);
  const [bcspxPriceData, setBcspxPriceData] = useState(null);
  const [networkStatus, setNetworkStatus] = useState({
    blockNumber: 0,
    gasPrice: "0",
  });

  const fetchRealTimePrices = async () => {
    setPriceLoading(true);
    try {
      const pricesData = await chainlinkService.getAllPrices();

      // Extract price values and check for staleness
      const btcData = pricesData.BTC;
      const bcspxData = pricesData.bCSPX;

      if (btcData) {
        setBtcPrice(btcData.price);
        setBtcPriceData(btcData);
      }

      if (bcspxData) {
        setBcspxPrice(bcspxData.price);
        setBcspxPriceData(bcspxData);
      }

      setLastPriceUpdate(new Date());

      // Update offers with new prices
      if (btcData && bcspxData) {
        updateOffersWithRealPrices(btcData.price, bcspxData.price);
      }
    } catch (error) {
      console.error("Error fetching Chainlink prices:", error);
      // Fallback to demo prices
      setBtcPrice(43250);
      setBcspxPrice(0.25);
    } finally {
      setPriceLoading(false);
    }
  };

  const updateOffersWithRealPrices = (btcPrice: number, bcspxPrice: number) => {
    // This function is kept for backward compatibility with Chainlink price updates
    // Real offers are now fetched from the API
  };

  // Validate Ethereum address format
  const isValidEthAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Fetch real offers from API
  const refreshOffers = async () => {
    if (!btcAmount || parseFloat(btcAmount) <= 0) {
      setOffers([]);
      return;
    }

    if (!userEthAddress || !isValidEthAddress(userEthAddress)) {
      setOffers([]);
      return;
    }

    setIsLoadingOffers(true);
    try {
      console.log("Fetching real offers from API...");
      const realOffers = await generateOffersFromQuotes(
        btcAmount,
        userEthAddress
      );
      setOffers(realOffers);
      console.log("Real offers received:", realOffers);
    } catch (error) {
      console.error("Failed to fetch offers:", error);
      // Keep existing offers on error
    } finally {
      setIsLoadingOffers(false);
    }
  };

  useEffect(() => {
    fetchRealTimePrices();

    // Update prices every 30 seconds
    const priceInterval = setInterval(fetchRealTimePrices, 30000);

    // Fetch network status
    const fetchNetworkStatus = async () => {
      const status = await chainlinkService.getNetworkStatus();
      setNetworkStatus(status);
    };
    fetchNetworkStatus();

    return () => {
      clearInterval(priceInterval);
      // Clean up swap polling if it exists
      if ((window as any).swapPollInterval) {
        clearInterval((window as any).swapPollInterval);
      }
    };
  }, []);

  // Auto-refresh offers when amount or address changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (btcAmount && userEthAddress && isValidEthAddress(userEthAddress)) {
        refreshOffers();
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timeoutId);
  }, [btcAmount, userEthAddress]);

  // Poll Oracle for swap status updates
  const pollSwapStatus = async (swapId: string) => {
    try {
      // Get both swap details and order tracking
      const [swapDetails, orderTracking] = await Promise.all([
        oracleAPI.getSwapDetails(swapId),
        oracleAPI.getOrderTracking(swapId).catch((error) => {
          console.warn("Order tracking not available yet:", error.message);
          return null;
        }),
      ]);

      console.log("Swap status update:", swapDetails.data.status);
      console.log("Order tracking:", orderTracking?.data);

      // Store order tracking data for UI
      if (orderTracking) {
        setOrderTrackingData(orderTracking.data);
      }

      switch (swapDetails.data.status) {
        case "pending":
          // Still waiting for BTC payment
          updateSwapStep(2, "current");
          setCurrentStep(2);
          break;

        case "btc_received":
          // BTC received, oracle processing
          updateSwapStep(2, "completed");
          updateSwapStep(3, "current");
          setCurrentStep(3);
          break;

        case "order_submitted":
          // Order has been submitted to CoW Protocol
          updateSwapStep(2, "completed");
          updateSwapStep(3, "completed");
          updateSwapStep(4, "current");
          setCurrentStep(4);
          break;

        case "order_pending":
          // Order is live on CoW Protocol, waiting for execution
          updateSwapStep(4, "current");
          setCurrentStep(4);
          break;

        case "order_partial":
          // Order partially filled
          updateSwapStep(4, "current");
          setCurrentStep(4);
          break;

        case "completed":
          // Actually completed - tokens delivered!
          updateSwapStep(4, "completed");
          updateSwapStep(5, "completed");
          setCurrentStep(5);
          setSwapCompleted(true);
          setIsSwapping(false);
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval);
            delete (window as any).swapPollInterval;
          }
          break;

        case "order_failed":
        case "mm_failed":
          console.error("Order/MM failed:", swapDetails.data);
          alert(
            "Order failed to execute. This can happen on testnet due to low liquidity. Please try again or contact support."
          );
          setIsSwapping(false);
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval);
            delete (window as any).swapPollInterval;
          }
          break;

        case "expired":
          console.error("Swap expired");
          alert("Swap expired. Please create a new swap.");
          setIsSwapping(false);
          // Clear polling
          if ((window as any).swapPollInterval) {
            clearInterval((window as any).swapPollInterval);
            delete (window as any).swapPollInterval;
          }
          break;
      }
    } catch (error) {
      console.error("Failed to get swap/order status:", error);
    }
  };

  const handleSwapConfirm = async () => {
    setShowConfirmModal(false);
    setIsSwapping(true);

    try {
      // Step 1: Create preimage via Oracle API
      setCurrentStep(0);
      updateSwapStep(0, "current");

      console.log("Creating preimage via Oracle API...");
      const preimageResponse = await oracleAPI.createPreimage({
        // userBtcAddress will be hardcoded in API service for testing
        mmPubkey:
          "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01", // Default MM pubkey
        btcAmount: btcToSatoshis(parseFloat(btcAmount)),
        timelock: 144,
        userEthAddress: userEthAddress,
      });

      console.log("Preimage created:", preimageResponse);

      // Store real swap data
      setRealSwapId(preimageResponse.data.swapId);
      setHtlcAddress(preimageResponse.data.htlcAddress);

      // Step 2: Show Bitcoin script created
      updateSwapStep(0, "completed");
      updateSwapStep(1, "completed");
      setCurrentStep(1);

      // Step 3: Wait for BTC to be locked (this will be manual for now)
      updateSwapStep(2, "current");
      setCurrentStep(2);

      console.log("✅ HTLC Created Successfully!");
      console.log(
        `🎯 Send ${btcAmount} BTC to: ${preimageResponse.data.htlcAddress}`
      );
      console.log(`🆔 Swap ID: ${preimageResponse.data.swapId}`);

      // Start polling for swap status updates
      const pollInterval = setInterval(() => {
        pollSwapStatus(preimageResponse.data.swapId);
      }, 5000); // Poll every 5 seconds

      // Store interval ID to clear later
      (window as any).swapPollInterval = pollInterval;
    } catch (error) {
      console.error("Swap creation failed:", error);
      alert(`Failed to create swap: ${error.message}`);
      setIsSwapping(false);
    }
  };

  const updateSwapStep = (
    stepIndex: number,
    status: "pending" | "current" | "completed"
  ) => {
    setSwapProgress((prev) =>
      prev.map((step, index) => ({
        ...step,
        status: index === stepIndex ? status : step.status,
      }))
    );
  };

  const calculateOutput = (amount: string | number, rate: number) => {
    return (Number.parseFloat(amount.toString()) * rate).toFixed(4);
  };

  const formatCurrency = (amount: string | number, currency: string) => {
    return `${amount} ${currency}`;
  };

  // Generate QR Code for Bitcoin payment
  const generateQRCode = async () => {
    if (!htlcAddress || !btcAmount) return;

    try {
      // Create Bitcoin URI format based on network
      // For testnet SegWit addresses (tb1...), use BIP 321 format
      // For mainnet SegWit addresses (bc1...), use standard format
      let bitcoinURI: string;

      if (
        htlcAddress.startsWith("tb1") ||
        htlcAddress.startsWith("2") ||
        htlcAddress.startsWith("m") ||
        htlcAddress.startsWith("n")
      ) {
        // Testnet address - use BIP 321 format: bitcoin:?tb=address&amount=X
        bitcoinURI = `bitcoin:?tb=${htlcAddress}&amount=${btcAmount}`;
      } else {
        // Mainnet address - use standard BIP 21 format: bitcoin:address?amount=X
        bitcoinURI = `bitcoin:${htlcAddress}?amount=${btcAmount}`;
      }

      // Generate QR code as data URL
      const qrDataURL = await QRCode.toDataURL(bitcoinURI, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      setQrCodeDataURL(qrDataURL);
      setShowQRModal(true);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  // Copy address to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

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
                <p className="text-xs text-gray-400 -mt-1">
                  Decentralized RWA Trading
                </p>
              </div>
            </div>
          </div>

          {/* Main Header Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bitcoin className="h-6 w-6 text-orange-500" />
              <span className="text-lg font-semibold text-white">
                BTC → RWA Swap
              </span>
            </div>

            {/* Real-time Price Ticker */}
            <div className="hidden lg:block">
              <ChainlinkPriceTicker
                onPriceUpdate={(pricesData) => {
                  if (pricesData.BTC) setBtcPrice(pricesData.BTC.price);
                  if (pricesData.bCSPX) setCowPrice(pricesData.bCSPX.price);
                  setLastPriceUpdate(new Date());
                }}
              />
            </div>

            <div className="flex items-center space-x-4">
              <Badge
                variant="outline"
                className="bg-orange-500/20 text-orange-400 border-orange-500/30"
              >
                <Bitcoin className="h-3 w-3 mr-1" />
                tb1pmj9...79wnn (Test)
              </Badge>
              {/* <Badge
                variant="outline"
                className="bg-blue-500/20 text-blue-400 border-blue-500/30"
              >
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse" />
                Testing Mode
              </Badge> */}
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
              if (pricesData.BTC) setBtcPrice(pricesData.BTC.price);
              if (pricesData.bCSPX) setCowPrice(pricesData.bCSPX.price);
              setLastPriceUpdate(new Date());
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
                      <label className="text-sm font-medium text-gray-300">
                        Amount to Swap
                      </label>
                      {btcAmount && btcPrice > 0 && (
                        <span className="text-sm text-gray-400">
                          ≈ $
                          {(
                            Number.parseFloat(btcAmount) * btcPrice
                          ).toLocaleString()}{" "}
                          USD
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
                      💡 For testing: Use 0.00001 BTC (1000 sats) or smaller
                      amounts for reliable swaps
                    </p>
                  </div>

                  {/* Ethereum Address Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-300">
                        Your Avalanche Address
                      </label>
                      {userEthAddress && !isValidEthAddress(userEthAddress) && (
                        <span className="text-sm text-red-400">
                          Invalid address format
                        </span>
                      )}
                      {userEthAddress && isValidEthAddress(userEthAddress) && (
                        <span className="text-sm text-green-400">
                          Valid address ✓
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-500" />
                      <Input
                        type="text"
                        placeholder="0x1234...5678 (where you'll receive bCSPX tokens)"
                        value={userEthAddress}
                        onChange={(e) => setUserEthAddress(e.target.value)}
                        className={`pl-12 text-lg h-14 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-500/50 ${
                          userEthAddress && !isValidEthAddress(userEthAddress)
                            ? "border-red-500/50"
                            : ""
                        } ${
                          userEthAddress && isValidEthAddress(userEthAddress)
                            ? "border-green-500/50"
                            : ""
                        }`}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Enter your Ethereum wallet address where you want to
                      receive the bCSPX tokens
                    </p>
                  </div>

                  {btcAmount && selectedOffer && (
                    <div className="flex justify-between text-sm bg-white/5 rounded-lg p-3">
                      <span className="text-gray-400">Exchange Rate:</span>
                      <span className="text-white">
                        1 BTC = {selectedOffer.rate.toFixed(6)} bCSPX
                      </span>
                    </div>
                  )}

                  {/* Refresh Offers */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">
                      Available Offers
                    </h3>
                    <Button
                      onClick={refreshOffers}
                      disabled={isLoadingOffers}
                      variant="outline"
                      size="sm"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${
                          isLoadingOffers ? "animate-spin" : ""
                        }`}
                      />
                      Refresh
                    </Button>
                  </div>

                  {/* Offers Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {isLoadingOffers
                      ? // Loading skeletons
                        Array.from({ length: 3 }).map((_, i) => (
                          <Card
                            key={i}
                            className="bg-gray-800/60 border-gray-700/50 animate-pulse backdrop-blur-sm"
                          >
                            <CardContent className="p-4">
                              <div className="h-4 bg-gray-600/40 rounded mb-2" />
                              <div className="h-6 bg-gray-600/40 rounded mb-3" />
                              <div className="space-y-2">
                                <div className="h-3 bg-gray-600/40 rounded" />
                                <div className="h-3 bg-gray-600/40 rounded w-3/4" />
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      : offers.map((offer) => (
                          <motion.div
                            key={offer.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Card
                              className={`cursor-pointer transition-all duration-200 backdrop-blur-sm ${
                                offer.isBest
                                  ? "bg-gradient-to-br from-orange-900/80 to-purple-900/80 border-orange-400/70 ring-2 ring-orange-400/50 shadow-lg shadow-orange-500/20"
                                  : offer.mmName.includes("Fallback")
                                  ? "bg-gradient-to-br from-slate-800/85 to-purple-900/70 border-purple-400/40 hover:bg-gradient-to-br hover:from-slate-700/90 hover:to-purple-800/80 hover:border-purple-300/50"
                                  : "bg-gradient-to-br from-slate-800/80 to-gray-900/80 border-slate-600/50 hover:bg-gradient-to-br hover:from-slate-700/85 hover:to-gray-800/85 hover:border-slate-500/60"
                              } ${
                                selectedOffer?.id === offer.id
                                  ? "ring-2 ring-blue-400/70 border-blue-400/60"
                                  : ""
                              }`}
                              onClick={() => setSelectedOffer(offer)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-semibold text-white text-base">
                                    {offer.mmName}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    {offer.rate && (
                                      <Badge
                                        variant="outline"
                                        className="bg-green-500/30 text-green-300 border-green-400/50 text-xs font-medium"
                                      >
                                        Live
                                      </Badge>
                                    )}
                                    {/* {offer.mmName.includes("Demo MM") && (
                                      <Badge
                                        variant="outline"
                                        className="bg-yellow-500/30 text-yellow-300 border-yellow-400/50 text-xs font-medium"
                                      >
                                        Demo
                                      </Badge>
                                    )} */}
                                    {offer.isBest && (
                                      <Badge className="bg-orange-500/30 text-orange-300 border-orange-400/50 font-medium">
                                        <Zap className="h-3 w-3 mr-1" />
                                        Best
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2.5 text-sm">
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-300 font-medium">
                                      Rate:
                                    </span>
                                    <span className="text-white font-semibold">
                                      {offer.rate.toFixed(6)} bCSPX/BTC
                                    </span>
                                  </div>

                                  {btcAmount && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-300 font-medium">
                                        You get:
                                      </span>
                                      <span className="text-green-300 font-semibold">
                                        {calculateOutput(btcAmount, offer.rate)}{" "}
                                        bCSPX
                                      </span>
                                    </div>
                                  )}

                                  {btcAmount && bcspxPrice > 0 && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-300 font-medium">
                                        USD Value:
                                      </span>
                                      <span className="text-blue-300 font-semibold">
                                        $
                                        {(
                                          Number.parseFloat(
                                            calculateOutput(
                                              btcAmount,
                                              offer.rate
                                            )
                                          ) * bcspxPrice
                                        ).toFixed(2)}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-300 font-medium">
                                      Fee:
                                    </span>
                                    <span className="text-white font-semibold">
                                      {offer.fee}%
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-300 font-medium">
                                      Time:
                                    </span>
                                    <span className="text-white font-semibold">
                                      {offer.estimatedTime}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-300 font-medium">
                                      Reliability:
                                    </span>
                                    <span className="text-green-300 font-semibold">
                                      {offer.reliability}%
                                    </span>
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
                      : `Swap ${btcAmount || "0"} BTC → ${
                          selectedOffer
                            ? calculateOutput(
                                btcAmount || "0",
                                selectedOffer.rate
                              )
                            : "0"
                        } bCSPX`}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Swap Progress */}
          {isSwapping && !swapCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="bg-white/10 backdrop-blur-md border-white/20">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center">
                    <Clock className="h-5 w-5 mr-2 animate-pulse" />
                    Swap in Progress
                  </CardTitle>
                  <div className="space-y-2">
                    <p className="text-gray-400">
                      Swap ID: {realSwapId || "Creating..."}
                    </p>

                    {/* Order Tracking Status */}
                    {orderTrackingData && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">Tracking:</span>
                        <Badge
                          variant="outline"
                          className={`${
                            orderTrackingData.tracking.method === "websocket"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          }`}
                        >
                          {orderTrackingData.tracking.method === "websocket"
                            ? "🔴 Live"
                            : "🔄 Polling"}
                        </Badge>
                        {orderTrackingData.explorerUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.open(
                                orderTrackingData.explorerUrl,
                                "_blank"
                              )
                            }
                            className="h-5 px-2 text-xs"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            CoW Explorer
                          </Button>
                        )}
                      </div>
                    )}

                    {htlcAddress && (
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-orange-400 font-semibold text-sm">
                            🎯 Send Bitcoin to:
                          </p>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(htlcAddress)}
                              className="h-6 w-6 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={generateQRCode}
                              className="h-6 w-6 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-white font-mono text-xs break-all">
                          {htlcAddress}
                        </p>
                        <p className="text-orange-300 text-xs mt-1">
                          Amount: {btcAmount} BTC
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {swapProgress.map((step) => {
                      const Icon = step.icon;
                      return (
                        <div
                          key={step.id}
                          className="flex items-center space-x-4"
                        >
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
                          {step.status === "completed" && (
                            <CheckCircle className="h-5 w-5 text-green-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Progress</span>
                      <span className="text-white">
                        {Math.round(
                          ((currentStep + 1) / swapSteps.length) * 100
                        )}
                        %
                      </span>
                    </div>
                    <Progress
                      value={((currentStep + 1) / swapSteps.length) * 100}
                      className="h-2 bg-white/10"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Bitcoin Funding Component - Disabled for testing mode */}
              {htlcAddress && (
                <div className="mt-6">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-400 font-semibold">
                          Testing Mode - Manual Funding Required
                        </p>
                        <p className="text-sm text-gray-300">
                          Send {btcAmount} BTC manually to the HTLC address
                          below to continue the swap
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

                  <h2 className="text-2xl font-bold text-white mb-2">
                    Swap Completed Successfully! 🎉
                  </h2>
                  <p className="text-gray-300 mb-6">
                    Your Bitcoin has been swapped and tokens have been delivered
                    to your wallet.
                  </p>

                  {/* Trade Details */}
                  <div className="bg-white/5 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Swapped</p>
                        <p className="text-white font-medium">
                          {btcAmount} BTC
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Received</p>
                        <p className="text-green-400 font-medium">
                          {orderTrackingData?.executedAmounts?.buy
                            ? `${(
                                parseFloat(
                                  orderTrackingData.executedAmounts.buy
                                ) / 1e18
                              ).toFixed(4)} bCSPX`
                            : `${
                                selectedOffer
                                  ? calculateOutput(
                                      btcAmount,
                                      selectedOffer.rate
                                    )
                                  : "0"
                              } bCSPX`}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Transaction</p>
                        <p className="text-white font-mono text-xs">
                          {orderTrackingData?.txHash
                            ? `${orderTrackingData.txHash.slice(
                                0,
                                10
                              )}...${orderTrackingData.txHash.slice(-6)}`
                            : "Processing"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Network</p>
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Sepolia
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {/* CoW Explorer Link */}
                    {orderTrackingData?.explorerUrl && (
                      <Button
                        onClick={() =>
                          window.open(orderTrackingData.explorerUrl, "_blank")
                        }
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on CoW Protocol Explorer
                      </Button>
                    )}

                    {/* Transaction Hash Link */}
                    {orderTrackingData?.txHash && (
                      <Button
                        onClick={() =>
                          window.open(
                            `https://sepolia.etherscan.io/tx/${orderTrackingData.txHash}`,
                            "_blank"
                          )
                        }
                        variant="outline"
                        className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Transaction on Etherscan
                      </Button>
                    )}

                    {/* Token Import Helper */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-left">
                      <p className="text-blue-400 font-semibold mb-2">
                        📱 Add Token to Wallet
                      </p>
                      <p className="text-sm text-gray-300 mb-2">
                        If tokens don't appear automatically, import this
                        contract:
                      </p>
                      <div className="bg-black/30 rounded p-2 flex items-center justify-between">
                        <code className="text-xs text-green-400 font-mono">
                          0x0625aFB445C3B6B7B929342a04A22599fd5dBB59
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59"
                            )
                          }
                          className="h-6 px-2"
                        >
                          Copy
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Token Symbol: bCSPX • Network: Sepolia Testnet
                      </p>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex gap-3 pt-4">
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
                      <p className="text-white font-medium text-lg">
                        {btcAmount} BTC
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">You Receive</p>
                      <p className="text-green-400 font-medium text-lg">
                        {calculateOutput(btcAmount, selectedOffer.rate)} bCSPX
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">BTC Address (Test):</span>
                    <span className="text-orange-400 font-mono text-xs">
                      tb1pmj9...79wnn
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your ETH Address:</span>
                    <span className="text-white font-mono text-xs">
                      {userEthAddress.slice(0, 6)}...{userEthAddress.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Maker:</span>
                    <span className="text-white">{selectedOffer.mmName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Exchange Rate:</span>
                    <span className="text-white">
                      {selectedOffer.rate.toFixed(6)} bCSPX/BTC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fee:</span>
                    <span className="text-white">{selectedOffer.fee}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Time:</span>
                    <span className="text-white">
                      {selectedOffer.estimatedTime}
                    </span>
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

        {/* QR Code Modal */}
        <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
          <DialogContent className="bg-slate-900/95 backdrop-blur-md border-white/20 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <QrCode className="h-5 w-5 text-orange-400" />
                Bitcoin Payment QR Code
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Payment Details */}
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount:</span>
                    <span className="text-white font-semibold">
                      {btcAmount} BTC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Network:</span>
                    <span className="text-white font-semibold">
                      {htlcAddress?.startsWith("tb1") ||
                      htlcAddress?.startsWith("2") ||
                      htlcAddress?.startsWith("m") ||
                      htlcAddress?.startsWith("n")
                        ? "Testnet"
                        : "Mainnet"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Address:</span>
                    <span className="text-white font-mono text-xs break-all">
                      {htlcAddress}
                    </span>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {qrCodeDataURL && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="bg-white p-4 rounded-lg">
                    <img
                      src={qrCodeDataURL}
                      alt="Bitcoin Payment QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Scan with your Bitcoin wallet to pay {btcAmount} BTC
                  </p>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <h4 className="text-blue-400 font-semibold text-sm mb-2">
                  Payment Instructions:
                </h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Open your Bitcoin wallet app</li>
                  <li>• Scan the QR code above</li>
                  <li>• Verify the amount and address</li>
                  <li>• Send the payment</li>
                  <li>• Wait for confirmation</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(htlcAddress)}
                  className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Address
                </Button>
                <Button
                  onClick={() => setShowQRModal(false)}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
