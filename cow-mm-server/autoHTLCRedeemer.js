#!/usr/bin/env node

/**
 * Auto HTLC Redeemer CLI Tool
 * 
 * Usage: node autoHTLCRedeemer.js <htlcAddress> <preimage> <htlcScript> [outputAddress]
 * 
 * Description:
 * This tool automatically redeems Bitcoin HTLCs by:
 * 1. Checking HTLC address for UTXOs
 * 2. Creating a spending transaction with the provided preimage
 * 3. Broadcasting the transaction to claim the funds
 * 
 * Example:
 * node autoHTLCRedeemer.js \
 *   bcrt1qspgxkr7jy04hjlsjv4r3mhzgvcj47sku4akl4xau2qgda3amp05qs2hz78 \
 *   bcdc0d6405be856047b579636c34edb5a898c0387e78c2283754891d20f17c67 \
 *   a82093631b2e5cfddf118496000d945dfa830380729afe18bd4395c599a55cc73c1488210367b7d22df3e63c6a4d4c92752826e5942fe453f6fe5d539ed604cc7f52f6d6d7ac \
 *   bcrt1quud9cnmcjwl9pxgv8e8k2s8cxz4p8u46254slj
 */

const BitcoinRPCClient = require('./bitcoin-rpc');

class AutoHTLCRedeemer {
    constructor() {
        this.rpcClient = new BitcoinRPCClient();
        this.defaultWalletName = 'htlc_test_wallet';
        this.defaultWalletPassphrase = 'testpass123';
    }

    /**
     * Parse and validate command line arguments
     */
    parseArguments() {
        const args = process.argv.slice(2);
        
        if (args.length < 3) {
            this.showUsage();
            process.exit(1);
        }

        const [htlcAddress, preimage, htlcScript, outputAddress] = args;

        // Basic validation
        if (!htlcAddress || htlcAddress.length < 26) {
            throw new Error('Invalid HTLC address provided');
        }

        if (!preimage || preimage.length !== 64) {
            throw new Error('Invalid preimage provided (must be 64 hex characters)');
        }

        if (!htlcScript || htlcScript.length < 50) {
            throw new Error('Invalid HTLC script provided');
        }

        return {
            htlcAddress,
            preimage,
            htlcScript,
            outputAddress: outputAddress || null // Will use wallet address if not provided
        };
    }

    /**
     * Show usage information
     */
    showUsage() {
        console.log(`
🔓 Auto HTLC Redeemer CLI Tool

Usage: node autoHTLCRedeemer.js <htlcAddress> <preimage> <htlcScript> [outputAddress]

Arguments:
  htlcAddress   - The P2WSH HTLC address to redeem from
  preimage      - The preimage (64 hex characters)
  htlcScript    - The HTLC script (hex)
  outputAddress - Optional: where to send redeemed funds (defaults to wallet address)

Example:
  node autoHTLCRedeemer.js \\
    bcrt1qspgxkr7jy04hjlsjv4r3mhzgvcj47sku4akl4xau2qgda3amp05qs2hz78 \\
    bcdc0d6405be856047b579636c34edb5a898c0387e78c2283754891d20f17c67 \\
    a82093631b2e5cfddf118496000d945dfa830380729afe18bd4395c599a55cc73c14 \\
    bcrt1quud9cnmcjwl9pxgv8e8k2s8cxz4p8u46254slj

Notes:
  - Requires Bitcoin Core running with RPC enabled
  - Uses default wallet '${this.defaultWalletName}' (created if not exists)
  - Automatically calculates fees and broadcasts transaction
        `);
    }

    /**
     * Setup market maker wallet
     */
    async setupWallet() {
        console.log('🔧 Setting up market maker wallet...');
        
        const walletName = this.defaultWalletName;
        
        // Check if wallet exists and load/create as needed
        if (!(await this.rpcClient.isWalletLoaded(walletName))) {
            console.log(`Loaded wallet: ${walletName}`);
        } else {
            console.log(`Wallet ${walletName} is already loaded`);
        }

        // Get wallet address
        const address = await this.rpcClient.getNewAddress(walletName);
        
        // Get public key
        const addressInfo = await this.rpcClient.getAddressInfo(address, walletName);
        
        return {
            name: walletName,
            address: address,
            publicKey: addressInfo.pubkey
        };
    }

