const bitcoin = require('bitcoinjs-lib');
const ECPair = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const crypto = require('crypto');

// Initialize ECPair with tiny-secp256k1
const ECPairFactory = ECPair.ECPairFactory(tinysecp);
// Initialize bitcoinjs-lib with tiny-secp256k1
bitcoin.initEccLib(tinysecp);

const NETWORK = bitcoin.networks.regtest;

class SimpleBitcoinWallet {
    constructor() {
        this.wallets = {};
    }

    /**
     * Create a new wallet with a random private key
     */
    createWallet(name) {
        // Generate a random private key
        const keyPair = ECPairFactory.makeRandom({ network: NETWORK });
        const privateKey = keyPair.toWIF();
        const publicKey = keyPair.publicKey;
        const publicKeyHex = Buffer.from(publicKey).toString('hex');

        // Create a simple P2WPKH address
        let bech32Address;
        try {
            const { address } = bitcoin.payments.p2wpkh({ 
                pubkey: publicKey, 
                network: NETWORK 
            });
            bech32Address = address;
        } catch (error) {
            console.error('Error creating bech32 address:', error.message);
            // Fallback to creating address manually
            const pubkeyHash = bitcoin.crypto.hash160(publicKey);
            bech32Address = bitcoin.address.toBech32(pubkeyHash, 0, NETWORK.bech32);
        }

        const wallet = {
            name,
            keyPair,
            privateKey,
            publicKey: publicKeyHex,
            address: bech32Address
        };

        this.wallets[name] = wallet;
        return wallet;
    }

    /**
     * Get wallet by name
     */
    getWallet(name) {
        return this.wallets[name];
    }

    /**
     * Generate preimage and hash
     */
    generatePreimage() {
        const preimage = crypto.randomBytes(32);
        const hash = crypto.createHash('sha256').update(preimage).digest();
        
        return {
            preimage: preimage.toString('hex'),
            hash: hash.toString('hex')
        };
    }

    /**
     * Create HTLC script
     */
    createHTLCScript(hash, mmPubkey, userPubkey, timelock) {
        // Encode timelock as minimal push
        const timelockBuffer = this.encodeNumber(timelock);
        
        const script = bitcoin.script.compile([
            bitcoin.opcodes.OP_IF,
                bitcoin.opcodes.OP_SHA256,
                Buffer.from(hash, 'hex'),
                bitcoin.opcodes.OP_EQUALVERIFY,
                Buffer.from(mmPubkey, 'hex'),
                bitcoin.opcodes.OP_CHECKSIG,
            bitcoin.opcodes.OP_ELSE,
                timelockBuffer,
                bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
                bitcoin.opcodes.OP_DROP,
                Buffer.from(userPubkey, 'hex'),
                bitcoin.opcodes.OP_CHECKSIG,
            bitcoin.opcodes.OP_ENDIF,
        ]);

        return script;
    }

    /**
     * Create P2WSH address from script
     */
    createP2WSHAddress(script) {
        const scriptHash = bitcoin.crypto.sha256(script);
        const address = bitcoin.address.toBech32(scriptHash, 0, NETWORK.bech32);
        return {
            address,
            script,
            scriptHash: scriptHash.toString('hex')
        };
    }

    /**
     * Encode number for Bitcoin script
     */
    encodeNumber(num) {
        if (num === 0) return Buffer.alloc(0);
        
        const buffer = [];
        while (num > 0) {
            buffer.push(num & 0xff);
            num >>= 8;
        }
        
        // Add 0x00 byte if most significant bit is set to prevent negative interpretation
        if (buffer[buffer.length - 1] & 0x80) {
            buffer.push(0x00);
        }
        
        return Buffer.from(buffer);
    }

    /**
     * Display wallet information
     */
    displayWallet(name) {
        const wallet = this.getWallet(name);
        if (!wallet) {
            console.log(`Wallet '${name}' not found`);
            return;
        }

        console.log(`\n=== ${wallet.name.toUpperCase()} WALLET ===`);
        console.log(`Private Key (WIF): ${wallet.privateKey}`);
        console.log(`Public Key (hex): ${wallet.publicKey}`);
        console.log(`Bech32 Address: ${wallet.address}`);
    }

    /**
     * Create a funding transaction (simulated UTXO)
     */
    createFundingTransaction(toAddress, amount) {
        // Create a dummy funding transaction
        const tx = new bitcoin.Transaction();
        
        // Add a dummy input (in real scenario, this would be from a real UTXO)
        tx.addInput(Buffer.alloc(32), 0);
        
        // Add output to the HTLC address
        const amountSatoshis = Math.round(amount * 100000000);
        const outputScript = bitcoin.address.toOutputScript(toAddress, NETWORK);
        tx.addOutput(outputScript, amountSatoshis);
        
        return {
            txid: tx.getId(),
            vout: 0,
            amount: amount,
            hex: tx.toHex()
        };
    }

    /**
     * Create spending transaction
     */
    createSpendingTransaction(utxo, toAddress, amount, fee = 0.001) {
        const tx = new bitcoin.Transaction();
        
        // Add input
        tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout);
        
        // Add output
        const outputAmount = Math.round((amount - fee) * 100000000);
        const outputScript = bitcoin.address.toOutputScript(toAddress, NETWORK);
        tx.addOutput(outputScript, outputAmount);
        
