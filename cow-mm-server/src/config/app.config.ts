import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { CoWConfigDto, SafeConfigDto, ServerConfigDto, WalletConfigDto } from '../models';
import { getCowApiUrl, getCurrentNetworkConfig, SUPPORTED_CHAIN_IDS } from './network.config';

dotenv.config();

/**
 * Validates configuration on startup
 * Throws error with detailed validation issues if configuration is invalid
 */
function validateConfig(): void {
  const errors: string[] = [];

  // Required fields for basic operation
  const requiredFields = [
    'EXECUTOR_PRIVATE_KEY',
    'MM_WALLET_ADDRESS', 
    'COW_API_URL',
    'COW_SETTLEMENT_CONTRACT',
    'COW_VAULT_RELAYER',
    'API_KEY'
  ];

  requiredFields.forEach(field => {
    if (!process.env[field]) {
      errors.push(`Missing required environment variable: ${field}`);
    }
  });

  // Validate Ethereum addresses
  if (process.env.MM_WALLET_ADDRESS && !ethers.utils.isAddress(process.env.MM_WALLET_ADDRESS)) {
    errors.push('MM_WALLET_ADDRESS is not a valid Ethereum address');
  }

  if (process.env.SAFE_WALLET_ADDRESS && process.env.SAFE_WALLET_ADDRESS !== '' && !ethers.utils.isAddress(process.env.SAFE_WALLET_ADDRESS)) {
    errors.push('SAFE_WALLET_ADDRESS is not a valid Ethereum address');
  }

  if (process.env.COW_SETTLEMENT_CONTRACT && !ethers.utils.isAddress(process.env.COW_SETTLEMENT_CONTRACT)) {
    errors.push('COW_SETTLEMENT_CONTRACT is not a valid Ethereum address');
  }

  if (process.env.COW_VAULT_RELAYER && !ethers.utils.isAddress(process.env.COW_VAULT_RELAYER)) {
    errors.push('COW_VAULT_RELAYER is not a valid Ethereum address');
  }

  // Validate private key format
  if (process.env.EXECUTOR_PRIVATE_KEY) {
    if (!process.env.EXECUTOR_PRIVATE_KEY.startsWith('0x')) {
      errors.push('EXECUTOR_PRIVATE_KEY must start with 0x');
    }
    if (process.env.EXECUTOR_PRIVATE_KEY.length !== 66) {
      errors.push('EXECUTOR_PRIVATE_KEY must be 66 characters long (including 0x)');
    }
    // Test if the private key is valid by trying to create a wallet
    try {
      new ethers.Wallet(process.env.EXECUTOR_PRIVATE_KEY);
    } catch (e) {
      errors.push('EXECUTOR_PRIVATE_KEY is not a valid private key format');
    }
  }

  // Validate chain ID
  const chainId = parseInt(process.env.CHAIN_ID || '11155111');
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as any)) {
    errors.push(`CHAIN_ID must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')} (Mainnet, Gnosis, Sepolia)`);
  }

  // Validate API key strength
  if (process.env.API_KEY && process.env.API_KEY.length < 32) {
    errors.push('API_KEY should be at least 32 characters long for security');
  }

  // Validate port
  const port = parseInt(process.env.PORT || '3000');
  if (port < 1 || port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Validate CoW API URL format
  if (process.env.COW_API_URL) {
    try {
      new URL(process.env.COW_API_URL);
    } catch (e) {
      errors.push('COW_API_URL must be a valid URL');
    }
  }

  // Validate supported tokens if provided
  if (process.env.SUPPORTED_TOKENS) {
    const tokens = process.env.SUPPORTED_TOKENS.split(',');
    tokens.forEach((token, index) => {
      if (!ethers.utils.isAddress(token.trim())) {
        errors.push(`SUPPORTED_TOKENS[${index}] (${token}) is not a valid Ethereum address`);
      }
    });
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease check your .env file and fix the above issues.');
    process.exit(1);
  }

  console.log('✅ Configuration validation passed');
}

// Validate configuration immediately on startup
validateConfig();

export const serverConfig: ServerConfigDto = {
  port: parseInt(process.env.PORT || '3000'),
  environment: (process.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100 // Max 100 requests per window per IP
  }
};

export const cowConfig: CoWConfigDto = {
  apiUrl: getCowApiUrl(parseInt(process.env.CHAIN_ID || '11155111')),
  settlementContract: process.env.COW_SETTLEMENT_CONTRACT || getCurrentNetworkConfig().cowSettlementContract,
  vaultRelayer: process.env.COW_VAULT_RELAYER || getCurrentNetworkConfig().cowVaultRelayer,
  chainId: parseInt(process.env.CHAIN_ID || '11155111'),
  defaultValidityPeriod: parseInt(process.env.DEFAULT_VALIDITY_PERIOD || '1800'), // 30 minutes
  defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE || '0.5') // 0.5%
};

export const safeConfig: SafeConfigDto = {
  address: process.env.SAFE_WALLET_ADDRESS || '',
  executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY || '',
  threshold: parseInt(process.env.SAFE_THRESHOLD || '1'),
  chainId: parseInt(process.env.CHAIN_ID || '11155111')
};

export const walletConfig: WalletConfigDto = {
  mmWalletAddress: process.env.MM_WALLET_ADDRESS || '',
  supportedTokens: process.env.SUPPORTED_TOKENS?.split(',') || [
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB', // COW
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0xA0b86a33E6180d86Cf755FA8d5Ec052399C86B5E'  // USDC (corrected address)
  ]
};

export const config = {
  server: serverConfig,
  cow: cowConfig,
  safe: safeConfig,
  wallet: walletConfig
};