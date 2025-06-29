// =============================================================================
// CORE DOMAIN MODELS
// =============================================================================

export interface Order {
  uid: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
  feeAmount: string;
  kind: OrderKind;
  partiallyFillable: boolean;
  sellTokenBalance: SellTokenSource;
  buyTokenBalance: BuyTokenDestination;
  signingScheme: SigningScheme;
  signature: string;
  from: string;
  receiver: string;
  creationDate: string;
  status: OrderStatus;
  executedSellAmount?: string;
  executedBuyAmount?: string;
  executedFeeAmount?: string;
  txHash?: string;
}

export interface Quote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  validTo: number;
  appData: string;
  appDataHash?: string;
  partiallyFillable: boolean;
  sellTokenBalance: SellTokenSource;
  buyTokenBalance: BuyTokenDestination;
  from: string;
  receiver: string;
  kind: OrderKind;
  id?: number;
  quoteId?: number;
}

export interface Trade {
  blockNumber: number;
  logIndex: number;
  orderUid: string;
  owner: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  txHash: string;
  timestamp: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface SafeTransaction {
  to: string;
  value: string;
  data: string;
  operation: SafeOperationType;
  safeTxHash: string;
  isExecuted: boolean;
  isSuccessful?: boolean;
  transactionHash?: string;
}

// =============================================================================
// REQUEST/RESPONSE DTOs
// =============================================================================

export interface TradeRequestDto {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  userWallet: string;
  slippagePercent?: number; // Default: 0.5%
  validitySeconds?: number; // Default: 1800 (30 minutes)
}

export interface TradeResponseDto {
  success: boolean;
  orderUid: string;
  quote: QuoteDto;
  estimatedExecutionTime: number; // seconds
  message?: string;
  error?: string;
}

export interface QuoteDto {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  validTo: number;
  priceImpact: string;
  expiresAt: string;
}

export interface OrderStatusRequestDto {
  orderUid: string;
}

export interface OrderStatusResponseDto {
  uid: string;
  status: OrderStatus;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  executedSellAmount?: string;
  executedBuyAmount?: string;
  validTo: number;
  creationDate: string;
  executionDate?: string;
  txHash?: string;
  trades: TradeDto[];
}

export interface TradeDto {
  blockNumber: number;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  txHash: string;
  timestamp: string;
}

export interface HealthCheckResponseDto {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    cowApi: 'up' | 'down';
    safeWallet: 'up' | 'down';
    blockchain: 'up' | 'down';
  };
}

export interface ErrorResponseDto {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// =============================================================================
// WEBSOCKET DTOs (for real-time order tracking)
// =============================================================================

export interface OrderUpdateDto {
  orderUid: string;
  status: OrderStatus;
  executedSellAmount?: string;
  executedBuyAmount?: string;
  txHash?: string;
  timestamp: string;
}

export interface WebSocketMessageDto {
  type: 'orderUpdate' | 'error' | 'connectionStatus';
  data: OrderUpdateDto | ErrorResponseDto | { status: string };
  timestamp: string;
}

// =============================================================================
// INTERNAL SERVICE DTOs
// =============================================================================

export interface CoWQuoteRequestDto {
  sellToken: string;
  buyToken: string;
  sellAmountBeforeFee: string;
  from: string;
  receiver: string;
  kind: OrderKind;
  partiallyFillable: boolean;
  sellTokenBalance: SellTokenSource;
  buyTokenBalance: BuyTokenDestination;
  signingScheme: SigningScheme;
  validTo?: number;
  appData?: string;
  appDataHash?: string;
  priceQuality?: string;
}

export interface SignedOrderDto {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  feeAmount: string;
  kind: OrderKind;
  partiallyFillable: boolean;
  sellTokenBalance: SellTokenSource;
  buyTokenBalance: BuyTokenDestination;
  signingScheme: SigningScheme;
  signature: string;
  from: string;
  quoteId?: number;
  appData: string;
  appDataHash: string;
}

export interface PreSignatureRequestDto {
  orderUid: string;
  signed: boolean;
}

// =============================================================================
// CONFIGURATION DTOs
// =============================================================================

export interface ServerConfigDto {
  port: number;
  environment: 'development' | 'staging' | 'production';
  corsOrigins: string[];
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface CoWConfigDto {
  apiUrl: string;
  settlementContract: string;
  vaultRelayer: string;
  chainId: number;
  defaultValidityPeriod: number; // seconds
  defaultSlippage: number; // percentage
}

export interface SafeConfigDto {
  address: string;
  executorPrivateKey: string; // For pre-signed orders
  threshold: number;
  chainId: number;
}

export interface WalletConfigDto {
  mmWalletAddress: string;
  supportedTokens: string[]; // Token addresses MM can trade
}

// =============================================================================
// ENUMS
// =============================================================================

export enum OrderKind {
  SELL = 'sell',
  BUY = 'buy'
}

export enum OrderStatus {
  PENDING = 'pending',
  OPEN = 'open', 
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PARTIALLY_FILLED = 'partiallyFilled'
}

export enum SigningScheme {
  EIP712 = 'eip712',
  ETHSIGN = 'ethsign', 
  ERC1271 = 'erc1271',
  PRESIGN = 'presign'
}

export enum SellTokenSource {
  ERC20 = 'erc20',
  INTERNAL = 'internal',
  EXTERNAL = 'external'
}

export enum BuyTokenDestination {
  ERC20 = 'erc20',
  INTERNAL = 'internal'
}

export enum SafeOperationType {
  CALL = 0,
  DELEGATE_CALL = 1
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface ApiResponseDto<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface ValidationErrorDto {
  field: string;
  message: string;
  value?: any;
}

// =============================================================================
// COMMON ERROR CODES
// =============================================================================

export const ERROR_CODES = {
  // Validation errors
  INVALID_TOKEN_ADDRESS: 'INVALID_TOKEN_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_WALLET_ADDRESS: 'INVALID_WALLET_ADDRESS',
  INVALID_SLIPPAGE: 'INVALID_SLIPPAGE',
  
  // CoW Protocol errors
  COW_API_ERROR: 'COW_API_ERROR',
  QUOTE_FAILED: 'QUOTE_FAILED',
  ORDER_SUBMISSION_FAILED: 'ORDER_SUBMISSION_FAILED',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  
  // Safe wallet errors
  SAFE_TRANSACTION_FAILED: 'SAFE_TRANSACTION_FAILED',
  PRESIGN_FAILED: 'PRESIGN_FAILED',
  
  // Internal errors
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  UNSUPPORTED_TOKEN: 'UNSUPPORTED_TOKEN',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;