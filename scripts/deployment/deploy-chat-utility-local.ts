import { network } from "hardhat";
import hardhatConfig from "../../hardhat.config.js";

import { saveAbi } from "../abi/saveAbi.js";
import {
  printContractDeployed,
  printDeployingContract,
  printExplorerContractLink,
} from "../logs/console/console_logger.js";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const timelockAddress = process.env.TIMELOCK_ADDRESS?.trim();
  if (!timelockAddress) {
    throw new Error("TIMELOCK_ADDRESS env var is required to deploy LCAIChatUtility");
  }

  const initialChatFee = ethers.parseEther(process.env.CHAT_FEE_LCAI ?? "0.001");
  const baseReward = ethers.parseEther(process.env.CHAT_BASE_REWARD_LCAI ?? "0.01");
  const epochDuration = Number(process.env.CHAT_EPOCH_DURATION ?? 7 * 24 * 60 * 60);
  const maxRewardPerEpoch = ethers.parseEther(
    process.env.CHAT_MAX_REWARD_PER_EPOCH_LCAI ?? "1000"
  );

  const networkName = (network as any).name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const networkCfg = (hardhatConfig.networks as any)?.[networkName] || {};
  const explorerUrl = networkCfg.explorer?.url || "";

  console.log("🚀 Deploying LCAIChatUtility (local helper)");
  console.log("========================================\n");
  console.log(`📡 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(
    `⚙️  Config -> chatFee: ${ethers.formatEther(initialChatFee)} LCAI, baseReward: ${ethers.formatEther(
      baseReward
    )} LCAI, epochDuration: ${epochDuration}s, maxRewardPerEpoch: ${ethers.formatEther(
      maxRewardPerEpoch
    )} LCAI`
  );
  console.log("");

  printDeployingContract("LCAIChatUtility");
  const chatFactory = await ethers.getContractFactory("LCAIChatUtility", deployer);
  const chatUtility = await chatFactory.deploy(
    initialChatFee,
    baseReward,
    epochDuration,
    maxRewardPerEpoch
  );
  await chatUtility.waitForDeployment();
  const chatUtilityAddress = await chatUtility.getAddress();

  printContractDeployed("LCAIChatUtility", chatUtilityAddress);
  printExplorerContractLink("LCAIChatUtility", chatUtilityAddress, explorerUrl);

  saveAbi("LCAIChatUtility", chatFactory);

  console.log("🔐 Transferring ownership to timelock...", timelockAddress);
  const transferTx = await chatUtility.transferOwnership(timelockAddress);
  await transferTx.wait();
  console.log("   ✅ Ownership transferred (tx:", transferTx.hash, ")");

  console.log("\n📋 Deployment Summary:");
  console.log("=======================");
  console.log(`   💬 LCAIChatUtility: ${chatUtilityAddress}`);
  console.log(`   👑 Owner (Timelock): ${timelockAddress}`);
  console.log(`   👤 Deployer: ${deployer.address}`);
  console.log(`   🌐 Explorer: ${explorerUrl}`);

  return { chatUtility: chatUtilityAddress, timelock: timelockAddress };
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("💥 Deployment failed:", err);
    process.exit(1);
  });


