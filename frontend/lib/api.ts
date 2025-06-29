// API service layer for TakeFi
import axios, { AxiosResponse } from "axios";

// API Configuration
const ORACLE_API_URL =
  process.env.NEXT_PUBLIC_ORACLE_API_URL || "http://localhost:3001";
const MM_SERVER_API_URL =
  process.env.NEXT_PUBLIC_MM_SERVER_API_URL || "http://localhost:3000";
const MM_API_KEY =
  process.env.NEXT_PUBLIC_MM_API_KEY || "takefi-mm-api-key-dev";

// Type definitions
export interface CreatePreimageRequest {
  userBtcAddress?: string; // Optional for now, will be generated
  mmPubkey: string;
  btcAmount: number; // in satoshis
  timelock?: number;
  userEthAddress: string; // User's Ethereum wallet for receiving tokens
}

export interface CreatePreimageResponse {
  success: boolean;
  data: {
    swapId: string;
    hash: string;
    htlcScript: string;
    htlcAddress: string; // Real Bitcoin address to fund
    expiresAt: string;
    timelock: number;
  };
}

export interface SwapDetailsResponse {
  success: boolean;
  data: {
    swapId: string;
    hash: string;
    userAddress: string;
    mmPubkey: string;
    btcAmount: number;
    timelock: number;
    htlcScript: string;
    htlcAddress: string;
    createdAt: string;
    expiresAt: string;
    status:
      | "active"
      | "btc_received"
      | "tokens_swapped"
      | "completed"
      | "expired";
    userEthAddress?: string;
    cowOrderUid?: string;
  };
}

export interface QuoteRequest {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  userWallet: string;
}

export interface QuoteResponse {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  validTo: number;
  priceImpact: string;
  expiresAt: string;
}

export interface MarketMakerOffer {
  id: string;
  mmName: string;
  fromToken: string;
  toToken: string;
  rate: number;
  fee: number;
  estimatedTime: string;
  reliability: number;
  isBest: boolean;
  quote?: QuoteResponse;
}

// Oracle Backend API Client
export class OracleAPI {
  private baseURL: string;

  constructor(baseURL: string = ORACLE_API_URL) {
    this.baseURL = baseURL;
  }

  async createPreimage(
    request: CreatePreimageRequest
  ): Promise<CreatePreimageResponse> {
    try {
      // Use a default MM public key for now - in production this would come from MM registration
      const mmPubkey =
        "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01";

      // TEMPORARY: Use test address from centralized config for testing
      const { getBitcoinTestAddresses } = await import('./bitcoin-network.config')
      const testAddresses = getBitcoinTestAddresses()
      const hardcodedBtcAddress = testAddresses.p2tr;

      const payload = {
        userBtcAddress: hardcodedBtcAddress, // Hardcoded for testing
        mmPubkey,
        btcAmount: request.btcAmount,
        timelock: request.timelock || 144,
        // Send as userEthWallet to match Oracle backend validation
        userEthWallet: request.userEthAddress,
      };

      console.log("Sending Oracle API request:", {
        ...payload,
        userBtcAddress:
          payload.userBtcAddress.slice(0, 8) +
          "..." +
          payload.userBtcAddress.slice(-8),
        userEthWallet:
          payload.userEthWallet.slice(0, 6) +
          "..." +
          payload.userEthWallet.slice(-4),
      });

      const response: AxiosResponse<CreatePreimageResponse> = await axios.post(
        `${this.baseURL}/api/oracle/create-preimage`,
        payload
      );

      return response.data;
    } catch (error: any) {
      console.error("Oracle API Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || "Failed to create preimage"
      );
    }
  }

  async getSwapDetails(swapId: string): Promise<SwapDetailsResponse> {
    try {
      const response: AxiosResponse<SwapDetailsResponse> = await axios.get(
        `${this.baseURL}/api/oracle/swap/${swapId}`
      );
      return response.data;
    } catch (error: any) {
      console.error("Oracle API Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || "Failed to get swap details"
      );
    }
  }

  async getOrderTracking(swapId: string): Promise<{
    success: boolean;
    data: {
      swapId: string;
      tracking: {
        isTracking: boolean;
        method?: 'websocket' | 'polling';
        startedAt?: string;
        lastChecked?: string;
        orderUid?: string;
      };
      currentStatus: string;
      cowOrderUid?: string;
      cowOrderStatus?: string;
      explorerUrl?: string;
      txHash?: string;
      executedAmounts: {
        sell?: string;
        buy?: string;
      };
      timestamps: {
        created: string;
        orderSubmitted?: string;
        completed?: string;
        failed?: string;
      };
    };
  }> {
    try {
      const response: AxiosResponse<{
        success: boolean;
        data: {
          swapId: string;
          tracking: {
            isTracking: boolean;
            method?: 'websocket' | 'polling';
            startedAt?: string;
            lastChecked?: string;
            orderUid?: string;
          };
          currentStatus: string;
          cowOrderUid?: string;
          cowOrderStatus?: string;
          explorerUrl?: string;
          txHash?: string;
          executedAmounts: {
            sell?: string;
            buy?: string;
          };
          timestamps: {
            created: string;
            orderSubmitted?: string;
            completed?: string;
            failed?: string;
          };
        };
      }> = await axios.get(
        `${this.baseURL}/api/oracle/order-tracking/${swapId}`
      );
      return response.data;
    } catch (error: any) {
      console.error("Order tracking API Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || "Failed to get order tracking"
      );
    }
  }
}

