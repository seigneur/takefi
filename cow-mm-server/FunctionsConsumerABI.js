const abi = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "router",
          "type": "address"
        },
        {
          "internalType": "bytes32",
          "name": "_donId",
          "type": "bytes32"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "EmptyArgs",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "EmptySource",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NoInlineSecrets",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "OnlyRouterCanFulfill",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferRequested",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "id",
          "type": "bytes32"
        }
      ],
      "name": "RequestFulfilled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "id",
          "type": "bytes32"
        }
      ],
      "name": "RequestSent",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "acceptOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "donId",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "requestId",
          "type": "bytes32"
        },
        {
          "internalType": "bytes",
          "name": "response",
          "type": "bytes"
        },
        {
          "internalType": "bytes",
          "name": "err",
          "type": "bytes"
        }
      ],
      "name": "handleOracleFulfillment",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "s_lastError",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "s_lastRequestId",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "s_lastResponse",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "source",
          "type": "string"
        },
        {
          "internalType": "enum FunctionsRequest.Location",
          "name": "secretsLocation",
          "type": "uint8"
        },
        {
          "internalType": "bytes",
          "name": "encryptedSecretsReference",
          "type": "bytes"
        },
        {
          "internalType": "string[]",
          "name": "args",
          "type": "string[]"
        },
        {
          "internalType": "bytes[]",
          "name": "bytesArgs",
          "type": "bytes[]"
        },
        {
          "internalType": "uint64",
          "name": "subscriptionId",
          "type": "uint64"
        },
        {
          "internalType": "uint32",
          "name": "callbackGasLimit",
          "type": "uint32"
        }
      ],
      "name": "sendRequest",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "newDonId",
          "type": "bytes32"
        }
      ],
      "name": "setDonId",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
];

module.exports = {
  FunctionsConsumerABI: abi
};