        return tx;
    }

    /**
     * Sign HTLC transaction (preimage path)
     */
    signHTLCTransactionPreimage(tx, utxo, htlcScript, mmKeyPair, preimage) {
        try {
            const utxoValue = Math.round(utxo.amount * 100000000);
            const hashType = bitcoin.Transaction.SIGHASH_ALL;
            
            // Create signature hash
            const signatureHash = tx.hashForWitnessV0(0, htlcScript, utxoValue, hashType);
            
            // Sign with MM's private key
            const signature = mmKeyPair.sign(signatureHash);
            
            // Convert signature to DER format
            let signatureDER;
            if (typeof signature.toDER === 'function') {
                signatureDER = signature.toDER();
            } else if (Buffer.isBuffer(signature)) {
                signatureDER = signature;
            } else {
                // Handle different signature formats
                signatureDER = Buffer.from(signature);
            }
            
            const signatureWithHashType = Buffer.concat([
                signatureDER,
                Buffer.from([hashType])
            ]);
            
            // Create witness stack: [signature] [preimage] [1] [script]
            const witnessStack = [
                signatureWithHashType,
                Buffer.from(preimage, 'hex'),
                Buffer.from([0x01]), // TRUE for IF branch
                htlcScript
            ];
            
            // Set witness
            tx.setWitness(0, witnessStack);
            
            return tx;
        } catch (error) {
            console.error('Error signing HTLC transaction:', error);
            throw error;
        }
    }
}

// Demo function
async function demonstrateSimpleHTLC() {
    console.log('=== Simple Bitcoin HTLC Demonstration ===\n');
    
    const wallet = new SimpleBitcoinWallet();
    
    try {
        // Step 1: Create wallets
        console.log('Step 1: Creating wallets...');
        const userWallet = wallet.createWallet('user');
        const mmWallet = wallet.createWallet('marketmaker');
        
        wallet.displayWallet('user');
        wallet.displayWallet('marketmaker');
        
        // Step 2: Generate preimage and hash
        console.log('\nStep 2: Generating preimage and hash...');
        const { preimage, hash } = wallet.generatePreimage();
        console.log(`Preimage: ${preimage}`);
        console.log(`Hash: ${hash}`);
        
        // Step 3: Create HTLC script
        console.log('\nStep 3: Creating HTLC script...');
        const timelock = 144; // ~24 hours
        const htlcScript = wallet.createHTLCScript(
            hash,
            mmWallet.publicKey,
            userWallet.publicKey,
            timelock
        );
        console.log(`HTLC Script (hex): ${htlcScript.toString('hex')}`);
        
        // Step 4: Create P2WSH address
        console.log('\nStep 4: Creating P2WSH address...');
        const p2wsh = wallet.createP2WSHAddress(htlcScript);
        console.log(`HTLC Address: ${p2wsh.address}`);
        
        // Step 5: Create funding transaction (simulated)
        console.log('\nStep 5: Creating funding transaction...');
        const fundingAmount = 0.5; // 0.5 BTC
        const fundingTx = wallet.createFundingTransaction(p2wsh.address, fundingAmount);
        console.log(`Funding TXID: ${fundingTx.txid}`);
        console.log(`Funding Amount: ${fundingTx.amount} BTC`);
        
        // Step 6: Create spending transaction (MM claims with preimage)
        console.log('\nStep 6: Creating spending transaction (MM with preimage)...');
        const spendingTx = wallet.createSpendingTransaction(
            fundingTx,
            mmWallet.address,
            fundingAmount,
            0.001
        );
        
        // Step 7: Sign the spending transaction
        console.log('\nStep 7: Signing spending transaction...');
        const signedTx = wallet.signHTLCTransactionPreimage(
            spendingTx,
            fundingTx,
            htlcScript,
            mmWallet.keyPair,
            preimage
        );
        
        console.log(`Signed Transaction: ${signedTx.toHex()}`);
        console.log(`Transaction ID: ${signedTx.getId()}`);
        
        // Step 8: Verify preimage is revealed
        console.log('\nStep 8: Verifying preimage revelation...');
        const witness = signedTx.ins[0].witness;
        const revealedPreimage = witness[1].toString('hex');
        const revealedHash = crypto.createHash('sha256').update(witness[1]).digest('hex');
        
        console.log(`Revealed Preimage: ${revealedPreimage}`);
        console.log(`Revealed Hash: ${revealedHash}`);
        console.log(`Hash Match: ${revealedHash === hash}`);
        console.log(`Preimage Match: ${revealedPreimage === preimage}`);
        
        console.log('\n=== Demo completed successfully! ===');
        
        return {
            userWallet,
            mmWallet,
            preimage,
            hash,
            htlcScript: htlcScript.toString('hex'),
            htlcAddress: p2wsh.address,
            signedTx: signedTx.toHex()
        };
        
    } catch (error) {
        console.error('Demo failed:', error);
        throw error;
    }
}

// Export for use in other scripts
module.exports = SimpleBitcoinWallet;

// Run demo if called directly
if (require.main === module) {
    demonstrateSimpleHTLC()
        .then(result => {
            console.log('\n=== Data for Oracle Backend Testing ===');
            console.log(`User Address: ${result.userWallet.address}`);
            console.log(`MM Public Key: ${result.mmWallet.publicKey}`);
            console.log(`Preimage: ${result.preimage}`);
            console.log(`Hash: ${result.hash}`);
            console.log(`HTLC Script: ${result.htlcScript}`);
            console.log(`HTLC Address: ${result.htlcAddress}`);
        })
        .catch(error => {
            console.error('Demo failed:', error);
        });
}
