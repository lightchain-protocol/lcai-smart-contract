/**
 * Governance Stack Deployment Script
 * Deploys: LCAITimeLock -> LCAIGovernor -> LCAITreasury -> LCAIChatSubscription
 *
 * Usage:
 *   npx hardhat run scripts/deployment/deploy-governance-stack.ts --network <network>
 *
 * Environment Variables:
 *   - OWNER_WALLET_PRIVATE_KEY: Deployer private key
 *   - PAYMENT_TOKEN_ADDRESS: (optional) ERC20 token for subscription payments
 *   - WLCAI_ADDRESS: (optional) Existing WLCAI voting token address
 *   - USE_MOCK_ADMIN: Set to "true" for local testing (deploys MockAdmin contract)
 */

import { network } from "hardhat";
import fs from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ADMIN_MULTISIG: "0xa159B1aEC2e17254213A5e263baf1d89968E8Db9",
  VOTING_TOKEN: "0x9cA8530CA349c966Fe9ef903Df17a75B8A778927", // WLCAI voting token
  TIMELOCK_MIN_DELAY: 172800n, // 2 days in seconds (production)
  TIMELOCK_MIN_DELAY_LOCAL: 60n, // 60 seconds for local testing
  ARTIFACTS_DIR: path.join(process.cwd(), "deployments"),
  DEPLOYMENT_FILE: "governance-stack-deployment.json",
};

// ============================================================================
// TYPES
// ============================================================================

interface DeploymentResult {
  network: string;
  chainId: number;
  timestamp: string;
  deployer: string;
  contracts: {
    wlcai: { address: string; deployed: boolean };
    timelock: { address: string };
    governor: { address: string };
    treasury: { address: string };
    chatSubscription: { address: string };
  };
  config: {
    adminMultisig: string;
    timelockDelay: string;
    paymentToken: string;
  };
  roles: {
    proposer: string;
    executor: string;
    canceller: string;
    admin: string;
  };
  verification?: {
    wlcai?: string;
    timelock: string;
    governor: string;
    treasury: string;
    chatSubscription: string;
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function log(message: string, indent = 0) {
  const prefix = "  ".repeat(indent);
  console.log(`${prefix}${message}`);
}

function logSection(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60) + "\n");
}

function logContract(name: string, address: string) {
  log(`${name}: ${address}`);
}

