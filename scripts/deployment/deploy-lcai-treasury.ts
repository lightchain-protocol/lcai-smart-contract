// path: lcai-dao/scripts/deployment/deploy-lcai-treasury.ts
import { network } from "hardhat";
import fs from "fs";
import { syncDeploymentArtifacts } from "./utils/updateDeploymentArtifacts.js";

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from "../abi/saveAbi.js";

// -------------------- Print Deployment Info To Console --------------------
import {
  printContractDeployed,
  printDeployingContract,
  printExplorerContractLink,
} from "../logs/console/console_logger.js";

/**
 * Deploy LCAITreasury Contract
 *
 * This script deploys the LCAITreasury contract for managing LCAI funds.
 * The treasury requires a timelock (owner) and an admin (multisig contract).
 */

async function main() {
  console.log("🚀 Deploying LCAITreasury");
  console.log("=========================");
  console.log("");

  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const networkConfig = (network as any).config;
  const networkName = networkConfig?.name || (network as any).name;
  const explorerUrl = networkConfig.explorer?.url || "";

  const timelockAddressEnv = process.env.TIMELOCK_ADDRESS?.trim();
  const adminAddressEnv = process.env.ADMIN_ADDRESS?.trim();

  if (!timelockAddressEnv) {
    throw new Error(
      "TIMELOCK_ADDRESS env var is required. Set it to the LCAITimeLock contract address."
    );
  }

  let adminAddress = adminAddressEnv;
  let mockAdminAddress: string | undefined;

  if (!adminAddress || adminAddress === "") {
    const shouldDeployMockAdmin = process.env.USE_MOCK_ADMIN === "true";
    if (!shouldDeployMockAdmin) {
      throw new Error(
        "ADMIN_ADDRESS env var is required. Set USE_MOCK_ADMIN=true to deploy a MockAdmin automatically for local testing."
      );
    }

    printDeployingContract("MockAdmin");
    const mockAdminFactory = await ethers.getContractFactory("MockAdmin", deployer);
    const mockAdmin = await mockAdminFactory.deploy(deployer.address);
    await mockAdmin.waitForDeployment();
    mockAdminAddress = await mockAdmin.getAddress();
    adminAddress = mockAdminAddress;

    printContractDeployed("MockAdmin", mockAdminAddress);
    printExplorerContractLink("MockAdmin", mockAdminAddress, explorerUrl);

    try {
      saveAbi("MockAdmin", mockAdminFactory);
    } catch (error: any) {
      console.warn(`⚠️ Failed to save ABI for MockAdmin:`, error.message);
    }
  }

  if (!adminAddress) {
    throw new Error("Failed to resolve admin address");
  }

  const adminCode = await deployer.provider!.getCode(adminAddress);
  if (adminCode === "0x") {
    throw new Error(
      `ADMIN_ADDRESS ${adminAddress} is not a contract. Provide a multisig or enable USE_MOCK_ADMIN.`
    );
  }

  const timelockAddress = timelockAddressEnv;

  console.log(`📡 Deploying to network: ${networkName} (chainId: ${chainId})`);

  console.log(`👤 Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`🔗 Explorer: ${explorerUrl}\n`);

  console.log("📋 Deployment Configuration:");
  console.log(`   Timelock (Owner): ${timelockAddress}`);
  console.log(`   Admin (Multisig): ${adminAddress}`);
  console.log("");

  // ==================== Deploy LCAITreasury ====================
  console.log("1️⃣ Deploying LCAITreasury...");
  printDeployingContract("LCAITreasury");

  const LCAITreasury = await ethers.getContractFactory(
    "LCAITreasury",
    deployer
  );

  console.log(
    `   📋 Constructor arguments: [${timelockAddress}, ${adminAddress}]`
  );

  let treasury;
  try {
    treasury = await LCAITreasury.deploy(timelockAddress, adminAddress);
    await treasury.waitForDeployment();
  } catch (error: any) {
    console.error("   ❌ Deployment failed:", error.message);
    if (error.message.includes("AdminMustBeMultisig")) {
      console.error(
        "   ⚠️  The admin address must be a contract (multisig), not an EOA"
      );
      console.error(
        "   💡 Deploy a Gnosis Safe or use an existing multisig address"
      );
    }
    process.exit(1);
  }

  const treasuryAddress = await treasury.getAddress();

  console.log(`   ✅ LCAITreasury deployed at: ${treasuryAddress}`);
  printExplorerContractLink("LCAITreasury", treasuryAddress, explorerUrl);

  // Verify contract has code
  const code = await deployer.provider!.getCode(treasuryAddress);
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
    const owner = await treasury.owner();
    const admin = await treasury.admin();
    const spent = await treasury.spent();
    const isWhitelisted = await treasury.isWhitelisted();
    const isBlacklisted = await treasury.isBlacklisted();
    const paused = await treasury.paused();

    console.log("   ✅ Contract successfully initialized:");
    console.log(`      Owner: ${owner}`);
    console.log(`      Admin: ${admin}`);
    console.log(`      Spent: ${ethers.formatEther(spent)} ETH`);
    console.log(`      Whitelist Mode: ${isWhitelisted}`);
    console.log(`      Blacklist Mode: ${isBlacklisted}`);
    console.log(`      Paused: ${paused}`);
    console.log("");
  } catch (error: any) {
    console.error("   ❌ Verification failed:", error.message);
    process.exit(1);
  }

  // Save ABI
  try {
    saveAbi("LCAITreasury", LCAITreasury);
    console.log(`📄 ABI saved for LCAITreasury`);
  } catch (error: any) {
    console.warn(`⚠️ Failed to save ABI for LCAITreasury:`, error.message);
  }
  console.log("");

  // ==================== Save Deployment Data ====================
  const deploymentData = {
    deploymentId: Date.now().toString(),
    deployedBy: deployer.address,
    network: networkName,
    chainId: chainId.toString(),
    explorerUrl,
    deployedAt: new Date().toISOString(),
    contract: {
      name: "LCAITreasury",
      address: treasuryAddress,
      explorerUrl: `${explorerUrl}/address/${treasuryAddress}`,
      constructorArgs: [timelockAddress, adminAddress],
    },
    configuration: {
      timelock: timelockAddress,
      admin: adminAddress,
    },
  };

  // Save to file
  const deploymentsDir = "deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = `${deploymentsDir}/lcai-treasury-deployment.json`;
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`📁 Deployment data saved to: ${deploymentFile}`);
  console.log("");

  syncDeploymentArtifacts(process.cwd(), networkName, {
    treasury: treasuryAddress,
    timelock: timelockAddress,
  });

  // Print next steps
  console.log("📋 Next Steps:");
  console.log("==============");
  console.log("1. Verify the contract on the block explorer:");
  console.log("");
  console.log(
    `   npx hardhat verify --network ${networkName} ${treasuryAddress} \\`
  );
  console.log(`     "${timelockAddress}" \\`);
  console.log(`     "${adminAddress}"`);
  console.log("");
  console.log("2. Fund the treasury:");
  console.log(`   Send LCAI to: ${treasuryAddress}`);
  console.log("");
  console.log("3. Configure treasury (via admin):");
  console.log(`   - Set whitelist/blacklist addresses`);
  console.log(`   - Enable/disable whitelist or blacklist modes`);
  console.log(`   - Pause/unpause if needed`);
  console.log("");

  console.log("✅ Deployment completed successfully!");
  console.log("");

  // Print summary
  console.log("\n📋 Deployment Summary:");
  console.log("=======================");
  console.log(`   💰 LCAITreasury: ${treasuryAddress}`);
  console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`   👤 Deployer: ${deployer.address}`);
  console.log(`   🔗 Explorer: ${explorerUrl}`);
  console.log(`   📅 Timestamp: ${deploymentData.deployedAt}`);
  console.log("");

  console.log("📊 Configuration:");
  console.log("=================");
  console.log(`   👑 Owner (Timelock): ${timelockAddress}`);
  console.log(`   🔐 Admin (Multisig): ${adminAddress}`);
  console.log(`   ✅ Whitelist Mode: Disabled`);
  console.log(`   ❌ Blacklist Mode: Disabled`);
  console.log(`   ⏸️  Paused: No`);
  console.log("");

  return {
    treasury: treasuryAddress,
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
