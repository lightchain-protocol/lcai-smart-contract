// path: lcai-dao/scripts/deployment/deploy-multisender.ts
import { network } from "hardhat";
import fs from "fs";

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from "../abi/saveAbi.js";

// -------------------- Print Deployment Info To Console --------------------
import {
  printContractDeployed,
  printDeployingContract,
  printExplorerContractLink,
  printDeploymentHeader,
  printDeployerInfo,
} from "../logs/console/console_logger.js";

/**
 * Deploy MultiSender Contract
 *
 * This script deploys:
 * - MultiSender - A contract for batch sending tokens and ETH to multiple addresses
 *
 * Environment Variables:
 * - ARRAY_LIMIT: Maximum number of addresses allowed per batch (default: 200)
 *
 * Constructor Parameters:
 * - _arrayLimit: uint256 - Maximum number of addresses allowed per batch
 */

async function main() {
  printDeploymentHeader("📤 MULTISENDER DEPLOYMENT");
  console.log("");

  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const balance = ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  );
  printDeployerInfo(deployer.address, balance);

  const networkConfig = (network as any).config;
  const networkName = networkConfig?.name || (network as any).name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const explorerUrl = networkConfig?.explorer?.url || "";

  console.log(`📡 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`🔗 Explorer: ${explorerUrl}\n`);

  // Configuration
  const arrayLimit = process.env.ARRAY_LIMIT || "200";
  const arrayLimitBigInt = BigInt(arrayLimit);

  // ============================================================
  // Deploy MultiSender
  // ============================================================
  printDeployingContract("MultiSender");
  console.log(`   Array Limit: ${arrayLimit}`);

  const multiSenderFactory = await ethers.getContractFactory("MultiSender");
  const multiSender = await multiSenderFactory.deploy(arrayLimitBigInt);
  await multiSender.waitForDeployment();
  const multiSenderAddress = await multiSender.getAddress();

  printContractDeployed("MultiSender", multiSenderAddress);
  printExplorerContractLink("MultiSender", multiSenderAddress, explorerUrl);
  saveAbi("MultiSender", multiSenderFactory);

  // Verify deployment
  try {
    const limit = await multiSender.arrayLimit();
    const owner = await multiSender.owner();

    console.log("   ✅ MultiSender verified:");
    console.log(`      Array Limit: ${limit}`);
    console.log(`      Owner: ${owner}`);
    console.log("");
  } catch (error: any) {
    console.warn(`   ⚠️  Verification warning: ${error.message}`);
  }

  // ============================================================
  // Save Deployment Data
  // ============================================================
  const deploymentData = {
    deploymentId: Date.now().toString(),
    deployedBy: deployer.address,
    network: networkName,
    chainId: chainId.toString(),
    explorerUrl,
    deployedAt: new Date().toISOString(),
    contracts: {
      MultiSender: {
        name: "MultiSender",
        address: multiSenderAddress,
        explorerUrl: `${explorerUrl}/address/${multiSenderAddress}`,
        constructorArgs: [arrayLimit],
      },
    },
    configuration: {
      arrayLimit,
    },
  };

  // Save to file
  const deploymentsDir = "deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = `${deploymentsDir}/multisender-deployment.json`;
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`📁 Deployment data saved to: ${deploymentFile}`);
  console.log("");

  // ============================================================
  // Deployment Summary
  // ============================================================
  console.log("📋 Deployment Summary:");
  console.log("======================");
  console.log(`   📤 MultiSender: ${multiSenderAddress}`);
  console.log(`   📊 Array Limit: ${arrayLimit} addresses per batch`);
  console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`   👤 Deployer (Owner): ${deployer.address}`);
  console.log(`   🔗 Explorer: ${explorerUrl}`);
  console.log(`   📅 Timestamp: ${deploymentData.deployedAt}`);
  console.log("");

  // Print usage examples
  console.log("📋 Usage Examples:");
  console.log("==================");
  console.log("");
  console.log("1. Send ERC20 tokens to multiple addresses:");
  console.log("   ```javascript");
  console.log("   const tokenAddress = '0x...'; // Your ERC20 token");
  console.log("   const recipients = ['0xAddr1', '0xAddr2', '0xAddr3'];");
  console.log(
    "   const amounts = [ethers.parseEther('100'), ethers.parseEther('200'), ethers.parseEther('300')];"
  );
  console.log("");
  console.log("   // First approve MultiSender to spend your tokens");
  console.log("   await token.approve(multiSenderAddress, totalAmount);");
  console.log("");
  console.log("   // Then call multisendToken");
  console.log(
    "   await multiSender.multisendToken(tokenAddress, recipients, amounts);"
  );
  console.log("   ```");
  console.log("");
  console.log("2. Send ETH to multiple addresses:");
  console.log("   ```javascript");
  console.log("   const recipients = ['0xAddr1', '0xAddr2', '0xAddr3'];");
  console.log(
    "   const amounts = [ethers.parseEther('0.1'), ethers.parseEther('0.2'), ethers.parseEther('0.3')];"
  );
  console.log("   const totalETH = amounts.reduce((a, b) => a + b, 0n);");
  console.log("");
  console.log(
    "   await multiSender.multisendToken(ethers.ZeroAddress, recipients, amounts, { value: totalETH });"
  );
  console.log("   ```");
  console.log("");
  console.log("3. Update array limit (owner only):");
  console.log("   ```javascript");
  console.log("   await multiSender.setArrayLimit(500);");
  console.log("   ```");
  console.log("");
  console.log("4. Withdraw stuck tokens (owner only):");
  console.log("   ```javascript");
  console.log("   await multiSender.withdrawAll(tokenAddress);");
  console.log("   ```");
  console.log("");

  // Print verification commands
  console.log("📋 Contract Verification:");
  console.log("=========================");
  console.log("");
  console.log(
    `npx hardhat verify --network ${networkName} ${multiSenderAddress} "${arrayLimit}"`
  );
  console.log("");

  console.log("✅ Deployment completed successfully!");
  console.log("");

  return {
    multiSender: multiSenderAddress,
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
