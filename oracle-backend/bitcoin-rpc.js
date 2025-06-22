// Bitcoin RPC client for regtest interaction
const bitcoin = require('bitcoinjs-lib');
const https = require('https');
const http = require('http');

class BitcoinRPCClient {
    constructor(options = {}) {
        // Default configuration for Bitcoin Core regtest
        this.rpcConfig = {
            protocol: options.protocol || 'http',
            user: options.user || 'devuser',
            pass: options.pass || 'devpass',
            host: options.host || '172.30.112.1',
            port: options.port || 18443, // regtest default port
        };

        this.currentWallet = null; // Track current wallet
    }

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
    async createWallet(walletName, descriptors = false, disablePrivateKeys = false) {
        try {
            console.log(`Attempting to create wallet: ${walletName}`);
            const result = await this.callRPC('createwallet', [walletName, disablePrivateKeys, false, '', false, descriptors]);
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
}

module.exports = BitcoinRPCClient;