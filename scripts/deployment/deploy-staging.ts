//path: lcai-dao-smart-contract/scripts/deployment/deploy-staging.ts
/**
 * Staging/Testnet Deployment Script with Verification
 * 
 * This script deploys AIVMModelRegistry, AIVMTicketManager, and BenchmarkRegistry
 * to a staging/testnet environment, verifies contracts, and runs smoke tests.
 * 
 * Usage:
 *   npx hardhat run scripts/deployment/deploy-staging.ts --network <network-name>
 * 
 * Environment Variables:
 *   TREASURY_ADDRESS - Treasury contract address (optional, defaults to timelock)
 *   AGGREGATOR_ADDRESS - Aggregator address for AIVMModelRegistry (optional, defaults to deployer)
 */

import { network } from "hardhat";
import hardhatConfig from '../../hardhat.config.js';
import fs from 'fs';
import path from 'path';

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from '../abi/saveAbi.js';

// -------------------- Print Deployment Info To Console --------------------
import { printDeployingContract, printExplorerContractLink } from '../logs/console/console_logger.js';

// -------------------- Deployment History Logging --------------------
import { logDeploymentsHistory } from '../logs/data/data_logger.js';

interface DeploymentArtifact {
    deploymentId: string;
    deployedBy: string;
    networkName: string;
    chainId: string;
    explorerUrl: string;
    deployedAt: string;
    contracts: {
        [key: string]: {
            name: string;
            address: string;
            explorerUrl: string;
            verified: boolean;
            verificationTx?: string;
        };
    };
    verification: {
        verifiedAt?: string;
        verificationLog?: string;
    };
}

async function verifyContract(
    contractAddress: string,
    contractName: string,
    constructorArgs: any[],
    networkName: string,
    explorerUrl: string
): Promise<{ verified: boolean; verificationTx?: string }> {
    console.log(`   🔍 Verifying ${contractName}...`);
    
    try {
        // Use hardhat verify plugin
        const { run } = require("hardhat");
        const verifyArgs = [contractAddress, ...constructorArgs];
        
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: constructorArgs.length > 0 ? constructorArgs : undefined,
        });
        
        console.log(`   ✅ ${contractName} verified successfully`);
        return { verified: true };
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`   ✅ ${contractName} already verified`);
            return { verified: true };
        } else {
            console.warn(`   ⚠️ Verification failed for ${contractName}: ${error.message}`);
            return { verified: false };
        }
    }
}

async function smokeTest(
    modelRegistryAddress: string,
    ticketManagerAddress: string,
    benchmarkRegistryAddress: string,
    deployer: any,
    ethers: any
): Promise<boolean> {
    console.log("\n🧪 Running Smoke Tests...");
    console.log("==========================");
    
    try {
        // Test 1: AIVMModelRegistry - Check owner
        const AIVMModelRegistry = await ethers.getContractAt("AIVMModelRegistry", modelRegistryAddress);
        const owner = await AIVMModelRegistry.owner();
        console.log(`   ✅ AIVMModelRegistry owner: ${owner}`);
        
        // Test 2: AIVMTicketManager - Issue a test ticket
        const AIVMTicketManager = await ethers.getContractAt("AIVMTicketManager", ticketManagerAddress);
        const testTicketId = await AIVMTicketManager.issueTicket(
            deployer.address,
            "test-variant-001",
            3600 // 1 hour TTL
        );
        console.log(`   ✅ AIVMTicketManager ticket issued: ${testTicketId}`);
        
        // Test 3: BenchmarkRegistry - Check owner
        const BenchmarkRegistry = await ethers.getContractAt("BenchmarkRegistry", benchmarkRegistryAddress);
        const benchmarkOwner = await BenchmarkRegistry.owner();
        console.log(`   ✅ BenchmarkRegistry owner: ${benchmarkOwner}`);
        
        console.log("\n✅ All smoke tests passed!");
        return true;
    } catch (error: any) {
        console.error(`   ❌ Smoke test failed: ${error.message}`);
        return false;
    }
}

