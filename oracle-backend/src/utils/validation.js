const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validation schemas for Bitcoin oracle API
 */
const schemas = {
  createPreimage: Joi.object({
    userBtcAddress: Joi.string()
      .trim()
      .min(26)
      .max(62)
      .pattern(/^[13bc1][a-km-zA-HJ-NP-Z1-9]{25,87}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid Bitcoin address format',
        'any.required': 'Bitcoin address is required'
      }),
    
    mmPubkey: Joi.string()
      .trim()
      .length(66)
      .pattern(/^[0-9a-fA-F]{66}$/)
      .required()
      .messages({
        'string.length': 'Public key must be exactly 66 hex characters (33 bytes)',
        'string.pattern.base': 'Public key must be valid hexadecimal',
        'any.required': 'Market maker public key is required'
      }),
    
    btcAmount: Joi.number()
      .integer()
      .min(1)
      .max(parseInt(process.env.MAX_BTC_AMOUNT) || 100000000)
      .required()
      .messages({
        'number.min': 'BTC amount must be at least 1 satoshi',
        'number.max': `BTC amount cannot exceed ${process.env.MAX_BTC_AMOUNT || 100000000} satoshis`,
        'any.required': 'BTC amount is required'
      }),
    
    timelock: Joi.number()
      .integer()
      .min(1)
      .max(65535)
      .default(parseInt(process.env.DEFAULT_TIMELOCK) || 144)
      .messages({
        'number.min': 'Timelock must be at least 1 block',
        'number.max': 'Timelock cannot exceed 65535 blocks'
      })
  }),

  swapId: Joi.string()
    .guid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Swap ID must be a valid UUID v4',
      'any.required': 'Swap ID is required'
    }),

  revealPreimage: Joi.object({
    authToken: Joi.string()
      .trim()
      .min(10)
      .required()
      .messages({
        'string.min': 'Authentication token must be at least 10 characters',
        'any.required': 'Authentication token is required'
      }),
    
    ethTxHash: Joi.string()
      .trim()
      .length(66)
      .pattern(/^0x[0-9a-fA-F]{64}$/)
      .optional()
      .messages({
        'string.length': 'Ethereum transaction hash must be 66 characters',
        'string.pattern.base': 'Invalid Ethereum transaction hash format'
      }),
    
    confirmations: Joi.number()
      .integer()
      .min(0)
      .max(1000)
      .optional()
      .messages({
        'number.min': 'Confirmations cannot be negative',
        'number.max': 'Confirmations cannot exceed 1000'
      })
  })
};

/**
 * Custom validation functions
 */
