const axios = require("axios");

/**
 * Public Bitcoin RPC client using Blockstream API
 */
class PublicBitcoinRPCClient {
  constructor(options = {}) {
    this.network = options.network || "testnet";
    this.baseURL =
      this.network === "testnet"
        ? "https://blockstream.info/testnet/api"
        : "https://blockstream.info/api";
  }

  /**
   * Test connection to public API
   */
  async testConnection() {
    try {
      console.log(`Testing connection to ${this.baseURL}`);
      const response = await axios.get(`${this.baseURL}/blocks/tip/height`);
      console.log(
        `✅ Connected to Blockstream API. Current block height: ${response.data}`
      );
      return true;
    } catch (error) {
      console.error("❌ Failed to connect to Blockstream API:", error.message);
      return false;
    }
  }

  /**
   * Get blockchain info
   */
  async getBlockchainInfo() {
    try {
      const height = await axios.get(`${this.baseURL}/blocks/tip/height`);
      const hash = await axios.get(`${this.baseURL}/blocks/tip/hash`);

      return {
        chain: this.network,
        blocks: height.data,
        bestblockhash: hash.data,
        difficulty: 1,
        verificationprogress: 1, // Always synced with public API
        initialblockdownload: false,
      };
    } catch (error) {
      console.error("Error getting blockchain info:", error.message);
      throw error;
    }
  }

  /**
   * Get address balance
   */
  async getAddressBalance(address) {
    try {
      const response = await axios.get(`${this.baseURL}/address/${address}`);
      const balanceSats =
        response.data.chain_stats.funded_txo_sum -
        response.data.chain_stats.spent_txo_sum;
      return balanceSats / 100000000; // Convert to BTC
    } catch (error) {
      console.error("Error getting address balance:", error.message);
      return 0;
    }
  }

  /**
   * Get address transactions
   */
  async getAddressTransactions(address) {
    try {
      const response = await axios.get(
        `${this.baseURL}/address/${address}/txs`
      );
      return response.data;
    } catch (error) {
      console.error("Error getting address transactions:", error.message);
      return [];
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txid) {
    try {
      const response = await axios.get(`${this.baseURL}/tx/${txid}`);
      return response.data;
    } catch (error) {
      console.error("Error getting transaction:", error.message);
      throw error;
    }
  }

  /**
   * Send raw transaction
   */
  async sendRawTransaction(rawTx) {
    try {
      const response = await axios.post(`${this.baseURL}/tx`, rawTx, {
        headers: { "Content-Type": "text/plain" },
      });
      return response.data;
    } catch (error) {
      console.error("Error sending transaction:", error.message);
      throw error;
    }
  }

  /**
   * Get fee estimates
   */
  async getFeeEstimates() {
    try {
      const response = await axios.get(`${this.baseURL}/fee-estimates`);
      return response.data;
    } catch (error) {
      console.error("Error getting fee estimates:", error.message);
      return { 6: 1 }; // Fallback
    }
  }

  /**
   * Check if address has received funds
   */
  async hasReceivedFunds(address, minAmount = 0) {
    try {
      const balance = await this.getAddressBalance(address);
      console.log(`Address ${address} balance: ${balance} BTC`);
      return balance >= minAmount;
    } catch (error) {
      console.error("Error checking funds:", error.message);
      return false;
    }
  }

  /**
   * Monitor address for incoming transactions
   */
  async waitForTransaction(address, expectedAmount, timeoutSeconds = 300) {
    console.log(
      `⏳ Monitoring address ${address} for incoming transactions...`
    );
    const startTime = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeout) {
      try {
        const hasFunds = await this.hasReceivedFunds(address, expectedAmount);
        if (hasFunds) {
          console.log(`✅ Funds received at address ${address}!`);
          return true;
        }

        // Wait 30 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 30000));
      } catch (error) {
        console.error("Error monitoring address:", error.message);
      }
    }

    console.log(`⏰ Timeout waiting for funds at address ${address}`);
    return false;
  }

  /**
   * Get UTXO for address
   */
  async getUTXOs(address) {
    try {
      const response = await axios.get(
        `${this.baseURL}/address/${address}/utxo`
      );
      return response.data;
    } catch (error) {
      console.error("Error getting UTXOs:", error.message);
      return [];
    }
  }

  // Stub methods for compatibility with local RPC
  async isWalletLoaded() {
    return false;
  }
  async createWallet() {
    throw new Error("Wallet operations not supported with public API");
  }
  async getWalletBalance() {
    throw new Error("Use getAddressBalance instead");
  }
  async fundWallet() {
    throw new Error("Use testnet faucets for funding");
  }
  async sendToAddress() {
    throw new Error("Use wallet software or manual transaction creation");
  }
  async generateBlocks() {
    throw new Error("Cannot generate blocks on public testnet");
  }
  async importAddress() {
    return true;
  } // No-op for public API
}

module.exports = PublicBitcoinRPCClient;