    /**
     * Check HTLC address for available UTXOs
     */
    async checkHTLCBalance(htlcAddress) {
        console.log(`🔍 Checking HTLC address: ${htlcAddress}`);
        
        const balanceResult = await this.rpcClient.getAddressUTXOBalance(htlcAddress);
        
        if (!balanceResult.success) {
            throw new Error(`Failed to check HTLC balance: ${balanceResult.error}`);
        }

        console.log(`💰 HTLC Balance: ${balanceResult.balance} BTC`);
        console.log(`📦 UTXOs found: ${balanceResult.utxos.length}`);

        if (balanceResult.utxos.length === 0) {
            throw new Error('No UTXOs found at HTLC address - nothing to redeem');
        }

        // Show UTXO details
        balanceResult.utxos.forEach((utxo, index) => {
            console.log(`  UTXO ${index + 1}: ${utxo.txid}:${utxo.vout} (${utxo.amount} BTC)`);
        });

        return balanceResult;
    }

    /**
     * Create and broadcast HTLC spending transaction
     */
    async redeemHTLC(htlcScript, preimage, htlcAddress, outputAddress, wallet) {
        console.log('🔓 Creating HTLC spending transaction...');

        // Get HTLC UTXOs
        const balanceResult = await this.checkHTLCBalance(htlcAddress);
        const htlcUtxo = balanceResult.utxos[0]; // Use the first UTXO

        // Calculate spending amount (subtract fee)
        const feeAmount = 1000; // 1000 satoshis
        const spendingAmount = Math.floor((htlcUtxo.amount * 100000000) - feeAmount);

        console.log(`📤 Using UTXO: ${htlcUtxo.txid}:${htlcUtxo.vout}`);
        console.log(`💸 Amount to redeem: ${spendingAmount} satoshis (${htlcUtxo.amount} BTC - ${feeAmount} sat fee)`);
        console.log(`📍 Sending to: ${outputAddress}`);

        // Create spending transaction
        const spendingTx = await this.rpcClient.createHTLCSpendingTransaction(
            htlcScript,
            preimage,
            outputAddress,
            htlcUtxo.txid,
            htlcUtxo.vout,
            spendingAmount,
            wallet.name
        );

        console.log(`✅ Transaction created successfully`);
        console.log(`🆔 Transaction ID: ${spendingTx.txid}`);
        console.log(`📝 Transaction hex: ${spendingTx.hex.substring(0, 100)}...`);

        // Broadcast transaction
        console.log('📡 Broadcasting transaction...');
        const broadcastResult = await this.rpcClient.sendRawTransaction(spendingTx.hex);
        
        if (!broadcastResult) {
            throw new Error('Failed to broadcast transaction');
        }

        console.log(`✅ Transaction broadcasted successfully!`);
        console.log(`🎯 Broadcasted TXID: ${broadcastResult}`);

        return {
            txid: broadcastResult,
            hex: spendingTx.hex,
            amount: spendingAmount,
            fee: feeAmount
        };
    }

    /**
     * Main execution function
     */
    async run() {
        try {
            console.log('🚀 Starting Auto HTLC Redeemer...\n');

            // Parse arguments
            const { htlcAddress, preimage, htlcScript, outputAddress } = this.parseArguments();
            
            console.log('📋 Parameters:');
            console.log(`   HTLC Address: ${htlcAddress}`);
            console.log(`   Preimage: ${preimage.substring(0, 16)}...`);
            console.log(`   Script Length: ${htlcScript.length} characters`);
            console.log(`   Output Address: ${outputAddress || 'Auto (wallet address)'}\n`);

            // Test Bitcoin Core connection
            console.log('🔌 Testing Bitcoin Core connection...');
            const connected = await this.rpcClient.testConnection();
            if (!connected) {
                throw new Error('Failed to connect to Bitcoin Core. Please ensure it is running and RPC is configured.');
            }
            console.log('✅ Connected to Bitcoin Core\n');

            // Setup wallet
            const wallet = await this.setupWallet();
            console.log(`✅ Wallet ready: ${wallet.address}\n`);

            // Use provided output address or wallet address
            const finalOutputAddress = outputAddress || wallet.address;

            // Redeem HTLC
            const result = await this.redeemHTLC(htlcScript, preimage, htlcAddress, finalOutputAddress, wallet);

            // Generate block for confirmation (regtest only)
            try {
                console.log('⛏️  Generating block for confirmation...');
                await this.rpcClient.generateBlocks(1);
                console.log('✅ Block generated\n');
            } catch (error) {
                console.log('ℹ️  Block generation not available (not regtest)\n');
            }

            // Success summary
            console.log('🎉 HTLC Redemption Complete!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📊 Summary:`);
            console.log(`   ✅ Redeemed: ${result.amount} satoshis`);
            console.log(`   💸 Fee paid: ${result.fee} satoshis`);
            console.log(`   🆔 TXID: ${result.txid}`);
            console.log(`   📍 Sent to: ${finalOutputAddress}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const redeemer = new AutoHTLCRedeemer();
    redeemer.run().catch(error => {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = AutoHTLCRedeemer;
