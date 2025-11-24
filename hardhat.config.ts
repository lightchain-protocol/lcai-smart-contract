//path: lcai-dao-smart-contract/hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import dotenv from "dotenv";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { getPrivateKey } from "./scripts/setup-dev-keys.js";

// Load environment variables
dotenv.config();

// Get private keys with auto-generation fallback
const OWNER_WALLET_PRIVATE_KEY = getPrivateKey(
  "OWNER_WALLET_PRIVATE_KEY",
  "owner"
);
const SEPOLIA_PRIVATE_KEY = getPrivateKey("SEPOLIA_PRIVATE_KEY", "sepolia");

// Load other environment variables
const {
  LCAI_TESTNET_RPC_URL,
  LCAI_TESTNET_V2_RPC_URL,
  LCAI_TESTNET_V2_CHAIN_ID,
  LCAI_BLOCKSCOUT_NAME,
  LCAI_BLOCKSCOUT_BROWSER_URL,
  LCAI_BLOCKSCOUT_API_URL,
  SEPOLIA_RPC_URL,
  MAINNET_RPC_URL,
  MAINNET_PRIVATE_KEY,
} = process.env;

const lcaiBlockscoutBrowserUrl =
  (LCAI_BLOCKSCOUT_BROWSER_URL && LCAI_BLOCKSCOUT_BROWSER_URL.trim()) ||
  "https://testnet.lightscan.app";
const lcaiBlockscoutApiUrl =
  (LCAI_BLOCKSCOUT_API_URL && LCAI_BLOCKSCOUT_API_URL.trim()) ||
  `${lcaiBlockscoutBrowserUrl.replace(/\/$/, "")}/api`;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin, hardhatVerify],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
          viaIR: true,
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
      url:
        (LCAI_TESTNET_RPC_URL && LCAI_TESTNET_RPC_URL.trim()) ||
        "https://light-testnet-rpc.lightchain.ai",
      explorer: {
        name: "Lightchain Testnet Explorer",
        url: lcaiBlockscoutBrowserUrl,
      },
      accounts: [OWNER_WALLET_PRIVATE_KEY],
    },
    lcai_testnet_v2: {
      name: "Lightchain Testnet v2",
      type: "http",
      chainType: "l1",
      chainId: Number(LCAI_TESTNET_V2_CHAIN_ID ?? 504),
      url:
        (LCAI_TESTNET_V2_RPC_URL && LCAI_TESTNET_V2_RPC_URL.trim()) ||
        "http://localhost:8545",
      explorer: {
        name: LCAI_BLOCKSCOUT_NAME || "Lightchain v2 Blockscout",
        url: lcaiBlockscoutBrowserUrl,
      },
      accounts: [OWNER_WALLET_PRIVATE_KEY],
    },
    sepolia: {
      name: "Sepolia Testnet",
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      explorer: {
        name: "Sepolia Etherscan",
        url: "https://sepolia.etherscan.io",
      },
      accounts: [SEPOLIA_PRIVATE_KEY],
    },
    mainnet: {
      name: "Ethereum Mainnet",
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: MAINNET_RPC_URL || "https://eth.llamarpc.com",
      explorer: {
        name: "Etherscan",
        url: "https://etherscan.io",
      },
      accounts: MAINNET_PRIVATE_KEY ? [MAINNET_PRIVATE_KEY] : [],
    },
  },
  chainDescriptors: {
    504: {
      name: "Lightchain Testnet",
      blockExplorers: {
        blockscout: {
          name: LCAI_BLOCKSCOUT_NAME || "Lightchain Testnet Explorer",
          url: lcaiBlockscoutBrowserUrl,
          apiUrl: lcaiBlockscoutApiUrl,
        },
      },
    },
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
  },
};

export default config;
