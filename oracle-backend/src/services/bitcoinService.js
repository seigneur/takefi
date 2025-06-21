const bitcoin = require('bitcoinjs-lib');
const logger = require('../utils/logger');

/**
 * Bitcoin service for HTLC operations and address validation
 */
class BitcoinService {
  constructor() {
    // Set network based on environment
    this.network = process.env.BITCOIN_NETWORK === 'mainnet' 
      ? bitcoin.networks.bitcoin 
      : bitcoin.networks.testnet;
    
    logger.info(`Bitcoin service initialized for ${process.env.BITCOIN_NETWORK || 'testnet'} network`);
  }

  /**
   * Validate Bitcoin address format and extract public key if possible
   * @param {string} address - Bitcoin address to validate
   * @returns {Object} Validation result with isValid flag and details
   */
  validateAddress(address) {
    try {
      // Try to decode the address
      let decoded;
      let addressType;
      let pubkey = null;

      // Check for bech32 (native SegWit)
      if (address.startsWith('bc1') || address.startsWith('tb1')) {
        try {
          decoded = bitcoin.address.fromBech32(address);
          
          // Validate network prefix
          const expectedPrefix = this.network === bitcoin.networks.bitcoin ? 'bc1' : 'tb1';
          if (!address.startsWith(expectedPrefix)) {
            return {
              isValid: false,
              error: `Wrong network: expected ${expectedPrefix} prefix for ${this.network === bitcoin.networks.bitcoin ? 'mainnet' : 'testnet'}`
            };
          }
          
          addressType = 'bech32';
          
          if (decoded.version === 0) {
            if (decoded.data.length === 20) {
              addressType = 'p2wpkh';
            } else if (decoded.data.length === 32) {
              addressType = 'p2wsh';
            }
          } else if (decoded.version === 1 && decoded.data.length === 32) {
            addressType = 'p2tr';
          }
        } catch (error) {
          return {
            isValid: false,
            error: 'Invalid bech32 address format'
          };
        }
      } else {
        // Check for base58 (legacy or P2SH)
        try {
          decoded = bitcoin.address.fromBase58Check(address);
          
          if (decoded.version === this.network.pubKeyHash) {
            addressType = 'p2pkh';
          } else if (decoded.version === this.network.scriptHash) {
            addressType = 'p2sh';
          } else {
            return {
              isValid: false,
              error: 'Invalid address version for network'
            };
          }
        } catch (error) {
          return {
            isValid: false,
            error: 'Invalid base58 address format'
          };
        }
      }

      return {
        isValid: true,
        type: addressType,
        network: this.network === bitcoin.networks.bitcoin ? 'mainnet' : 'testnet',
        pubkey
      };

    } catch (error) {
      logger.error('Address validation error:', error);
      return {
        isValid: false,
        error: 'Address validation failed'
      };
    }
  }

  /**
   * Validate public key format
   * @param {string} pubkeyHex - Public key in hex format
   * @returns {Object} Validation result
   */
  validatePublicKey(pubkeyHex) {
    try {
      if (!pubkeyHex || typeof pubkeyHex !== 'string') {
        return {
          isValid: false,
          error: 'Public key must be a string'
        };
      }

      // Remove any whitespace
      const cleanHex = pubkeyHex.trim();

      // Check if it's valid hex
      if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
        return {
          isValid: false,
          error: 'Public key must be valid hexadecimal'
        };
      }

      // Check length (33 bytes for compressed, 65 bytes for uncompressed)
      if (cleanHex.length !== 66 && cleanHex.length !== 130) {
        return {
          isValid: false,
          error: 'Public key must be 33 bytes (compressed) or 65 bytes (uncompressed)'
        };
      }

      const pubkeyBuffer = Buffer.from(cleanHex, 'hex');

      // Check compression flag for compressed keys
      if (cleanHex.length === 66) {
        const firstByte = pubkeyBuffer[0];
        if (firstByte !== 0x02 && firstByte !== 0x03) {
          return {
            isValid: false,
            error: 'Invalid compression flag for compressed public key'
          };
        }
      }

      // Check for uncompressed keys
      if (cleanHex.length === 130) {
        const firstByte = pubkeyBuffer[0];
        if (firstByte !== 0x04) {
          return {
            isValid: false,
            error: 'Invalid prefix for uncompressed public key'
          };
        }
      }

      // Try to validate the public key mathematically
      try {
        // For bitcoinjs-lib v6+, we'll do basic validation without ECPair
        // Check if it's a valid point on the secp256k1 curve by trying to use it
        // in a payment script
        const payment = cleanHex.length === 66 
          ? bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network: this.network })
          : bitcoin.payments.p2pkh({ pubkey: pubkeyBuffer, network: this.network });
        