const customValidators = {
  /**
   * Validate Bitcoin address format and network
   * @param {string} address - Bitcoin address
   * @param {string} expectedNetwork - Expected network (mainnet/testnet)
   * @returns {Object} Validation result
   */
  validateBitcoinAddress(address, expectedNetwork = 'testnet') {
    try {
      // Basic format validation
      if (!address || typeof address !== 'string') {
        return {
          isValid: false,
          error: 'Address must be a string'
        };
      }

      const trimmedAddress = address.trim();

      // Network-specific validation
      if (expectedNetwork === 'mainnet') {
        // Mainnet addresses
        if (trimmedAddress.startsWith('bc1') || // Bech32
            trimmedAddress.startsWith('1') ||   // P2PKH
            trimmedAddress.startsWith('3')) {   // P2SH
          return { isValid: true, network: 'mainnet' };
        }
      } else {
        // Testnet addresses
        if (trimmedAddress.startsWith('tb1') || // Bech32 testnet
            trimmedAddress.startsWith('m') ||   // P2PKH testnet
            trimmedAddress.startsWith('n') ||   // P2PKH testnet
            trimmedAddress.startsWith('2')) {   // P2SH testnet
          return { isValid: true, network: 'testnet' };
        }
      }

      return {
        isValid: false,
        error: `Address format not valid for ${expectedNetwork} network`
      };

    } catch (error) {
      logger.error('Bitcoin address validation error:', error);
      return {
        isValid: false,
        error: 'Address validation failed'
      };
    }
  },

  /**
   * Validate public key format and compression
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

      const cleanPubkey = pubkeyHex.trim();

      // Check hex format
      if (!/^[0-9a-fA-F]+$/.test(cleanPubkey)) {
        return {
          isValid: false,
          error: 'Public key must be valid hexadecimal'
        };
      }

      // Check length (33 bytes compressed or 65 bytes uncompressed)
      if (cleanPubkey.length !== 66 && cleanPubkey.length !== 130) {
        return {
          isValid: false,
          error: 'Public key must be 33 bytes (compressed) or 65 bytes (uncompressed)'
        };
      }

      // Check compression prefix for compressed keys
      if (cleanPubkey.length === 66) {
        const prefix = cleanPubkey.substring(0, 2);
        if (prefix !== '02' && prefix !== '03') {
          return {
            isValid: false,
            error: 'Compressed public key must start with 02 or 03'
          };
        }
        return { isValid: true, compressed: true };
      }

      // Check prefix for uncompressed keys
      if (cleanPubkey.length === 130) {
        const prefix = cleanPubkey.substring(0, 2);
        if (prefix !== '04') {
          return {
            isValid: false,
            error: 'Uncompressed public key must start with 04'
          };
        }
        return { isValid: true, compressed: false };
      }

      return { isValid: true };

    } catch (error) {
      logger.error('Public key validation error:', error);
      return {
        isValid: false,
        error: 'Public key validation failed'
      };
    }
  },

  /**
   * Validate BTC amount is within reasonable bounds
   * @param {number} amount - Amount in satoshis
   * @returns {Object} Validation result
   */
  validateBtcAmount(amount) {
    try {
      const maxAmount = parseInt(process.env.MAX_BTC_AMOUNT) || 100000000; // 1 BTC default
      const minAmount = 1; // 1 satoshi minimum

      if (!Number.isInteger(amount)) {
        return {
          isValid: false,
          error: 'BTC amount must be an integer (satoshis)'
        };
      }

      if (amount < minAmount) {
        return {
          isValid: false,
          error: `BTC amount must be at least ${minAmount} satoshis`
        };
      }

      if (amount > maxAmount) {
        return {
          isValid: false,
          error: `BTC amount cannot exceed ${maxAmount} satoshis`
        };
      }

      return { isValid: true };

    } catch (error) {
      logger.error('BTC amount validation error:', error);
      return {
        isValid: false,
        error: 'BTC amount validation failed'
      };
    }
  },

  /**
   * Validate timelock value
   * @param {number} timelock - Timelock in blocks
   * @returns {Object} Validation result
   */
  validateTimelock(timelock) {
    try {
      if (!Number.isInteger(timelock)) {
        return {
          isValid: false,
          error: 'Timelock must be an integer'
        };
      }

      if (timelock < 1) {
        return {
          isValid: false,
          error: 'Timelock must be at least 1 block'
        };
      }

      if (timelock > 65535) {
        return {
          isValid: false,
          error: 'Timelock cannot exceed 65535 blocks'
        };
      }

      // Warn about very short timelocks (less than 6 blocks ~ 1 hour)
      if (timelock < 6) {
        logger.warn('Short timelock detected', { timelock });
      }

      // Warn about very long timelocks (more than 4320 blocks ~ 30 days)
      if (timelock > 4320) {
        logger.warn('Long timelock detected', { timelock });
      }

      return { isValid: true };

    } catch (error) {
      logger.error('Timelock validation error:', error);
      return {
        isValid: false,
        error: 'Timelock validation failed'
      };
    }
  }
};

/**
 * Sanitization functions
 */
const sanitizers = {
  /**
   * Sanitize and normalize Bitcoin address
   * @param {string} address - Bitcoin address
   * @returns {string} Sanitized address
   */
  sanitizeAddress(address) {
    if (!address || typeof address !== 'string') {
      return '';
    }
    
    return address.trim().toLowerCase();
  },

  /**
   * Sanitize public key hex string
   * @param {string} pubkey - Public key hex
   * @returns {string} Sanitized public key
   */
  sanitizePubkey(pubkey) {
    if (!pubkey || typeof pubkey !== 'string') {
      return '';
    }
    
    return pubkey.trim().toLowerCase();
  },

  /**
   * Sanitize numeric input
   * @param {any} value - Numeric value
   * @returns {number|null} Sanitized number or null
   */
  sanitizeNumber(value) {
    const num = parseInt(value, 10);
    return Number.isInteger(num) ? num : null;
  }
};

module.exports = {
  schemas,
  customValidators,
  sanitizers
};
