const { createSignedFetcher } = await import("npm:aws-sigv4-fetch@4.0.0");

const region = args[0] || "ap-southeast-1";
const secretARN = args[1];
const awsRetrievalUrl = `https://secretsmanager.${region}.amazonaws.com/`;
const TX_HASH = args[2] || "0x";
const FUNCTION_SELECTOR = args[3] || "0x13d79a0b";
const TOPIC = args[4] || "0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17";


function strip0x(hex) {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function parseAddress(hex) {
  return "0x" + hex.slice(-40);
}

function parseUint256(hex) {
  return BigInt("0x" + hex).toString();
}

async function callRPC(method, params) {
  const txRequest = Functions.makeHttpRequest({
    url: secrets.RPC_URL,
    method: "POST",
    headers: { 
        "Content-Type": "application/json" 
    },
    data: ({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  const txResponse = await txRequest;
  if (txResponse.error) {
    throw new Error("RPC request failed: " + txResponse.error);
  }
  const json = txResponse.data;
  if (json.error) {
    throw new Error("RPC error: " + json.error.message);
  }
  return json.result;
}

const signedFetch = createSignedFetcher({
  service: "secretsmanager",
  region,
  credentials: {
    accessKeyId: secrets.AWS_ACCESS_KEY_ID,
    secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
  }
});

try {
  const response = await signedFetch(awsRetrievalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "secretsmanager.GetSecretValue",
    },
    body: JSON.stringify({ SecretId: secretARN })
  });

  if (!response.ok) {
    throw new Error(`AWS API error: ${response.status}`);
  }

  const data = await response.json();
  const secretObject = JSON.parse(data.SecretString);

  const tx = await callRPC("eth_getTransactionByHash", [TX_HASH]);
  if (!tx) {
    throw new Error("Transaction not found.");
  }
  if (tx.blockNumber === null) {
    throw new Error("Transaction is still pending.");
  }
  const receipt = await callRPC("eth_getTransactionReceipt", [TX_HASH]);
  if (!receipt) {
    throw new Error("Transaction receipt not found.");
  }
  const selector = tx.input ? tx.input.slice(0, 10) : "";
  if (selector !== "0x13d79a0b") {
    throw new Error("Invalid selector in transaction.");
  }
  if (receipt.logs && receipt.logs.length > 0) {
    for (const log of receipt.logs) {
        if (log.topics[0] === TOPIC) {
            const owner = parseAddress(strip0x(log.topics[1]));
            const data = strip0x(log.data);
            const sellToken = parseAddress(data.slice(0, 64));
            const buyToken = parseAddress(data.slice(64, 128));
            const sellAmount = parseUint256(data.slice(128, 192));
            const buyAmount = parseUint256(data.slice(192, 256));

            // Implement checks for address and amount
            console.log(secretObject);

            return Functions.encodeString(secretObject.preimage);
        }
    }
  } else {
    throw new Error("No logs found in transaction receipt.");
  }
  
  throw new Error("Preimage retrieval unsuccessful.");
} catch (error) {
  throw error;
}