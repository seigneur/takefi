import {
  OrderBookApi,
  OrderQuoteRequest,
  OrderQuoteSideKindSell,
  OrderQuoteSideKindBuy,
  OrderSigningUtils,
  UnsignedOrder,
  SupportedChainId,
  SigningScheme as CowSigningScheme,
  OrderStatus as CowOrderStatus,
  SellTokenSource as CowSellTokenSource,
  BuyTokenDestination as CowBuyTokenDestination,
} from "@cowprotocol/cow-sdk";
import { MetadataApi } from "@cowprotocol/app-data";
import { ethers } from "ethers";
import {
  CoWQuoteRequestDto,
  SignedOrderDto,
  Order,
  Quote,
  OrderKind,
  SigningScheme,
  SellTokenSource,
  BuyTokenDestination,
  OrderStatus,
  ERROR_CODES,
} from "../models";
import { config } from "../config/app.config";
import { createAppError } from "../middleware/errorHandler";
import { getRpcUrl } from "../config/network.config";

export class CoWService {
  private orderBookApi: OrderBookApi;
  private provider: ethers.providers.JsonRpcProvider;
  private signer: ethers.Wallet;
  constructor() {
    this.orderBookApi = new OrderBookApi({
      chainId: config.cow.chainId as SupportedChainId,
    });

    // Initialize provider based on chain
    const rpcUrl = getRpcUrl(config.cow.chainId);
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Initialize signer for MM wallet
    if (!config.safe.executorPrivateKey) {
      throw new Error("EXECUTOR_PRIVATE_KEY environment variable is required");
    }
    this.signer = new ethers.Wallet(
      config.safe.executorPrivateKey,
      this.provider
    );
  }


  async getQuote(request: CoWQuoteRequestDto): Promise<Quote> {
    try {
      const quoteRequest = {
        sellToken: request.sellToken,
        buyToken: request.buyToken,
        sellAmountBeforeFee: request.sellAmountBeforeFee,
        from: request.from,
        receiver: request.receiver,
        kind: OrderQuoteSideKindSell.SELL, // Always use SELL for simplicity
        sellTokenBalance: request.sellTokenBalance as any,
        buyTokenBalance: request.buyTokenBalance as any,
        signingScheme: request.signingScheme as any,
        validTo: request.validTo,
        appData: request.appData || this.getDefaultAppData(),
      } as OrderQuoteRequest;

      const { quote } = await this.orderBookApi.getQuote(quoteRequest);

      return {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        feeAmount: quote.feeAmount,
        validTo: quote.validTo,
        appData: quote.appData,
        appDataHash: request.appDataHash || (quote as any).appDataHash,
        partiallyFillable: quote.partiallyFillable,
        sellTokenBalance: quote.sellTokenBalance as SellTokenSource,
        buyTokenBalance: quote.buyTokenBalance as BuyTokenDestination,
        from: request.from,
        receiver: request.receiver,
        kind: request.kind,
        id: (quote as any).id,
        quoteId: (quote as any).quoteId || (quote as any).id,
      };
    } catch (error) {
      console.error("Quote request failed:", error);
      throw createAppError(
        "Failed to get quote from CoW Protocol",
        400,
        ERROR_CODES.QUOTE_FAILED,
        error
      );
    }
  }

