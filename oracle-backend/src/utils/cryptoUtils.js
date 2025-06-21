const crypto = require('crypto');
const logger = require('./logger');

/**
 * Cryptographic utilities for Bitcoin operations
 */
class CryptoUtils {
  /**
   * Generate cryptographically secure random bytes
   * @param {number} length - Number of bytes to generate
   * @returns {Buffer} Random bytes
   */
  static generateRandomBytes(length = 32) {
    try {
      return crypto.randomBytes(length);
    } catch (error) {
      logger.error('Error generating random bytes:', error);
      throw new Error('Failed to generate random bytes');
    }
  }

  /**
   * Create SHA256 hash
   * @param {Buffer|string} data - Data to hash
   * @returns {Buffer} SHA256 hash
   */
  static sha256(data) {
    try {
      const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      return crypto.createHash('sha256').update(input).digest();
    } catch (error) {
      logger.error('Error creating SHA256 hash:', error);
      throw new Error('Failed to create SHA256 hash');
    }
  }

  /**
   * Create double SHA256 hash (Bitcoin standard)
   * @param {Buffer|string} data - Data to hash
   * @returns {Buffer} Double SHA256 hash
   */
  static doubleSha256(data) {
    try {
      const firstHash = this.sha256(data);
      return this.sha256(firstHash);
    } catch (error) {
      logger.error('Error creating double SHA256 hash:', error);
      throw new Error('Failed to create double SHA256 hash');
    }
  }

  /**
   * Create RIPEMD160 hash
   * @param {Buffer|string} data - Data to hash
   * @returns {Buffer} RIPEMD160 hash
   */
  static ripemd160(data) {
    try {
      const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      return crypto.createHash('ripemd160').update(input).digest();
    } catch (error) {
      logger.error('Error creating RIPEMD160 hash:', error);
      throw new Error('Failed to create RIPEMD160 hash');
    }
  }

  /**
   * Create Bitcoin address hash (SHA256 + RIPEMD160)
   * @param {Buffer} publicKey - Public key buffer
   * @returns {Buffer} Hash160 result
   */
  static hash160(publicKey) {
    try {
      const sha256Hash = this.sha256(publicKey);
      return this.ripemd160(sha256Hash);
    } catch (error) {
      logger.error('Error creating hash160:', error);
      throw new Error('Failed to create hash160');
    }
  }

  /**
   * Generate secure random hex string
   * @param {number} byteLength - Length in bytes
   * @returns {string} Hex string
   */
  static generateRandomHex(byteLength = 32) {
    try {
      return this.generateRandomBytes(byteLength).toString('hex');
    } catch (error) {
      logger.error('Error generating random hex:', error);
      throw new Error('Failed to generate random hex');
    }
  }

