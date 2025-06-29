const fs = require("fs");
const path = require("path");
const {
    SubscriptionManager,
    SecretsManager,
    decodeResult,
    ResponseListener,
    Location,
    ReturnType,
    CodeLanguage,
    FulfillmentCode
} = require("@chainlink/functions-toolkit");
const { ethers } = require("ethers");
const { FunctionsConsumerABI } = require("./FunctionsConsumerABI");
const dotenv = require("dotenv");
dotenv.config();

console.log("Initializing Chainlink Functions Service...", process.env.OPERATOR_PRIVATE_KEY);

class ChainlinkFunctionsService {
    constructor() {
        this.consumerContractAddress = process.env.CONSUMER_CONTRACT_ADDRESS;
        this.networkRpcUrl = process.env.NETWORK_RPC_URL || "https://eth-sepolia.public.blastapi.io";
        this.provider = new ethers.providers.JsonRpcProvider(this.networkRpcUrl);
        this.signer = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY || '0x', this.provider);
        this.gatewayUrls = process.env.IS_PRODUCTION === "true"
            ? ["https://01.functions-gateway.chain.link/", "https://02.functions-gateway.chain.link/"]
            : ["https://01.functions-gateway.testnet.chain.link/", "https://02.functions-gateway.testnet.chain.link/"]
        this.linkTokenAddress = process.env.LINK_TOKEN_ADDRESS;
        this.functionsRouterAddress = process.env.FUNCTIONS_ROUTER_ADDRESS;
        this.donId = process.env.DON_ID || "fun-ethereum-sepolia-1";
        this.subscriptionId = process.env.SUBSCRIPTION_ID;
    }

    /**
     * Creates a Chainlink Functions request to retrieve preimage and reads the result.
     */
    async createRequestAndReadResult(awsSecretARN, ethTxHash) {
        try {
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                throw new Error("AWS credentials are not set in environment variables.");
            }

            if (!awsSecretARN) {
                throw new Error("AWS Secret ARN is required.");
            }            

            if (!ethTxHash) {
                throw new Error("Ethereum transaction hash is required.");
            }

            const subManager = new SubscriptionManager({ signer: this.signer, 
                linkTokenAddress: this.linkTokenAddress, functionsRouterAddress: this.functionsRouterAddress });
            await subManager.initialize();            

            const secretsManager = new SecretsManager({ signer: this.signer, 
                functionsRouterAddress: this.functionsRouterAddress, donId: this.donId });
            await secretsManager.initialize();

            const subInfo = await subManager.getSubscriptionInfo(this.subscriptionId);
            if (!subInfo.consumers.map((c) => c.toLowerCase()).includes(this.consumerContractAddress.toLowerCase())) {
                throw new Error(`Consumer contract ${this.consumerContractAddress} has not been added to subscription ${this.subscriptionId}`);
            }

            const callbackGasLimit = 100000;

            const { gasPrice } = await this.provider.getFeeData();
            const gasPriceWei = BigInt(Math.ceil(ethers.utils.formatUnits(gasPrice, "wei").toString()));
            const estimatedCostJuels = await subManager.estimateFunctionsRequestCost({
                donId: this.donId,
                subscriptionId: this.subscriptionId,
                callbackGasLimit,
                gasPriceWei,
            });

            const estimatedCostLink = ethers.utils.formatUnits(estimatedCostJuels, 18);
            const subBalanceLink = ethers.utils.formatUnits(subInfo.balance, 18);
            if (subInfo.balance <= estimatedCostJuels) {
                throw new Error(
                    `Subscription ${this.subscriptionId} does not have sufficient funds. The estimated cost is ${estimatedCostLink} LINK, but the subscription only has ${subBalanceLink} LINK.`
                );
            }

            const requestConfig = {
                source: fs.readFileSync(path.join(__dirname, "./preimage-retrieval.js")).toString(),
                codeLocation: Location.Inline,
                secrets: { 
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "", 
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "" ,
                    RPC_URL: this.networkRpcUrl
                },
                secretsLocation: Location.DONHosted,
                args: [
                    process.env.AWS_REGION ?? "", 
                    awsSecretARN ?? "",
                    ethTxHash,
                    process.env.FUNCTION_SELECTOR ?? "0x13d79a0b",
                    process.env.TX_LOG_TOPIC ?? "0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17"
                ],
                codeLanguage: CodeLanguage.JavaScript,
                expectedReturnType: ReturnType.string,
            };

            const encryptedSecrets = await secretsManager.encryptSecrets(requestConfig.secrets);
            const { version } = await secretsManager.uploadEncryptedSecretsToDON({
                encryptedSecretsHexstring: encryptedSecrets.encryptedSecrets,
                gatewayUrls: this.gatewayUrls,
                slotId: 0,
                minutesUntilExpiration: 5,
            });
            let encryptedSecretsReference = await secretsManager.buildDONHostedEncryptedSecretsReference({
                slotId: 0,
                version,
            });

            const requestGasLimit = 1500000;
            const overrides = {
                gasLimit: requestGasLimit,
            };
            const responseListener = new ResponseListener({
                provider: this.provider,
                functionsRouterAddress: this.functionsRouterAddress,
            });

            const consumerContract = new ethers.Contract(
                this.consumerContractAddress,
                FunctionsConsumerABI,
                this.signer
            );

            const requestTx = await consumerContract.sendRequest(
                requestConfig.source,
                requestConfig.secretsLocation,
                encryptedSecretsReference,
                requestConfig.args ?? [],
                requestConfig.bytesArgs ?? [],
                this.subscriptionId,
                callbackGasLimit,
                overrides
            );
            console.log(`Sending request to Chainlink Functions with transaction hash: ${requestTx.hash}`);
            const requestTxReceipt = await requestTx.wait(1);
            console.log(`Confirmed transaction hash ${requestTxReceipt.transactionHash}`);

            console.log(
                `Functions request has been initiated in transaction ${requestTx.hash} with request ID ${requestTxReceipt.events[2].args.id}. Note the request ID may change if a re-org occurs, but the transaction hash will remain constant.\nWaiting for fulfillment from the Decentralized Oracle Network...\n`
            );

            const NUM_CONFIRMATIONS = 2;
            const { requestId, totalCostInJuels, responseBytesHexstring, errorString, fulfillmentCode } =
                await responseListener.listenForResponseFromTransaction(requestTx.hash, undefined, NUM_CONFIRMATIONS, undefined);
            switch (fulfillmentCode) {
                case FulfillmentCode.FULFILLED:
                    if (errorString.length > 0) {
                        throw new Error(`Request ${requestId} fulfilled with error: ${errorString}`);
                    } else if (responseBytesHexstring == "0x") {
                        throw new Error(`Request ${requestId} fulfilled with empty response data`);
                    } else {
                        const linkCost = ethers.utils.formatUnits(totalCostInJuels, 18);
                        console.log(`Total request cost: ${linkCost} LINK`);
                    }
                    break;
        
                case FulfillmentCode.USER_CALLBACK_ERROR:
                    throw new Error(
                        "Error encountered when calling consumer contract callback.\nEnsure the fulfillRequest function in FunctionsConsumer is correct and the --callbackgaslimit is sufficient."
                    );
        
                case FulfillmentCode.COST_EXCEEDS_COMMITMENT:
                    throw new Error(
                        `Request ${requestId} failed due to a gas price spike when attempting to respond`
                    );
        
                default:
                    throw new Error(`Request ${requestId} failed with fulfillment code: ${fulfillmentCode}`);
            }

            let latestResponse = await consumerContract.s_lastResponse();
            if (latestResponse.length > 0 && latestResponse !== "0x") {
                const decodedResult = decodeResult(latestResponse, requestConfig.expectedReturnType);
                return decodedResult;
            } else if (latestResponse == "0x") {
                return latestResponse;
            }
        } catch (error) {
            console.error('Error creating Chainlink Functions request:', error);
            throw error;
        }
    }
}

module.exports = new ChainlinkFunctionsService();