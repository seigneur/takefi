const bitcoin = require('bitcoinjs-lib');
const dotenv = require('dotenv');
dotenv.config();

const BITCOIN_NETWORKS = {
  mainnet: {
    network: bitcoin.networks.bitcoin,
    name: 'mainnet',
    rpcEndpoint: {
      host: process.env.BITCOIN_RPC_HOST || 'bitcoin-mainnet-rpc.publicnode.com',
      port: parseInt(process.env.BITCOIN_RPC_PORT || '443'),
      protocol: process.env.BITCOIN_RPC_PROTOCOL || 'https',
      username: process.env.BITCOIN_RPC_USERNAME || '',
      password: process.env.BITCOIN_RPC_PASSWORD || ''
    },
    apiUrls: {
      blockstream: 'https://blockstream.info/api',
      mempool: 'https://mempool.space/api'
    },
    explorerUrls: {
      address: 'https://blockstream.info/address/',
      tx: 'https://blockstream.info/tx/'
    },
    zmqEndpoint: {
      host: process.env.BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.BITCOIN_ZMQ_PORT || '28332')
    }
  },
  testnet: {
    network: bitcoin.networks.testnet,
    name: 'testnet',
    rpcEndpoint: {
      host: process.env.BITCOIN_RPC_HOST || 'bitcoin-testnet-rpc.publicnode.com',
      port: parseInt(process.env.BITCOIN_RPC_PORT || '443'),
      protocol: process.env.BITCOIN_RPC_PROTOCOL || 'https',
      username: process.env.BITCOIN_RPC_USERNAME || '',
      password: process.env.BITCOIN_RPC_PASSWORD || ''
    },
    apiUrls: {
      blockstream: 'https://blockstream.info/testnet/api',
      mempool: 'https://mempool.space/testnet/api'
    },
    explorerUrls: {
      address: 'https://blockstream.info/testnet/address/',
      tx: 'https://blockstream.info/testnet/tx/'
    },
    zmqEndpoint: {
      host: process.env.BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.BITCOIN_ZMQ_PORT || '28332')
    }
  },
  regtest: {
    network: bitcoin.networks.regtest,
    name: 'regtest',
    rpcEndpoint: {
      host: process.env.BITCOIN_RPC_HOST || '172.30.112.1',
      port: parseInt(process.env.BITCOIN_RPC_PORT || '18443'),
      protocol: process.env.BITCOIN_RPC_PROTOCOL || 'http',
      username: process.env.BITCOIN_RPC_USERNAME || 'devuser',
      password: process.env.BITCOIN_RPC_PASSWORD || 'devpass'
    },
    apiUrls: {
      blockstream: 'http://localhost:3000/api',
      mempool: 'http://localhost:3000/api'
    },
    explorerUrls: {
      address: 'http://localhost:3000/address/',
      tx: 'http://localhost:3000/tx/'
    },
    zmqEndpoint: {
      host: process.env.BITCOIN_ZMQ_HOST || '127.0.0.1',
      port: parseInt(process.env.BITCOIN_ZMQ_PORT || '28332')
    }
  }
};

function getBitcoinNetworkConfig(networkType = null) {
  const network = networkType || process.env.BITCOIN_NETWORK || 'testnet';
  console.log(`Using Bitcoin network: ${process.env.BITCOIN_NETWORK}`);
  if (!BITCOIN_NETWORKS[network]) {
    throw new Error(`Unsupported Bitcoin network: ${network}. Supported networks: ${Object.keys(BITCOIN_NETWORKS).join(', ')}`);
  }
  
  return BITCOIN_NETWORKS[network];
}

function getCurrentBitcoinNetwork() {
  return getBitcoinNetworkConfig();
}

function getBitcoinNetwork(networkType = null) {
  return getBitcoinNetworkConfig(networkType).network;
}

function getBitcoinRpcEndpoint(networkType = null) {
  return getBitcoinNetworkConfig(networkType).rpcEndpoint;
}

function getBitcoinApiUrls(networkType = null) {
  return getBitcoinNetworkConfig(networkType).apiUrls;
}

function getBitcoinExplorerUrls(networkType = null) {
  return getBitcoinNetworkConfig(networkType).explorerUrls;
}

function getBitcoinZmqEndpoint(networkType = null) {
  return getBitcoinNetworkConfig(networkType).zmqEndpoint;
}

function isSupportedBitcoinNetwork(networkType) {
  return Object.keys(BITCOIN_NETWORKS).includes(networkType);
}

module.exports = {
  BITCOIN_NETWORKS,
  getBitcoinNetworkConfig,
  getCurrentBitcoinNetwork,
  getBitcoinNetwork,
  getBitcoinRpcEndpoint,
  getBitcoinApiUrls,
  getBitcoinExplorerUrls,
  getBitcoinZmqEndpoint,
  isSupportedBitcoinNetwork
};