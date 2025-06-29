const fs = require("fs")
const { Location, ReturnType, CodeLanguage } = require("@chainlink/functions-toolkit")

const requestConfig = {
  source: fs.readFileSync("../cow-mm-server/preimage-retrieval.js").toString(),
  codeLocation: Location.Inline,
  secrets: { 
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "", 
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    RPC_URL: process.env.AVALANCHE_RPC_URL ?? "" 
  },
  secretsLocation: Location.DONHosted,
  args: [
    process.env.AWS_REGION ?? "", 
    process.env.AWS_SECRET_ARN ?? "",
    "0x1c65b602ecb53d46e929b92874739dc225b59cf2d4c5654845f9d2b8b09f5b3e",
    "0x13d79a0b",
    "0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17"
  ],
  codeLanguage: CodeLanguage.JavaScript,
  expectedReturnType: ReturnType.string,
}

module.exports = requestConfig;