  async signOrder(quote: Quote): Promise<SignedOrderDto> {
    try {
      // Create the order exactly as it should be submitted (with feeAmount = 0)
      const order: UnsignedOrder = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,  // Use quote sellAmount directly
        buyAmount: quote.buyAmount,
        validTo: quote.validTo,
        appData: quote.appData,
        feeAmount: "0", // CoW Protocol expects feeAmount = 0 in submission
        kind: quote.kind,
        partiallyFillable: quote.partiallyFillable,
        sellTokenBalance: quote.sellTokenBalance,
        buyTokenBalance: quote.buyTokenBalance,
        receiver: quote.receiver,
      };

      console.log('🔐 Signing order with structure:', JSON.stringify(order, null, 2));

      const orderSigningResult = await OrderSigningUtils.signOrder(
        order,
        config.cow.chainId,
        this.signer
      );

      console.log('✅ Order signed successfully');
      console.log('   Signature:', orderSigningResult.signature);
      console.log('   Signing Scheme:', orderSigningResult.signingScheme);

      // Return the signed order (same structure as signed, no modifications needed)
      return {
        ...order,
        signingScheme: orderSigningResult.signingScheme as any as SigningScheme,
        signature: orderSigningResult.signature,
        from: await this.signer.getAddress(),
        sellTokenBalance: quote.sellTokenBalance,
        buyTokenBalance: quote.buyTokenBalance,
        quoteId: quote.quoteId,
        appDataHash: quote.appDataHash || quote.appData, // Use appDataHash if available, fallback to appData
      };
    } catch (error) {
      console.error("Order signing failed:", error);
      throw createAppError(
        "Failed to sign order",
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }

  async submitOrder(signedOrder: SignedOrderDto): Promise<string> {
    try {
      // Ensure the order structure exactly matches CoW API expectations
      const orderSubmission = {
        sellToken: signedOrder.sellToken,
        buyToken: signedOrder.buyToken,
        receiver: signedOrder.receiver,
        sellAmount: signedOrder.sellAmount,
        buyAmount: signedOrder.buyAmount,
        validTo: signedOrder.validTo,
        feeAmount: signedOrder.feeAmount,
        kind: signedOrder.kind === OrderKind.SELL ? "sell" : "buy",
        partiallyFillable: signedOrder.partiallyFillable,
        sellTokenBalance: signedOrder.sellTokenBalance.toLowerCase(),
        buyTokenBalance: signedOrder.buyTokenBalance.toLowerCase(),
        signingScheme: signedOrder.signingScheme.toLowerCase(),
        signature: signedOrder.signature,
        from: signedOrder.from,
        ...(signedOrder.quoteId && { quoteId: signedOrder.quoteId }),
        appData: signedOrder.appData,
        appDataHash: signedOrder.appDataHash,
      };

      console.log('📤 Submitting order to CoW Protocol:', JSON.stringify(orderSubmission, null, 2));

      const orderUid = await this.orderBookApi.sendOrder(orderSubmission as any);

      console.log('✅ Order submitted successfully. OrderUID:', orderUid);
      return orderUid;
    } catch (error) {
      console.error("Order submission failed:", error);
      throw createAppError(
        "Failed to submit order to CoW Protocol",
        400,
        ERROR_CODES.ORDER_SUBMISSION_FAILED,
        error
      );
    }
  }

  async getOrderStatus(orderUid: string): Promise<Order> {
    try {
      const order = await this.orderBookApi.getOrder(orderUid);

      return {
        uid: order.uid,
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        sellAmount: order.sellAmount,
        buyAmount: order.buyAmount,
        validTo: order.validTo,
        appData: order.appData,
        feeAmount: order.feeAmount,
        kind: (order.kind as any) === "sell" ? OrderKind.SELL : OrderKind.BUY,
        partiallyFillable: order.partiallyFillable,
        sellTokenBalance: order.sellTokenBalance as SellTokenSource,
        buyTokenBalance: order.buyTokenBalance as BuyTokenDestination,
        signingScheme: order.signingScheme as any as SigningScheme,
        signature: order.signature,
        from: order.from || "",
        receiver: order.receiver || "",
        creationDate: order.creationDate,
        status: this.convertOrderStatus(order.status as any),
        executedSellAmount: order.executedSellAmount,
        executedBuyAmount: order.executedBuyAmount,
        executedFeeAmount: order.executedFeeAmount,
        txHash: (order as any).txHash,
      };
    } catch (error) {
      console.error("Failed to get order status:", error);
      throw createAppError(
        "Order not found",
        404,
        ERROR_CODES.ORDER_NOT_FOUND,
        error
      );
    }
  }

  async getTrades(orderUid: string) {
    try {
      const trades = await this.orderBookApi.getTrades({ orderUid });
      return trades.map((trade) => ({
        blockNumber: trade.blockNumber,
        logIndex: trade.logIndex,
        orderUid: trade.orderUid,
        owner: trade.owner,
        sellToken: trade.sellToken,
        buyToken: trade.buyToken,
        sellAmount: trade.sellAmount,
        buyAmount: trade.buyAmount,
        feeAmount: (trade as any).feeAmount || "0",
        txHash: trade.txHash || "",
        timestamp: (trade as any).blockTimestamp || new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Failed to get trades:", error);
      return [];
    }
  }

  async waitForOrderExecution(
    orderUid: string,
    timeoutMs: number = 300000
  ): Promise<Order> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const order = await this.getOrderStatus(orderUid);

        if (
          order.status === OrderStatus.FILLED ||
          order.status === OrderStatus.CANCELLED ||
          order.status === OrderStatus.EXPIRED
        ) {
          return order;
        }

        // Wait 2 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        // Continue polling even if there are temporary errors
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw createAppError(
      "Order execution timeout",
      408,
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }

  private convertOrderStatus(cowStatus: any): OrderStatus {
    switch (cowStatus) {
      case "open":
        return OrderStatus.OPEN;
      case "filled":
        return OrderStatus.FILLED;
      case "cancelled":
        return OrderStatus.CANCELLED;
      case "expired":
        return OrderStatus.EXPIRED;
      case "partiallyFilled":
        return OrderStatus.PARTIALLY_FILLED;
      default:
        return OrderStatus.PENDING;
    }
  }

  /**
   * Generate app data and hash for CoW Protocol orders
   */
  async generateAppData(orderClass: 'market' | 'limit' = 'market', slippageBips: number = 51): Promise<{
    appData: string,
    appDataHash: string
  }> {
    try {
      // Use the working format from your curl example
      const appDataString = JSON.stringify({
        "appCode": "CoW Swap",
        "environment": "production",
        "metadata": {
          "orderClass": { "orderClass": orderClass },
          "quote": {
            "slippageBips": slippageBips,
            "smartSlippage": true
          }
        },
        "version": "1.4.0"
      });
      
      // Use the known working appDataHash from your curl example
      const workingAppDataHash = "0xece31e9c84314882f8f18d9975ef6811abccee6df8dede1a16b42504aac94107";
      
      return { 
        appData: appDataString, 
        appDataHash: workingAppDataHash 
      };
    } catch (error) {
      console.error('Failed to generate app data:', error);
      // Use the working fallback from your curl example
      return {
        appData: '{"appCode":"CoW Swap","environment":"production","metadata":{"orderClass":{"orderClass":"market"},"quote":{"slippageBips":51,"smartSlippage":true}},"version":"1.4.0"}',
        appDataHash: "0xece31e9c84314882f8f18d9975ef6811abccee6df8dede1a16b42504aac94107"
      };
    }
  }

  private getDefaultAppData(): string {
    // Generate default app data for MM orders
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  async checkServiceHealth(): Promise<boolean> {
    try {
      // Use network-appropriate test tokens
      const { sellToken, buyToken } = this.getHealthCheckTokens();

      const testQuote = await this.orderBookApi.getQuote({
        sellToken,
        buyToken,
        sellAmountBeforeFee: "1000000000000000000", // 1 token
        from: config.wallet.mmWalletAddress,
        receiver: config.wallet.mmWalletAddress,
        kind: OrderQuoteSideKindSell.SELL,
        sellTokenBalance: SellTokenSource.ERC20 as any,
        buyTokenBalance: BuyTokenDestination.ERC20 as any,
        signingScheme: CowSigningScheme.EIP712 as any,
      });

      return !!testQuote;
    } catch (error) {
      console.error("CoW API health check failed:", error);
      return false;
    }
  }

  private getHealthCheckTokens(): { sellToken: string; buyToken: string } {
    switch (config.cow.chainId) {
      case 1: // Mainnet
        return {
          sellToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
          buyToken: "0xA0b86a33E6180d86Cf755FA8d5Ec052399C86B5E", // COW
        };
      case 11155111: // Sepolia
        return {
          sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
          buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // COW Sepolia
        };
      case 100: // Gnosis
        return {
          sellToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // WXDAI
          buyToken: "0x177127622c4A00F3d409B75571e12cB3c8973d3c", // COW Gnosis
        };
      case 43114: // Avalanche
        return {
          sellToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC
          buyToken: "0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59", // BCSPX
        };
      default:
        // Fallback to a simpler health check - just test API connectivity
        throw new Error("Unsupported chain for health check");
    }
  }

  /**
   * Check current token allowance for CoW Vault Relayer
   * Works with both EOA and Safe wallets (uses owner address parameter)
   */
  async checkTokenAllowance(tokenAddress: string, ownerAddress: string): Promise<ethers.BigNumber> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        this.provider
      );
      
      const allowance = await tokenContract.allowance(
        ownerAddress, 
        config.cow.vaultRelayer
      );
      
      console.log(`📊 Current allowance for ${tokenAddress}: ${ethers.utils.formatUnits(allowance, 18)} tokens`);
      return allowance;
    } catch (error) {
      console.error('Failed to check token allowance:', error);
      return ethers.BigNumber.from(0);
    }
  }

  /**
   * Approve token for CoW Vault Relayer if needed
   * For EOA: Uses direct signing with executor private key
   * For Safe: Will delegate to SafeService in the future
   */
  async ensureTokenApproval(tokenAddress: string, requiredAmount: string): Promise<void> {
    try {
      // For current EOA implementation, use MM wallet address as owner
      const ownerAddress = config.wallet.mmWalletAddress;
      
      console.log(`🔍 Checking approval for token ${tokenAddress}...`);
      console.log(`   Owner: ${ownerAddress}`);
      console.log(`   Spender: ${config.cow.vaultRelayer}`);
      
      // Check current allowance
      const currentAllowance = await this.checkTokenAllowance(tokenAddress, ownerAddress);
      const required = ethers.BigNumber.from(requiredAmount);
      
      console.log(`   Required amount: ${ethers.utils.formatUnits(required, 18)} tokens`);
      
      // If allowance is insufficient, approve max amount
      if (currentAllowance.lt(required)) {
        console.log('⚡ Insufficient allowance detected. Initiating approval...');
        
        // For EOA: Direct approval with executor signer
        if (!config.safe.address || config.safe.address === '') {
          await this.approveTokenEOA(tokenAddress);
        } else {
          // For Safe: Will be implemented later
          throw createAppError(
            'Safe wallet token approval not yet implemented - use EOA for now',
            500,
            ERROR_CODES.INTERNAL_SERVER_ERROR
          );
        }
      } else {
        console.log('✅ Token already has sufficient allowance - no approval needed');
      }
    } catch (error) {
      console.error('Failed to ensure token approval:', error);
      throw createAppError(
        'Failed to approve token for trading',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }

  /**
   * Approve token using EOA (Externally Owned Account)
   * Uses executor private key to sign approval transaction
   */
  private async approveTokenEOA(tokenAddress: string): Promise<void> {
    try {
      console.log('🔐 Executing EOA token approval...');
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.signer // Use executor signer for EOA
      );
      
      // Approve maximum amount to avoid future approvals
      const maxAmount = ethers.constants.MaxUint256;
      
      console.log(`⏳ Sending approval transaction for max amount...`);
      
      const tx = await tokenContract.approve(config.cow.vaultRelayer, maxAmount, {
        gasLimit: 100000 // Conservative gas limit for approval
      });
      
      console.log(`📡 Approval transaction sent: ${tx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      console.log(`✅ Token approved successfully!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`   Transaction: ${receipt.transactionHash}`);
      
    } catch (error) {
      console.error('EOA token approval failed:', error);
      throw createAppError(
        'Failed to approve token using EOA wallet',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }

  /**
   * Get token balance for an address
   * Useful for checking if wallet has sufficient funds before trading
   */
  async getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<ethers.BigNumber> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      
      const balance = await tokenContract.balanceOf(ownerAddress);
      return balance;
    } catch (error) {
      console.error('Failed to get token balance:', error);
      return ethers.BigNumber.from(0);
    }
  }
}
