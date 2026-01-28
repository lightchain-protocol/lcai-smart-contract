// path: lcai-dao/scripts/deployment/deploy-airdrop.ts
import { network } from "hardhat";

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

async function main() {
  printDeploymentHeader("🎁 AIRDROP SYSTEM DEPLOYMENT");
  console.log("");

  const { ethers, networkName } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const balance = ethers.formatEther(
    await ethers.provider.getBalance(deployer.address),
  );
  printDeployerInfo(deployer.address, balance);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const explorerUrl = "";

  console.log(`📡 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`🔗 Explorer: ${explorerUrl}\n`);

  const presaleAddress = "0x7f5620c13b1644b4244114b465fa71bd95f1d8dc";

  // ============================================================
  // Deploy LCAIAirdrop
  // ============================================================
  printDeployingContract("LCAIAirdrop");
  console.log(`   Presale Contract: ${presaleAddress}`);

  const airdropFactory = await ethers.getContractFactory("LCAIAirdrop");
  const airdrop = await airdropFactory.deploy(presaleAddress);
  await airdrop.waitForDeployment();
  const airdropAddress = await airdrop.getAddress();

  printContractDeployed("LCAIAirdrop", airdropAddress);
  printExplorerContractLink("LCAIAirdrop", airdropAddress, explorerUrl);
  saveAbi("LCAIAirdrop", airdropFactory);

  // Verify deployment
  try {
    const presaleAddr = await airdrop.lcaiPresale();
    const owner = await airdrop.owner();

    console.log("   ✅ LCAIAirdrop verified:");
    console.log(`      Presale: ${presaleAddr}`);
    console.log(`      Owner: ${owner}`);
    console.log("");
  } catch (error: any) {
    console.warn(`   ⚠️  Verification warning: ${error.message}`);
  }

  // ============================================================
  // Deployment Summary
  // ============================================================
  console.log("📋 Deployment Summary:");
  console.log("======================");
  console.log(`   🎁 LCAIAirdrop: ${airdropAddress}`);
  console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`   👤 Deployer: ${deployer.address}`);
  console.log(`   🔗 Explorer: ${explorerUrl}`);
  console.log(`   📅 Timestamp: ${new Date().toISOString()}`);
  console.log("");

  console.log(
    `   npx hardhat verify --network ${networkName} ${airdropAddress} "${presaleAddress}"`,
  );
  console.log("");

  console.log("✅ Deployment completed successfully!");
  console.log("");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  });

export default main;
