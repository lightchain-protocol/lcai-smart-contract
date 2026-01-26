import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

const SOLIDITY_VERSION = "0.8.28";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: SOLIDITY_VERSION,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    lcaiTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("LCAI_TESTNET_RPC_URL"),
      accounts: [configVariable("OWNER_WALLET_PRIVATE_KEY")],
    },
    lcai_testnet_v2: {
      type: "http",
      chainType: "l1",
      url: configVariable("LCAI_TESTNET_V2_RPC_URL"),
      accounts: [configVariable("OWNER_WALLET_PRIVATE_KEY")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