        // If we can create a payment, the pubkey is valid
        if (!payment.address) {
          throw new Error('Invalid public key - cannot create address');
        }
      } catch (error) {
        return {
          isValid: false,
          error: 'Public key is not a valid secp256k1 point'
        };
      }

      return {
        isValid: true,
        compressed: cleanHex.length === 66,
        length: pubkeyBuffer.length
      };

    } catch (error) {
      logger.error('Public key validation error:', error);
      return {
        isValid: false,
        error: 'Public key validation failed'
      };
    }
  }

  /**
   * Create HTLC script with hash, market maker pubkey, user pubkey, and timelock
   * @param {Object} params - HTLC parameters
   * @param {Buffer} params.hash - SHA256 hash of preimage
   * @param {Buffer} params.mmPubkey - Market maker public key
   * @param {Buffer} params.userPubkey - User public key (optional, can be null for P2SH)
   * @param {number} params.timelock - Timelock in blocks
   * @returns {Object} HTLC script and address
   */
  createHTLCScript({ hash, mmPubkey, userPubkey, timelock }) {
    try {
      // Encode timelock as minimal push
      const timelockBuffer = this.encodeNumber(timelock);

      let redeemScript;

      if (userPubkey) {
        // Full HTLC with user fallback
        redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_IF,
            bitcoin.opcodes.OP_SHA256,
            hash,
            bitcoin.opcodes.OP_EQUALVERIFY,
            mmPubkey,
            bitcoin.opcodes.OP_CHECKSIG,
          bitcoin.opcodes.OP_ELSE,
            timelockBuffer,
            bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
            bitcoin.opcodes.OP_DROP,
            userPubkey,
            bitcoin.opcodes.OP_CHECKSIG,
          bitcoin.opcodes.OP_ENDIF,
        ]);
      } else {
        // Simplified HTLC without user fallback (for cases where we only have address)
        redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_SHA256,
          hash,
          bitcoin.opcodes.OP_EQUALVERIFY,
          mmPubkey,
          bitcoin.opcodes.OP_CHECKSIG,
        ]);
      }

      // Create P2SH address for the script
      const payment = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
        network: this.network
      });

      // Also create P2WSH (SegWit) version
      const segwitPayment = bitcoin.payments.p2wsh({
        redeem: { output: redeemScript },
        network: this.network
      });

      return {
        script: redeemScript,
        address: payment.address,
        scriptHash: payment.hash,
        segwitAddress: segwitPayment.address,
        segwitScriptHash: segwitPayment.hash,
        redeemScript: redeemScript.toString('hex')
      };

    } catch (error) {
      logger.error('HTLC script creation error:', error);
      throw new Error('Failed to create HTLC script');
    }
  }

  /**
   * Encode number for Bitcoin script (minimal push)
   * @param {number} num - Number to encode
   * @returns {Buffer} Encoded number
   */
  encodeNumber(num) {
    if (num === 0) return Buffer.alloc(0);
    
    const buffer = [];
    let n = Math.abs(num);
    
    while (n > 0) {
      buffer.push(n & 0xff);
      n >>= 8;
    }
    
    // If the most significant bit is set, add a padding byte
    if (buffer[buffer.length - 1] & 0x80) {
      buffer.push(num < 0 ? 0x80 : 0x00);
    } else if (num < 0) {
      buffer[buffer.length - 1] |= 0x80;
    }
    
    return Buffer.from(buffer);
  }

  /**
   * Create a spending transaction for HTLC (for testing purposes)
   * @param {Object} params - Spending parameters
   * @returns {Object} Transaction details
   */
  createHTLCSpendingTx({ utxo, redeemScript, preimage, privateKey, outputAddress, fee = 1000 }) {
    try {
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Add input
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: utxo.scriptPubKey,
          value: utxo.value,
        },
        redeemScript: Buffer.from(redeemScript, 'hex')
      });

      // Add output
      psbt.addOutput({
        address: outputAddress,
        value: utxo.value - fee,
      });

      // Sign the transaction
      const keyPair = bitcoin.ECPair.fromWIF(privateKey, this.network);
      psbt.signInput(0, keyPair);

      // Finalize with preimage
      psbt.finalizeInput(0, (inputIndex, input) => {
        const signature = input.partialSig[0].signature;
        const preimageBuffer = Buffer.from(preimage, 'hex');
        
        return {
          finalScriptSig: bitcoin.script.compile([
            signature,
            preimageBuffer,
            bitcoin.opcodes.OP_TRUE, // Take the IF branch
            input.redeemScript
          ])
        };
      });

      return {
        hex: psbt.extractTransaction().toHex(),
        txid: psbt.extractTransaction().getId()
      };

    } catch (error) {
      logger.error('HTLC spending transaction creation error:', error);
      throw new Error('Failed to create HTLC spending transaction');
    }
  }

  /**
   * Get current Bitcoin network info
   * @returns {Object} Network information
   */
  getNetworkInfo() {
    return {
      name: this.network === bitcoin.networks.bitcoin ? 'mainnet' : 'testnet',
      network: this.network,
      addressPrefixes: {
        p2pkh: this.network.pubKeyHash,
        p2sh: this.network.scriptHash,
        bech32: this.network.bech32
      }
    };
  }
}

module.exports = new BitcoinService();
