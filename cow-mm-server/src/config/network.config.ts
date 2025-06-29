export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  cowApiUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  cowSettlementContract: string;
  cowVaultRelayer: string;
}

export const SUPPORTED_CHAIN_IDS = [1, 100, 11155111] as const;
export type SupportedChainId = typeof SUPPORTED_CHAIN_IDS[number];

export const NETWORK_CONFIGS: Record<SupportedChainId, NetworkConfig> = {
  1: {
    chainId: 1,
    name: 'mainnet',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    cowApiUrl: 'https://api.cow.fi/mainnet/api/v1',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    cowSettlementContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
    cowVaultRelayer: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
  },
  100: {
    chainId: 100,
    name: 'gnosis',
    rpcUrl: process.env.GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
    cowApiUrl: 'https://api.cow.fi/xdai/api/v1',
    explorerUrl: 'https://gnosisscan.io',
    nativeCurrency: {
      name: 'xDAI',
      symbol: 'XDAI',
      decimals: 18,
    },
    cowSettlementContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
    cowVaultRelayer: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
  },
  11155111: {
    chainId: 11155111,
    name: 'sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/5ce176a66fac47848ebce0ae3a817bd6',
    cowApiUrl: 'https://api.cow.fi/sepolia/api/v1',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    cowSettlementContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
    cowVaultRelayer: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
  },
};

export function getNetworkConfig(chainId: number): NetworkConfig {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
  }
  return NETWORK_CONFIGS[chainId];
}

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId);
}

export function getCurrentNetworkConfig(): NetworkConfig {
  const chainId = parseInt(process.env.CHAIN_ID || '11155111');
  return getNetworkConfig(chainId);
}

export function getRpcUrl(chainId: number): string {
  return getNetworkConfig(chainId).rpcUrl;
}

export function getCowApiUrl(chainId: number): string {
  return getNetworkConfig(chainId).cowApiUrl;
}