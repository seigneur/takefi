// Bitcoin Wallet Service for Frontend
// Using the same libraries as oracle-backend for consistency

import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as ecc from 'tiny-secp256k1'
import { getBitcoinNetwork, getBitcoinApiUrls, getBitcoinExplorerUrls, getCurrentBitcoinNetworkName } from './bitcoin-network.config'

// Initialize libraries
const ECPair = ECPairFactory(ecc)
bitcoin.initEccLib(ecc)

// Bitcoin network configuration from centralized config
const BITCOIN_NETWORK = getBitcoinNetwork()

export interface BitcoinWallet {
  address: string
  publicKey: string
  privateKey: string // WIF format
  network: string
}

export interface WalletState {
  isConnected: boolean
  wallet: BitcoinWallet | null
  error: string | null
}

export class BitcoinWalletService {
  private wallet: BitcoinWallet | null = null
  private keyPair: any = null

  /**
   * Generate a new Bitcoin testnet wallet
   */
  generateWallet(): BitcoinWallet {
    try {
      // Generate random key pair
      this.keyPair = ECPair.makeRandom({ network: BITCOIN_NETWORK })
      
      // Get private key in WIF format
      const privateKey = this.keyPair.toWIF()
      
      // Get public key in hex format
      const publicKey = this.keyPair.publicKey.toString('hex')
      
      // Create P2WPKH address (native SegWit)
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: this.keyPair.publicKey,
        network: BITCOIN_NETWORK
      })

      if (!address) {
        throw new Error('Failed to generate Bitcoin address')
      }

      this.wallet = {
        address,
        publicKey,
        privateKey,
        network: getCurrentBitcoinNetworkName()
      }

      // Store in localStorage for persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('takefi_btc_wallet', JSON.stringify({
          address: this.wallet.address,
          publicKey: this.wallet.publicKey,
          // NOTE: In production, never store private keys in localStorage
          // This is for demo purposes only
          privateKey: this.wallet.privateKey,
          network: this.wallet.network
        }))
      }

      console.log('✅ Generated new Bitcoin testnet wallet:', {
        address: this.wallet.address,
        publicKey: this.wallet.publicKey
      })

      return this.wallet
    } catch (error) {
      console.error('Failed to generate Bitcoin wallet:', error)
      throw new Error('Failed to generate Bitcoin wallet')
    }
  }

  /**
   * Load existing wallet from localStorage
   */
  loadStoredWallet(): BitcoinWallet | null {
    try {
      if (typeof window === 'undefined') return null

      const stored = localStorage.getItem('takefi_btc_wallet')
      if (!stored) return null

      const walletData = JSON.parse(stored)
      
      // Recreate keyPair from private key for future use
      this.keyPair = ECPair.fromWIF(walletData.privateKey, BITCOIN_NETWORK)
      
      this.wallet = walletData
      console.log('✅ Loaded stored Bitcoin wallet:', {
        address: this.wallet.address,
        publicKey: this.wallet.publicKey
      })

      return this.wallet
    } catch (error) {
      console.error('Failed to load stored wallet:', error)
      return null
    }
  }

  /**
   * Get current wallet or create new one
   */
  getOrCreateWallet(): BitcoinWallet {
    // Try to load existing wallet first
    const stored = this.loadStoredWallet()
    if (stored) {
      return stored
    }

    // Generate new wallet if none exists
    return this.generateWallet()
  }

  /**
   * Get current wallet
   */
  getCurrentWallet(): BitcoinWallet | null {
    return this.wallet
  }

  /**
   * Clear wallet data
   */
  clearWallet(): void {
    this.wallet = null
    this.keyPair = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('takefi_btc_wallet')
    }
    console.log('🗑️ Cleared Bitcoin wallet data')
  }

  /**
   * Import wallet from WIF private key (for testing)
   */
  importFromWIF(wifPrivateKey: string): BitcoinWallet {
    try {
      this.keyPair = ECPair.fromWIF(wifPrivateKey, BITCOIN_NETWORK)
      
      const publicKey = this.keyPair.publicKey.toString('hex')
      
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: this.keyPair.publicKey,
        network: BITCOIN_NETWORK
      })

      if (!address) {
        throw new Error('Failed to generate address from WIF')
      }

      this.wallet = {
        address,
        publicKey,
        privateKey: wifPrivateKey,
        network: getCurrentBitcoinNetworkName()
      }

      // Store in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('takefi_btc_wallet', JSON.stringify(this.wallet))
      }

      console.log('✅ Imported Bitcoin wallet from WIF:', {
        address: this.wallet.address,
        publicKey: this.wallet.publicKey
      })

      return this.wallet
    } catch (error) {
      console.error('Failed to import wallet from WIF:', error)
      throw new Error('Invalid WIF private key')
    }
  }

  /**
   * Get wallet balance (placeholder - would need RPC connection)
   */
  async getBalance(): Promise<number> {
    if (!this.wallet) return 0
    
    try {
      // Use Blockstream API for balance check (same as oracle-backend)
      const apiUrls = getBitcoinApiUrls()
      const response = await fetch(`${apiUrls.blockstream}/address/${this.wallet.address}`)
      const data = await response.json()
      
      const balanceSats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
      return balanceSats / 100000000 // Convert to BTC
    } catch (error) {
      console.error('Failed to get balance:', error)
      return 0
    }
  }

  /**
   * Validate if an address is a valid Bitcoin address
   */
  static validateAddress(address: string): boolean {
    try {
      // Check for testnet bech32 addresses
      if (address.startsWith('tb1') || address.startsWith('bcrt1')) {
        bitcoin.address.fromBech32(address)
        return true
      }
      
      // Check for testnet legacy addresses
      const decoded = bitcoin.address.fromBase58Check(address)
      return decoded.version === BITCOIN_NETWORK.pubKeyHash || 
             decoded.version === BITCOIN_NETWORK.scriptHash
    } catch (error) {
      return false
    }
  }

  /**
   * Get testnet faucet URL for funding
   */
  static getFaucetUrl(): string {
    return 'https://testnet-faucet.mempool.co/'
  }

  /**
   * Get block explorer URL for address
   */
  static getExplorerUrl(address: string): string {
    const explorerUrls = getBitcoinExplorerUrls()
    return `${explorerUrls.address}${address}`
  }
}

// Export singleton instance
export const bitcoinWalletService = new BitcoinWalletService()