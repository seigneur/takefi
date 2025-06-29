import * as bitcoin from 'bitcoinjs-lib';

export interface BitcoinNetworkConfig {
  network: bitcoin.Network;
  name: string;
  apiUrls: {
    blockstream: string;
    mempool: string;
  };
  rpc: {
    host: string;
    port: number;
    protocol: string;
  };
  zmq: {
    host: string;
    port: number;
  };
  explorerUrls: {
    address: string;
    tx: string;
  };
  testAddresses: {
    p2wpkh: string;
    p2tr: string;
  };
}

export const BITCOIN_NETWORKS: Record<'mainnet' | 'testnet' | 'regtest', BitcoinNetworkConfig> = {
  mainnet: {
    network: bitcoin.networks.bitcoin,
    name: 'mainnet',
    apiUrls: {
      blockstream: 'https://blockstream.info/api',
      mempool: 'https://mempool.space/api'
    },
    rpc: {
      host: process.env.NEXT_PUBLIC_BITCOIN_RPC_HOST || 'bitcoin-mainnet-rpc.publicnode.com',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_RPC_PORT || '443'),
      protocol: process.env.NEXT_PUBLIC_BITCOIN_RPC_PROTOCOL || 'https'
    },
    zmq: {
      host: process.env.NEXT_PUBLIC_BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_ZMQ_PORT || '28332')
    },
    explorerUrls: {
      address: 'https://blockstream.info/address/',
      tx: 'https://blockstream.info/tx/'
    },
    testAddresses: {
      p2wpkh: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      p2tr: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
    }
  },
  testnet: {
    network: bitcoin.networks.testnet,
    name: 'testnet',
    apiUrls: {
      blockstream: 'https://blockstream.info/testnet/api',
      mempool: 'https://mempool.space/testnet/api'
    },
    rpc: {
      host: process.env.NEXT_PUBLIC_BITCOIN_RPC_HOST || 'bitcoin-testnet-rpc.publicnode.com',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_RPC_PORT || '443'),
      protocol: process.env.NEXT_PUBLIC_BITCOIN_RPC_PROTOCOL || 'https'
    },
    zmq: {
      host: process.env.NEXT_PUBLIC_BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_ZMQ_PORT || '28332')
    },
    explorerUrls: {
      address: 'https://blockstream.info/testnet/address/',
      tx: 'https://blockstream.info/testnet/tx/'
    },
    testAddresses: {
      p2wpkh: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      p2tr: 'tb1pelx8g8d4xs8clm4pjvgks6chhsm20hslq5dycwnme6mg0f3j22wsmefggc'
    }
  },
  regtest: {
    network: bitcoin.networks.regtest,
    name: 'regtest',
    apiUrls: {
      blockstream: 'http://localhost:3000/api',
      mempool: 'http://localhost:3000/api'
    },
    rpc: {
      host: process.env.NEXT_PUBLIC_BITCOIN_RPC_HOST || '127.0.0.1',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_RPC_PORT || '18443'),
      protocol: process.env.NEXT_PUBLIC_BITCOIN_RPC_PROTOCOL || 'http'
    },
    zmq: {
      host: process.env.NEXT_PUBLIC_BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.NEXT_PUBLIC_BITCOIN_ZMQ_PORT || '28332')
    },
    explorerUrls: {
      address: 'http://localhost:3000/address/',
      tx: 'http://localhost:3000/tx/'
    },
    testAddresses: {
      p2wpkh: 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kyxztws',
      p2tr: 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqrsaqu5u'
    }
  }
};

export type SupportedBitcoinNetwork = keyof typeof BITCOIN_NETWORKS;
export const SUPPORTED_BITCOIN_NETWORKS = Object.keys(BITCOIN_NETWORKS) as SupportedBitcoinNetwork[];

export function getBitcoinNetworkConfig(networkType?: SupportedBitcoinNetwork): BitcoinNetworkConfig {
  const network = networkType || (process.env.NEXT_PUBLIC_BITCOIN_NETWORK as SupportedBitcoinNetwork) || 'testnet';
  
  if (!BITCOIN_NETWORKS[network]) {
    throw new Error(`Unsupported Bitcoin network: ${network}. Supported networks: ${SUPPORTED_BITCOIN_NETWORKS.join(', ')}`);
  }
  
  return BITCOIN_NETWORKS[network];
}

export function getCurrentBitcoinNetworkConfig(): BitcoinNetworkConfig {
  return getBitcoinNetworkConfig();
}

export function getBitcoinNetwork(networkType?: SupportedBitcoinNetwork): bitcoin.Network {
  return getBitcoinNetworkConfig(networkType).network;
}

export function getBitcoinApiUrls(networkType?: SupportedBitcoinNetwork) {
  return getBitcoinNetworkConfig(networkType).apiUrls;
}

export function getBitcoinExplorerUrls(networkType?: SupportedBitcoinNetwork) {
  return getBitcoinNetworkConfig(networkType).explorerUrls;
}

export function getBitcoinRpcConfig(networkType?: SupportedBitcoinNetwork) {
  return getBitcoinNetworkConfig(networkType).rpc;
}

export function getBitcoinZmqConfig(networkType?: SupportedBitcoinNetwork) {
  return getBitcoinNetworkConfig(networkType).zmq;
}

export function getBitcoinTestAddresses(networkType?: SupportedBitcoinNetwork) {
  return getBitcoinNetworkConfig(networkType).testAddresses;
}

export function isSupportedBitcoinNetwork(networkType: string): networkType is SupportedBitcoinNetwork {
  return SUPPORTED_BITCOIN_NETWORKS.includes(networkType as SupportedBitcoinNetwork);
}

// Helper to get current network name for display
export function getCurrentBitcoinNetworkName(): string {
  return getCurrentBitcoinNetworkConfig().name;
}

// Helper to check if current network is mainnet
export function isMainnet(): boolean {
  return getCurrentBitcoinNetworkConfig().name === 'mainnet';
}

// Helper to check if current network is testnet
export function isTestnet(): boolean {
  return getCurrentBitcoinNetworkConfig().name === 'testnet';
}

// Helper to check if current network is regtest
export function isRegtest(): boolean {
  return getCurrentBitcoinNetworkConfig().name === 'regtest';
}