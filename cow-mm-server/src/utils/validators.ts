import { ethers } from 'ethers';
import { TradeRequestDto, ValidationErrorDto } from '../models';

export function validateTradeRequest(request: TradeRequestDto): ValidationErrorDto[] {
  const errors: ValidationErrorDto[] = [];

  // Validate sell token address
  if (!ethers.utils.isAddress(request.sellToken)) {
    errors.push({
      field: 'sellToken',
      message: 'Invalid sell token address',
      value: request.sellToken
    });
  }

  // Validate buy token address
  if (!ethers.utils.isAddress(request.buyToken)) {
    errors.push({
      field: 'buyToken',
      message: 'Invalid buy token address',
      value: request.buyToken
    });
  }

  // Validate user wallet address
  if (!ethers.utils.isAddress(request.userWallet)) {
    errors.push({
      field: 'userWallet',
      message: 'Invalid user wallet address',
      value: request.userWallet
    });
  }

  // Validate sell amount
  try {
    const amount = ethers.BigNumber.from(request.sellAmount);
    if (amount.lte(0)) {
      errors.push({
        field: 'sellAmount',
        message: 'Sell amount must be greater than 0',
        value: request.sellAmount
      });
    }
  } catch (error) {
    errors.push({
      field: 'sellAmount',
      message: 'Invalid sell amount format',
      value: request.sellAmount
    });
  }

  // Validate slippage (optional)
  if (request.slippagePercent !== undefined) {
    if (request.slippagePercent < 0 || request.slippagePercent > 50) {
      errors.push({
        field: 'slippagePercent',
        message: 'Slippage must be between 0 and 50 percent',
        value: request.slippagePercent
      });
    }
  }

  // Validate validity (optional)
  if (request.validitySeconds !== undefined) {
    if (request.validitySeconds < 60 || request.validitySeconds > 3600) {
      errors.push({
        field: 'validitySeconds',
        message: 'Validity must be between 60 seconds and 1 hour',
        value: request.validitySeconds
      });
    }
  }

  return errors;
}

export function validateOrderUid(orderUid: string): boolean {
  // CoW order UIDs are 112 character hex strings (plus 0x prefix = 114 total)
  return /^0x[a-fA-F0-9]{112}$/.test(orderUid);
}

export function isValidAddress(address: string): boolean {
  return ethers.utils.isAddress(address);
}