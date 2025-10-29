//path: lcai-dao-smart-contract/scripts/deployment/deploy.ts
import { network } from "hardhat";

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from '../abi/saveAbi.js';

// -------------------- Print Deployment Info To Console --------------------
import { printDeployingContract, printExplorerContractLink, printDeploymentHeader, printDeployerInfo, printContractDeployed, printWarning, printStep, printDeploymentSummary } from '../logs/console/console_logger.js';

// -------------------- Deployment History Logging --------------------
import { logDeploymentsHistory } from '../logs/data/data_logger.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Configuration Constants
const TIMELOCK_DELAY = 172800n; // 2 days in seconds
const VOTING_DELAY = 300; // 1 hour in blocks
const VOTING_PERIOD = 14400; // 2 days in blocks
const QUORUM_PERCENTAGE = 4; // 4% of total supply
const PRESALE_TOTAL_SUPPLY = 10000000n;

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  printDeploymentHeader("🚀 DAO GOVERNANCE SYSTEM DEPLOYMENT");
  
  const balance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  printDeployerInfo(deployer.address, balance);

  const networkConfig = (network as any).config;
  const networkName = networkConfig?.name || (network as any).name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const explorerUrl = networkConfig?.explorer?.url || "";

  const deploymentData: any = {
    network: networkName,
    chainId: Number(chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // ============================================================
  // Deploy LCAITimeLock
  // ============================================================
  printDeployingContract("LCAITimeLock");
  const timelockFactory = await ethers.getContractFactory("LCAITimeLock");
  const timelock = await timelockFactory.deploy(TIMELOCK_DELAY, [], [], deployer.address);
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  
  printContractDeployed("LCAITimeLock", timelockAddress);
  printExplorerContractLink("LCAITimeLock", timelockAddress, explorerUrl);
  saveAbi("LCAITimeLock", timelockFactory);
  
  deploymentData.contracts.LCAITimeLock = {
    address: timelockAddress,
    constructorArgs: [TIMELOCK_DELAY, [], [], deployer.address]
  };

  // ============================================================
  // Deploy PresaleVotingPower
  // ============================================================
  printDeployingContract("PresaleVotingPower");
  const presaleFactory = await ethers.getContractFactory("PresaleVotingPower");
  const PresaleVotingPower = await presaleFactory.deploy(PRESALE_TOTAL_SUPPLY);
  await PresaleVotingPower.waitForDeployment();
  const presaleAddress = await PresaleVotingPower.getAddress();
  
  printContractDeployed("PresaleVotingPower", presaleAddress);
  printExplorerContractLink("PresaleVotingPower", presaleAddress, explorerUrl);
  saveAbi("PresaleVotingPower", presaleFactory);
  
  deploymentData.contracts.PresaleVotingPower = {
    address: presaleAddress,
    constructorArgs: [PRESALE_TOTAL_SUPPLY]
  };

  // ============================================================
  // Deploy LCAIGovernor
  // ============================================================
  printDeployingContract("LCAIGovernor");
  
  // NOTE: For production, replace with Gnosis Safe address
  const adminAddress = deployer.address;
  
  const governorFactory = await ethers.getContractFactory("LCAIGovernor");
  const governor = await governorFactory.deploy(presaleAddress, timelockAddress, adminAddress);
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  
  printContractDeployed("LCAIGovernor", governorAddress);
  console.log("   Admin:", adminAddress);
  if (adminAddress === deployer.address) {
    printWarning("Using EOA as admin. For production, use Gnosis Safe!");
  }
  printExplorerContractLink("LCAIGovernor", governorAddress, explorerUrl);
  saveAbi("LCAIGovernor", governorFactory);
  
  deploymentData.contracts.LCAIGovernor = {
    address: governorAddress,
    constructorArgs: [presaleAddress, timelockAddress, adminAddress],
    admin: adminAddress
  };

  // ============================================================
  // Configure Timelock Roles
  // ============================================================
  printStep("Configuring Timelock roles...");
  await sleep(5000);

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const cancelRole = await timelock.CANCELLER_ROLE();
  
  await timelock.grantRole(proposerRole, governorAddress);
  await timelock.grantRole(executorRole, governorAddress);
  await timelock.grantRole(cancelRole, governorAddress);

  console.log("✅ Timelock roles configured\n");

  // ============================================================
  // Deploy Counter (Test Contract)
  // ============================================================
  printDeployingContract("Counter");
  const counterFactory = await ethers.getContractFactory("Counter");
  const counter = await counterFactory.deploy(timelockAddress);
  await counter.waitForDeployment();
  const counterAddress = await counter.getAddress();
  
  printContractDeployed("Counter", counterAddress);
  printExplorerContractLink("Counter", counterAddress, explorerUrl);
  saveAbi("Counter", counterFactory);
  
  deploymentData.contracts.Counter = {
    address: counterAddress,
    constructorArgs: [timelockAddress]
  };

  // ============================================================
  // Log Deployment History
  // ============================================================
  printStep("Logging deployment history...");
  logDeploymentsHistory(deploymentData);

  // ============================================================
  // Deployment Summary
  // ============================================================
  printDeploymentSummary({
    networkName,
    chainId: chainId.toString(),
    deployer: deployer.address,
    contracts: {
      LCAITimeLock: timelockAddress,
      PresaleVotingPower: presaleAddress,
      LCAIGovernor: governorAddress,
      Counter: counterAddress
    },
    config: {
      "Timelock Delay": `${Number(TIMELOCK_DELAY) / 86400} days (${TIMELOCK_DELAY} seconds)`,
      "Voting Delay": `${VOTING_DELAY / 300} hour (${VOTING_DELAY} blocks)`,
      "Voting Period": `${VOTING_PERIOD / 7200} days (${VOTING_PERIOD} blocks)`,
      "Quorum": `${QUORUM_PERCENTAGE}% of total supply`,
      "Admin": adminAddress
    },
    adminAddress,
    isAdminEOA: adminAddress === deployer.address,
    nextSteps: [
      "Verify contracts on block explorer",
      "Test governance by creating a proposal",
      "For production: Set up Gnosis Safe as admin",
      "Review: data/deployments/deploymentsHistory.json"
    ]
  });
}

main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
