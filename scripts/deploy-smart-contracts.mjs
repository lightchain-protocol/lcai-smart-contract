//path: lcai-dao-smart-contract/scripts/deploy-smart-contracts.mjs
import hre from "hardhat";
const { ethers } = hre;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from './abi/saveAbi.mjs';

// -------------------- Print Deployment Info To Console --------------------
import { printDeployingContract, printExplorerContractLink } from './logs/console/console_logger.mjs';

// -------------------- Deployment History Logging --------------------
import { logChatUtilityDeployment, logDeploymentsHistory } from './logs/data/data_logger.mjs';

// -------------------- Role Assignment & Funding --------------------
import { RoleAssigner } from './roles/assignRoles.mjs';

/**
 * Deploy All Smart Contracts
 * 
 * This script deploys the complete DAO system and Chat Utility:
 * 1. Deploy DAO contracts (PresaleVotingPower, LCAITimeLock, LCAIGovernor)
 * 2. Deploy LCAIChatUtility contract
 * 3. Transfer ownership of LCAIChatUtility to TimelockController
 * 4. Configure roles and permissions
 * 5. Fund contracts as needed
 */

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
    // Chat Utility Configuration
    initialChatFee: ethers.parseEther("0.001"), // 0.001 LCAI per message
    baseReward: ethers.parseEther("0.01"), // 0.01 LCAI per chat reward
    epochDuration: 7 * 24 * 60 * 60, // 7 days
    maxRewardPerEpoch: ethers.parseEther("1000"), // 1000 LCAI max per epoch

    // DAO Configuration
    timelockDelay: 0, // 0 seconds for testing (use 2 days for production)
    votingDelay: 1, // 1 block delay
    votingPeriod: 100, // 100 blocks voting period
    quorumNumerator: 4, // 4% quorum
};

