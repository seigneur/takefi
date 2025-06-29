import { ethers } from "ethers";
import { mmAPI, TOKEN_ADDRESSES } from "./api";

// Chainlink Price Feed ABI (minimal interface)
const PRICE_FEED_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "description",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

// Mainnet Chainlink Price Feed Addresses
export const PRICE_FEEDS = {
  BTC_USD: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // BTC/USD
  ETH_USD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD
  bCSPX_USD: "0x0000000000000000000000000000000000000000", // Mock address for COW
} as const;

export interface PriceData {
  price: number;
  timestamp: number;
  roundId: string;
  decimals: number;
  description: string;
}

export class ChainlinkPriceService {
  private static instance: ChainlinkPriceService;
  private provider: ethers.providers.JsonRpcProvider;
  private priceCache: Map<string, { data: PriceData; cacheTime: number }> =
    new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly RPC_URLS = [
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`,
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",
  ];

  private constructor() {
    // Try multiple RPC providers for reliability
    this.provider = this.createProvider();
  }

  private createProvider(): ethers.providers.JsonRpcProvider {
    for (const url of this.RPC_URLS) {
      try {
        if (url.includes("undefined") || url.includes("null")) continue;
        return new ethers.providers.JsonRpcProvider(url);
      } catch (error) {
        console.warn(`Failed to create provider with URL: ${url}`);
        continue;
      }
    }
    // Fallback to public node
    return new ethers.providers.JsonRpcProvider("https://ethereum.publicnode.com");
  }

  static getInstance(): ChainlinkPriceService {
    if (!ChainlinkPriceService.instance) {
      ChainlinkPriceService.instance = new ChainlinkPriceService();
    }
    return ChainlinkPriceService.instance;
  }

  async getPriceFromContract(
    contractAddress: string
  ): Promise<PriceData | null> {
    try {
      const contract = new ethers.Contract(
        contractAddress,
        PRICE_FEED_ABI,
        this.provider
      );

      // Get latest round data and decimals in parallel
      let roundData: [bigint, bigint, bigint, bigint, bigint] | undefined =
        undefined;
      let decimals: number | undefined = undefined;
      let description: string | undefined = undefined;

      try {
        // Normal AggregatorV3 interface
        [roundData, decimals, description] = await Promise.all([
          contract.latestRoundData(),
          contract.decimals(),
          contract.description().catch(() => "Unknown Feed"),
        ]);
      } catch (err: any) {
        /* When the feed reverts (e.g. "missing revert data") retry with legacy getters.
         Some older equity feeds expose latestAnswer / latestTimestamp instead. */
        if (err.code === "CALL_EXCEPTION") {
          const [legacyAnswer, legacyTimestamp, legacyDecimals] =
            await Promise.all([
              contract.latestAnswer?.().catch(() => undefined),
              contract.latestTimestamp?.().catch(() => undefined),
              contract.decimals().catch(() => undefined),
            ]);

          if (legacyAnswer && legacyTimestamp) {
            roundData = [
              BigInt(0),
              BigInt(legacyAnswer),
              BigInt(legacyTimestamp),
              BigInt(legacyTimestamp),
              BigInt(0),
            ];
            decimals = Number(legacyDecimals ?? 8);
            description = await contract
              .description()
              .catch(() => "Legacy Feed");
          } else {
            throw err; // propagate if legacy path also fails
          }
        } else {
          throw err;
        }
      }

      const [roundId, answer, startedAt, updatedAt, answeredInRound] =
        roundData as [bigint, bigint, bigint, bigint, bigint];

      // Convert price based on decimals
      const price = Number(answer) / Math.pow(10, Number(decimals));

      return {
        price,
        timestamp: Number(updatedAt) * 1000, // Convert to milliseconds
        roundId: String(roundId),
        decimals: Number(decimals),
        description: String(description ?? ""),
      };
    } catch (error) {
      console.error(
        `Error reading from Chainlink contract ${contractAddress}:`,
        error
      );
      return null;
    }
  }

  async getCowUsdPriceViaQuote(): Promise<PriceData | null> {
    try {
      // Get ETH/USD price from Chainlink
      const ethPriceData = await this.getPriceFromContract(PRICE_FEEDS.ETH_USD);
      if (!ethPriceData) throw new Error("ETH/USD price unavailable");
      // Use 1 WETH (1e18 wei)
      const sellAmount = (1e18).toString();
      // Use a default testnet wallet (can be any valid address)
      const userWallet =
        process.env.NEXT_PUBLIC_TEST_USER_WALLET ||
        "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a";
      // Get quote for 1 WETH -> COW
      const quote = await mmAPI.getQuote({
        sellToken: TOKEN_ADDRESSES.WETH,
        buyToken: TOKEN_ADDRESSES.COW,
        sellAmount,
        userWallet,
      });
      const cowAmount = parseFloat(quote.buyAmount) / 1e18;
      const ethUsd = ethPriceData.price;
      // 1 COW = (1 ETH in USD) / (COW per ETH)
      const cowUsd = ethUsd / cowAmount;
      return {
        price: cowUsd,
        timestamp: Date.now(),
        roundId: quote.expiresAt || "cow-quote",
        decimals: 18,
        description: "COW / USD (via MM Quote)",
      };
    } catch (error) {
      console.error("Error fetching COW price via quote:", error);
      return null;
    }
  }

  async getBCSPXUsdPriceViaCowQuote(): Promise<PriceData | null> {
    try {
      // Use your working curl example parameters to get bCSPX price
      const response = await fetch('https://api.cow.fi/avalanche/api/v1/quote', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          "from": "0x0000000000000000000000000000000000000000",
          "sellToken": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC on Avalanche
          "buyToken": "0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59", // bCSPX on Avalanche
          "receiver": "0x0000000000000000000000000000000000000000",
          "validFor": 1800,
          "appData": '{"appCode":"CoW Swap","environment":"production","metadata":{"orderClass":{"orderClass":"market"},"quote":{"slippageBips":51,"smartSlippage":true}},"version":"1.4.0"}',
          "appDataHash": "0xece31e9c84314882f8f18d9975ef6811abccee6df8dede1a16b42504aac94107",
          "priceQuality": "optimal",
          "signingScheme": "eip712",
          "kind": "sell",
          "sellAmountBeforeFee": "12000000" // 12 USDC (6 decimals)
        })
      });

      if (!response.ok) {
        throw new Error(`CoW API error: ${response.status}`);
      }

      const data = await response.json();
      const quote = data.quote;

      if (!quote) {
        throw new Error("No quote returned from CoW API");
      }

      // Calculate bCSPX price in USD
      // sellAmount is 12 USDC (6 decimals) = 12,000,000 wei
      // buyAmount is bCSPX tokens (18 decimals)
      const usdcAmount = parseFloat(quote.sellAmount) / 1e6; // Convert from USDC wei to USDC
      const bcspxAmount = parseFloat(quote.buyAmount) / 1e18; // Convert from bCSPX wei to bCSPX tokens
      
      // 1 bCSPX = (USDC amount) / (bCSPX amount) USD
      const bcspxUsdPrice = usdcAmount / bcspxAmount;

      return {
        price: bcspxUsdPrice,
        timestamp: Date.now(),
        roundId: data.id?.toString() || "cow-bcspx-quote",
        decimals: 18,
        description: "bCSPX / USD (via CoW Avalanche)",
      };
    } catch (error) {
      console.error("Error fetching bCSPX price via CoW quote:", error);
      return null;
    }
  }

  async getPrice(symbol: string): Promise<PriceData | null> {
    const cacheKey = symbol;
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.cacheTime < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      let priceData: PriceData | null = null;

      switch (symbol) {
        case "BTC":
          priceData = await this.getPriceFromContract(PRICE_FEEDS.BTC_USD);
          break;
        case "ETH":
          priceData = await this.getPriceFromContract(PRICE_FEEDS.ETH_USD);
          break;
        case "COW":
          priceData = await this.getCowUsdPriceViaQuote();
          break;
        case "bCSPX":
          priceData = await this.getBCSPXUsdPriceViaCowQuote();
          break;
        default:
          console.warn(`Price feed not available for ${symbol}`);
          return null;
      }

      if (priceData) {
        this.priceCache.set(cacheKey, {
          data: priceData,
          cacheTime: Date.now(),
        });
      }

      return priceData;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  async getAllPrices(): Promise<Record<string, PriceData | null>> {
    const [btcData, bcspxData] = await Promise.all([
      this.getPrice("BTC"),
      this.getPrice("bCSPX"),
    ]);

    return {
      BTC: btcData,
      bCSPX: bcspxData,
    };
  }

  // Method to get price staleness (how old the data is)
  getPriceStaleness(priceData: PriceData): number {
    return Date.now() - priceData.timestamp;
  }

  // Check if price data is stale (older than 1 hour)
  isPriceStale(priceData: PriceData): boolean {
    return this.getPriceStaleness(priceData) > 3600000; // 1 hour
  }

  // Subscribe to real-time updates
  subscribeToRealTimeUpdates(
    callback: (prices: Record<string, PriceData | null>) => void
  ): () => void {
    const interval = setInterval(async () => {
      const prices = await this.getAllPrices();
      callback(prices);
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }

  // Get network status
  async getNetworkStatus(): Promise<{ blockNumber: number; gasPrice: string }> {
    try {
      const [blockNumber, gasPrice] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getFeeData(),
      ]);

      return {
        blockNumber,
        gasPrice: ethers.formatUnits(gasPrice.gasPrice || 0, "gwei"),
      };
    } catch (error) {
      console.error("Error getting network status:", error);
      return { blockNumber: 0, gasPrice: "0" };
    }
  }
}

export const chainlinkService = ChainlinkPriceService.getInstance();