// Market Maker Server API Client
export class MarketMakerAPI {
  private baseURL: string;
  private apiKey: string;

  constructor(
    baseURL: string = MM_SERVER_API_URL,
    apiKey: string = MM_API_KEY
  ) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    try {
      const response: AxiosResponse<QuoteResponse> = await axios.get(
        `${this.baseURL}/api/quote`,
        {
          params: request,
          headers: this.getHeaders(),
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "MM Server API Error:",
        error.response?.data || error.message
      );
      throw new Error(error.response?.data?.error || "Failed to get quote");
    }
  }

  async executeTrade(request: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    userWallet: string;
    slippagePercent?: number;
  }) {
    try {
      const response = await axios.post(`${this.baseURL}/api/trade`, request, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "MM Server API Error:",
        error.response?.data || error.message
      );
      throw new Error(error.response?.data?.error || "Failed to execute trade");
    }
  }
}

// Token addresses for different networks
export const TOKEN_ADDRESSES = {
  // Sepolia testnet addresses with known liquidity
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
  COW: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // CoW Token Sepolia - NATIVE TOKEN, HAS LIQUIDITY
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC Sepolia
  // Use COW as the main token (native CoW Protocol token, guaranteed liquidity)
  XTSLA: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // Using COW as RWA token replacement
};

// Service instances
export const oracleAPI = new OracleAPI();
export const mmAPI = new MarketMakerAPI();

// Fallback quote service for when real API fails
export const createFallbackQuote = (
  sellAmount: string,
  userWallet: string
): QuoteResponse => {
  const sellAmountNum = parseFloat(sellAmount);
  const buyAmount = (sellAmountNum * 10000).toString(); // 1 WETH ≈ 10000 COW (demo rate)

  return {
    sellToken: TOKEN_ADDRESSES.WETH,
    buyToken: TOKEN_ADDRESSES.COW,
    sellAmount: sellAmount,
    buyAmount: buyAmount,
    feeAmount: (sellAmountNum * 0.003).toString(), // 0.3% fee
    validTo: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
    priceImpact: "0.1",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
};

// Helper function to convert BTC amount to satoshis
export const btcToSatoshis = (btc: number): number => {
  return Math.round(btc * 100000000);
};

// Helper function to convert satoshis to BTC
export const satoshisToBtc = (satoshis: number): number => {
  return satoshis / 100000000;
};

// Generate market maker offers using real quotes
export const generateOffersFromQuotes = async (
  btcAmount: string,
  userEthAddress: string,
  targetToken: string = TOKEN_ADDRESSES.COW
): Promise<MarketMakerOffer[]> => {
  try {
    console.log("Generating offers for:", {
      btcAmount,
      userEthAddress,
      targetToken,
    });

    // Convert BTC amount to equivalent WETH amount for quote (1:1 ratio for demo)
    const wethAmount = (parseFloat(btcAmount) * 1e18).toString(); // Convert to wei

    // Get quote from MM Server
    const quote = await mmAPI.getQuote({
      sellToken: TOKEN_ADDRESSES.WETH,
      buyToken: targetToken,
      sellAmount: wethAmount, // Use WETH amount in wei
      userWallet: userEthAddress,
    });

    console.log("Received quote:", quote);

    // Calculate rate (tokens per BTC)
    const buyAmountInTokens = parseFloat(quote.buyAmount) / 1e18; // Convert from wei
    const rate = buyAmountInTokens / parseFloat(btcAmount);

    // Create market maker offers with real quote data
    return [
      {
        id: "real-mm-1",
        mmName: "CoW Protocol MM",
        fromToken: "BTC",
        toToken: "COW",
        rate: rate,
        fee: 0.3,
        estimatedTime: "5-10 minutes",
        reliability: 98.5,
        isBest: true,
        quote: quote,
      },
    ];
  } catch (error: any) {
    console.error("Failed to generate real offers:", error);

    // Better error handling with more details
    const errorMessage = error.message || "Unknown error";
    console.log("Quote error details:", errorMessage);

    // Create fallback quote for better UX
    const wethAmount = (parseFloat(btcAmount) * 1e18).toString();
    const fallbackQuote = createFallbackQuote(wethAmount, userEthAddress);

    // Calculate rate from fallback quote
    const buyAmountInTokens = parseFloat(fallbackQuote.buyAmount) / 1e18;
    const rate = buyAmountInTokens / parseFloat(btcAmount);

    // Fallback to mock data with realistic quote data
    return [
      {
        id: "fallback-mm-1",
        mmName: `Demo MM (${
          errorMessage.includes("NoLiquidity") ? "No Liquidity" : "API Error"
        })`,
        fromToken: "BTC",
        toToken: "COW",
        rate: rate,
        fee: 0.3,
        estimatedTime: "5-10 minutes",
        reliability: 98.5,
        isBest: true,
        quote: fallbackQuote,
      },
    ];
  }
};
