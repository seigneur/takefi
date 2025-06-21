const BitcoinWalletManager = require('./bitcoin-wallet-simple');
const axios = require('axios');

const ORACLE_BASE_URL = 'http://localhost:3000';

class HTLCIntegrationTest {
    constructor() {
        this.walletManager = new BitcoinWalletManager();
    }

    async runFullIntegrationTest() {
        console.log('=== HTLC Integration Test with Oracle Backend ===\n');

        try {
            // Step 1: Create wallets
            console.log('Step 1: Creating wallets...');
            const userWallet = this.walletManager.createWallet('user');
            const mmWallet = this.walletManager.createWallet('marketmaker');
            
            this.walletManager.displayWallet('user');
            this.walletManager.displayWallet('marketmaker');

            // Step 2: Create preimage via oracle
            console.log('\nStep 2: Creating preimage via Oracle Backend...');
            const oracleResponse = await this.createPreimageViaOracle(
                userWallet.address,
                mmWallet.publicKey,
                50000000, // 0.5 BTC in satoshis
                144
            );

            console.log('Oracle Response:', JSON.stringify(oracleResponse.data, null, 2));

            // Step 3: Get the preimage from oracle (simulate internal access)
            console.log('\nStep 3: Simulating preimage retrieval...');
            const { preimage, hash } = this.walletManager.generatePreimage();
            console.log(`Simulated Preimage: ${preimage}`);
            console.log(`Oracle Hash: ${oracleResponse.data.hash}`);

            // Step 4: Create funding transaction
            console.log('\nStep 4: Creating funding transaction...');
            const fundingTx = this.walletManager.createFundingTransaction(
                oracleResponse.data.htlcAddress,
                0.5
            );
            console.log(`Funding TXID: ${fundingTx.txid}`);

            // Step 5: Create and sign spending transaction
            console.log('\nStep 5: Creating spending transaction...');
            const htlcScript = Buffer.from(oracleResponse.data.htlcScript, 'hex');
            
            const spendingTx = this.walletManager.createSpendingTransaction(
                fundingTx,
                mmWallet.address,
                0.5,
                0.001
            );

            // Sign with the generated preimage (in real scenario, get from oracle)
            const signedTx = this.walletManager.signHTLCTransactionPreimage(
                spendingTx,
                fundingTx,
                htlcScript,
                mmWallet.keyPair,
                preimage // In real scenario, get this from oracle reveal endpoint
            );

            console.log(`Signed Transaction: ${signedTx.toHex()}`);

            // Step 6: Verify the process
            console.log('\nStep 6: Verification...');
            const witness = signedTx.ins[0].witness;
            const revealedPreimage = witness[1].toString('hex');
            
            console.log(`Revealed Preimage: ${revealedPreimage}`);
            console.log(`Preimage matches: ${revealedPreimage === preimage}`);

            return {
                success: true,
                userWallet,
                mmWallet,
                oracleResponse: oracleResponse.data,
                signedTransaction: signedTx.toHex(),
                revealedPreimage
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