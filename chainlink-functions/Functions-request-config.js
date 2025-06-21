const fs = require("fs")
const { Location, ReturnType, CodeLanguage } = require("@chainlink/functions-toolkit")

const requestConfig = {
  source: fs.readFileSync("./preimage-retrieval-aws.js").toString(),
  codeLocation: Location.Inline,
  secrets: { AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "", AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "" },
  secretsLocation: Location.DONHosted,
  args: [process.env.AWS_REGION, process.env.AWS_SECRET_ARN],
  codeLanguage: CodeLanguage.JavaScript,
  expectedReturnType: ReturnType.uint256,
}

module.exports = requestConfig;
