const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Service for managing preimages and hashes for HTLC
 */
class PreimageService {
  constructor() {
    this.preimageCache = new Map(); // In-memory cache for quick access
    this.usedHashes = new Set(); // Track used hashes to prevent collisions
  }

  /**
   * Generate a cryptographically secure preimage and its SHA256 hash
   * @returns {Object} Preimage data with swapId, preimage, and hash
   */
  generatePreimage() {
    try {
      // Generate 32-byte cryptographically secure random preimage
      const preimage = crypto.randomBytes(32);
      const preimageHex = preimage.toString('hex');

      // Create SHA256 hash of preimage
      const hash = crypto.createHash('sha256').update(preimage).digest();
      const hashHex = hash.toString('hex');

      // Generate unique swap ID
      const swapId = uuidv4();

      // Check for hash collision (extremely unlikely but good practice)
      if (this.usedHashes.has(hashHex)) {
        logger.warn('Hash collision detected, regenerating preimage');
        return this.generatePreimage(); // Recursive call to regenerate
      }

      // Add to used hashes set
      this.usedHashes.add(hashHex);

      // Cache the preimage data temporarily
      const preimageData = {
        swapId,
        preimage: preimageHex,
        hash: hashHex,
        hashBuffer: hash,
        preimageBuffer: preimage,
        createdAt: new Date().toISOString()
      };

      this.preimageCache.set(swapId, preimageData);

      logger.info('Generated new preimage', {
        swapId,
        hashPreview: hashHex.substring(0, 16) + '...'
      });

      return preimageData;

    } catch (error) {
      logger.error('Error generating preimage:', error);
      throw new Error('Failed to generate preimage');
    }
  }

  /**
   * Validate preimage against its hash
   * @param {string} preimageHex - Preimage in hex format
   * @param {string} expectedHashHex - Expected hash in hex format
   * @returns {boolean} True if preimage is valid
   */
  validatePreimage(preimageHex, expectedHashHex) {
    try {
      if (!preimageHex || !expectedHashHex) {
        return false;
      }

      // Convert preimage from hex to buffer
      const preimageBuffer = Buffer.from(preimageHex, 'hex');
      
      // Calculate SHA256 hash
      const calculatedHash = crypto.createHash('sha256').update(preimageBuffer).digest('hex');
      
      // Compare with expected hash
      return calculatedHash.toLowerCase() === expectedHashHex.toLowerCase();

    } catch (error) {
      logger.error('Error validating preimage:', error);
      return false;
    }
  }

  /**
   * Get preimage data from cache
   * @param {string} swapId - Swap ID
   * @returns {Object|null} Cached preimage data or null
   */
  getCachedPreimage(swapId) {
    return this.preimageCache.get(swapId) || null;
  }

  /**
   * Remove preimage from cache (for security)
   * @param {string} swapId - Swap ID
   */
  clearCachedPreimage(swapId) {
    const removed = this.preimageCache.delete(swapId);
    if (removed) {
      logger.info('Cleared cached preimage', { swapId });
    }
  }

  /**
   * Generate multiple preimages in batch
   * @param {number} count - Number of preimages to generate
   * @returns {Array} Array of preimage data objects
   */
  generateBatchPreimages(count = 10) {
    if (count > 100) {
      throw new Error('Batch size too large, maximum 100 preimages per batch');
    }

    const preimages = [];
    for (let i = 0; i < count; i++) {
      preimages.push(this.generatePreimage());
    }

    logger.info(`Generated ${count} preimages in batch`);
    return preimages;
  }

  /**
   * Create deterministic hash from string (for testing purposes)
   * @param {string} input - Input string
   * @returns {string} SHA256 hash in hex
   */
  createDeterministicHash(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  /**
   * Verify preimage uniqueness across system
   * @param {string} preimageHex - Preimage to check
   * @returns {boolean} True if preimage is unique
   */
  isPreimageUnique(preimageHex) {
    try {
      const hash = crypto.createHash('sha256').update(Buffer.from(preimageHex, 'hex')).digest('hex');
      return !this.usedHashes.has(hash);
    } catch (error) {
      logger.error('Error checking preimage uniqueness:', error);
      return false;
    }
  }

  /**
   * Clean up expired preimages from cache
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   */
  cleanupExpiredPreimages(maxAgeMs = 3600000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [swapId, data] of this.preimageCache.entries()) {
      const createdAt = new Date(data.createdAt).getTime();
      if (now - createdAt > maxAgeMs) {
        this.preimageCache.delete(swapId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired preimages from cache`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      totalCached: this.preimageCache.size,
      totalHashesUsed: this.usedHashes.size,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Export preimage in various formats for different use cases
   * @param {string} swapId - Swap ID
   * @returns {Object} Preimage in multiple formats
   */
  exportPreimage(swapId) {
    const data = this.preimageCache.get(swapId);
    if (!data) {
      return null;
    }

    return {
      hex: data.preimage,
      buffer: data.preimageBuffer,
      base64: data.preimageBuffer.toString('base64'),
      uint8Array: new Uint8Array(data.preimageBuffer),
      hash: {
        hex: data.hash,
        buffer: data.hashBuffer,
        base64: data.hashBuffer.toString('base64')
      }
    };
  }

  /**
   * Initialize cleanup timer for expired preimages
   */
  startCleanupTimer(intervalMs = 600000) { // 10 minutes
    setInterval(() => {
      this.cleanupExpiredPreimages();
    }, intervalMs);

    logger.info('Started preimage cleanup timer', { intervalMs });
  }
}

module.exports = new PreimageService();
