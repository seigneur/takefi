const { createSignedFetcher } = await import("npm:aws-sigv4-fetch@4.0.0");

const signedFetch = createSignedFetcher({
  service: "secretsmanager",
  region: args[0] || "ap-southeast-1",
  credentials: {
    accessKeyId: secrets.AWS_ACCESS_KEY_ID,
    secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
  }
});

const secretName = args[1];
const region = args[0] || "ap-southeast-1";
const awsRetrievalUrl = `https://secretsmanager.${region}.amazonaws.com/`;

try {
  const response = await signedFetch(awsRetrievalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "secretsmanager.GetSecretValue",
    },
    body: JSON.stringify({ SecretId: secretName })
  });

  if (!response.ok) {
    throw new Error(`AWS API error: ${response.status}`);
  }

  const data = await response.json();
  const secretObject = JSON.parse(data.SecretString);
  
  return Functions.encodeString(secretObject.preimage);
} catch (error) {
  throw error;
}