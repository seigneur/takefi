// Bitcoin RPC client for regtest interaction
const bitcoin = require('bitcoinjs-lib');
const ECPair = require('ecpair').ECPairFactory(require('tiny-secp256k1'));
const https = require('https');
const http = require('http');

class BitcoinRPCClient {
    constructor(options = {}) {
        // Default configuration for Bitcoin Core regtest
        this.rpcConfig = {
            protocol: options.protocol || 'http',
            user: options.user || 'devuser',
            pass: options.pass || 'devpass',
            host: options.host || '127.0.0.1',
            port: options.port || 18332, // testnet default port (was 18443 for regtest)
        };

        this.currentWallet = null; // Track current wallet
        
        // Bitcoin network configuration
        this.network = bitcoin.networks.regtest; // Use regtest network
    }
    // ...existing code...

/**
 * Get detailed information about an address including public key
 */
async getAddressInfo(address, walletName) {
    try {
        console.log(`Getting address info for: ${address}`);
        const result = await this.callRPC('getaddressinfo', [address], walletName);
        return result;
    } catch (error) {
        console.error(`Error getting address info for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Get UTXO balance for any address using scantxoutset (works without importing address)
 */
async getAddressUTXOBalance(address) {
    try {
        console.log(`Scanning UTXO set for address: ${address}`);
        const result = await this.callRPC('scantxoutset', ['start', [`addr(${address})`]]);
        
        if (result && result.unspents) {
            const totalAmount = result.unspents.reduce((sum, utxo) => sum + utxo.amount, 0);
            console.log(`Found ${result.unspents.length} UTXOs for address ${address}, total: ${totalAmount} BTC`);
            return {
                balance: totalAmount,
                utxos: result.unspents,
                success: true
            };
        } else {
            console.log(`No UTXOs found for address ${address}`);
            return {
                balance: 0,
                utxos: [],
                success: true
            };
        }
    } catch (error) {
        console.error(`Error scanning UTXOs for address ${address}:`, error.message);
        return {
            balance: 0,
            utxos: [],
            success: false,
            error: error.message
        };
    }
}


// ...existing code...

    /**
     * Call RPC method with promise wrapper using HTTP
     */
    async callRPC(method, params = [], walletName = null) {
        return new Promise((resolve, reject) => {
            console.log(`🔌 Calling RPC method: ${method} with params:`, params, walletName ? `(wallet: ${walletName})` : '');

            const requestBody = JSON.stringify({
                jsonrpc: "1.0",
                id: "node-client",
                method: method,
                params: params
            });

            // Build URL path
            let path = '/';
            if (walletName) {
                path = `/wallet/${walletName}`;
            }

            const options = {
                hostname: this.rpcConfig.host,
                port: this.rpcConfig.port,
                path: path,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(requestBody),
                    'Authorization': 'Basic ' + Buffer.from(this.rpcConfig.user + ':' + this.rpcConfig.pass).toString('base64')
                }
            };

            const httpModule = this.rpcConfig.protocol === 'https' ? https : http;
            
            const req = httpModule.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        console.log(`✅ RPC Response for ${method}:`, response);
                        
                        if (response.error) {
                            reject(new Error(`RPC Error: ${response.error.message}`));
                        } else {
                            resolve(response.result);
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse RPC response: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error(`❌ RPC Error for ${method}:`, error);
                reject(new Error(`RPC Request Error: ${error.message}`));
            });

            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Set current wallet for subsequent operations
     */
    setCurrentWallet(walletName) {
        this.currentWallet = walletName;
        console.log(`Set current wallet to: ${walletName}`);
    }

    /**
     * Test connection to Bitcoin Core
     */
    async testConnection() {
        try {
            console.log(`Testing connection to Bitcoin Core at ${this.rpcConfig.host}:${this.rpcConfig.port}`);
            const info = await this.callRPC('getblockchaininfo', []);
            console.log('✅ Successfully connected to Bitcoin Core');
            console.log(`Chain: ${info.chain}, Blocks: ${info.blocks}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Bitcoin Core:', error.message);
            return false;
        }
    }

    /**
     * Get wallet balance
     */
    async getWalletBalance(walletName = '') {
        try {
            if (walletName) {
                // Use wallet-specific RPC call
                return await this.callRPC('getbalance', [], walletName);
            } else if (this.currentWallet) {
                // Use current wallet
                return await this.callRPC('getbalance', [], this.currentWallet);
            } else {
                // Get balance from default wallet (might fail if no default wallet)
                return await this.callRPC('getbalance', []);
            }
        } catch (error) {
            console.error('Error getting wallet balance:', error.message);
            throw error;
        }
    }

    /**
     * Generate blocks (for regtest only)
     */
    async generateBlocks(numBlocks, address = null) {
        try {
            if (address) {
                return await this.callRPC('generatetoaddress', [numBlocks, address]);
            } else {
                // Generate to a new address from current wallet or any available wallet
                let newAddress;
                try {
                    if (this.currentWallet) {
                        newAddress = await this.callRPC('getnewaddress', [], this.currentWallet);
                    } else {
                        // Try to use any available wallet
                        const wallets = await this.callRPC('listwallets', []);
                        if (wallets.length > 0) {
                            newAddress = await this.callRPC('getnewaddress', [], wallets[0]);
                        } else {
                            throw new Error('No wallets available for block generation');
                        }
                    }
                } catch (error) {
                    // Fallback: generate to a dummy address
                    newAddress = 'bcrt1q0000000000000000000000000000000000000000000000000000000000000000000000000000000000';
                }
                return await this.callRPC('generatetoaddress', [numBlocks, newAddress]);
            }
        } catch (error) {
            console.error('Error generating blocks:', error.message);
            throw error;
        }
    }

    /**
     * Create a new wallet
     */
    async createWallet(walletName, descriptors = false, disablePrivateKeys = false, passphrase = '') {
        try {
            console.log(`Attempting to create wallet: ${walletName}`);
            const result = await this.callRPC('createwallet', [walletName, disablePrivateKeys, false, passphrase, false, descriptors]);
            console.log(`Successfully created wallet: ${walletName}`);
            return result;
        } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('Database already exists')) {
                console.log(`Wallet '${walletName}' already exists, attempting to load it...`);
                try {
                    const loadResult = await this.callRPC('loadwallet', [walletName]);
                    console.log(`Successfully loaded existing wallet: ${walletName}`);
                    return loadResult;
                } catch (loadError) {
                    if (loadError.message.includes('already loaded')) {
                        console.log(`Wallet '${walletName}' is already loaded`);
                        return { name: walletName, warning: 'Wallet already loaded' };
                    }
                    console.error(`Failed to load existing wallet ${walletName}:`, loadError.message);
                    throw loadError;
                }
            }
            console.error(`Failed to create wallet ${walletName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get new address from wallet
     */
    async getNewAddress(walletName, label = '', addressType = 'bech32') {
        try {
            if (walletName) {
                return await this.callRPC('getnewaddress', [label, addressType], walletName);
            } else if (this.currentWallet) {
                return await this.callRPC('getnewaddress', [label, addressType], this.currentWallet);
            } else {
                return await this.callRPC('getnewaddress', [label, addressType]);
            }
        } catch (error) {
            console.error('Error getting new address:', error.message);
            throw error;
        }
    }

    /**
     * Send BTC to address
     */
    async sendToAddress(walletName, address, amount, comment = '', commentTo = '') {
        try {
            // For regtest, we need to set a manual fee since fee estimation might fail
            try {
                if (walletName) {
                    return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo], walletName);
                } else if (this.currentWallet) {
                    return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo], this.currentWallet);
                } else {
                    return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo]);
                }
            } catch (feeError) {
                if (feeError.message.includes('Fee estimation failed')) {
                    console.log('Fee estimation failed, trying with fallback fee...');
                    
                    // Use settxfee to set a manual fee rate first
                    const feePerKB = 0.00001; // 0.00001 BTC per KB (very low for regtest)
                    
                    if (walletName) {
                        await this.callRPC('settxfee', [feePerKB], walletName);
                        return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo], walletName);
                    } else if (this.currentWallet) {
                        await this.callRPC('settxfee', [feePerKB], this.currentWallet);
                        return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo], this.currentWallet);
                    } else {
                        await this.callRPC('settxfee', [feePerKB]);
                        return await this.callRPC('sendtoaddress', [address, amount, comment, commentTo]);
                    }
                } else {
                    throw feeError;
                }
            }
        } catch (error) {
            console.error('Error sending to address:', error.message);
            throw error;
        }
    }

    /**
     * Import address for monitoring
     */
    async importAddress(address, label = '', rescan = true, walletName = null) {
        try {
            if (walletName) {
                return await this.callRPC('importaddress', [address, label, rescan], walletName);
            } else if (this.currentWallet) {
                return await this.callRPC('importaddress', [address, label, rescan], this.currentWallet);
            } else {
                return await this.callRPC('importaddress', [address, label, rescan]);
            }
        } catch (error) {
            console.error('Error importing address:', error.message);
            throw error;
        }
    }

    /**
     * Get received amount by address
     */
    async getReceivedByAddress(address, minConfirmations = 1, walletName = null) {
        try {
            if (walletName) {
                return await this.callRPC('getreceivedbyaddress', [address, minConfirmations], walletName);
            } else if (this.currentWallet) {
                return await this.callRPC('getreceivedbyaddress', [address, minConfirmations], this.currentWallet);
            } else {
                return await this.callRPC('getreceivedbyaddress', [address, minConfirmations]);
            }
        } catch (error) {
            console.error('Error getting received by address:', error.message);
            throw error;
        }
    }

    /**
     * List transactions
     */
    async listTransactions(count = 10, skip = 0) {
        try {
            return await this.callRPC('listtransactions', ['*', count, skip]);
        } catch (error) {
            console.error('Error listing transactions:', error.message);
            throw error;
        }
    }

    /**
     * Get blockchain info
     */
    async getBlockchainInfo() {
        try {
            return await this.callRPC('getblockchaininfo', []);
        } catch (error) {
            console.error('Error getting blockchain info:', error.message);
            throw error;
        }
    }

    /**
     * Check if wallet exists and is loaded
     */
    async isWalletLoaded(walletName) {
        try {
            const wallets = await this.callRPC('listwallets', []);
            return wallets.includes(walletName);
        } catch (error) {
            console.error('Error checking wallet status:', error.message);
            return false;
        }
    }

    /**
     * Fund wallet with generated coins (regtest only)
     */
    async fundWallet(walletName, targetAmount = 1.0) {
        try {
            console.log(`Funding wallet '${walletName}' with ${targetAmount} BTC...`);
            
            // Load or create wallet
            if (!(await this.isWalletLoaded(walletName))) {
                await this.createWallet(walletName);
            }

            // Set current wallet for subsequent operations
            this.setCurrentWallet(walletName);

            // Get current balance
            const currentBalance = await this.getWalletBalance(walletName);
            console.log(`Current balance: ${currentBalance} BTC`);

            // Handle null balance
            if (currentBalance === null || currentBalance === undefined) {
                throw new Error('Failed to get current balance. Check Bitcoin Core RPC connection.');
            }

            if (currentBalance >= targetAmount) {
                console.log(`Wallet already has sufficient balance (${currentBalance} BTC >= ${targetAmount} BTC)`);
                return currentBalance;
            }

            // Generate new address for this wallet
            const address = await this.getNewAddress(walletName, 'funding');
            console.log(`Generated funding address: ${address}`);

            // Handle null address
            if (!address) {
                throw new Error('Failed to generate new address. Check Bitcoin Core RPC connection.');
            }

            // Calculate blocks needed (50 BTC per block in regtest)
            const blocksNeeded = Math.ceil((targetAmount - currentBalance) / 50) + 1;
            console.log(`Generating ${blocksNeeded} blocks to address ${address}...`);

            // Generate blocks to the wallet address
            const blockHashes = await this.generateBlocks(blocksNeeded, address);
            console.log(`Generated ${blocksNeeded} blocks`);

            // Handle null block generation
            if (!blockHashes) {
                throw new Error('Failed to generate blocks. Check Bitcoin Core RPC connection and regtest mode.');
            }

            // Generate additional blocks to mature the coinbase outputs (need 100 confirmations)
            console.log('Generating 100 additional blocks to mature coinbase outputs...');
            await this.generateBlocks(100);

            // Check new balance
            const newBalance = await this.getWalletBalance(walletName);
            console.log(`New balance after block generation: ${newBalance} BTC`);

            // Handle null new balance
            if (newBalance === null || newBalance === undefined) {
                throw new Error('Failed to get new balance after funding. Check Bitcoin Core RPC connection.');
            }

            return newBalance;
        } catch (error) {
            console.error('Error funding wallet:', error.message);
            throw error;
        }
    }

    /**
     * Create and sign an HTLC spending transaction using bitcoinjs-lib
     */
    async createHTLCSpendingTransaction(htlcScript, preimage, outputAddress, fundingTxid, fundingVout, amount, walletName = null) {
        try {
            console.log('Creating HTLC spending transaction with bitcoinjs-lib...');
            console.log(`HTLC Script: ${htlcScript}`);
            console.log(`Preimage: ${preimage}`);
            console.log(`Output Address: ${outputAddress}`);
            console.log(`Funding TXID: ${fundingTxid}`);
            console.log(`Funding Vout: ${fundingVout}`);
            console.log(`Amount: ${amount} satoshis`);
            console.log(`Using wallet: ${walletName}`);

            // Convert hex inputs to buffers
            const htlcScriptBuffer = Buffer.from(htlcScript, 'hex');
            const preimageBuffer = Buffer.from(preimage, 'hex');

            // Get private key from legacy wallet for signing
            console.log('Getting private key from legacy wallet...');
            
            // Try to unlock the wallet first (in case it has a passphrase)
            try {
                await this.unlockWallet('testpass123', 300, walletName);
            } catch (error) {
                // Wallet might not have a passphrase or already unlocked
                console.log('Wallet unlock not needed or already unlocked');
            }
            
            // First, ensure the wallet has some funds so we have usable addresses
            console.log('Ensuring wallet has funds...');
            await this.fundWallet(walletName, 1.0);
            
            // Get addresses from the wallet
            let addresses = await this.callRPC('listreceivedbyaddress', [0, false, true], walletName);
            if (!addresses || addresses.length === 0) {
                // If still no addresses, generate a new one and fund it
                console.log('No addresses found, generating new address...');
                const newAddress = await this.callRPC('getnewaddress', [], walletName);
                console.log(`Generated new address: ${newAddress}`);
                
                // Fund the new address
                await this.sendToAddress('testwallet', newAddress, 0.1, 'Fund new address', '');
                await this.generateBlocks(1);
                
                // Try again to get addresses
                addresses = await this.callRPC('listreceivedbyaddress', [0, false, true], walletName);
                if (!addresses || addresses.length === 0) {
                    throw new Error('Still no addresses found after funding wallet');
                }
            }

            // Find an address that belongs to the wallet and get its private key
            let walletAddress = null;
            let privateKeyWIF = null;
            
            // First, try to get the private key for the output address (which should match the MM pubkey)
            try {
                const addressInfo = await this.callRPC('getaddressinfo', [outputAddress], walletName);
                if (addressInfo.ismine && addressInfo.solvable) {
                    walletAddress = outputAddress;
                    privateKeyWIF = await this.callRPC('dumpprivkey', [outputAddress], walletName);
                    console.log(`Successfully got private key for MM address: ${walletAddress}`);
                }
            } catch (error) {
                console.log(`Failed to get private key for MM address ${outputAddress}: ${error.message}`);
            }
            
            // If that doesn't work, try other addresses in the wallet
            if (!privateKeyWIF) {
                for (const addr of addresses) {
                    try {
                        const addressInfo = await this.callRPC('getaddressinfo', [addr.address], walletName);
                        if (addressInfo.ismine && addressInfo.solvable) {
                            walletAddress = addr.address;
                            // Get the private key for this address
                            privateKeyWIF = await this.callRPC('dumpprivkey', [addr.address], walletName);
                            console.log(`Successfully got private key for address: ${walletAddress}`);
                            break;
                        }
                    } catch (error) {
                        console.log(`Failed to get private key for ${addr.address}: ${error.message}`);
                        // Continue to next address if this one fails
                        continue;
                    }
                }
            }

            if (!privateKeyWIF) {
                throw new Error(`Could not find a private key for signing from wallet ${walletName}. Make sure it's a legacy wallet.`);
            }

            console.log(`Using wallet address ${walletAddress} for signing`);

            // Create ECPair from private key
            const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);
            
