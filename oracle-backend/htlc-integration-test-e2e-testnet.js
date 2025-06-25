const BitcoinWalletManager = require("./bitcoin-wallet-simple");
const PublicBitcoinRPCClient = require("./bitcoin-rpc-public");
const axios = require("axios");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");
const bitcoin = require("bitcoinjs-lib");

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const ORACLE_BASE_URL = "http://localhost:3001";

// Your private key for a funded wallet in WIF format
const USER_PRIVATE_KEY_WIF =
  "cSeXJqqNG1BLTwT69vx1JirYnntXxM8eV5dWyU8Sq37Kuj4E3r3y";

class HTLCIntegrationTestTestnet {
  constructor() {
    this.walletManager = new BitcoinWalletManager();
    this.rpcClient = new PublicBitcoinRPCClient({ network: "testnet" });
    this.network = bitcoin.networks.testnet;
  }

  /**
   * Create wallet from your private key
   */
  createWalletFromPrivateKey() {
    try {
      if (
        !USER_PRIVATE_KEY_WIF ||
        USER_PRIVATE_KEY_WIF === "cYourPrivateKeyInWIFFormatGoesHere"
      ) {
        throw new Error(
          "Please replace 'cYourPrivateKeyInWIFFormatGoesHere' with your actual private key in WIF format."
        );
      }
      // Create key pair from WIF
      const keyPair = ECPair.fromWIF(USER_PRIVATE_KEY_WIF, this.network);

      // Create the address
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      });

