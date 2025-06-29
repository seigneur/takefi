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
  supportedTokens: {
    WETH: string;
    COW: string;
    DAI: string;
    USDC: string;
    BCSPX?: string; // Optional for networks that support BCSPX
  };
}

export const SUPPORTED_CHAIN_IDS = [1, 100, 11155111, 43114] as const;
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
    supportedTokens: {
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      COW: '0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB',
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    },
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
    supportedTokens: {
      WETH: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1', // WETH on Gnosis
      COW: '0x177127622c4A00F3d409B75571e12cB3c8973d3c', // COW on Gnosis
      DAI: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // WXDAI (wrapped xDAI)
      USDC: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // USDC on Gnosis
    },
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
    supportedTokens: {
      WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // WETH on Sepolia
      COW: '0x8267cF9254734C6Eb452a7bb9AAF97B392258b21', // COW on Sepolia
      DAI: '0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb', // DAI on Sepolia
      USDC: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // USDC on Sepolia
    },
  },
  43114: {
    chainId: 43114,
    name: 'avalanche',
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    cowApiUrl: 'https://api.cow.fi/avalanche/api/v1',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
    },
    cowSettlementContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
    cowVaultRelayer: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
    supportedTokens: {
      WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', // WETH on Avalanche
      COW: '0x0000000000000000000000000000000000000000', // COW not available on Avalanche
      DAI: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', // DAI on Avalanche
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
      BCSPX: '0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59', // BCSPX on Avalanche
    },
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

export function getSupportedTokens(chainId: number): string[] {
  const config = getNetworkConfig(chainId);
  return Object.values(config.supportedTokens);
}

export function getSupportedTokensConfig(chainId: number): NetworkConfig['supportedTokens'] {
  return getNetworkConfig(chainId).supportedTokens;
}