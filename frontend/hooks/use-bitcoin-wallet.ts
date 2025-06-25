// Bitcoin Wallet Hook using Reown AppKit
'use client'

import { useAppKitProvider, useAppKitAccount } from "@reown/appkit/react"
import type { BitcoinConnector } from "@reown/appkit-adapter-bitcoin"

export interface BitcoinWalletState {
  address: string | undefined
  isConnected: boolean
  signMessage: (message: string) => Promise<string>
  sendTransaction: (recipient: string, amount: string) => Promise<string>
  walletProvider: BitcoinConnector | undefined
}

export function useBitcoinWallet(): BitcoinWalletState {
  // Get Bitcoin provider and account from Reown AppKit
  const { walletProvider } = useAppKitProvider<BitcoinConnector>("bip122")
  const { address, isConnected } = useAppKitAccount()

  const signMessage = async (message: string): Promise<string> => {
    if (!walletProvider || !address) {
      throw new Error('Bitcoin wallet not connected')
    }
    
    try {
      const signature = await walletProvider.signMessage({
        address,
        message
      })
      return signature
    } catch (error: any) {
      console.error('Failed to sign message:', error)
      throw new Error(`Failed to sign message: ${error.message}`)
    }
  }

  const sendTransaction = async (recipient: string, amount: string): Promise<string> => {
    if (!walletProvider) {
      throw new Error('Bitcoin wallet not connected')
    }
    
    try {
      const txHash = await walletProvider.sendTransfer({
        recipient,
        amount // amount in satoshis
      })
      return txHash
    } catch (error: any) {
      console.error('Failed to send Bitcoin transaction:', error)
      throw new Error(`Failed to send Bitcoin: ${error.message}`)
    }
  }

  return {
    address,
    isConnected,
    signMessage,
    sendTransaction,
    walletProvider
  }
}

// Helper function to format Bitcoin address for display
export function formatBitcoinAddress(address: string | undefined, chars = 6): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

// Helper function to convert BTC to satoshis
export function btcToSatoshis(btc: number): string {
  return Math.round(btc * 100000000).toString()
}

// Helper function to convert satoshis to BTC
export function satoshisToBtc(satoshis: string): number {
  return parseInt(satoshis) / 100000000
}