async function saveDeployment(deployment: DeploymentResult) {
  if (!fs.existsSync(CONFIG.ARTIFACTS_DIR)) {
    fs.mkdirSync(CONFIG.ARTIFACTS_DIR, { recursive: true });
  }
  const filePath = path.join(CONFIG.ARTIFACTS_DIR, CONFIG.DEPLOYMENT_FILE);
  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
  log(`Deployment saved to: ${filePath}`);
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

async function deployMockAdmin(ethers: any, ownerAddress: string) {
  log("Deploying MockAdmin for local testing...");
  const factory = await ethers.getContractFactory("MockAdmin");
  const contract = await factory.deploy(ownerAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("MockAdmin", address);
  return { contract, address };
}

async function deployWLCAI(ethers: any) {
  log("Deploying WLCAI voting token...");
  const factory = await ethers.getContractFactory("WLCAI");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("WLCAI", address);
  return { contract, address, deployed: true };
}

async function deployTimelock(
  ethers: any,
  deployerAddress: string,
  minDelay: bigint
) {
  log("Deploying LCAITimeLock...");
  log(`  Min delay: ${minDelay} seconds`, 1);
  log(`  Initial admin: ${deployerAddress} (deployer)`, 1);

  // Deploy with deployer as admin so we can configure roles
  // Admin role will be transferred after configuration
  const proposers: string[] = [];
  const executors: string[] = [ethers.ZeroAddress]; // Anyone can execute
  const admin = deployerAddress;

  const factory = await ethers.getContractFactory("LCAITimeLock");
  const contract = await factory.deploy(minDelay, proposers, executors, admin);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("LCAITimeLock", address);
  return { contract, address };
}

async function deployGovernor(
  ethers: any,
  votingTokenAddress: string,
  timelockAddress: string,
  adminMultisig: string
) {
  log("Deploying LCAIGovernor...");
  log(`  Voting token: ${votingTokenAddress}`, 1);
  log(`  Timelock: ${timelockAddress}`, 1);
  log(`  Admin: ${adminMultisig}`, 1);

  const factory = await ethers.getContractFactory("LCAIGovernor");
  const contract = await factory.deploy(
    votingTokenAddress,
    timelockAddress,
    adminMultisig
  );
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("LCAIGovernor", address);
  return { contract, address };
}

async function deployTreasury(
  ethers: any,
  timelockAddress: string,
  adminMultisig: string
) {
  log("Deploying LCAITreasury...");
  log(`  Owner (Timelock): ${timelockAddress}`, 1);
  log(`  Admin: ${adminMultisig}`, 1);

  const factory = await ethers.getContractFactory("LCAITreasury");
  const contract = await factory.deploy(timelockAddress, adminMultisig);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("LCAITreasury", address);
  return { contract, address };
}

async function deployChatSubscription(
  ethers: any,
  paymentTokenAddress: string,
  treasuryAddress: string,
  timelockAddress: string,
  adminMultisig: string
) {
  log("Deploying LCAIChatSubscription...");
  log(`  Payment token: ${paymentTokenAddress}`, 1);
  log(`  Treasury: ${treasuryAddress}`, 1);
  log(`  Owner (Timelock): ${timelockAddress}`, 1);
  log(`  Admin: ${adminMultisig}`, 1);

  const factory = await ethers.getContractFactory("LCAIChatSubscription");
  const contract = await factory.deploy(
    paymentTokenAddress,
    treasuryAddress,
    timelockAddress,
    adminMultisig
  );
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logContract("LCAIChatSubscription", address);
  return { contract, address };
}

// ============================================================================
// ROLE CONFIGURATION
// ============================================================================

async function configureTimelockRoles(
  ethers: any,
  timelock: any,
  governorAddress: string,
  adminAddress: string,
  deployerAddress: string
) {
  log("Configuring timelock roles...");

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

  log(`  PROPOSER_ROLE: ${PROPOSER_ROLE}`, 1);
  log(`  CANCELLER_ROLE: ${CANCELLER_ROLE}`, 1);
  log(`  EXECUTOR_ROLE: ${EXECUTOR_ROLE}`, 1);
  log(`  DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`, 1);

  // Grant PROPOSER_ROLE to Governor
  log(`  Granting PROPOSER_ROLE to Governor...`, 1);
  const tx1 = await timelock.grantRole(PROPOSER_ROLE, governorAddress);
  await tx1.wait();
  log(`    Done`, 2);

  // Grant CANCELLER_ROLE to Governor
  log(`  Granting CANCELLER_ROLE to Governor...`, 1);
  const tx2 = await timelock.grantRole(CANCELLER_ROLE, governorAddress);
  await tx2.wait();
  log(`    Done`, 2);

  // Grant DEFAULT_ADMIN_ROLE to admin (multisig)
  log(`  Granting DEFAULT_ADMIN_ROLE to Admin...`, 1);
  const tx3 = await timelock.grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
  await tx3.wait();
  log(`    Done`, 2);

  // Revoke DEFAULT_ADMIN_ROLE from deployer (optional but recommended for production)
  log(`  Revoking DEFAULT_ADMIN_ROLE from deployer...`, 1);
  const tx4 = await timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployerAddress);
  await tx4.wait();
  log(`    Done`, 2);

  // Verify roles
  const hasProposer = await timelock.hasRole(PROPOSER_ROLE, governorAddress);
  const hasCanceller = await timelock.hasRole(CANCELLER_ROLE, governorAddress);
  const hasExecutor = await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress);
  const adminHasRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, adminAddress);
  const deployerHasRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress);

  log(`  Role verification:`, 1);
  log(`    Governor has PROPOSER_ROLE: ${hasProposer}`, 2);
  log(`    Governor has CANCELLER_ROLE: ${hasCanceller}`, 2);
  log(`    Anyone can execute: ${hasExecutor}`, 2);
  log(`    Admin has DEFAULT_ADMIN_ROLE: ${adminHasRole}`, 2);
  log(`    Deployer has DEFAULT_ADMIN_ROLE: ${deployerHasRole}`, 2);

  if (!hasProposer || !hasCanceller || !adminHasRole || deployerHasRole) {
    throw new Error("Role configuration failed");
  }

  return {
    proposer: governorAddress,
    executor: ethers.ZeroAddress,
    canceller: governorAddress,
    admin: adminAddress,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { ethers } = await network.connect() as any;
  const [deployer] = await ethers.getSigners();

  // Get network info
  const networkConfig = (network as any).config;
  const networkName = networkConfig?.name || (network as any).name || "unknown";
  const chainId = (await ethers.provider.getNetwork()).chainId;
  // Chain ID 31337 is hardhat's default local chain
  const isLocalNetwork =
    networkName === "hardhat" ||
    networkName === "localhost" ||
    chainId === 31337n;

  logSection("GOVERNANCE STACK DEPLOYMENT");

  log(`Network: ${networkName}`);
  log(`Chain ID: ${chainId}`);
  log(`Deployer: ${deployer.address}`);
  log(`Local Network: ${isLocalNetwork}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const paymentTokenEnv = process.env.PAYMENT_TOKEN_ADDRESS;
  const existingWlcaiEnv = process.env.WLCAI_ADDRESS;
  const useMockAdmin = process.env.USE_MOCK_ADMIN === "true" || isLocalNetwork;

  // Determine admin address
  let adminAddress = CONFIG.ADMIN_MULTISIG;
  let mockAdminDeployed = false;

  // Check if admin is a contract (required by LCAIGovernor and LCAITreasury)
  const adminCode = await ethers.provider.getCode(adminAddress);
  const adminIsContract = adminCode !== "0x";

  if (!adminIsContract) {
    if (useMockAdmin) {
      logSection("STEP 0: Deploy MockAdmin (Local Testing)");
      const mockResult = await deployMockAdmin(ethers, deployer.address);
      adminAddress = mockResult.address;
      mockAdminDeployed = true;
      log(`Using MockAdmin as admin: ${adminAddress}`);
    } else {
      throw new Error(
        `Admin address ${CONFIG.ADMIN_MULTISIG} is not a contract. ` +
        `Use USE_MOCK_ADMIN=true for local testing or provide a valid multisig address.`
      );
    }
  }

  // Use shorter timelock delay for local testing
  const timelockDelay = isLocalNetwork
    ? CONFIG.TIMELOCK_MIN_DELAY_LOCAL
    : CONFIG.TIMELOCK_MIN_DELAY;

  logSection("STEP 1: Voting Token Setup");

  let votingTokenAddress: string;
  let votingTokenDeployed = false;

  // Priority: env var > config > deploy new (local only)
  if (existingWlcaiEnv) {
    log(`Using WLCAI from env: ${existingWlcaiEnv}`);
    votingTokenAddress = existingWlcaiEnv;
  } else if (!isLocalNetwork) {
    // Production: use configured token address
    log(`Using configured voting token: ${CONFIG.VOTING_TOKEN}`);
    votingTokenAddress = CONFIG.VOTING_TOKEN;
    
    // Verify token exists
    const tokenCode = await ethers.provider.getCode(votingTokenAddress);
    if (tokenCode === "0x") {
      throw new Error(`Voting token at ${votingTokenAddress} is not a contract`);
    }
  } else {
    // Local: deploy new WLCAI
    const result = await deployWLCAI(ethers);
    votingTokenAddress = result.address;
    votingTokenDeployed = true;
  }

  // Payment token defaults to voting token if not specified
  const paymentTokenAddress = paymentTokenEnv || votingTokenAddress;

  logSection("STEP 2: Deploy LCAITimeLock");

  const timelockResult = await deployTimelock(
    ethers,
    deployer.address, // Deployer as initial admin
    timelockDelay
  );

  logSection("STEP 3: Deploy LCAIGovernor");

  const governorResult = await deployGovernor(
    ethers,
    votingTokenAddress,
    timelockResult.address,
    adminAddress
  );

  logSection("STEP 4: Configure Timelock Roles");

  const roles = await configureTimelockRoles(
    ethers,
    timelockResult.contract,
    governorResult.address,
    adminAddress,
    deployer.address
  );

  logSection("STEP 5: Deploy LCAITreasury");

  const treasuryResult = await deployTreasury(
    ethers,
    timelockResult.address,
    adminAddress
  );

  logSection("STEP 6: Deploy LCAIChatSubscription");

  const subscriptionResult = await deployChatSubscription(
    ethers,
    paymentTokenAddress,
    treasuryResult.address,
    timelockResult.address,
    adminAddress
  );

  logSection("DEPLOYMENT SUMMARY");

  // Build verification commands
  const verificationCommands = {
    ...(votingTokenDeployed && {
      wlcai: `npx hardhat verify --network ${networkName} ${votingTokenAddress}`,
    }),
    timelock: `npx hardhat verify --network ${networkName} ${timelockResult.address} ${timelockDelay} '[]' '["${ethers.ZeroAddress}"]' ${deployer.address}`,
    governor: `npx hardhat verify --network ${networkName} ${governorResult.address} ${votingTokenAddress} ${timelockResult.address} ${adminAddress}`,
    treasury: `npx hardhat verify --network ${networkName} ${treasuryResult.address} ${timelockResult.address} ${adminAddress}`,
    chatSubscription: `npx hardhat verify --network ${networkName} ${subscriptionResult.address} ${paymentTokenAddress} ${treasuryResult.address} ${timelockResult.address} ${adminAddress}`,
  };

  const deployment: DeploymentResult = {
    network: networkName,
    chainId: Number(chainId),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      wlcai: { address: votingTokenAddress, deployed: votingTokenDeployed },
      timelock: { address: timelockResult.address },
      governor: { address: governorResult.address },
      treasury: { address: treasuryResult.address },
      chatSubscription: { address: subscriptionResult.address },
    },
    config: {
      adminMultisig: adminAddress,
      timelockDelay: timelockDelay.toString(),
      paymentToken: paymentTokenAddress,
    },
    roles,
    ...(!isLocalNetwork && { verification: verificationCommands }),
  };

  console.log("\nDeployed Contracts:");
  console.log("-".repeat(50));
  if (mockAdminDeployed) {
    logContract("MockAdmin (local)", adminAddress);
  }
  logContract(`Voting Token${votingTokenDeployed ? " (deployed)" : " (existing)"}`, votingTokenAddress);
  logContract("LCAITimeLock", timelockResult.address);
  logContract("LCAIGovernor", governorResult.address);
  logContract("LCAITreasury", treasuryResult.address);
  logContract("LCAIChatSubscription", subscriptionResult.address);

  console.log("\nConfiguration:");
  console.log("-".repeat(50));
  log(`Admin: ${adminAddress}${mockAdminDeployed ? " (MockAdmin)" : " (Multisig)"}`);
  log(`Timelock Delay: ${timelockDelay} seconds`);
  log(`Payment Token: ${paymentTokenAddress}`);

  console.log("\nRoles:");
  console.log("-".repeat(50));
  log(`Proposer: Governor (${governorResult.address})`);
  log(`Executor: Anyone (address(0))`);
  log(`Canceller: Governor (${governorResult.address})`);

  console.log("\nOwnership:");
  console.log("-".repeat(50));
  log(`Treasury Owner: Timelock (${timelockResult.address})`);
  log(`ChatSubscription Owner: Timelock (${timelockResult.address})`);

  await saveDeployment(deployment);

  // Only show verification commands for non-local networks
  if (!isLocalNetwork) {
    logSection("VERIFICATION COMMANDS");
    
    console.log("Run these commands to verify contracts on the block explorer:\n");

    if (votingTokenDeployed) {
      console.log("# WLCAI (Voting Token)");
      console.log(`npx hardhat verify --network ${networkName} ${votingTokenAddress}\n`);
    }

    console.log("# LCAITimeLock");
    console.log(`npx hardhat verify --network ${networkName} ${timelockResult.address} \\`);
    console.log(`  ${timelockDelay} \\`);
    console.log(`  '[]' \\`);
    console.log(`  '["${ethers.ZeroAddress}"]' \\`);
    console.log(`  ${deployer.address}\n`);

    console.log("# LCAIGovernor");
    console.log(`npx hardhat verify --network ${networkName} ${governorResult.address} \\`);
    console.log(`  ${votingTokenAddress} \\`);
    console.log(`  ${timelockResult.address} \\`);
    console.log(`  ${adminAddress}\n`);

    console.log("# LCAITreasury");
    console.log(`npx hardhat verify --network ${networkName} ${treasuryResult.address} \\`);
    console.log(`  ${timelockResult.address} \\`);
    console.log(`  ${adminAddress}\n`);

    console.log("# LCAIChatSubscription");
    console.log(`npx hardhat verify --network ${networkName} ${subscriptionResult.address} \\`);
    console.log(`  ${paymentTokenAddress} \\`);
    console.log(`  ${treasuryResult.address} \\`);
    console.log(`  ${timelockResult.address} \\`);
    console.log(`  ${adminAddress}\n`);
  }

  logSection("DEPLOYMENT COMPLETE");

  return deployment;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nERROR:", error.message);
    console.error(error);
    process.exit(1);
  });
