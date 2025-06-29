const BitcoinRPCClient = require('./bitcoin-rpc');
const axios = require('axios');
const readline = require('readline');
require('dotenv').config(); // Load environment variables from .env file


const ORACLE_BASE_URL = 'http://localhost:3001';

class HTLCIntegrationTest {
    constructor() {
        this.rpcClient = new BitcoinRPCClient();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Wait for user input before proceeding
     */
    async waitForUser(message = "Press Enter to continue...") {
        return new Promise((resolve) => {
            this.rl.question(`\n${message}`, () => {
                resolve();
            });
        });
    }

    async runFullIntegrationTest() {
        console.log('=== HTLC Integration Test with Oracle Backend ===\n');

        try {
            // Check if wallets already exist, if not create them
            const userWalletName = 'user-test';
            // Check if wallet exists and create if not
            if (!(await this.rpcClient.isWalletLoaded(userWalletName))) {
                console.log(`Creating or loading wallet: ${userWalletName}`);
                await this.rpcClient.createWallet(userWalletName);
            } else {
                console.log(`Wallet ${userWalletName} is already loaded`);
            }
            const userWallet = {
                name: userWalletName,
                address: await this.rpcClient.getNewAddress(userWalletName)
            };
            console.log(`User wallet  ${userWallet.name} with address ${userWallet.address}`);

            let mmWalletName = 'htlc_test_wallet';
            if (!(await this.rpcClient.isWalletLoaded(mmWalletName))) {
                console.log(`Creating or loading wallet: ${mmWalletName}`);
                // Create a new legacy wallet with a known passphrase
                await this.rpcClient.createWallet(mmWalletName, false, false, 'testpass123'); // Create legacy wallet with passphrase
            } else {
                console.log(`Wallet ${mmWalletName} is already loaded`);
            }
            const mmWallet = {
                name: mmWalletName,
                address: await this.rpcClient.getNewAddress(mmWalletName)
            };
            console.log(`Market Maker wallet ${mmWallet.name} with address ${mmWallet.address}`);
                // Get the public key from the wallet address
                console.log('Getting MM wallet public key...');
                try {
                    const addressInfo = await this.rpcClient.getAddressInfo(mmWallet.address, mmWalletName);
                    mmWallet.publicKey = addressInfo.pubkey;
                    console.log(`MM Public Key: ${mmWallet.publicKey}`);
                    
                 } catch (error) {
                    console.error('Error getting wallet keys:', error.message);
                    throw error;
                }
            // Step 2: Test Bitcoin RPC connection
            console.log('\nStep 2: Testing Bitcoin RPC connection...');
            await this.waitForUser("🔌 Ready to test Bitcoin RPC connection? Press Enter...");
            const isConnected = await this.rpcClient.testConnection();
            if (!isConnected) {
                throw new Error('Failed to connect to Bitcoin Core. Please check if Bitcoin Core is running and RPC credentials are correct.');
            }

            // Step 3: Check wallet balance and auto-fund if necessary
            console.log('\nStep 3: Checking wallet balance and auto-funding...');
            await this.waitForUser("💰 Ready to check wallet balance and fund if needed? Press Enter...");
            await this.checkAndFundWallet('user-test', 1.0);

            // Step 4: Create preimage via oracle
            console.log('\nStep 4: Creating preimage via Oracle Backend...');
            await this.waitForUser("🔮 Ready to create HTLC preimage via Oracle? Press Enter...");
            const oracleResponse = await this.createPreimageViaOracle(
                userWallet.address,
                mmWallet.publicKey,
                50000000, // 0.5 BTC in satoshis
                144
            );

            //at this point multisig is generated
            

            console.log('Oracle Response:', JSON.stringify(oracleResponse.data, null, 2));

            // Step 4: Send real Bitcoin transaction to HTLC address
            console.log('\nStep 4: Sending 0.5 BTC to HTLC address...');
            await this.waitForUser(`💸 Ready to send 0.5 BTC to HTLC address ${oracleResponse.data.htlcAddress}? Press Enter...`);
            // First fund the htlc_test_wallet so it has coins to send
            await this.checkAndFundWallet(mmWallet.name, 1.0);
            const txid = await this.sendBitcoinToHTLC(oracleResponse.data.htlcAddress, 0.5, mmWallet.name);
            console.log(`✅ Successfully sent 0.5 BTC to HTLC address`);
            console.log(`Transaction ID: ${txid}`);

            // Step 5: Verify transaction
            console.log('\nStep 5: Verifying transaction...');
            await this.waitForUser("🔍 Ready to verify the HTLC funding transaction? Press Enter...");
            let txDeets = await this.verifyHTLCTransaction(oracleResponse.data.htlcAddress, txid, mmWallet.name);
            console.log('Transaction Details:', JSON.stringify(txDeets, null, 2));

            // Show the balance of the HTLC address
            console.log('\nChecking HTLC address balance...');
            const htlcBalanceResult = await this.rpcClient.getAddressUTXOBalance(oracleResponse.data.htlcAddress);
            if (htlcBalanceResult.success) {
                console.log(`HTLC Address Balance: ${htlcBalanceResult.balance} BTC`);
                console.log(`Number of UTXOs: ${htlcBalanceResult.utxos.length}`);
                if (htlcBalanceResult.utxos.length > 0) {
                    console.log('HTLC UTXOs:', htlcBalanceResult.utxos.map(utxo => ({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        amount: utxo.amount
                    })));
                }
            } else {
                console.log('Failed to check HTLC balance:', htlcBalanceResult.error);
            }

            // here create a console.log with information to call autoRedeemHTLC
            console.log(`\nTo redeem the HTLC, call autoRedeemHTLC with the following parameters:`);
            console.log(`  - HTLC Script: ${oracleResponse.data.htlcScript}`);
            console.log(`  - Preimage: ${oracleResponse.data.preimage}`);
            console.log(`  - HTLC Address: ${oracleResponse.data.htlcAddress}`);
            console.log(`  - Output Address: ${mmWallet.address}`); // Use MM wallet address as output
            

            // Step 6: Create a transaction to spend the HTLC
            console.log('\nStep 6: Creating spending transaction...');
            await this.waitForUser("🔓 Ready to create HTLC spending transaction with preimage? Press Enter...");
            const htlcScript = oracleResponse.data.htlcScript;
            const preimage = oracleResponse.data.preimage; // This should be the preimage returned
            
            // Get the UTXO details for spending
            if (htlcBalanceResult.utxos.length === 0) {
                throw new Error('No UTXOs found for HTLC address');
            }
            
            const htlcUtxo = htlcBalanceResult.utxos[0]; // Use the first UTXO
            const spendingAmount = Math.floor((htlcUtxo.amount * 100000000) - 1000); // Subtract 1000 sats for fee
            
            console.log(`Using UTXO: ${htlcUtxo.txid}:${htlcUtxo.vout} with ${htlcUtxo.amount} BTC`);
            console.log(`Spending amount after fee: ${spendingAmount} satoshis`);
            
            const spendingTx = await this.rpcClient.createHTLCSpendingTransaction(
                htlcScript,
                preimage,
                mmWallet.address,
                htlcUtxo.txid,
                htlcUtxo.vout,
                spendingAmount,
                mmWallet.name
            );
            console.log(`✅ HTLC spending transaction created and signed successfully`);
            console.log(`Transaction ID: ${spendingTx.txid}`);
            console.log(`Transaction hex: ${spendingTx.hex}`);
            
            // Step 7: Broadcast the signed transaction
            console.log('\nStep 7: Broadcasting the signed transaction...');
            await this.waitForUser(`📡 Ready to broadcast spending transaction ${spendingTx.txid}? Press Enter...`);
            const broadcastResult = await this.rpcClient.sendRawTransaction(spendingTx.hex);
            if (!broadcastResult) {
                throw new Error('Failed to broadcast the signed transaction. Please check the wallet and network status.');
            }
            console.log(`✅ Transaction broadcasted successfully`);
            console.log(`Broadcasted Transaction ID: ${broadcastResult}`);
            
            // Generate a block to confirm the spending transaction
            console.log('Generating 1 block to confirm spending transaction...');
            await this.rpcClient.generateBlocks(1);

            // Close readline interface
            this.rl.close();


            return {
                success: true,
                userWallet,
                mmWallet,
                oracleResponse: oracleResponse.data,
                fundingTransactionId: txid,
                spendingTransactionId: broadcastResult,
                htlcBalance: htlcBalanceResult
            };

        } catch (error) {
            console.error('Integration test failed:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            // Close readline interface on error
            this.rl.close();
            return { success: false, error: error.message };
        }
    }

    async createPreimageViaOracle(userBtcAddress, mmPubkey, btcAmount, timelock) {
        const userEthWallet = process.env.ETH_WALLET_ADDRESS || '0x6E59B243B9A534E63E39a7debb6658d5A4806A8C';
        const response = await axios.post(`${ORACLE_BASE_URL}/api/oracle/create-preimage`, {
            userBtcAddress,
            userEthWallet,
            mmPubkey,
            btcAmount,
            timelock
        });
        
        return response.data;
    }

    async getSwapDetails(swapId) {
        const response = await axios.get(`${ORACLE_BASE_URL}/api/oracle/swap/${swapId}`);
        return response.data;
    }

    /**
     * Check wallet balance and auto-fund if below threshold
     */
    async checkAndFundWallet(walletName, targetAmount = 1.0) {
        try {
            console.log(`Checking balance for wallet: ${walletName}`);
            
            

            // Get current balance using wallet-specific call
            const currentBalance = await this.rpcClient.getWalletBalance(walletName);
            console.log(`Current wallet balance: ${currentBalance} BTC`);

            // Handle null balance (RPC connection issue)
            if (currentBalance === null || currentBalance === undefined) {
                throw new Error('Failed to retrieve wallet balance. Check Bitcoin Core RPC connection.');
            }

            // Check if funding is needed
            if (currentBalance < targetAmount) {
                console.log(`Balance ${currentBalance} BTC is below threshold ${targetAmount} BTC`);
                console.log('Auto-funding wallet with generated coins...');
                
                const newBalance = await this.rpcClient.fundWallet(walletName, targetAmount);
                
                // Handle null response from funding
                if (newBalance === null || newBalance === undefined) {
                    throw new Error('Failed to fund wallet. Check Bitcoin Core RPC connection and regtest mode.');
                }
                
                console.log(`✅ Wallet funded successfully. New balance: ${newBalance} BTC`);
                return newBalance;
            } else {
                console.log(`✅ Wallet has sufficient balance: ${currentBalance} BTC`);
                return currentBalance;
            }
        } catch (error) {
            console.error('Error checking and funding wallet:', error.message);
            throw error;
        }
    }

    /**
     * Send Bitcoin to HTLC address using Bitcoin Core
     */
    async sendBitcoinToHTLC(htlcAddress, amount, walletName = 'htlc_test_wallet') {
        try {
            console.log(`Sending ${amount} BTC to HTLC address: ${htlcAddress}`);
            
            // Try to unlock the wallet first if it's encrypted
            try {
                await this.rpcClient.unlockWallet('testpass123', 300, walletName);
                console.log('Wallet unlocked for sending transaction');
            } catch (error) {
                console.log('Wallet unlock not needed or already unlocked');
            }
            
            // Import the HTLC address for monitoring
            try {
                await this.rpcClient.importAddress(htlcAddress, 'HTLC_ADDRESS', false, walletName);
                console.log('HTLC address imported for monitoring');
            } catch (error) {
                // Address might already be imported
                console.log('HTLC address already imported or import not needed');
            }

            // Send Bitcoin to HTLC address using specified wallet
            const txid = await this.rpcClient.sendToAddress(
                walletName,
                htlcAddress, 
                amount, 
                'HTLC funding transaction', 
                'Atomic swap HTLC'
            );

            // Generate a block to confirm the transaction
            console.log('Generating 1 block to confirm transaction...');
            await this.rpcClient.generateBlocks(1);

            return txid;
        } catch (error) {
            console.error('Error sending Bitcoin to HTLC:', error.message);
            throw error;
        }
    }


    /**
     * Verify HTLC transaction
     */
    async verifyHTLCTransaction(htlcAddress, expectedTxid, walletName = 'htlc_test_wallet') {
        try {
            console.log('Verifying HTLC transaction...');
            
            // Get transaction details
            try {
                const txDetails = await this.rpcClient.callRPC('gettransaction', [expectedTxid], walletName);
                console.log('✅ HTLC transaction found:');
                console.log(`  - Transaction ID: ${txDetails.txid}`);
                console.log(`  - Amount: ${Math.abs(txDetails.amount)} BTC`);
                console.log(`  - Confirmations: ${txDetails.confirmations}`);
                console.log(`  - Block Hash: ${txDetails.blockhash || 'Not yet in block'}`);
                console.log(`  - Time: ${new Date(txDetails.time * 1000).toISOString()}`);
                
                return {
                    transactionFound: true,
                    transactionDetails: txDetails
                };
            } catch (error) {
                console.log('⚠️  Transaction not found in wallet (this is expected for send transactions)');
                
                // Try to get raw transaction details
                try {
                    const rawTx = await this.rpcClient.callRPC('getrawtransaction', [expectedTxid, true]);
                    console.log('✅ Raw transaction found:');
                    console.log(`  - Transaction ID: ${rawTx.txid}`);
                    console.log(`  - Confirmations: ${rawTx.confirmations || 0}`);
                    console.log(`  - Block Hash: ${rawTx.blockhash || 'Not yet in block'}`);
                    
                    // Check if transaction has outputs to the HTLC address
                    const htlcOutput = rawTx.vout.find(output => 
                        output.scriptPubKey.addresses && 
                        output.scriptPubKey.addresses.includes(htlcAddress)
                    );
                    
                    if (htlcOutput) {
                        console.log(`  - Amount sent to HTLC: ${htlcOutput.value} BTC`);
                        console.log('✅ Transaction successfully sent 0.5 BTC to HTLC address');
                    }
                    
                    return {
                        transactionFound: true,
                        rawTransaction: rawTx,
                        htlcOutput: htlcOutput
                    };
                } catch (rawError) {
                    console.error('Error getting raw transaction:', rawError.message);
                    throw error;
                }
            }
        } catch (error) {
            console.error('Error verifying HTLC transaction:', error.message);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const integrationTest = new HTLCIntegrationTest();
    
    integrationTest.runFullIntegrationTest()
        .then(result => {
            if (result.success) {
                console.log('\n✅ Integration test completed successfully!');
            } else {
                console.log('\n❌ Integration test failed:', result.error);
            }
        })
        .catch(error => {
            console.error('❌ Integration test error:', error);
        });
}

module.exports = HTLCIntegrationTest;