      return {
        name: "funded_user",
        address,
        privateKey: USER_PRIVATE_KEY_WIF,
        publicKey: keyPair.publicKey.toString("hex"),
        keyPair,
        derived: false,
      };
    } catch (error) {
      console.error("Error creating wallet from private key:", error.message);
      throw error;
    }
  }

  async runFullIntegrationTest() {
    console.log(
      "=== HTLC Integration Test with Testnet + Blockstream API ===\n"
    );

    try {
      // Step 1: Use your funded wallet + create MM wallet
      console.log("Step 1: Setting up wallets...");

      // Create your funded wallet from private key
      const userWallet = this.createWalletFromPrivateKey();
      console.log("✅ Created your funded wallet from private key");

      // Create market maker wallet
      let mmWallet = this.walletManager.getWallet("marketmaker");
      if (!mmWallet) {
        console.log("Creating new market maker wallet...");
        mmWallet = this.walletManager.createWallet("marketmaker");
      } else {
        console.log("Using existing market maker wallet...");
      }

      // Display wallet info
      console.log("\n=== YOUR FUNDED WALLET ===");
      console.log(`Address: ${userWallet.address}`);
      console.log(`Public Key: ${userWallet.publicKey}`);
      console.log(`Private Key: ${userWallet.privateKey}`);

      console.log("\n=== MARKET MAKER WALLET ===");
      console.log(`Address: ${mmWallet.address}`);
      console.log(`Public Key: ${mmWallet.publicKey}`);

      // Step 2: Test Blockstream API connection
      console.log("\nStep 2: Testing Blockstream API connection...");
      const isConnected = await this.rpcClient.testConnection();
      if (!isConnected) {
        throw new Error("Failed to connect to Blockstream API");
      }

      // Step 3: Check your wallet balance
      console.log("\nStep 3: Checking your wallet balance...");
      await this.checkWalletBalance(userWallet.address);

      // Step 4: Create preimage via oracle
      console.log("\nStep 4: Creating preimage via Oracle Backend...");
      const btcAmountSats = 7500; // 0.000075 BTC
      const oracleResponse = await this.createPreimageViaOracle(
        userWallet.address,
        mmWallet.publicKey,
        btcAmountSats,
        144
      );

      console.log(
        "Oracle Response:",
        JSON.stringify(oracleResponse.data, null, 2)
      );

      // Step 5: Monitor HTLC address (since we can't auto-send with public API)
      console.log("\nStep 5: HTLC Address Created - Ready for Funding...");
      console.log(`🎯 HTLC Address: ${oracleResponse.data.htlcAddress}`);
      console.log(`💰 Amount to send: 0.000075 BTC`);
      console.log(
        `🔍 Monitor HTLC: https://mempool.space/testnet/address/${oracleResponse.data.htlcAddress}`
      );
      console.log(
        `🔍 Your Wallet: https://mempool.space/testnet/address/${userWallet.address}`
      );

      console.log("\n📝 To complete the test:");
      console.log(
        "1. Use your Bitcoin wallet software to send 0.000075 BTC to the HTLC address above"
      );
      console.log(
        "2. Or run the transaction verification separately once funded"
      );

      // Step 6: Optional - Wait for HTLC funding
      console.log(
        "\nStep 6: Waiting for HTLC funding (optional - 50 minute timeout)..."
      );
      const htlcFunded = await this.rpcClient.waitForTransaction(
        oracleResponse.data.htlcAddress,
        btcAmountSats / 100000000, // Convert satoshis to BTC
        3000
      );

      let result = {
        success: true,
        userWallet,
        mmWallet,
        oracleResponse: oracleResponse.data,
        htlcFunded,
        explorerUrls: {
          user: `https://mempool.space/testnet/address/${userWallet.address}`,
          htlc: `https://mempool.space/testnet/address/${oracleResponse.data.htlcAddress}`,
        },
      };

      if (htlcFunded) {
        console.log("\n✅ HTLC has been funded!");

        // Step 7: Verify HTLC transaction
        console.log("\nStep 7: Verifying HTLC funding...");
        const verification = await this.verifyHTLCTransaction(
          oracleResponse.data.htlcAddress
        );
        result.verification = verification;

        if (verification.funded) {
          console.log(
            `✅ HTLC successfully funded with ${verification.amount} BTC`
          );
          console.log(`📋 Transaction ID: ${verification.latestTx?.txid}`);
          result.transactionId = verification.latestTx?.txid;
        }
      } else {
        console.log(
          "\n⏰ HTLC not funded within timeout - test setup completed successfully"
        );
        console.log(
          "You can manually fund the HTLC address to complete the atomic swap"
        );
      }

      return result;
    } catch (error) {
      console.error("Integration test failed:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
      }
      return { success: false, error: error.message };
    }
  }

  async createPreimageViaOracle(userBtcAddress, mmPubkey, btcAmount, timelock) {
    const response = await axios.post(
      `${ORACLE_BASE_URL}/api/oracle/create-preimage`,
      {
        userBtcAddress,
        mmPubkey,
        btcAmount,
        timelock,
      }
    );

    return response.data;
  }

  async getSwapDetails(swapId) {
    const response = await axios.get(
      `${ORACLE_BASE_URL}/api/oracle/swap/${swapId}`
    );
    return response.data;
  }

  /**
   * Check wallet balance using Blockstream API
   */
  async checkWalletBalance(address, minAmount = 0.001) {
    try {
      console.log(`Checking balance for address: ${address}`);

      const balance = await this.rpcClient.getAddressBalance(address);
      console.log(
        `💰 Current balance: ${balance} BTC (${balance * 100000000} satoshis)`
      );

      if (balance < minAmount) {
        console.log(
          `⚠️  Insufficient balance! Need at least ${minAmount} BTC for testing.`
        );
        console.log(`💸 Your balance: ${balance} BTC`);
        console.log(
          `🚰 Get more testnet coins from: https://testnet-faucet.mempool.co/`
        );
        throw new Error(
          `Insufficient balance: ${balance} BTC. Need at least ${minAmount} BTC.`
        );
      } else {
        console.log(`✅ Sufficient balance: ${balance} BTC`);
        return balance;
      }
    } catch (error) {
      console.error("Error checking wallet balance:", error.message);
      throw error;
    }
  }

  /**
   * Note: Cannot send Bitcoin using public API - this would require wallet software
   * This method is adapted to work with manual sending
   */
  async sendBitcoinToHTLC(htlcAddress, amount) {
    console.log(`\n🔄 HTLC Funding Instructions:`);
    console.log(`📍 Send ${amount} BTC to: ${htlcAddress}`);
    console.log(`💡 Use your Bitcoin wallet software to send this transaction`);
    console.log(
      `🔍 Monitor: https://mempool.space/testnet/address/${htlcAddress}`
    );

    // Wait for manual funding
    console.log(`⏳ Waiting for you to send the transaction...`);
    const funded = await this.rpcClient.waitForTransaction(
      htlcAddress,
      amount,
      600
    ); // 10 minute timeout

    if (funded) {
      const txs = await this.rpcClient.getAddressTransactions(htlcAddress);
      const latestTx = txs[0];
      console.log(`✅ HTLC funded! Transaction: ${latestTx.txid}`);
      return latestTx.txid;
    } else {
      throw new Error("HTLC not funded within timeout");
    }
  }

  /**
   * Verify HTLC transaction using Blockstream API
   */
  async verifyHTLCTransaction(htlcAddress) {
    try {
      console.log("Verifying HTLC transaction...");

      // Get address info and transactions
      const balance = await this.rpcClient.getAddressBalance(htlcAddress);
      const transactions = await this.rpcClient.getAddressTransactions(
        htlcAddress
      );

      if (balance > 0 && transactions.length > 0) {
        const latestTx = transactions[0];

        console.log("✅ HTLC transaction verified:");
        console.log(`  - HTLC Address: ${htlcAddress}`);
        console.log(`  - Balance: ${balance} BTC`);
        console.log(`  - Latest Transaction ID: ${latestTx.txid}`);
        console.log(
          `  - Block Height: ${latestTx.status?.block_height || "Unconfirmed"}`
        );
        console.log(
          `  - Confirmations: ${
            latestTx.status?.confirmed ? "Confirmed" : "Unconfirmed"
          }`
        );
        console.log(
          `  - Explorer: https://mempool.space/testnet/tx/${latestTx.txid}`
        );

        return {
          funded: true,
          amount: balance,
          latestTx,
          transactions,
          explorerUrl: `https://mempool.space/testnet/tx/${latestTx.txid}`,
        };
      } else {
        console.log("⚠️  HTLC address not yet funded");
        return {
          funded: false,
          amount: balance,
          transactions,
        };
      }
    } catch (error) {
      console.error("Error verifying HTLC transaction:", error.message);
      throw error;
    }
  }
}

// Run if called directly
if (require.main === module) {
  const integrationTest = new HTLCIntegrationTestTestnet();

  integrationTest
    .runFullIntegrationTest()
    .then((result) => {
      if (result.success) {
        console.log("\n🎉 Integration test completed successfully!");
        console.log(`🔍 Your Wallet: ${result.explorerUrls?.user}`);
        console.log(`🔍 HTLC Address: ${result.explorerUrls?.htlc}`);

        if (result.transactionId) {
          console.log(
            `📋 Transaction: https://mempool.space/testnet/tx/${result.transactionId}`
          );
        }
      } else {
        console.log("\n❌ Integration test failed:", result.error);
      }
    })
    .catch((error) => {
      console.error("❌ Integration test error:", error);
    });
}

module.exports = HTLCIntegrationTestTestnet;