async function main() {
    console.log("🚀 Deploying Complete DAO + Chat Utility System");
    console.log("================================================");
    console.log("");

    // Get deployer
    const [deployer] = await ethers.getSigners();

    // Get network info
    const network = await hre.network.name;
    const chainIdHex = await hre.network.provider.send('eth_chainId');
    const chainId = parseInt(chainIdHex, 16);
    console.log(`📡 Deploying to network: ${network} (chainId: ${chainId})`);

    // Get explorer URL from Hardhat config
    const hardhatConfig = await
    import ('../hardhat.config.js');
    const networkConfig = hardhatConfig.default.networks[network] || {};
    const explorerUrl = (networkConfig.explorer && networkConfig.explorer.url) || '';

    console.log(`👤 Deployer: ${deployer.address}`);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`🔗 Explorer: ${explorerUrl}\n`);

    console.log("📋 Deployment Configuration:");
    console.log(`   Chat Fee: ${ethers.formatEther(CONFIG.initialChatFee)} LCAI`);
    console.log(`   Base Reward: ${ethers.formatEther(CONFIG.baseReward)} LCAI`);
    console.log(`   Timelock Delay: ${CONFIG.timelockDelay} seconds`);
    console.log(`   Voting Delay: ${CONFIG.votingDelay} blocks`);
    console.log(`   Voting Period: ${CONFIG.votingPeriod} blocks`);
    console.log(`   Quorum: ${CONFIG.quorumNumerator}%`);
    console.log("");

    const roleAssigner = new RoleAssigner(deployer, explorerUrl);
    const deploymentResults = {};

    // ==================== STEP 1: Deploy DAO Contracts ====================
    console.log("1️⃣ Deploying DAO Contracts...");
    console.log("==============================");

    // Deploy PresaleVotingPower
    console.log("   🏛️ Deploying PresaleVotingPower...");
    printDeployingContract("PresaleVotingPower");
    const PresaleVotingPower = await ethers.getContractFactory("PresaleVotingPower", deployer);
    const presaleVotingPower = await PresaleVotingPower.deploy();
    await presaleVotingPower.waitForDeployment();
    const presaleVotingPowerAddress = await presaleVotingPower.getAddress();
    console.log(`   ✅ PresaleVotingPower deployed at: ${presaleVotingPowerAddress}`);
    printExplorerContractLink("PresaleVotingPower", presaleVotingPowerAddress, explorerUrl);

    // Deploy LCAITimeLock
    console.log("   ⏰ Deploying LCAITimeLock...");
    printDeployingContract("LCAITimeLock");
    const LCAITimeLock = await ethers.getContractFactory("LCAITimeLock", deployer);
    const timelock = await LCAITimeLock.deploy(
        CONFIG.timelockDelay, [deployer.address], // proposers
        [deployer.address], // executors
        deployer.address // admin
    );
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();
    console.log(`   ✅ LCAITimeLock deployed at: ${timelockAddress}`);
    printExplorerContractLink("LCAITimeLock", timelockAddress, explorerUrl);

    // Deploy LCAIGovernor
    console.log("   🗳️ Deploying LCAIGovernor...");
    printDeployingContract("LCAIGovernor");
    const LCAIGovernor = await ethers.getContractFactory("LCAIGovernor", deployer);
    const governor = await LCAIGovernor.deploy(
        presaleVotingPowerAddress, // voting token
        timelockAddress, // timelock
        CONFIG.votingDelay,
        CONFIG.votingPeriod,
        CONFIG.quorumNumerator
    );
    await governor.waitForDeployment();
    const governorAddress = await governor.getAddress();
    console.log(`   ✅ LCAIGovernor deployed at: ${governorAddress}`);
    printExplorerContractLink("LCAIGovernor", governorAddress, explorerUrl);

    // Save DAO ABIs
    try {
        saveAbi("PresaleVotingPower", PresaleVotingPower);
        saveAbi("LCAITimeLock", LCAITimeLock);
        saveAbi("LCAIGovernor", LCAIGovernor);
        console.log("   📄 DAO ABIs saved");
    } catch (error) {
        console.warn("   ⚠️ Failed to save DAO ABIs:", error.message);
    }

    deploymentResults.dao = {
        presaleVotingPower: presaleVotingPowerAddress,
        timelock: timelockAddress,
        governor: governorAddress
    };

    console.log("");

    // ==================== STEP 2: Deploy LCAIChatUtility ====================
    console.log("2️⃣ Deploying LCAIChatUtility...");
    console.log("=================================");

    printDeployingContract("LCAIChatUtility");
    const LCAIChatUtility = await ethers.getContractFactory("LCAIChatUtility", deployer);

    const constructorArgs = [
        CONFIG.initialChatFee,
        CONFIG.baseReward,
        CONFIG.epochDuration,
        CONFIG.maxRewardPerEpoch
    ];

    console.log(`   📋 Constructor arguments: ${JSON.stringify(constructorArgs.map(arg => arg.toString()))}`);

    // Deploy with retry logic for gas price issues
    let chatUtility;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`   🔄 Deployment attempt ${attempt}/${maxRetries}...`);

            const gasPrice = ethers.parseUnits("50", "gwei");
            console.log(`   ⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

            chatUtility = await LCAIChatUtility.deploy(...constructorArgs, {
                gasPrice: gasPrice,
                gasLimit: 8000000
            });
            await chatUtility.waitForDeployment();

            console.log(`   ✅ LCAIChatUtility deployed successfully on attempt ${attempt}`);
            break;

        } catch (error) {
            console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt === maxRetries) {
                throw new Error(`Failed to deploy LCAIChatUtility after ${maxRetries} attempts: ${error.message}`);
            }

            console.log(`   ⏳ Waiting 2 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    const chatUtilityAddress = await chatUtility.getAddress();
    console.log(`   ✅ LCAIChatUtility deployed at: ${chatUtilityAddress}`);
    printExplorerContractLink("LCAIChatUtility", chatUtilityAddress, explorerUrl);

    // Save Chat Utility ABI
    try {
        saveAbi("LCAIChatUtility", LCAIChatUtility);
        console.log("   📄 Chat Utility ABI saved");
    } catch (error) {
        console.warn("   ⚠️ Failed to save Chat Utility ABI:", error.message);
    }

    deploymentResults.chatUtility = chatUtilityAddress;
    console.log("");

    // ==================== STEP 3: Configure DAO Governance ====================
    console.log("3️⃣ Configuring DAO Governance...");
    console.log("==================================");

    try {
        // Authorize owner wallet to issue rewards before transferring ownership
        const ownerWalletAddress = process.env.OWNER_WALLET_ADDRESS;
        if (ownerWalletAddress) {
            console.log(`   🔧 Authorizing owner wallet (${ownerWalletAddress}) to issue rewards...`);
            const authTx = await chatUtility.authorizeRewardIssuer(ownerWalletAddress);
            await authTx.wait();
            console.log(`   ✅ Owner wallet authorized to issue rewards`);
        }

        // Transfer ownership of LCAIChatUtility to TimelockController
        console.log(`   🔧 Transferring LCAIChatUtility ownership to TimelockController...`);
        const transferTx = await chatUtility.transferOwnership(timelockAddress);
        await transferTx.wait();
        console.log(`   ✅ LCAIChatUtility ownership transferred to TimelockController`);

        // Configure TimelockController roles
        console.log(`   🔧 Configuring TimelockController roles...`);
        await roleAssigner.configureTimelockRoles(timelockAddress, chatUtilityAddress);

        console.log(`   ✅ DAO governance configured successfully`);
    } catch (error) {
        console.error(`   ❌ DAO configuration failed:`, error.message);
        console.log(`   ⚠️ Contracts deployed but governance not fully configured`);
    }

    console.log("");

    // ==================== STEP 4: Fund Contracts ====================
    console.log("4️⃣ Funding Contracts...");
    console.log("========================");

    try {
        // Fund LCAIChatUtility
        console.log(`   💰 Funding LCAIChatUtility...`);
        const fundingSuccess = await roleAssigner.fundChatUtility(chatUtilityAddress, '100.0');
        if (fundingSuccess) {
            console.log(`   ✅ LCAIChatUtility funded with 100 LCAI`);
        } else {
            console.warn(`   ⚠️ LCAIChatUtility funding failed`);
        }

        // Fund TimelockController for governance transactions
        console.log(`   💰 Funding TimelockController...`);
        const timelockFundingSuccess = await roleAssigner.fundTimelockController(timelockAddress, '10.0');
        if (timelockFundingSuccess) {
            console.log(`   ✅ TimelockController funded with 10 LCAI`);
        } else {
            console.warn(`   ⚠️ TimelockController funding failed`);
        }

    } catch (error) {
        console.error(`   ❌ Funding failed:`, error.message);
        console.log(`   ⚠️ You can manually fund the contracts later`);
    }

    console.log("");

    // ==================== STEP 5: Log Deployment Data ====================
    console.log("5️⃣ Logging Deployment Data...");
    console.log("==============================");

    const deploymentData = {
        deploymentId: Date.now().toString(),
        deployedBy: deployer.address,
        network,
        chainId,
        explorerUrl,
        deployedAt: new Date().toISOString(),
        deploymentType: 'complete_dao_system',
        contracts: {
            PresaleVotingPower: {
                name: 'PresaleVotingPower',
                address: presaleVotingPowerAddress,
                explorerUrl: `${explorerUrl}/address/${presaleVotingPowerAddress}`,
            },
            LCAITimeLock: {
                name: 'LCAITimeLock',
                address: timelockAddress,
                explorerUrl: `${explorerUrl}/address/${timelockAddress}`,
            },
            LCAIGovernor: {
                name: 'LCAIGovernor',
                address: governorAddress,
                explorerUrl: `${explorerUrl}/address/${governorAddress}`,
            },
            LCAIChatUtility: {
                name: 'LCAIChatUtility',
                address: chatUtilityAddress,
                explorerUrl: `${explorerUrl}/address/${chatUtilityAddress}`,
            },
        },
        configuration: {
            timelockDelay: CONFIG.timelockDelay,
            votingDelay: CONFIG.votingDelay,
            votingPeriod: CONFIG.votingPeriod,
            quorumNumerator: CONFIG.quorumNumerator,
            chatFee: ethers.formatEther(CONFIG.initialChatFee),
            baseReward: ethers.formatEther(CONFIG.baseReward),
            epochDuration: CONFIG.epochDuration,
            maxRewardPerEpoch: ethers.formatEther(CONFIG.maxRewardPerEpoch),
        },
    };

    // Log deployment data
    try {
        logChatUtilityDeployment(deploymentData);
        logDeploymentsHistory(deploymentData);
        console.log("   📊 Deployment data logged successfully");
    } catch (error) {
        console.warn("   ⚠️ Failed to log deployment data:", error.message);
    }

    console.log("");

    // ==================== STEP 6: Print Summary ====================
    console.log("🎉 Deployment Complete!");
    console.log("=======================");
    console.log("");
    console.log("📋 Contract Addresses:");
    console.log("=====================");
    console.log(`   🏛️  PresaleVotingPower: ${presaleVotingPowerAddress}`);
    console.log(`   ⏰ LCAITimeLock: ${timelockAddress}`);
    console.log(`   🗳️  LCAIGovernor: ${governorAddress}`);
    console.log(`   💬 LCAIChatUtility: ${chatUtilityAddress}`);
    console.log("");
    console.log("🔗 Explorer Links:");
    console.log("=================");
    console.log(`   PresaleVotingPower: ${explorerUrl}/address/${presaleVotingPowerAddress}`);
    console.log(`   LCAITimeLock: ${explorerUrl}/address/${timelockAddress}`);
    console.log(`   LCAIGovernor: ${explorerUrl}/address/${governorAddress}`);
    console.log(`   LCAIChatUtility: ${explorerUrl}/address/${chatUtilityAddress}`);
    console.log("");
    console.log("📋 Next Steps:");
    console.log("==============");
    console.log("1. Verify contracts on block explorer");
    console.log("2. Test governance proposals");
    console.log("3. Test chat utility functions");
    console.log("4. Update frontend with new contract addresses");
    console.log("");
    console.log("✅ Complete DAO + Chat Utility system deployed successfully!");

    return deploymentResults;
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("💥 Deployment failed:", error);
        process.exit(1);
    });

export default main;