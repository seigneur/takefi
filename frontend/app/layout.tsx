import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/components/wallet-provider'

export const metadata: Metadata = {
  title: 'TakeFi - Decentralized RWA Trading',
  description: 'Swap Bitcoin to Real World Assets with HTLC technology',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
