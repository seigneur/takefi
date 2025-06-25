"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { oracleAPI, mmAPI, btcToSatoshis } from "@/lib/api";

export default function APITestPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState<any>({});

  const testOracleHealth = async () => {
    setLoading({ ...loading, oracle: true });
    try {
      const response = await fetch("http://localhost:3001/health");
      const data = await response.json();
      setResults({ ...results, oracle: { success: true, data } });
    } catch (error: any) {
      setResults({
        ...results,
        oracle: { success: false, error: error.message },
      });
    } finally {
      setLoading({ ...loading, oracle: false });
    }
  };

  const testMMServerHealth = async () => {
    setLoading({ ...loading, mm: true });
    try {
      const response = await fetch("http://localhost:3000/health");
      const data = await response.json();
      setResults({ ...results, mm: { success: true, data } });
    } catch (error: any) {
      setResults({ ...results, mm: { success: false, error: error.message } });
    } finally {
      setLoading({ ...loading, mm: false });
    }
  };

  const testCreatePreimage = async () => {
    setLoading({ ...loading, preimage: true });
    try {
      const response = await oracleAPI.createPreimage({
        // Don't include userBtcAddress - let Oracle generate one
        mmPubkey:
          "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
        btcAmount: btcToSatoshis(0.001), // 0.001 BTC
        timelock: 144,
        userEthAddress: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
      });
      setResults({ ...results, preimage: { success: true, data: response } });
    } catch (error: any) {
      setResults({
        ...results,
        preimage: { success: false, error: error.message },
      });
    } finally {
      setLoading({ ...loading, preimage: false });
    }
  };

  const testGetQuote = async () => {
    setLoading({ ...loading, quote: true });
    try {
      // Test with a smaller amount that's more likely to have liquidity
      const response = await mmAPI.getQuote({
        sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH Sepolia
        buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // COW Token Sepolia
        sellAmount: "100000000000000000", // 0.1 ETH (smaller amount)
        userWallet: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
      });
      setResults({ ...results, quote: { success: true, data: response } });
    } catch (error: any) {
      setResults({
        ...results,
        quote: { success: false, error: error.message },
      });
    } finally {
      setLoading({ ...loading, quote: false });
    }
  };

  const testMultipleTokenPairs = async () => {
    setLoading({ ...loading, multiQuote: true });

    const tokenPairs = [
      {
        name: "WETH → COW",
        sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
        buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59",
      },
      {
        name: "WETH → USDC",
        sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
        buyToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      },
    ];

    const results = [];
    for (const pair of tokenPairs) {
      try {
        console.log(`Testing ${pair.name}...`);
        const response = await mmAPI.getQuote({
          sellToken: pair.sellToken,
          buyToken: pair.buyToken,
          sellAmount: "1000000000000000", // 0.001 ETH
          userWallet: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
        });
        results.push({ pair: pair.name, success: true, data: response });
      } catch (error: any) {
        results.push({ pair: pair.name, success: false, error: error.message });
      }
    }

    setResults({ ...results, multiQuote: { success: true, data: results } });
    setLoading({ ...loading, multiQuote: false });
  };

  const testDirectCowAPI = async () => {
    setLoading({ ...loading, directCow: true });
    try {
      // Test direct CoW API call to see what's available
      const response = await fetch("https://api.cow.fi/sepolia/api/v1/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sellToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH
          buyToken: "0x0625aFB445C3B6B7B929342a04A22599fd5dBB59", // COW
          sellAmountBeforeFee: "1000000000000000", // 0.001 ETH
          from: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
          receiver: "0x742d35Cc6aB09028b5bC08dB6c2b968e1d4fE03a",
          kind: "sell",
          partiallyFillable: false,
          sellTokenBalance: "erc20",
          buyTokenBalance: "erc20",
          signingScheme: "eip712",
        }),
      });

      const data = await response.json();
      setResults({
        ...results,
        directCow: { success: response.ok, data, status: response.status },
      });
    } catch (error: any) {
      setResults({
        ...results,
        directCow: { success: false, error: error.message },
      });
    } finally {
      setLoading({ ...loading, directCow: false });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          TakeFi API Test Dashboard
        </h1>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Oracle Backend Tests */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-white">Oracle Backend API</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={testOracleHealth}
                disabled={loading.oracle}
                className="w-full"
              >
                {loading.oracle ? "Testing..." : "Test Oracle Health"}
              </Button>

              <Button
                onClick={testCreatePreimage}
                disabled={loading.preimage}
                className="w-full"
                variant="outline"
              >
                {loading.preimage ? "Creating..." : "Test Create Preimage"}
              </Button>

              {results.oracle && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Oracle Health Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto">
                    {JSON.stringify(results.oracle, null, 2)}
                  </pre>
                </div>
              )}

              {results.preimage && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Create Preimage Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto max-h-40">
                    {JSON.stringify(results.preimage, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MM Server Tests */}
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-white">
                Market Maker Server API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={testMMServerHealth}
                disabled={loading.mm}
                className="w-full"
              >
                {loading.mm ? "Testing..." : "Test MM Server Health"}
              </Button>

              <Button
                onClick={testGetQuote}
                disabled={loading.quote}
                className="w-full"
                variant="outline"
              >
                {loading.quote ? "Getting Quote..." : "Test Get Quote"}
              </Button>

              <Button
                onClick={testMultipleTokenPairs}
                disabled={loading.multiQuote}
                className="w-full"
                variant="outline"
              >
                {loading.multiQuote
                  ? "Testing Pairs..."
                  : "Test Multiple Token Pairs"}
              </Button>

              <Button
                onClick={testDirectCowAPI}
                disabled={loading.directCow}
                className="w-full"
                variant="secondary"
              >
                {loading.directCow
                  ? "Testing Direct..."
                  : "Test Direct CoW API"}
              </Button>

              {results.mm && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    MM Server Health Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto">
                    {JSON.stringify(results.mm, null, 2)}
                  </pre>
                </div>
              )}

              {results.quote && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Get Quote Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto max-h-40">
                    {JSON.stringify(results.quote, null, 2)}
                  </pre>
                </div>
              )}

              {results.multiQuote && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Multiple Token Pairs Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto max-h-60">
                    {JSON.stringify(results.multiQuote, null, 2)}
                  </pre>
                </div>
              )}

              {results.directCow && (
                <div className="bg-black/20 rounded p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Direct CoW API Result:
                  </p>
                  <pre className="text-xs text-white overflow-auto max-h-60">
                    {JSON.stringify(results.directCow, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/10 backdrop-blur-md border-white/20 mt-6">
          <CardHeader>
            <CardTitle className="text-white">📋 Test Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-gray-300">
              <div className="flex items-start space-x-3">
                <span className="text-green-400 font-bold">1.</span>
                <div>
                  <p className="font-medium">Start Oracle Backend</p>
                  <code className="text-xs bg-black/30 px-2 py-1 rounded">
                    cd oracle-backend && npm run dev
                  </code>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 font-bold">2.</span>
                <div>
                  <p className="font-medium">Start Market Maker Server</p>
                  <code className="text-xs bg-black/30 px-2 py-1 rounded">
                    cd cow-mm-server && npm run dev
                  </code>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 font-bold">3.</span>
                <div>
                  <p className="font-medium">Test APIs</p>
                  <p className="text-sm text-gray-400">
                    Click the buttons above to test each API endpoint
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