async function main() {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();
    const networkName = (network as any).name;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const networkConfig = (hardhatConfig.networks as any)?.[networkName] || {};
    const explorerUrl = networkConfig.explorer?.url || 'https://testnet.lightscan.app';

    console.log("🚀 Staging Deployment: AIVM Core Contracts");
    console.log("===========================================");
    console.log(`📡 Network: ${networkName} (chainId: ${chainId})`);
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`🔗 Explorer: ${explorerUrl}\n`);

    const deploymentArtifact: DeploymentArtifact = {
        deploymentId: Date.now().toString(),
        deployedBy: deployer.address,
        networkName,
        chainId: chainId.toString(),
        explorerUrl,
        deployedAt: new Date().toISOString(),
        contracts: {},
        verification: {},
    };

    // Get treasury address (use timelock if available, otherwise deployer)
    const treasuryAddressEnv = process.env.TREASURY_ADDRESS?.trim();
    const timelockAddressEnv = process.env.TIMELOCK_ADDRESS?.trim();
    const treasuryAddress = treasuryAddressEnv || timelockAddressEnv || deployer.address;
    
    if (!treasuryAddressEnv) {
        console.log(`⚠️ TREASURY_ADDRESS not set, using: ${treasuryAddress}`);
    }

    const aggregatorAddress = process.env.AGGREGATOR_ADDRESS?.trim() || deployer.address;

    // ==================== Deploy BenchmarkRegistry ====================
    console.log("\n1️⃣ Deploying BenchmarkRegistry...");
    printDeployingContract("BenchmarkRegistry");
    const BenchmarkRegistry = await ethers.getContractFactory("BenchmarkRegistry", deployer);
    const benchmarkRegistry = await BenchmarkRegistry.deploy();
    await benchmarkRegistry.waitForDeployment();
    const benchmarkRegistryAddress = await benchmarkRegistry.getAddress();
    console.log(`   ✅ BenchmarkRegistry: ${benchmarkRegistryAddress}`);
    printExplorerContractLink("BenchmarkRegistry", benchmarkRegistryAddress, explorerUrl);
    
    saveAbi("BenchmarkRegistry", BenchmarkRegistry);
    deploymentArtifact.contracts.BenchmarkRegistry = {
        name: 'BenchmarkRegistry',
        address: benchmarkRegistryAddress,
        explorerUrl: `${explorerUrl}/address/${benchmarkRegistryAddress}`,
        verified: false,
    };

    // ==================== Deploy AIVMTicketManager ====================
    console.log("\n2️⃣ Deploying AIVMTicketManager...");
    printDeployingContract("AIVMTicketManager");
    const AIVMTicketManager = await ethers.getContractFactory("AIVMTicketManager", deployer);
    const ticketManager = await AIVMTicketManager.deploy();
    await ticketManager.waitForDeployment();
    const ticketManagerAddress = await ticketManager.getAddress();
    console.log(`   ✅ AIVMTicketManager: ${ticketManagerAddress}`);
    printExplorerContractLink("AIVMTicketManager", ticketManagerAddress, explorerUrl);
    
    saveAbi("AIVMTicketManager", AIVMTicketManager);
    deploymentArtifact.contracts.AIVMTicketManager = {
        name: 'AIVMTicketManager',
        address: ticketManagerAddress,
        explorerUrl: `${explorerUrl}/address/${ticketManagerAddress}`,
        verified: false,
    };

    // ==================== Deploy AIVMModelRegistry ====================
    console.log("\n3️⃣ Deploying AIVMModelRegistry...");
    printDeployingContract("AIVMModelRegistry");
    const AIVMModelRegistry = await ethers.getContractFactory("AIVMModelRegistry", deployer);
    const modelRegistry = await AIVMModelRegistry.deploy(treasuryAddress);
    await modelRegistry.waitForDeployment();
    const modelRegistryAddress = await modelRegistry.getAddress();
    console.log(`   ✅ AIVMModelRegistry: ${modelRegistryAddress}`);
    printExplorerContractLink("AIVMModelRegistry", modelRegistryAddress, explorerUrl);
    
    // Set aggregator if different from deployer
    if (aggregatorAddress !== deployer.address) {
        console.log(`   🔧 Setting aggregator to: ${aggregatorAddress}`);
        const setAggregatorTx = await modelRegistry.setAggregator(aggregatorAddress);
        await setAggregatorTx.wait();
    }
    
    saveAbi("AIVMModelRegistry", AIVMModelRegistry);
    deploymentArtifact.contracts.AIVMModelRegistry = {
        name: 'AIVMModelRegistry',
        address: modelRegistryAddress,
        explorerUrl: `${explorerUrl}/address/${modelRegistryAddress}`,
        verified: false,
    };

    // ==================== Verify Contracts ====================
    console.log("\n4️⃣ Verifying Contracts...");
    console.log("==========================");
    
    // Verify BenchmarkRegistry
    const benchmarkVerification = await verifyContract(
        benchmarkRegistryAddress,
        "BenchmarkRegistry",
        [],
        networkName,
        explorerUrl
    );
    deploymentArtifact.contracts.BenchmarkRegistry.verified = benchmarkVerification.verified;
    
    // Verify AIVMTicketManager
    const ticketVerification = await verifyContract(
        ticketManagerAddress,
        "AIVMTicketManager",
        [],
        networkName,
        explorerUrl
    );
    deploymentArtifact.contracts.AIVMTicketManager.verified = ticketVerification.verified;
    
    // Verify AIVMModelRegistry
    const modelVerification = await verifyContract(
        modelRegistryAddress,
        "AIVMModelRegistry",
        [treasuryAddress],
        networkName,
        explorerUrl
    );
    deploymentArtifact.contracts.AIVMModelRegistry.verified = modelVerification.verified;
    
    deploymentArtifact.verification = {
        verifiedAt: new Date().toISOString(),
        verificationLog: `Verified on ${networkName} at ${explorerUrl}`,
    };

    // ==================== Smoke Tests ====================
    const smokeTestPassed = await smokeTest(
        modelRegistryAddress,
        ticketManagerAddress,
        benchmarkRegistryAddress,
        deployer,
        ethers
    );

    // ==================== Save Deployment Artifact ====================
    const deploymentsDir = path.join(process.cwd(), 'data', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const artifactPath = path.join(deploymentsDir, `staging-${networkName}-${Date.now()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(deploymentArtifact, null, 2));
    console.log(`\n📄 Deployment artifact saved: ${artifactPath}`);
    
    // Also log to deployment history
    logDeploymentsHistory({
        deploymentId: deploymentArtifact.deploymentId,
        deployedBy: deployer.address,
        networkName,
        chainId: chainId.toString(),
        explorerUrl,
        deployedAt: deploymentArtifact.deployedAt,
        deploymentType: 'AIVM_STAGING',
        contracts: {
            BenchmarkRegistry: {
                name: 'BenchmarkRegistry',
                address: benchmarkRegistryAddress,
                explorerUrl: `${explorerUrl}/address/${benchmarkRegistryAddress}`,
            },
            AIVMTicketManager: {
                name: 'AIVMTicketManager',
                address: ticketManagerAddress,
                explorerUrl: `${explorerUrl}/address/${ticketManagerAddress}`,
            },
            AIVMModelRegistry: {
                name: 'AIVMModelRegistry',
                address: modelRegistryAddress,
                explorerUrl: `${explorerUrl}/address/${modelRegistryAddress}`,
            },
        },
        configuration: {
            treasuryAddress,
            aggregatorAddress,
        },
    });

    // ==================== Print Summary ====================
    console.log("\n🎉 Staging Deployment Complete!");
    console.log("===============================");
    console.log("\n📋 Contract Addresses:");
    console.log(`   BenchmarkRegistry: ${benchmarkRegistryAddress}`);
    console.log(`   AIVMTicketManager: ${ticketManagerAddress}`);
    console.log(`   AIVMModelRegistry: ${modelRegistryAddress}`);
    console.log("\n🔗 Explorer Links:");
    console.log(`   BenchmarkRegistry: ${explorerUrl}/address/${benchmarkRegistryAddress}`);
    console.log(`   AIVMTicketManager: ${explorerUrl}/address/${ticketManagerAddress}`);
    console.log(`   AIVMModelRegistry: ${explorerUrl}/address/${modelRegistryAddress}`);
    console.log("\n✅ Next Steps:");
    console.log("   1. Update SDK/env templates with these addresses");
    console.log("   2. Update CONTRACT_DEPLOYMENT.md");
    console.log("   3. Share addresses with downstream services");
    console.log(`   4. Smoke tests: ${smokeTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("💥 Deployment failed:", error);
        process.exit(1);
    });

export default main;

