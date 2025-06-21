const { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, UpdateSecretCommand, DescribeSecretCommand } = require('@aws-sdk/client-secrets-manager');
const logger = require('../utils/logger');

/**
 * AWS Secrets Manager service for secure preimage storage
 */
class AWSSecretsService {
  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
      // Credentials will be automatically picked up from:
      // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
      // 2. IAM roles (for EC2/ECS)
      // 3. AWS profile (~/.aws/credentials)
    });

    this.secretPrefix = process.env.AWS_SECRETS_PREFIX || 'btc-oracle/';
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 5000   // 5 seconds
    };

    logger.info('AWS Secrets Manager service initialized', {
      region: process.env.AWS_REGION || 'us-east-1',
      prefix: this.secretPrefix
    });
  }

  /**
   * Store swap secret in AWS Secrets Manager
   * @param {string} swapId - Unique swap identifier
   * @param {Object} swapData - Complete swap data including preimage
   * @returns {Promise<Object>} Storage result
   */
  async storeSwapSecret(swapId, swapData) {
    const secretName = `${this.secretPrefix}${swapId}`;
    
    try {
      // Prepare secret value with metadata
      const secretValue = {
        ...swapData,
        version: '1.0',
        storedAt: new Date().toISOString()
      };

      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify(secretValue),
        Description: `Bitcoin HTLC swap preimage for swap ${swapId}`,
        Tags: [
          {
            Key: 'SwapId',
            Value: swapId
          },
          {
            Key: 'Service',
            Value: 'bitcoin-oracle'
          },
          {
            Key: 'Environment',
            Value: process.env.NODE_ENV || 'development'
          },
          {
            Key: 'CreatedAt',
            Value: new Date().toISOString()
          }
        ]
      });

      const result = await this.executeWithRetry(() => this.client.send(command));

      logger.info('Successfully stored swap secret', {
        swapId,
        secretArn: result.ARN,
        versionId: result.VersionId
      });

      return {
        success: true,
        secretArn: result.ARN,
        versionId: result.VersionId
      };

    } catch (error) {
      logger.error('Error storing swap secret:', {
        swapId,
        error: error.message,
        code: error.name
      });
      
      // Don't expose internal AWS errors
      throw new Error('Failed to store swap data securely');
    }
  }

  /**
   * Retrieve swap secret from AWS Secrets Manager
   * @param {string} swapId - Swap identifier
   * @returns {Promise<Object|null>} Swap data or null if not found
   */
  async getSwapSecret(swapId) {
    const secretName = `${this.secretPrefix}${swapId}`;
    
    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName
      });

      const result = await this.executeWithRetry(() => this.client.send(command));
      
      if (!result.SecretString) {
        logger.warn('Secret found but no string value', { swapId });
        return null;
      }

      const swapData = JSON.parse(result.SecretString);

      logger.info('Successfully retrieved swap secret', {
        swapId,
        versionId: result.VersionId
      });

      return swapData;

    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        logger.info('Swap secret not found', { swapId });
        return null;
      }

      logger.error('Error retrieving swap secret:', {
        swapId,
        error: error.message,
        code: error.name
      });
      
      throw new Error('Failed to retrieve swap data');
    }
  }

  /**
   * Update swap status in AWS Secrets Manager
   * @param {string} swapId - Swap identifier
   * @param {string} newStatus - New status (active, used, expired)
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Object>} Update result
   */
  async updateSwapStatus(swapId, newStatus, additionalData = {}) {
    const secretName = `${this.secretPrefix}${swapId}`;
    
    try {
      // First, get the current secret
      const currentData = await this.getSwapSecret(swapId);
      
      if (!currentData) {
        throw new Error('Swap not found');
      }

      // Update the data
      const updatedData = {
        ...currentData,
        status: newStatus,
        lastUpdated: new Date().toISOString(),
        ...additionalData
      };

      // If status is 'used', add usage timestamp
      if (newStatus === 'used') {
        updatedData.usedAt = new Date().toISOString();
      }

      // If status is 'expired', add expiry timestamp
      if (newStatus === 'expired') {
        updatedData.expiredAt = new Date().toISOString();
      }

      const command = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(updatedData),
        Description: `Bitcoin HTLC swap preimage for swap ${swapId} - Status: ${newStatus}`
      });

      const result = await this.executeWithRetry(() => this.client.send(command));

      logger.info('Successfully updated swap status', {
        swapId,
        newStatus,
        versionId: result.VersionId
      });

      return {
        success: true,
        versionId: result.VersionId,
        status: newStatus
      };

    } catch (error) {
      logger.error('Error updating swap status:', {
        swapId,
        newStatus,
        error: error.message,
        code: error.name
      });
      
      throw new Error('Failed to update swap status');
    }
  }

  /**
   * Check if swap secret exists
   * @param {string} swapId - Swap identifier
   * @returns {Promise<boolean>} True if secret exists
   */
  async swapExists(swapId) {
    const secretName = `${this.secretPrefix}${swapId}`;
    
    try {
      const command = new DescribeSecretCommand({
        SecretId: secretName
      });

      await this.executeWithRetry(() => this.client.send(command));
      return true;

    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      
      logger.error('Error checking swap existence:', {
        swapId,
        error: error.message
      });
      
      throw new Error('Failed to check swap existence');
    }
  }

  /**
   * Delete swap secret (use with caution)
   * @param {string} swapId - Swap identifier
   * @param {boolean} forceDelete - Force immediate deletion (default: false, schedules for deletion)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteSwapSecret(swapId, forceDelete = false) {
    const secretName = `${this.secretPrefix}${swapId}`;
    
    try {
      const { DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');
      
      const command = new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: forceDelete,
        RecoveryWindowInDays: forceDelete ? undefined : 7 // 7 days recovery window
      });

      const result = await this.executeWithRetry(() => this.client.send(command));

      logger.warn('Swap secret deletion initiated', {
        swapId,
        forceDelete,
        deletionDate: result.DeletionDate
      });

      return {
        success: true,
        deletionDate: result.DeletionDate
      };

    } catch (error) {
      logger.error('Error deleting swap secret:', {
        swapId,
        error: error.message,
        code: error.name
      });
      
      throw new Error('Failed to delete swap secret');
    }
  }

  /**
   * Execute AWS operation with retry logic
   * @param {Function} operation - AWS operation to execute
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.name === 'ValidationException' || 
            error.name === 'ResourceNotFoundException' ||
            error.name === 'AccessDeniedException') {
          throw error;
        }

        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
          this.retryConfig.maxDelay
        );

        logger.warn(`AWS operation failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message,
          maxRetries: this.retryConfig.maxRetries
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Get service health and configuration
   * @returns {Promise<Object>} Service health status
   */
  async getHealthStatus() {
    try {
      // Try to list secrets to verify AWS connectivity
      const { ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
      
      const command = new ListSecretsCommand({
        MaxResults: 1,
        Filters: [
          {
            Key: 'name',
            Values: [this.secretPrefix]
          }
        ]
      });

      const startTime = Date.now();
      await this.client.send(command);
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        region: process.env.AWS_REGION || 'us-east-1',
        secretPrefix: this.secretPrefix,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('AWS Secrets Manager health check failed:', error);
      
      return {
        status: 'unhealthy',
        error: error.message,
        region: process.env.AWS_REGION || 'us-east-1',
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new AWSSecretsService();
