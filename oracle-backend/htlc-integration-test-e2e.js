const BitcoinWalletManager = require('./bitcoin-wallet-simple');
const BitcoinRPCClient = require('./bitcoin-rpc');
const axios = require('axios');

const ORACLE_BASE_URL = 'http://localhost:3001';

class HTLCIntegrationTest {
    constructor() {
        this.walletManager = new BitcoinWalletManager();
        this.rpcClient = new BitcoinRPCClient();
    }

    async runFullIntegrationTest() {
        console.log('=== HTLC Integration Test with Oracle Backend ===\n');

        try {
            // Check if wallets already exist, if not create them
            let userWallet = this.walletManager.getWallet('user');
            if (!userWallet) {
                console.log('Creating new user wallet...');
                userWallet = this.walletManager.createWallet('user');
            } else {
                console.log('Using existing user wallet...');
            }

            let mmWallet = this.walletManager.getWallet('marketmaker');
            if (!mmWallet) {
                console.log('Creating new market maker wallet...');
                mmWallet = this.walletManager.createWallet('marketmaker');
            } else {
                console.log('Using existing market maker wallet...');
            }
            
            this.walletManager.displayWallet('user');
            this.walletManager.displayWallet('marketmaker');

            // Step 2: Test Bitcoin RPC connection
            console.log('\nStep 2: Testing Bitcoin RPC connection...');
            const isConnected = await this.rpcClient.testConnection();
            if (!isConnected) {
                throw new Error('Failed to connect to Bitcoin Core. Please check if Bitcoin Core is running and RPC credentials are correct.');
            }

            // Step 3: Check wallet balance and auto-fund if necessary
            console.log('\nStep 3: Checking wallet balance and auto-funding...');
            await this.checkAndFundWallet('testwallet', 1.0);

            // Step 4: Create preimage via oracle
            console.log('\nStep 4: Creating preimage via Oracle Backend...');
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
            const txid = await this.sendBitcoinToHTLC(oracleResponse.data.htlcAddress, 0.5);
            console.log(`✅ Successfully sent 0.5 BTC to HTLC address`);
            console.log(`Transaction ID: ${txid}`);

            // Step 5: Verify transaction
            console.log('\nStep 5: Verifying transaction...');
            await this.verifyHTLCTransaction(oracleResponse.data.htlcAddress, txid);

            // // Sign with the generated preimage (in real scenario, get from oracle)
            // const signedTx = this.walletManager.signHTLCTransactionPreimage(
            //     spendingTx,
            //     fundingTx,
            //     htlcScript,
            //     mmWallet.keyPair,
            //     preimage // In real scenario, get this from oracle reveal endpoint
            // );

            // console.log(`Signed Transaction: ${signedTx.toHex()}`);

            // // Step 6: Verify the process
            // console.log('\nStep 6: Verification...');
            // const witness = signedTx.ins[0].witness;
            // const revealedPreimage = witness[1].toString('hex');
            
            // console.log(`Revealed Preimage: ${revealedPreimage}`);
            // console.log(`Preimage matches: ${revealedPreimage === preimage}`);

            return {
                success: true,
                userWallet,
                mmWallet,
                oracleResponse: oracleResponse.data,
                transactionId: txid
                // signedTransaction: signedTx.toHex(),
                // revealedPreimage
            };

        } catch (error) {
            console.error('Integration test failed:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return { success: false, error: error.message };
        }
    }

    async createPreimageViaOracle(userBtcAddress, mmPubkey, btcAmount, timelock) {
        const response = await axios.post(`${ORACLE_BASE_URL}/api/oracle/create-preimage`, {
            userBtcAddress,
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
            
            // Check if wallet exists and create if not
            if (!(await this.rpcClient.isWalletLoaded(walletName))) {
                console.log(`Creating or loading wallet: ${walletName}`);
                await this.rpcClient.createWallet(walletName);
            } else {
                console.log(`Wallet ${walletName} is already loaded`);
            }

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
    async sendBitcoinToHTLC(htlcAddress, amount, walletName = 'testwallet') {
        try {
            console.log(`Sending ${amount} BTC to HTLC address: ${htlcAddress}`);
            
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
    async verifyHTLCTransaction(htlcAddress, expectedTxid, walletName = 'testwallet') {
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

    async createPreimageViaOracle(userBtcAddress, mmPubkey, btcAmount, timelock) {
        const response = await axios.post(`${ORACLE_BASE_URL}/api/oracle/create-preimage`, {
            userBtcAddress,
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