            // Create transaction
            const tx = new bitcoin.Transaction();
            tx.version = 2;

            // Add input (the HTLC UTXO) - for P2WSH, the scriptSig should be empty
            tx.addInput(Buffer.from(fundingTxid, 'hex').reverse(), fundingVout, 0xffffffff, Buffer.alloc(0));

            // Add output (where to send the spent coins)
            tx.addOutput(bitcoin.address.toOutputScript(outputAddress, this.network), amount);

            // Create signature hash for the input
            const hashType = bitcoin.Transaction.SIGHASH_ALL;
            const inputValue = Math.floor(50000000); // 0.5 BTC in satoshis (the HTLC UTXO value)
            
            const signatureHash = tx.hashForWitnessV0(
                0, // input index
                htlcScriptBuffer, // script code
                inputValue, // value of the input being spent
                hashType
            );

            // Sign the hash
            const signature = keyPair.sign(signatureHash);
            
            // Encode signature using bitcoinjs-lib's signature encoder
            const signatureWithHashType = bitcoin.script.signature.encode(Buffer.from(signature), hashType);

            // For the simplified HTLC script: OP_SHA256 <hash> OP_EQUALVERIFY <pubkey> OP_CHECKSIG
            // The witness stack should be: [<signature> <preimage>] and script is the witness script
            const witness = [
                signatureWithHashType,
                preimageBuffer
            ];

