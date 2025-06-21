import { ethers } from "ethers";
import { config } from "../config/app.config";
import { createAppError, AppError } from "../middleware/errorHandler";
import { ERROR_CODES, SafeTransaction, SigningScheme } from "../models";

export class SafeService {
  private provider: ethers.providers.JsonRpcProvider;
  private executorSigner: ethers.Wallet;
  private settlementContract: ethers.Contract;

  constructor() {
    // Initialize provider
    const rpcUrl = this.getRpcUrl(config.cow.chainId);
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Initialize executor signer
    if (!config.safe.executorPrivateKey) {
      throw new Error("EXECUTOR_PRIVATE_KEY environment variable is required");
    }
    this.executorSigner = new ethers.Wallet(
      config.safe.executorPrivateKey,
      this.provider
    );

    // Initialize settlement contract for pre-signature operations
    this.settlementContract = new ethers.Contract(
      config.cow.settlementContract,
      [
        "function setPreSignature(bytes calldata orderUid, bool signed) external",
        "function preSignature(bytes calldata orderUid) external view returns (uint256)",
      ],
      this.executorSigner
    );
  }

  private getRpcUrl(chainId: number): string {
    switch (chainId) {
      case 1:
        return process.env.ETHEREUM_RPC_URL || "https://cloudflare-eth.com";
      case 100:
        return process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
      case 11155111:
        return (
          process.env.SEPOLIA_RPC_URL ||
          "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
        );
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }

  async setPreSignature(
    orderUid: string,
    signed: boolean = true
  ): Promise<string> {
    try {
      console.log(`Setting pre-signature for order ${orderUid} to ${signed}`);

      const tx = await this.settlementContract.setPreSignature(
        orderUid,
        signed,
        {
          gasLimit: 100000, // Conservative gas limit
        }
      );

      await tx.wait();
      console.log(`Pre-signature set successfully. TX: ${tx.hash}`);

      return tx.hash;
    } catch (error) {
      console.error("Failed to set pre-signature:", error);
      throw createAppError(
        "Failed to set pre-signature on settlement contract",
        500,
        ERROR_CODES.PRESIGN_FAILED,
        error
      );
    }
  }

  async checkPreSignature(orderUid: string): Promise<boolean> {
    try {
      const preSignature = await this.settlementContract.preSignature(orderUid);
      return !preSignature.isZero();
    } catch (error) {
      console.error("Failed to check pre-signature:", error);
      return false;
    }
  }

  async createPreSignedOrder(orderData: any): Promise<string> {
    try {
      console.log("Creating pre-signed order for Safe wallet");

      // The orderData should contain the orderUid returned from CoW API submission
      if (!orderData.orderUid) {
        throw new Error("OrderUID is required for pre-signed order creation");
      }

      // Set the pre-signature on settlement contract
      const txHash = await this.setPreSignature(orderData.orderUid, true);

      console.log(
        `Pre-signature set for order ${orderData.orderUid}. TX: ${txHash}`
      );
      return txHash;
    } catch (error) {
      console.error("Failed to create pre-signed order:", error);
      throw createAppError(
        "Failed to create pre-signed order",
        500,
        ERROR_CODES.SAFE_TRANSACTION_FAILED,
        error
      );
    }
  }

  async cancelPreSignedOrder(orderUid: string): Promise<string> {
    try {
      const txHash = await this.setPreSignature(orderUid, false);
      console.log(`Pre-signed order ${orderUid} cancelled. TX: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error("Failed to cancel pre-signed order:", error);
      throw createAppError(
        "Failed to cancel pre-signed order",
        500,
        ERROR_CODES.SAFE_TRANSACTION_FAILED,
        error
      );
    }
  }

  async getBalance(tokenAddress: string): Promise<string> {
    try {
      if (tokenAddress === ethers.constants.AddressZero) {
        // ETH balance
        const balance = await this.provider.getBalance(config.safe.address);
        return balance.toString();
      } else {
        // ERC20 balance
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ["function balanceOf(address) view returns (uint256)"],
          this.provider
        );
        const balance = await tokenContract.balanceOf(config.safe.address);
        return balance.toString();
      }
    } catch (error) {
      console.error("Failed to get balance:", error);
      throw createAppError(
        "Failed to get wallet balance",
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }

  async checkAllowance(
    tokenAddress: string,
    spenderAddress: string
  ): Promise<string> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
        ],
        this.provider
      );

      const allowance = await tokenContract.allowance(
        config.safe.address,
        spenderAddress
      );
      return allowance.toString();
    } catch (error) {
      console.error("Failed to check allowance:", error);
      throw createAppError(
        "Failed to check token allowance",
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        error
      );
    }
  }

  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: string
  ): Promise<string> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.executorSigner
      );

      const tx = await tokenContract.approve(spenderAddress, amount, {
        gasLimit: 100000,
      });

      await tx.wait();
      console.log(`Token approval successful. TX: ${tx.hash}`);

      return tx.hash;
    } catch (error) {
      console.error("Failed to approve token:", error);
      throw createAppError(
        "Failed to approve token",
        500,
        ERROR_CODES.SAFE_TRANSACTION_FAILED,
        error
      );
    }
  }

  async checkServiceHealth(): Promise<boolean> {
    try {
      // If no Safe address configured, test with executor address instead
      const addressToTest = config.safe.address || this.executorSigner.address;
      const balance = await this.provider.getBalance(addressToTest);
      return balance.gte(0);
    } catch (error) {
      console.error("Safe service health check failed:", error);
      return false;
    }
  }

  getSafeAddress(): string {
    return config.safe.address;
  }

  getExecutorAddress(): string {
    return this.executorSigner.address;
  }
}
