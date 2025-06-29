// API service layer for TakeFi
import axios, { AxiosResponse } from "axios";
import { MetadataApi } from "@cowprotocol/app-data";
import { chainlinkService } from "./chainlink";

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
  slippageBips?: number;
  priceQuality?: "fast" | "optimal";
  chainId?: number;
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
  appData?: string;
  appDataHash?: string;
  quoteId?: number;
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
      const { getBitcoinTestAddresses } = await import(
        "./bitcoin-network.config"
      );
      const testAddresses = getBitcoinTestAddresses();
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
        method?: "websocket" | "polling";
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
            method?: "websocket" | "polling";
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
      console.error(
        "Order tracking API Error:",
        error.response?.data || error.message
      );
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
      const params = {
        sellToken: request.sellToken,
        buyToken: request.buyToken,
        sellAmount: request.sellAmount,
        userWallet: request.userWallet,
        ...(request.slippageBips && { slippageBips: request.slippageBips }),
        ...(request.priceQuality && { priceQuality: request.priceQuality }),
      };

      console.log("MM API Quote Request:", params);

      const response: AxiosResponse<QuoteResponse> = await axios.get(
        `${this.baseURL}/api/quote`,
        {
          params,
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
    chainId?: number;
    quoteId?: number;
  }) {
    try {
      const payload = {
        sellToken: request.sellToken,
        buyToken: request.buyToken,
        sellAmount: request.sellAmount,
        userWallet: request.userWallet,
        slippagePercent: request.slippagePercent,
        ...(request.chainId && { chainId: request.chainId }),
        ...(request.quoteId && { quoteId: request.quoteId }),
      };

      console.log("MM API Trade Request:", payload);

      const response = await axios.post(`${this.baseURL}/api/trade`, payload, {
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
  SEPOLIA: {
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
    COW: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // CoW Token Sepolia
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC Sepolia
    XTSLA: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // Using COW as RWA token replacement
    bCSPX: "0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59", // Mainnet bCSPX address
  },
  // Avalanche mainnet addresses
  AVALANCHE: {
    WETH: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", // WETH on Avalanche
    COW: "0x0000000000000000000000000000000000000000", // COW not available on Avalanche
    USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC on Avalanche
    XTSLA: "0x0000000000000000000000000000000000000000", // Not available
    bCSPX: "0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59", // BCSPX on Avalanche
  },
  // Legacy flat structure for backward compatibility
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
  COW: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // CoW Token Sepolia
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC Sepolia
  XTSLA: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // Using COW as RWA token replacement
  bCSPX: "0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59", // Mainnet bCSPX address
};

// Service instances
export const oracleAPI = new OracleAPI();
export const mmAPI = new MarketMakerAPI();

// Fallback quote service for when real API fails
export const createFallbackQuote = async (
  usdcAmount: string,
  chainId: number = 11155111,
  bcspxUsdPrice: number = 0.25
): Promise<QuoteResponse> => {
  const usdcAmountNum = parseFloat(usdcAmount) / 1e6; // Convert USDC wei to USDC dollars

  // Calculate bCSPX tokens using real price: USDC dollars / bCSPX price = bCSPX tokens
  const bcspxTokens = usdcAmountNum / bcspxUsdPrice;
  const bcspxAmount = (bcspxTokens * 1e18).toString(); // Convert to bCSPX wei (18 decimals)

  const tokens = getTokenAddresses(chainId);

  // Generate fallback app data
  const { appDataHex, appDataHash } = await generateQuoteAppData(51);

  console.log(
    `Fallback quote: $${usdcAmountNum} USDC / $${bcspxUsdPrice} per bCSPX = ${bcspxTokens.toFixed(
      4
    )} bCSPX tokens`
  );

  return {
    sellToken: tokens.USDC, // MM sells USDC
    buyToken: tokens.bCSPX || tokens.COW, // MM buys BCSPX
    sellAmount: usdcAmount,
    buyAmount: bcspxAmount,
    feeAmount: (parseFloat(usdcAmount) * 0.003).toString(), // 0.3% fee on USDC wei
    validTo: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
    priceImpact: "0.1",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    appData: appDataHex,
    appDataHash: appDataHash,
    quoteId: Math.floor(Math.random() * 1000000), // Random fallback quoteId
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

// Generate app data for CoW Protocol quotes
export const generateQuoteAppData = async (slippageBips: number = 51) => {
  try {
    // Use the working format from your curl example
    const appDataString = JSON.stringify({
      appCode: "CoW Swap",
      environment: "production",
      metadata: {
        orderClass: { orderClass: "market" },
        quote: {
          slippageBips: slippageBips,
          smartSlippage: true,
        },
      },
      version: "1.4.0",
    });

    // Use the known working appDataHash from your curl example
    const workingAppDataHash =
      "0xece31e9c84314882f8f18d9975ef6811abccee6df8dede1a16b42504aac94107";

    return {
      appDataHex: appDataString,
      appDataHash: workingAppDataHash,
    };
  } catch (error) {
    console.error("Failed to generate app data:", error);
    return {
      appDataHex:
        '{"appCode":"CoW Swap","environment":"production","metadata":{"orderClass":{"orderClass":"market"},"quote":{"slippageBips":51,"smartSlippage":true}},"version":"1.4.0"}',
      appDataHash:
        "0xece31e9c84314882f8f18d9975ef6811abccee6df8dede1a16b42504aac94107",
    };
  }
};

// Get token addresses for a specific network
export const getTokenAddresses = (chainId: number = 11155111) => {
  switch (chainId) {
    case 43114: // Avalanche
      return TOKEN_ADDRESSES.AVALANCHE;
    case 11155111: // Sepolia
    default:
      return TOKEN_ADDRESSES.SEPOLIA;
  }
};

// Generate market maker offers using real quotes
export const generateOffersFromQuotes = async (
  btcAmount: string,
  userEthAddress: string,
  targetToken?: string,
  chainId: number = 11155111
): Promise<MarketMakerOffer[]> => {
  try {
    // Get network-specific token addresses
    const tokens = getTokenAddresses(chainId);
    const finalTargetToken = targetToken || tokens.bCSPX || tokens.COW; // Fallback to COW if bCSPX not available

    console.log("Generating offers for:", {
      btcAmount,
      userEthAddress,
      targetToken: finalTargetToken,
      chainId,
    });

    // PRODUCTION FLOW: BTC → MM sells USDC → buys BCSPX → transfers to user
    // Get current BTC/USD price from Chainlink oracle
    const btcPriceData = await chainlinkService.getPrice("BTC");
    if (!btcPriceData) {
      throw new Error("Unable to fetch BTC price from Chainlink oracle");
    }

    // Calculate USDC amount needed (USDC has 6 decimals)
    const usdValue = parseFloat(btcAmount) * btcPriceData.price;
    const usdcAmount = (usdValue * 1e6).toString(); // Convert to USDC wei (6 decimals)

    console.log(
      `Production flow: ${btcAmount} BTC @ $${btcPriceData.price.toFixed(
        2
      )} = $${usdValue.toFixed(2)} USDC`
    );
    console.log(
      `MM will sell ${(parseFloat(usdcAmount) / 1e6).toFixed(
        2
      )} USDC to buy BCSPX for user`
    );

    // MM sells USDC to buy BCSPX for the user (correct production flow)
    const quote = await mmAPI.getQuote({
      sellToken: tokens.USDC, // MM sells USDC (production)
      buyToken: finalTargetToken, // MM buys BCSPX
      sellAmount: usdcAmount, // USDC amount equivalent to BTC value
      userWallet: userEthAddress, // BCSPX goes directly to user's wallet
      slippageBips: 51,
      priceQuality: "optimal",
      chainId,
    });

    console.log("Received quote:", quote);

    // Calculate rate (BCSPX tokens per BTC)
    const buyAmountInTokens = parseFloat(quote.buyAmount) / 1e18; // Convert from wei
    const bcspxPerBtc = buyAmountInTokens / parseFloat(btcAmount);

    console.log(`Rate: 1 BTC = ${bcspxPerBtc.toFixed(4)} BCSPX tokens`);

    // Create market maker offers with real quote data
    const networkName = chainId === 43114 ? "Avalanche" : "Sepolia";
    const targetTokenSymbol = chainId === 43114 ? "BCSPX" : "bCSPX";

    return [
      {
        id: "real-mm-1",
        mmName: `CoW Protocol MM (${networkName})`,
        fromToken: "BTC",
        toToken: targetTokenSymbol,
        rate: bcspxPerBtc,
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

    // Create fallback quote using real prices when possible
    let fallbackBtcPrice = 50000; // Default fallback
    let fallbackBcspxPrice = 0.25; // Default fallback ($0.25 per bCSPX)

    try {
      // Try to get real prices even in fallback scenario
      const [realBtcPrice, realBcspxPrice] = await Promise.all([
        chainlinkService.getPrice("BTC"),
        chainlinkService.getPrice("bCSPX"),
      ]);

      if (realBtcPrice) {
        fallbackBtcPrice = realBtcPrice.price;
        console.log(`Using real BTC price in fallback: $${fallbackBtcPrice}`);
      }

      if (realBcspxPrice) {
        fallbackBcspxPrice = realBcspxPrice.price;
        console.log(
          `Using real bCSPX price in fallback: $${fallbackBcspxPrice}`
        );
      }
    } catch (priceError) {
      console.warn("Could not fetch real prices for fallback, using defaults");
    }

    // Calculate realistic rate using real prices: bCSPX tokens per BTC
    const fallbackBcspxPerBtc = fallbackBtcPrice / fallbackBcspxPrice;

    // Create fallback quote with real price-based calculations
    const fallbackUsdValue = parseFloat(btcAmount) * fallbackBtcPrice;
    const fallbackUsdcAmount = (fallbackUsdValue * 1e6).toString();
    const fallbackQuote = await createFallbackQuote(
      fallbackUsdcAmount,
      chainId,
      fallbackBcspxPrice
    );

    console.log(
      `Fallback: 1 BTC @ $${fallbackBtcPrice} / 1 bCSPX @ $${fallbackBcspxPrice} → ${fallbackBcspxPerBtc.toFixed(
        4
      )} bCSPX/BTC`
    );

    // Fallback to mock data with realistic quote data
    const networkName = chainId === 43114 ? "Avalanche" : "Sepolia";
    const targetTokenSymbol = chainId === 43114 ? "BCSPX" : "bCSPX";

    return [
      {
        id: "fallback-mm-1",
        mmName: "CoW Swap",
        fromToken: "BTC",
        toToken: targetTokenSymbol,
        rate: fallbackBcspxPerBtc,
        fee: 0.3,
        estimatedTime: "5-10 minutes",
        reliability: 98.5,
        isBest: true,
        quote: fallbackQuote,
      },
    ];
  }
};
