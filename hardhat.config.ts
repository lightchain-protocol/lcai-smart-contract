//path: lcai-dao-smart-contract/hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      name: "Hardhat Mainnet",
      type: "edr-simulated",
      chainType: "l1",
      url: "http://localhost:8545",
      explorer: {
        name: "Local",
        url: "",
      },
    },
    hardhatOp: {
      name: "Hardhat Optimism",
      type: "edr-simulated",
      chainType: "op",
      explorer: {
        name: "Local",
        url: "",
      },
    },
    lcaiTestnet: {
      name: "Lightchain Testnet",
      type: "http",
      chainType: "l1",
      chainId: 504,
      url: "https://light-testnet-rpc.lightchain.ai",
      explorer: {
        name: "Lightchain Testnet Explorer",
        url: "https://testnet.lightscan.app",
      },
      accounts: process.env.OWNER_WALLET_PRIVATE_KEY 
        ? [process.env.OWNER_WALLET_PRIVATE_KEY]
        : [],
    },
    sepolia: {
      name: "Sepolia Testnet",
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: "https://rpc.sepolia.org",
      explorer: {
        name: "Sepolia Etherscan",
        url: "https://sepolia.etherscan.io",
      },
      accounts: process.env.SEPOLIA_PRIVATE_KEY
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : [],
    },
    mainnet: {
      name: "Ethereum Mainnet",
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com",
      explorer: {
        name: "Etherscan",
        url: "https://etherscan.io",
      },
      accounts: process.env.MAINNET_PRIVATE_KEY
        ? [process.env.MAINNET_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