  /**
   * Validate hex string format
   * @param {string} hexString - Hex string to validate
   * @param {number} expectedLength - Expected length in bytes (optional)
   * @returns {boolean} True if valid hex
   */
  static isValidHex(hexString, expectedLength = null) {
    try {
      if (typeof hexString !== 'string') return false;
      
      // Check if it's valid hex
      const hexRegex = /^[0-9a-fA-F]+$/;
      if (!hexRegex.test(hexString)) return false;
      
      // Check length if specified
      if (expectedLength !== null) {
        return hexString.length === expectedLength * 2;
      }
      
      // Must be even length
      return hexString.length % 2 === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert hex string to buffer with validation
   * @param {string} hexString - Hex string
   * @returns {Buffer} Buffer representation
   */
  static hexToBuffer(hexString) {
    try {
      if (!this.isValidHex(hexString)) {
        throw new Error('Invalid hex string format');
      }
      return Buffer.from(hexString, 'hex');
    } catch (error) {
      logger.error('Error converting hex to buffer:', error);
      throw new Error('Failed to convert hex to buffer');
    }
  }

  /**
   * Secure comparison of two buffers (timing attack resistant)
   * @param {Buffer} a - First buffer
   * @param {Buffer} b - Second buffer
   * @returns {boolean} True if buffers are equal
   */
  static secureCompare(a, b) {
    try {
      if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
        return false;
      }
      
      if (a.length !== b.length) {
        return false;
      }
      
      return crypto.timingSafeEqual(a, b);
    } catch (error) {
      logger.error('Error in secure comparison:', error);
      return false;
    }
  }

  /**
   * Generate HMAC-SHA256
   * @param {Buffer|string} key - HMAC key
   * @param {Buffer|string} data - Data to authenticate
   * @returns {Buffer} HMAC result
   */
  static hmacSha256(key, data) {
    try {
      const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8');
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      
      return crypto.createHmac('sha256', keyBuffer).update(dataBuffer).digest();
    } catch (error) {
      logger.error('Error creating HMAC-SHA256:', error);
      throw new Error('Failed to create HMAC-SHA256');
    }
  }

  /**
   * Derive key using PBKDF2
   * @param {string} password - Password
   * @param {Buffer} salt - Salt
   * @param {number} iterations - Number of iterations
   * @param {number} keyLength - Desired key length in bytes
   * @returns {Promise<Buffer>} Derived key
   */
  static async deriveKeyPBKDF2(password, salt, iterations = 100000, keyLength = 32) {
    try {
      return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, keyLength, 'sha256', (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey);
          }
        });
      });
    } catch (error) {
      logger.error('Error deriving key with PBKDF2:', error);
      throw new Error('Failed to derive key with PBKDF2');
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {Buffer|string} data - Data to encrypt
   * @param {Buffer} key - Encryption key (32 bytes)
   * @returns {Object} Encrypted data with IV and auth tag
   */
  static encryptAES256GCM(data, key) {
    try {
      if (key.length !== 32) {
        throw new Error('Key must be 32 bytes for AES-256');
      }

      const iv = crypto.randomBytes(12); // 96-bit IV for GCM
      const cipher = crypto.createCipher('aes-256-gcm', key);
      cipher.setAAD(Buffer.from('bitcoin-oracle', 'utf8')); // Additional authenticated data

      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      
      let encrypted = cipher.update(dataBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.error('Error encrypting with AES-256-GCM:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {Object} encryptedData - Encrypted data object
   * @param {Buffer} key - Decryption key (32 bytes)
   * @returns {Buffer} Decrypted data
   */
  static decryptAES256GCM(encryptedData, key) {
    try {
      if (key.length !== 32) {
        throw new Error('Key must be 32 bytes for AES-256');
      }

      const { encrypted, iv, authTag } = encryptedData;
      
      const decipher = crypto.createDecipher('aes-256-gcm', key);
      decipher.setAAD(Buffer.from('bitcoin-oracle', 'utf8'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
    } catch (error) {
      logger.error('Error decrypting with AES-256-GCM:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate Bitcoin script number encoding
   * @param {number} num - Number to encode
   * @returns {Buffer} Encoded number for Bitcoin script
   */
  static encodeScriptNumber(num) {
    try {
      if (num === 0) return Buffer.alloc(0);
      
      const negative = num < 0;
      const absNum = Math.abs(num);
      
      const bytes = [];
      let n = absNum;
      
      while (n > 0) {
        bytes.push(n & 0xff);
        n >>>= 8;
      }
      
      // If the most significant bit is set, add a padding byte
      if (bytes[bytes.length - 1] & 0x80) {
        bytes.push(negative ? 0x80 : 0x00);
      } else if (negative) {
        bytes[bytes.length - 1] |= 0x80;
      }
      
      return Buffer.from(bytes);
    } catch (error) {
      logger.error('Error encoding script number:', error);
      throw new Error('Failed to encode script number');
    }
  }

  /**
   * Generate checksum for data validation
   * @param {Buffer|string} data - Data to checksum
   * @returns {string} Checksum (first 8 chars of SHA256)
   */
  static generateChecksum(data) {
    try {
      const hash = this.sha256(data);
      return hash.toString('hex').substring(0, 8);
    } catch (error) {
      logger.error('Error generating checksum:', error);
      throw new Error('Failed to generate checksum');
    }
  }

  /**
   * Validate checksum
   * @param {Buffer|string} data - Original data
   * @param {string} expectedChecksum - Expected checksum
   * @returns {boolean} True if checksum is valid
   */
  static validateChecksum(data, expectedChecksum) {
    try {
      const actualChecksum = this.generateChecksum(data);
      return actualChecksum === expectedChecksum.toLowerCase();
    } catch (error) {
      logger.error('Error validating checksum:', error);
      return false;
    }
  }
}

module.exports = CryptoUtils;