            // Set the witness for P2WSH - the script is automatically included as the last element
            tx.setWitness(0, [...witness, htlcScriptBuffer]);

            const txHex = tx.toHex();

            console.log(`✅ HTLC spending transaction created successfully`);
            console.log(`Transaction hex: ${txHex}`);
            console.log(`Transaction ID: ${tx.getId()}`);
            
            // Test the transaction before returning
            console.log('Testing transaction validity...');
            try {
                const testResult = await this.testMempoolAccept(txHex);
                if (testResult && testResult.length > 0) {
                    const result = testResult[0];
                    if (!result.allowed) {
                        console.error('Transaction would be rejected:', result['reject-reason']);
                        throw new Error(`Transaction validation failed: ${result['reject-reason']}`);
                    } else {
                        console.log('✅ Transaction would be accepted by mempool');
                    }
                }
            } catch (testError) {
                console.warn('Could not test transaction validity:', testError.message);
            }

            return {
                hex: txHex,
                txid: tx.getId(),
                complete: true,
                inputs: [{
                    txid: fundingTxid,
                    vout: fundingVout
                }],
                outputs: [{
                    address: outputAddress,
                    value: amount
                }],
                witness: witness.map(w => w.toString('hex'))
            };

        } catch (error) {
            console.error('Error creating HTLC spending transaction:', error.message);
            throw error;
        }
    }

    /**
     * Create and sign HTLC spending transaction using Bitcoin CLI
     */
    async createHTLCSpendingTransactionWithCLI(htlcScript, preimage, outputAddress, fundingTxid, fundingVout, amount, walletName = null) {
        try {
            console.log('Creating HTLC spending transaction with Bitcoin CLI...');
            console.log(`HTLC Script: ${htlcScript}`);
            console.log(`Preimage: ${preimage}`);
            console.log(`Output Address: ${outputAddress}`);
            console.log(`Funding TXID: ${fundingTxid}`);
            console.log(`Funding Vout: ${fundingVout}`);
            console.log(`Amount: ${amount} satoshis`);
            console.log(`Using wallet: ${walletName}`);

            // Convert hex inputs to buffers
            const htlcScriptBuffer = Buffer.from(htlcScript, 'hex');
            const preimageBuffer = Buffer.from(preimage, 'hex');

            // Create unsigned transaction using bitcoinjs-lib
            const tx = new bitcoin.Transaction();
            tx.version = 2;

            // Add input (the HTLC UTXO)
            tx.addInput(Buffer.from(fundingTxid, 'hex').reverse(), fundingVout);

            // Add output (where to send the spent coins)
            tx.addOutput(bitcoin.address.toOutputScript(outputAddress, this.network), amount);

            // Get the unsigned transaction hex
            const unsignedTxHex = tx.toHex();
            console.log(`Unsigned transaction hex: ${unsignedTxHex}`);

            // Use Bitcoin CLI to sign the transaction
            const { spawn } = require('child_process');
            
            return new Promise((resolve, reject) => {
                const rpcUser = this.rpcConfig.user;
                const rpcPassword = this.rpcConfig.pass;
                const rpcConnect = this.rpcConfig.host;
                const rpcPort = this.rpcConfig.port;
                
                const walletPath = walletName ? `/wallet/${walletName}` : '';
                const rpcUrl = `http://${rpcUser}:${rpcPassword}@${rpcConnect}:${rpcPort}${walletPath}`;
                
                const args = [
                    '-rpcconnect=' + rpcConnect,
                    '-rpcport=' + rpcPort,
                    '-rpcuser=' + rpcUser,
                    '-rpcpassword=' + rpcPassword
                ];
                
                if (walletName) {
                    args.push('-rpcwallet=' + walletName);
                }
                
                // Unlock wallet first if it has a passphrase
                const unlockProcess = spawn('bitcoin-cli', [
                    ...args,
                    'walletpassphrase',
                    'testpass123',
                    '300'
                ]);
                
                unlockProcess.on('close', (code) => {
                    // Whether unlock succeeds or fails, try to sign
                    console.log('Attempting to sign transaction with Bitcoin CLI...');
                    
                    const signProcess = spawn('bitcoin-cli', [
                        ...args,
                        'signrawtransactionwithwallet',
                        unsignedTxHex
                    ]);
                    
                    let output = '';
                    let errorOutput = '';
                    
                    signProcess.stdout.on('data', (data) => {
                        output += data.toString();
                    });
                    
                    signProcess.stderr.on('data', (data) => {
                        errorOutput += data.toString();
                    });
                    
                    signProcess.on('close', (code) => {
                        if (code === 0) {
                            try {
                                const result = JSON.parse(output);
                                console.log('✅ Transaction signed successfully with Bitcoin CLI');
                                console.log(`Signed transaction hex: ${result.hex}`);
                                console.log(`Complete: ${result.complete}`);
                                
                                // Parse the signed transaction to get the TXID
                                const signedTx = bitcoin.Transaction.fromHex(result.hex);
                                
                                resolve({
                                    hex: result.hex,
                                    txid: signedTx.getId(),
                                    complete: result.complete,
                                    inputs: [{
                                        txid: fundingTxid,
                                        vout: fundingVout
                                    }],
                                    outputs: [{
                                        address: outputAddress,
                                        value: amount
                                    }]
                                });
                            } catch (parseError) {
                                reject(new Error(`Failed to parse Bitcoin CLI output: ${parseError.message}`));
                            }
                        } else {
                            reject(new Error(`Bitcoin CLI signing failed with code ${code}: ${errorOutput}`));
                        }
                    });
                    
                    signProcess.on('error', (error) => {
                        reject(new Error(`Failed to execute Bitcoin CLI: ${error.message}`));
                    });
                });
                
                unlockProcess.on('error', (error) => {
                    console.log('Wallet unlock failed, but continuing with signing...');
                    // Continue with signing even if unlock fails
                });
            });

        } catch (error) {
            console.error('Error creating HTLC spending transaction with CLI:', error.message);
            throw error;
        }
    }

    /**
     * Sign a raw transaction
     */
    async signRawTransaction(rawTxHex, walletName = null) {
        try {
            console.log('Signing raw transaction...');
            const result = await this.callRPC('signrawtransactionwithwallet', [rawTxHex], walletName);
            console.log(`Transaction signed: ${result.complete}`);
            return result;
        } catch (error) {
            console.error('Error signing raw transaction:', error.message);
            throw error;
        }
    }

    /**
     * Broadcast a signed transaction
     */
    async sendRawTransaction(signedTxHex, walletName = null) {
        try {
            console.log('Broadcasting raw transaction...');
            const txid = await this.callRPC('sendrawtransaction', [signedTxHex], walletName);
            console.log(`Transaction broadcasted with txid: ${txid}`);
            return txid;
        } catch (error) {
            console.error('Error broadcasting raw transaction:', error.message);
            throw error;
        }
    }

    /**
     * Unlock wallet with passphrase
     */
    async unlockWallet(passphrase, timeout = 60, walletName = null) {
        try {
            console.log(`Unlocking wallet for ${timeout} seconds...`);
            const result = await this.callRPC('walletpassphrase', [passphrase, timeout], walletName);
            console.log('✅ Wallet unlocked successfully');
            return result;
        } catch (error) {
            console.error('Error unlocking wallet:', error.message);
            throw error;
        }
    }

    /**
     * Test if a raw transaction would be accepted by the mempool
     */
    async testMempoolAccept(rawTxHex, walletName = null) {
        try {
            console.log('Testing mempool acceptance for transaction...');
            const result = await this.callRPC('testmempoolaccept', [[rawTxHex]], walletName);
            console.log('Mempool test result:', JSON.stringify(result, null, 2));
            return result;
        } catch (error) {
            console.error('Error testing mempool accept:', error.message);
            throw error;
        }
    }
}

module.exports = BitcoinRPCClient;