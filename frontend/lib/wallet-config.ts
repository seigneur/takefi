// TakeFi Wallet Configuration with Reown AppKit Bitcoin Support
"use client";

import { createAppKit } from "@reown/appkit/react";
import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bitcoin, bitcoinTestnet } from "@reown/appkit/networks";
import { mainnet, sepolia } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "@wagmi/core";

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined");
}

// Create Bitcoin Adapter for Bitcoin wallet support
const bitcoinAdapter = new BitcoinAdapter({
  projectId,
});

// Create Wagmi Adapter for Ethereum support (existing functionality)
const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks: [mainnet, sepolia],
});

// App metadata
const metadata = {
  name: "TakeFi",
  description:
    "Decentralized RWA Trading Platform - Swap Bitcoin to Real World Assets",
  url: "https://takefi.app",
  icons: ["https://takefi.app/icon.png"],
};

// Create AppKit with Bitcoin and Ethereum support
createAppKit({
  adapters: [bitcoinAdapter, wagmiAdapter],
  networks: [bitcoinTestnet, bitcoin, mainnet, sepolia], // Testnet first for development
  metadata,
  projectId,
  features: {
    analytics: true,
    email: false,
    socials: [],
  },
  themeMode: "dark", // Match our existing dark theme
  themeVariables: {
    "--w3m-color-mix": "#9333ea", // Purple accent to match our brand
    "--w3m-color-mix-strength": 20,
  },
});

export { wagmiAdapter, projectId };
