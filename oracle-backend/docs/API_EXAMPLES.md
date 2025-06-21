# API Examples

This document provides practical examples for using the Bitcoin Oracle Backend API.

## Environment Setup

```bash
export API_BASE_URL="http://localhost:3000/api/oracle"
export CONTENT_TYPE="Content-Type: application/json"
```

## 1. Health Check

Check if the service is running and healthy.

```bash
curl -X GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-21T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

## 2. Create HTLC Preimage (Testnet)

Create a new Bitcoin HTLC for testnet.

```bash
curl -X POST $API_BASE_URL/create-preimage \
  -H "$CONTENT_TYPE" \
  -d '{
    "userBtcAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
    "btcAmount": 100000,
    "timelock": 144
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "hash": "a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df2",
    "htlcScript": "63a820a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df28821026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01ac67029000b27576a914...",
    "htlcAddress": "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc",
    "expiresAt": "2025-06-22T12:00:00.000Z",
    "timelock": 144
  }
}
```

## 3. Create HTLC Preimage (Mainnet)

For mainnet deployment, use mainnet addresses:

```bash
curl -X POST $API_BASE_URL/create-preimage \
  -H "$CONTENT_TYPE" \
  -d '{
    "userBtcAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "03c6103b3b83e4a24a0e33a4df246ef11772f9992663db0c35759a5e2ebf68d8e9",
    "btcAmount": 50000000,
    "timelock": 288
  }'
```

## 4. Get Swap Details

Retrieve information about an existing swap.

```bash
# Replace with actual swap ID
SWAP_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X GET $API_BASE_URL/swap/$SWAP_ID
```

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "hash": "a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df2",
    "userAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
    "btcAmount": 100000,
    "timelock": 144,
    "htlcScript": "63a820a665127d4c9c280b08bb727d3323d8ef0d6a75a853bcbd0d2dc9b2f83e1d2df2882102...",
    "htlcAddress": "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc",
    "createdAt": "2025-06-21T12:00:00.000Z",
    "expiresAt": "2025-06-22T12:00:00.000Z",
    "status": "active"
  }
}
```

## 5. Reveal Preimage (Chainlink Integration)

Reveal the preimage for a completed swap (requires authentication).

```bash
SWAP_ID="123e4567-e89b-12d3-a456-426614174000"
AUTH_TOKEN="chainlink-don-token"
ETH_TX_HASH="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

curl -X POST $API_BASE_URL/reveal-preimage/$SWAP_ID \
  -H "$CONTENT_TYPE" \
  -d '{
    "authToken": "'$AUTH_TOKEN'",
    "ethTxHash": "'$ETH_TX_HASH'"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "swapId": "123e4567-e89b-12d3-a456-426614174000",
    "preimage": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "revealedAt": "2025-06-21T12:30:00.000Z",
    "ethTxHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  }
}
```

## 6. Get Oracle Statistics

```bash
curl -X GET $API_BASE_URL/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSwaps": 42,
    "activeSwaps": 5,
    "completedSwaps": 35,
    "expiredSwaps": 2,
    "totalVolume": 2100000000
  }
}
```

## Error Examples

### 1. Invalid Bitcoin Address

```bash
curl -X POST $API_BASE_URL/create-preimage \
  -H "$CONTENT_TYPE" \
  -d '{
    "userBtcAddress": "invalid-address",
    "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
    "btcAmount": 100000,
    "timelock": 144
  }'
```

**Error Response:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "userBtcAddress",
      "message": "Invalid Bitcoin address format",
      "value": "invalid-address"
    }
  ]
}
```

### 2. Invalid Public Key

```bash
curl -X POST $API_BASE_URL/create-preimage \
  -H "$CONTENT_TYPE" \
  -d '{
    "userBtcAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "invalid-pubkey",
    "btcAmount": 100000,
    "timelock": 144
  }'
```

**Error Response:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "mmPubkey",
      "message": "Public key must be exactly 66 hex characters (33 bytes)",
      "value": "invalid-pubkey"
    }
  ]
}
```

### 3. Amount Too Large

```bash
curl -X POST $API_BASE_URL/create-preimage \
  -H "$CONTENT_TYPE" \
  -d '{
    "userBtcAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
    "btcAmount": 999999999999,
    "timelock": 144
  }'
```

