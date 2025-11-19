// path: lcai-dao/scripts/deployment/deploy-lcai-chat-subscription.ts
import { network } from "hardhat";
import fs from "fs";
import hardhatConfig from "../../hardhat.config.js";
import { syncDeploymentArtifacts } from "./utils/updateDeploymentArtifacts.js";

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from "../abi/saveAbi.js";

// -------------------- Print Deployment Info To Console --------------------
import {
  printDeployingContract,
  printExplorerContractLink,
} from "../logs/console/console_logger.js";

/**
 * Deploy LCAIChatSubscription Contract
 *
 * This script deploys the LCAIChatSubscription contract for managing chat subscriptions.
 * The contract supports 3 tiers with monthly and yearly durations.
 *
 * Required Environment Variables:
 * - TREASURY_ADDRESS: Address where subscription payments will be sent
 * - DEFAULT_ADMIN_ADDRESS: Address of the default admin (will have both admin roles)
 */

async function main() {
  console.log("🚀 Deploying LCAIChatSubscription");
  console.log("==================================");
  console.log("");

  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  // Get addresses from environment
  const treasuryAddress = process.env.TREASURY_ADDRESS?.trim();
  const defaultAdminAddress =
    process.env.DEFAULT_ADMIN_ADDRESS?.trim() || deployer.address;

  if (!treasuryAddress) {
    console.error("❌ Error: Missing required environment variable TREASURY_ADDRESS");
    console.error("   Set TREASURY_ADDRESS=0x... in your .env file before deploying.");
    process.exit(1);
  }

  // Get network info
  const networkName = (network as any).name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log(`📡 Deploying to network: ${networkName} (chainId: ${chainId})`);

  // Get explorer URL from Hardhat config
  const networkConfig = (hardhatConfig.networks as any)?.[networkName] || {};
  const explorerUrl = networkConfig.explorer?.url || "";

  console.log(`👤 Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`🔗 Explorer: ${explorerUrl}\n`);

  console.log("📋 Deployment Configuration:");
  console.log(`   Treasury: ${treasuryAddress}`);
  console.log(`   Default Admin: ${defaultAdminAddress}`);
  console.log("");

  // ==================== Deploy LCAIChatSubscription ====================
  console.log("1️⃣ Deploying LCAIChatSubscription...");
  printDeployingContract("LCAIChatSubscription");

  const LCAIChatSubscription = await ethers.getContractFactory(
    "LCAIChatSubscription",
    deployer
  );

  console.log(
    `   📋 Constructor arguments: [${treasuryAddress}, ${defaultAdminAddress}]`
  );

  let subscription;
  try {
    subscription = await LCAIChatSubscription.deploy(
      treasuryAddress,
      defaultAdminAddress
    );
    await subscription.waitForDeployment();
  } catch (error: any) {
    console.error("   ❌ Deployment failed:", error.message);
    process.exit(1);
  }

  const subscriptionAddress = await subscription.getAddress();

  console.log(`   ✅ LCAIChatSubscription deployed at: ${subscriptionAddress}`);
  printExplorerContractLink(
    "LCAIChatSubscription",
    subscriptionAddress,
    explorerUrl
  );

  // Verify contract has code
  const code = await deployer.provider!.getCode(subscriptionAddress);
  console.log(`   📄 Contract code length: ${code.length} bytes`);
  if (code.length <= 2) {
    console.log(`   ❌ WARNING: Contract has no code!`);
  } else {
    console.log(`   ✅ Contract code verified`);
  }
  console.log("");

  // Verify deployment
  console.log("   🔍 Verifying deployment...");
  try {
    const treasury = await subscription.treasury();
    const isAdmin = await subscription.isAdmin(defaultAdminAddress);
    const totalSubscribers = await subscription.getTotalActiveSubscribers();
    const paused = await subscription.paused();

    // Get all plans
    const plans = await subscription.getAllPlans();

    console.log("   ✅ Contract successfully initialized:");
    console.log(`      Treasury: ${treasury}`);
    console.log(
      `      Default Admin: ${defaultAdminAddress} (is admin: ${isAdmin})`
    );
    console.log(`      Total Active Subscribers: ${totalSubscribers}`);
    console.log(`      Paused: ${paused}`);
    console.log("");
    console.log("   📊 Default Pricing:");
    console.log(
      `      Tier 1: ${ethers.formatEther(
        plans[0].monthlyPrice
      )} LCAI/month, ${ethers.formatEther(
        plans[0].yearlyPrice
      )} LCAI/year (Active: ${plans[0].isActive})`
    );
    console.log(
      `      Tier 2: ${ethers.formatEther(
        plans[1].monthlyPrice
      )} LCAI/month, ${ethers.formatEther(
        plans[1].yearlyPrice
      )} LCAI/year (Active: ${plans[1].isActive})`
    );
    console.log(
      `      Tier 3: ${ethers.formatEther(
        plans[2].monthlyPrice
      )} LCAI/month, ${ethers.formatEther(
        plans[2].yearlyPrice
      )} LCAI/year (Active: ${plans[2].isActive})`
    );
    console.log("");
  } catch (error: any) {
    console.error("   ❌ Verification failed:", error.message);
    process.exit(1);
  }

  // Save ABI
  try {
    saveAbi("LCAIChatSubscription", LCAIChatSubscription);
    console.log(`📄 ABI saved for LCAIChatSubscription`);
  } catch (error: any) {
    console.warn(
      `⚠️ Failed to save ABI for LCAIChatSubscription:`,
      error.message
    );
  }
  console.log("");

  // ==================== Save Deployment Data ====================
  const plans = await subscription.getAllPlans();

  const deploymentData = {
    deploymentId: Date.now().toString(),
    deployedBy: deployer.address,
    network: networkName,
    chainId: chainId.toString(),
    explorerUrl,
    deployedAt: new Date().toISOString(),
    contract: {
      name: "LCAIChatSubscription",
      address: subscriptionAddress,
      explorerUrl: `${explorerUrl}/address/${subscriptionAddress}`,
      constructorArgs: [treasuryAddress, defaultAdminAddress],
    },
    configuration: {
      treasury: treasuryAddress,
      defaultAdmin: defaultAdminAddress,
      pricing: {
        tier1: {
          monthly: ethers.formatEther(plans[0].monthlyPrice),
          yearly: ethers.formatEther(plans[0].yearlyPrice),
          active: plans[0].isActive,
        },
        tier2: {
          monthly: ethers.formatEther(plans[1].monthlyPrice),
          yearly: ethers.formatEther(plans[1].yearlyPrice),
          active: plans[1].isActive,
        },
        tier3: {
          monthly: ethers.formatEther(plans[2].monthlyPrice),
          yearly: ethers.formatEther(plans[2].yearlyPrice),
          active: plans[2].isActive,
        },
      },
    },
  };

  // Save to file
  const deploymentsDir = "deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = `${deploymentsDir}/lcai-chat-subscription-deployment.json`;
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`📁 Deployment data saved to: ${deploymentFile}`);
  console.log("");

  syncDeploymentArtifacts(process.cwd(), networkName, {
    chatSubscription: subscriptionAddress,
    treasury: treasuryAddress,
  });

  // Print next steps
  console.log("📋 Next Steps:");
  console.log("==============");
  console.log("1. Verify the contract on the block explorer:");
  console.log("");
  console.log(
    `   npx hardhat verify --network ${networkName} ${subscriptionAddress} \\`
  );
  console.log(`     "${treasuryAddress}" \\`);
  console.log(`     "${defaultAdminAddress}"`);
  console.log("");
  console.log("2. Test the deployment:");
  console.log(`   - Call subscribe() to test subscription purchase`);
  console.log(`   - Verify payments go to treasury: ${treasuryAddress}`);
  console.log(`   - Check hasActiveSubscription() for users`);
  console.log(`   - Test getSubscription() to view details`);
  console.log("");
  console.log("3. Configure subscription (via admin):");
  console.log(`   - Update plan pricing if needed`);
  console.log(`   - Add additional admins with addAdmin()`);
  console.log(`   - Update treasury address if needed`);
  console.log(`   - Activate/deactivate tiers`);
  console.log("");
  console.log("4. Admin management:");
  console.log(`   - Default admin can add/remove other admins`);
  console.log(`   - Admins can update pricing and pause/unpause`);
  console.log(`   - Only default admin can change treasury`);
  console.log("");

  console.log("✅ Deployment completed successfully!");
  console.log("");

  // Print summary
  console.log("\n📋 Deployment Summary:");
  console.log("=======================");
  console.log(`   💳 LCAIChatSubscription: ${subscriptionAddress}`);
  console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`   👤 Deployer: ${deployer.address}`);
  console.log(`   🔗 Explorer: ${explorerUrl}`);
  console.log(`   📅 Timestamp: ${deploymentData.deployedAt}`);
  console.log("");

  console.log("📊 Configuration:");
  console.log("=================");
  console.log(`   💰 Treasury: ${treasuryAddress}`);
  console.log(`   🔐 Default Admin: ${defaultAdminAddress}`);
  console.log(`   ⏸️  Paused: No`);
  console.log("");
  console.log("   Pricing:");
  console.log(
    `   ├─ Tier 1: ${deploymentData.configuration.pricing.tier1.monthly} LCAI/month, ${deploymentData.configuration.pricing.tier1.yearly} LCAI/year`
  );
  console.log(
    `   ├─ Tier 2: ${deploymentData.configuration.pricing.tier2.monthly} LCAI/month, ${deploymentData.configuration.pricing.tier2.yearly} LCAI/year`
  );
  console.log(
    `   └─ Tier 3: ${deploymentData.configuration.pricing.tier3.monthly} LCAI/month, ${deploymentData.configuration.pricing.tier3.yearly} LCAI/year`
  );
  console.log("");

  return {
    subscription: subscriptionAddress,
    deploymentData,
  };
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  });

export default main;
