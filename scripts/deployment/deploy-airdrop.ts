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

/**
 * Deploy DummyLCAIPresale, and LCAIAirdrop Contracts
 *
 * This script deploys:
 * 1. Token - A basic ERC20 token to use as the sale token
 * 2. DummyLCAIPresale - A mock presale contract for testing
 * 4. LCAIAirdrop - The airdrop contract that distributes rewards with claim and vesting options
 *
 * Environment Variables:
 * - AIRDROP_TOKEN_AMOUNT: Amount of tokens to deposit in airdrop contract (defaults to 100000)
 * - VESTING_DURATION_MONTHS: Vesting duration in months (defaults to 12)
 * - VESTING_REWARD_PERCENTAGE: Reward percentage for vesting option (defaults to 75)
 *
 * Configuration:
 * - Claim period: Opens immediately for 1 year (immediate 50% reward)
 * - Vesting period: Opens immediately for 1 year (configurable reward with linear vesting)
 */

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

  // Configuration
  const airdropTokenAmount = process.env.AIRDROP_TOKEN_AMOUNT || "100000";
  const vestingDurationMonths = process.env.VESTING_DURATION_MONTHS || "6"; // 6 months
  const vestingRewardPercentage = process.env.VESTING_REWARD_PERCENTAGE || "70"; // 70% for vesting option

  // Time configuration (1 year ahead)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const oneYearInSeconds = 365 * 24 * 60 * 60; // 1 year
  const claimStartTime = currentTimestamp;
  const claimEndTime = currentTimestamp + oneYearInSeconds;
  const vestingStartTime = currentTimestamp;
  const vestingEndTime = currentTimestamp + oneYearInSeconds;

  // ============================================================
  // Deploy or Use Existing Sale Token
  // ============================================================
  let saleTokenAddress: string;
  let saleTokenDeployed = false;

  // Deploy new Token
  printDeployingContract("Token (Sale Token)");
  console.log(`   Name: LCAI Token`);
  console.log(`   Symbol: LCAI`);

  const tokenFactory = await ethers.getContractFactory("Token");
  const token = await tokenFactory.deploy();
  await token.waitForDeployment();
  saleTokenAddress = await token.getAddress();
  saleTokenDeployed = true;

  printContractDeployed("Token", saleTokenAddress);
  printExplorerContractLink("Token", saleTokenAddress, explorerUrl);
  saveAbi("Token", tokenFactory);

  // Verify deployment
  try {
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);

    console.log("   ✅ Token verified:");
    console.log(`      Name: ${name}`);
    console.log(`      Symbol: ${symbol}`);
    console.log(
      `      Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`,
    );
    console.log(
      `      Deployer Balance: ${ethers.formatEther(deployerBalance)} ${symbol}`,
    );
    console.log("");
  } catch (error: any) {
    console.warn(`   ⚠️  Verification warning: ${error.message}`);
  }

  // ============================================================
  // Deploy DummyLCAIPresale
  // ============================================================
  printDeployingContract("DummyLCAIPresale");
  console.log(`   Sale Token: ${saleTokenAddress}`);

  const presaleFactory = await ethers.getContractFactory("DummyLCAIPresale");
  const presale = await presaleFactory.deploy(saleTokenAddress);
  await presale.waitForDeployment();
  const presaleAddress = await presale.getAddress();

  printContractDeployed("DummyLCAIPresale", presaleAddress);
  printExplorerContractLink("DummyLCAIPresale", presaleAddress, explorerUrl);
  saveAbi("DummyLCAIPresale", presaleFactory);

  // Verify deployment
  try {
    const tokenAddr = await presale.saleToken();
    const decimals = await presale.saleTokenDec();
    const owner = await presale.owner();

    console.log("   ✅ DummyLCAIPresale verified:");
    console.log(`      Sale Token: ${tokenAddr}`);
    console.log(`      Token Decimals: ${decimals}`);
    console.log(`      Owner: ${owner}`);
    console.log("");
  } catch (error: any) {
    console.warn(`   ⚠️  Verification warning: ${error.message}`);
  }

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
    const tokenAddr = await airdrop.token();
    const presaleAddr = await airdrop.lcaiPresale();
    const rewardPercentage = await airdrop.REWARD_PERCENTAGE();
    const owner = await airdrop.owner();

    console.log("   ✅ LCAIAirdrop verified:");
    console.log(`      Token: ${tokenAddr}`);
    console.log(`      Presale: ${presaleAddr}`);
    console.log(`      Reward Percentage: ${rewardPercentage}%`);
    console.log(`      Owner: ${owner}`);
    console.log("");
  } catch (error: any) {
    console.warn(`   ⚠️  Verification warning: ${error.message}`);
  }

  // ============================================================
  // Configure Contracts
  // ============================================================
  console.log("⚙️  Configuring contracts...\n");

  // Open claim period
  console.log(`   Opening claim period...`);
  console.log(`      Start: ${new Date(claimStartTime * 1000).toISOString()}`);
  console.log(`      End: ${new Date(claimEndTime * 1000).toISOString()}`);
  const openClaimTx = await airdrop.openClaim(claimStartTime, claimEndTime);
  await openClaimTx.wait();
  console.log(`   ✅ Claim period opened (1 year duration)`);

  // Open vesting period
  console.log(`   Opening vesting period...`);
  console.log(
    `      Start: ${new Date(vestingStartTime * 1000).toISOString()}`,
  );
  console.log(`      End: ${new Date(vestingEndTime * 1000).toISOString()}`);
  console.log(`      Duration: ${vestingDurationMonths} months`);
  console.log(`      Reward: ${vestingRewardPercentage}%`);
  const openVestingTx = await airdrop.openVesting(
    vestingStartTime,
    vestingEndTime,
    parseInt(vestingDurationMonths),
    parseInt(vestingRewardPercentage),
  );
  await openVestingTx.wait();
  console.log(`   ✅ Vesting period opened`);
  console.log("");

  // Deposit tokens to airdrop contract if we deployed the token
  if (saleTokenDeployed) {
    console.log(
      `   Depositing ${airdropTokenAmount} tokens to airdrop contract...`,
    );
    const tokenContract = await ethers.getContractAt("Token", saleTokenAddress);
    const depositAmount = ethers.parseEther(airdropTokenAmount);

    // Approve airdrop contract to spend tokens
    const approveTx = await tokenContract.approve(
      airdropAddress,
      depositAmount,
    );
    await approveTx.wait();
    console.log(`   ✅ Approved airdrop contract to spend tokens`);

    // Deposit tokens
    const depositTx = await airdrop.deposit(depositAmount);
    await depositTx.wait();
    console.log(
      `   ✅ Deposited ${airdropTokenAmount} tokens to airdrop contract`,
    );

    // Verify balance
    const airdropBalance = await tokenContract.balanceOf(airdropAddress);
    console.log(
      `   📊 Airdrop contract balance: ${ethers.formatEther(
        airdropBalance,
      )} tokens`,
    );
  }

  console.log("");

  // ============================================================
  // Deployment Summary
  // ============================================================
  console.log("📋 Deployment Summary:");
  console.log("======================");
  console.log(
    `   💰 Sale Token: ${saleTokenAddress}${
      saleTokenDeployed ? "" : " (existing)"
    }`,
  );
  console.log(`   🎯 DummyLCAIPresale: ${presaleAddress}`);
  console.log(`   🎁 LCAIAirdrop: ${airdropAddress}`);
  console.log(
    `   ⏰ Claim Period: ${new Date(claimStartTime * 1000).toLocaleDateString()} - ${new Date(claimEndTime * 1000).toLocaleDateString()}`,
  );
  console.log(`   📊 Vesting Duration: ${vestingDurationMonths} months`);
  console.log(`   🎁 Vesting Reward: ${vestingRewardPercentage}%`);
  console.log(
    `   ⏰ Vesting Period: ${new Date(vestingStartTime * 1000).toLocaleDateString()} - ${new Date(vestingEndTime * 1000).toLocaleDateString()}`,
  );
  console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`   👤 Deployer (Timelock & Admin): ${deployer.address}`);
  console.log(`   🔗 Explorer: ${explorerUrl}`);
  console.log(`   📅 Timestamp: ${new Date().toISOString()}`);
  console.log("");

  // Print next steps
  console.log("📋 Next Steps:");
  console.log("==============");
  console.log("1. Set buyer amounts in DummyLCAIPresale:");
  console.log("");
  console.log(`   // For single buyer`);
  console.log(`   await presale.setBuyerAmount(buyerAddress, amount);`);
  console.log("");
  console.log(`   // For multiple buyers`);
  console.log(
    `   await presale.setBuyerAmountsBatch([addr1, addr2], [amt1, amt2]);`,
  );
  console.log("");
  console.log("2. Users can claim airdrop (immediate 50%):");
  console.log(`   await airdrop.claim();`);
  console.log("");
  console.log(
    `   OR claim with vesting (${vestingRewardPercentage}% over ${vestingDurationMonths} months):`,
  );
  console.log(`   await airdrop.claimWithVesting();`);
  console.log("");
  console.log("3. Users who chose vesting can claim vested tokens:");
  console.log(`   await airdrop.claimVested();`);
  console.log("");
  console.log("4. Verify contracts on block explorer:");
  console.log("");
  if (saleTokenDeployed) {
    console.log(
      `   npx hardhat verify --network ${networkName} ${saleTokenAddress}`,
    );
  }
  console.log(
    `   npx hardhat verify --network ${networkName} ${presaleAddress} "${saleTokenAddress}"`,
  );
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