**Error Response:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "btcAmount",
      "message": "BTC amount cannot exceed 100000000 satoshis",
      "value": 999999999999
    }
  ]
}
```

### 4. Unauthorized Preimage Reveal

```bash
curl -X POST $API_BASE_URL/reveal-preimage/123e4567-e89b-12d3-a456-426614174000 \
  -H "$CONTENT_TYPE" \
  -d '{
    "authToken": "invalid-token"
  }'
```

**Error Response:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 5. Swap Not Found

```bash
curl -X GET $API_BASE_URL/swap/00000000-0000-0000-0000-000000000000
```

**Error Response:**
```json
{
  "success": false,
  "error": "Swap not found"
}
```

## Rate Limiting Example

When making too many requests:

```bash
# This will eventually trigger rate limiting
for i in {1..150}; do
  curl -X GET http://localhost:3000/health
done
```

**Rate Limited Response:**
```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "retryAfter": 60
}
```

## JavaScript/Node.js Examples

### Using fetch()

```javascript
const API_BASE = 'http://localhost:3000/api/oracle';

async function createSwap() {
  try {
    const response = await fetch(`${API_BASE}/create-preimage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userBtcAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        mmPubkey: '026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01',
        btcAmount: 100000,
        timelock: 144
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Swap created:', data.data.swapId);
      console.log('HTLC address:', data.data.htlcAddress);
      return data.data;
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

async function getSwap(swapId) {
  try {
    const response = await fetch(`${API_BASE}/swap/${swapId}`);
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error getting swap:', error);
  }
}
```

### Using axios

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api/oracle',
  headers: {
    'Content-Type': 'application/json'
  }
});

async function createSwap(swapData) {
  try {
    const response = await api.post('/create-preimage', swapData);
    return response.data.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
    } else {
      console.error('Network Error:', error.message);
    }
    throw error;
  }
}

async function revealPreimage(swapId, authToken, ethTxHash) {
  try {
    const response = await api.post(`/reveal-preimage/${swapId}`, {
      authToken,
      ethTxHash
    });
    return response.data.data;
  } catch (error) {
    console.error('Error revealing preimage:', error.response?.data || error.message);
    throw error;
  }
}
```

## Python Examples

### Using requests

```python
import requests
import json

API_BASE = 'http://localhost:3000/api/oracle'

def create_swap(user_address, mm_pubkey, amount, timelock=144):
    url = f'{API_BASE}/create-preimage'
    data = {
        'userBtcAddress': user_address,
        'mmPubkey': mm_pubkey,
        'btcAmount': amount,
        'timelock': timelock
    }
    
    response = requests.post(url, json=data)
    
    if response.status_code == 201:
        return response.json()['data']
    else:
        print(f"Error: {response.json()}")
        return None

def get_swap(swap_id):
    url = f'{API_BASE}/swap/{swap_id}'
    response = requests.get(url)
    
    if response.status_code == 200:
        return response.json()['data']
    else:
        print(f"Error: {response.json()}")
        return None

# Example usage
swap_data = create_swap(
    'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    '026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01',
    100000
)

if swap_data:
    print(f"Created swap: {swap_data['swapId']}")
    print(f"HTLC address: {swap_data['htlcAddress']}")
```

## Integration Testing

### Complete Swap Flow Test

```bash
#!/bin/bash

API_BASE="http://localhost:3000/api/oracle"

echo "🧪 Testing complete swap flow..."

# 1. Create swap
echo "1. Creating swap..."
RESPONSE=$(curl -s -X POST $API_BASE/create-preimage \
  -H "Content-Type: application/json" \
  -d '{
    "userBtcAddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "mmPubkey": "026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01",
    "btcAmount": 100000,
    "timelock": 144
  }')

SWAP_ID=$(echo $RESPONSE | jq -r '.data.swapId')
echo "✅ Swap created: $SWAP_ID"

# 2. Get swap details
echo "2. Getting swap details..."
curl -s -X GET $API_BASE/swap/$SWAP_ID | jq '.'

# 3. Try to reveal preimage (will fail without proper auth)
echo "3. Testing preimage reveal..."
curl -s -X POST $API_BASE/reveal-preimage/$SWAP_ID \
  -H "Content-Type: application/json" \
  -d '{
    "authToken": "chainlink-don-token",
    "ethTxHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  }' | jq '.'

echo "🎉 Integration test complete!"
```
