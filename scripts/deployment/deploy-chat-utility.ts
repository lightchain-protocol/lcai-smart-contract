
//path: lcai-dao-smart-contract/scripts/deployment/deploy-chat-utility.ts
import { network } from "hardhat";
import fs from "fs";
import hardhatConfig from '../../hardhat.config.js';

// -------------------- ABI & Contract Utilities --------------------
import { saveAbi } from '../abi/saveAbi.js';

// -------------------- Print Deployment Info To Console --------------------
import { printDeployingContract, printExplorerContractLink } from '../logs/console/console_logger.js';

// -------------------- Deployment History Logging --------------------
import { logChatUtilityDeployment } from '../logs/data/data_logger.js';

// -------------------- Role Assignment & Funding --------------------
import { RoleAssigner } from '../roles/assignRoles.js';

/**
 * Deploy LCAIChatUtility Contract
 * 
 * This script deploys the new chat utility contract that consolidates
 * session management and reward tracking functionality.
 */

async function main() {
    console.log("🚀 Deploying LCAIChatUtility with TimelockController");
    console.log("=====================================================");
    console.log("");

    const { ethers } = await network.connect();
    
    // Configuration
    const CONFIG = {
        initialChatFee: ethers.parseEther("0.001"), // 0.001 LCAI per message
        baseReward: ethers.parseEther("0.01"), // 0.01 LCAI per chat reward
        epochDuration: 7 * 24 * 60 * 60, // 7 days
        maxRewardPerEpoch: ethers.parseEther("1000"), // 1000 LCAI max per epoch
    };
    const [deployer] = await ethers.getSigners();

    // Get network info
    const networkName = (network as any).name;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    console.log(`📡 Deploying to network: ${networkName} (chainId: ${chainId})`);

    // Get explorer URL and RPC URL from Hardhat config for the current network
    const networkConfig = (hardhatConfig.networks as any)?.[networkName] || {};
    const explorerUrl = networkConfig.explorer?.url || '';
    const rpcUrl = networkConfig.url || '';

    console.log(`👤 Deployer: ${deployer.address}`);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`🔗 Explorer: ${explorerUrl}\n`);

    console.log("📋 Deployment Configuration:");
    console.log(`   Initial Chat Fee: ${ethers.formatEther(CONFIG.initialChatFee)} LCAI`);
    console.log(`   Base Reward: ${ethers.formatEther(CONFIG.baseReward)} LCAI`);
    console.log(`   Epoch Duration: ${CONFIG.epochDuration} seconds (${CONFIG.epochDuration / (24 * 60 * 60)} days)`);
    console.log(`   Max Reward Per Epoch: ${ethers.formatEther(CONFIG.maxRewardPerEpoch)} LCAI`);
    console.log("");

    // ==================== STEP 1: Deploy TimelockController ====================
    console.log("1️⃣ Deploying TimelockController for DAO governance...");
    printDeployingContract("TimelockController");

    const TimelockController = await ethers.getContractFactory(
        "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
        deployer
    );

    const minDelay = 0; // 0 seconds delay for testing (use 2 days for production)
    const proposers = [deployer.address]; // Who can propose
    const executors = [deployer.address]; // Who can execute
    const admin = deployer.address; // Admin (will renounce after setup)

    const timelock = await TimelockController.deploy(minDelay, proposers, executors, admin);
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();

    console.log(`   ✅ TimelockController deployed at: ${timelockAddress}`);
    printExplorerContractLink("TimelockController", timelockAddress, explorerUrl);
    console.log(`   ⏱️  Min Delay: ${minDelay} seconds`);
    console.log(`   👥 Proposers: ${proposers.join(', ')}`);
    console.log(`   👥 Executors: ${executors.join(', ')}`);
    console.log("");

    // Save TimelockController ABI
    try {
        saveAbi("TimelockController", TimelockController);
        console.log(`   📄 ABI saved for TimelockController`);
        } catch (error: any) {
            console.warn(`   ⚠️ Failed to save ABI for TimelockController:`, error.message);
    }
    console.log("");

    // ==================== STEP 2: Deploy LCAIChatUtility ====================
    console.log("2️⃣ Deploying LCAIChatUtility...");
    printDeployingContract("LCAIChatUtility");

    const constructorArgs = [
        CONFIG.initialChatFee,
        CONFIG.baseReward,
        CONFIG.epochDuration,
        CONFIG.maxRewardPerEpoch
    ];

    console.log(`   📋 Constructor arguments: ${JSON.stringify(constructorArgs.map(arg => arg.toString()))}`);

    const LCAIChatUtility = await ethers.getContractFactory("LCAIChatUtility", deployer);

    // Deploy with retry logic for gas price issues
    let chatUtility;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`   🔄 Deployment attempt ${attempt}/${maxRetries}...`);

            // Use a fixed, lower gas price to avoid exceeding the fee cap
            const gasPrice = ethers.parseUnits("50", "gwei");
            console.log(`   ⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

            chatUtility = await LCAIChatUtility.deploy(
                CONFIG.initialChatFee,
                CONFIG.baseReward,
                CONFIG.epochDuration,
                CONFIG.maxRewardPerEpoch,
                {
                    gasPrice: gasPrice,
                    gasLimit: 8000000
                }
            );
            await chatUtility.waitForDeployment();

            console.log(`   ✅ LCAIChatUtility deployed successfully on attempt ${attempt}`);
            break;

        } catch (error: any) {
            console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt === maxRetries) {
                throw new Error(`Failed to deploy LCAIChatUtility after ${maxRetries} attempts: ${error.message}`);
            }

            // Wait before retry
            console.log(`   ⏳ Waiting 2 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    const chatUtilityAddress = await chatUtility!.getAddress();

    console.log(`   ✅ LCAIChatUtility deployed at: ${chatUtilityAddress}`);
    printExplorerContractLink("LCAIChatUtility", chatUtilityAddress, explorerUrl);

    // Verify contract has code
    const code = await deployer.provider!.getCode(chatUtilityAddress);
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
        const chatFeeLCAI = await chatUtility!.chatFeeLCAI();
        const baseReward = await chatUtility!.baseReward();
        const owner = await chatUtility!.owner();
        const epochDuration = await chatUtility!.epochDuration();
        const maxRewardPerEpoch = await chatUtility!.maxRewardPerEpoch();
        const totalUsersCount = await chatUtility!.totalUsersCount();
        const sessionCount = await chatUtility!.sessionCount();

        console.log("   ✅ Contract successfully initialized:");
        console.log(`      Chat Fee: ${ethers.formatEther(chatFeeLCAI)} LCAI`);
        console.log(`      Base Reward: ${ethers.formatEther(baseReward)} LCAI`);
        console.log(`      Epoch Duration: ${epochDuration} seconds`);
        console.log(`      Max Reward Per Epoch: ${ethers.formatEther(maxRewardPerEpoch)} LCAI`);
        console.log(`      Owner: ${owner}`);
        console.log(`      Total Users: ${totalUsersCount}`);
        console.log(`      Total Sessions: ${sessionCount}`);
        console.log(`      💰 LCAIChatUtility IS the reward vault (holds and distributes rewards)`);
        console.log("");
    } catch (error: any) {
        console.error("   ❌ Verification failed:", error.message);
        process.exit(1);
    }

    // Save ABI
    try {
        saveAbi("LCAIChatUtility", LCAIChatUtility);
        console.log(`📄 ABI saved for LCAIChatUtility`);
    } catch (error: any) {
        console.warn(`⚠️ Failed to save ABI for LCAIChatUtility:`, error.message);
    }
    console.log("");

    // ==================== STEP 3: Authorize owner wallet to issue rewards ====================
    console.log("3️⃣ Authorizing owner wallet to issue rewards...");

    try {
        // Get owner wallet address from env
        const ownerWalletAddress = process.env.OWNER_WALLET_ADDRESS;

        if (!ownerWalletAddress) {
            console.warn("   ⚠️  OWNER_WALLET_ADDRESS not found in env, using deployer instead");
            const isDeployerAuthorized = await chatUtility!.authorizedRewardIssuers(deployer.address);
            console.log(`   Deployer (${deployer.address}) authorization: ${isDeployerAuthorized ? 'Authorized' : 'Not authorized'}`);

            if (!isDeployerAuthorized) {
                const authTx = await chatUtility!.authorizeRewardIssuer(deployer.address);
                await authTx.wait();
                console.log("   ✅ Deployer authorized to issue rewards");
            }
        } else {
            console.log(`   Owner Wallet Address: ${ownerWalletAddress}`);

            // Check if deployer is authorized (from constructor)
            const isDeployerAuthorized = await chatUtility!.authorizedRewardIssuers(deployer.address);
            console.log(`   Deployer authorization status: ${isDeployerAuthorized ? 'Authorized' : 'Not authorized'}`);

            // Check if owner wallet is already authorized
            const isOwnerAuthorized = await chatUtility!.authorizedRewardIssuers(ownerWalletAddress);
            console.log(`   Owner wallet authorization status: ${isOwnerAuthorized ? 'Authorized' : 'Not authorized'}`);

            if (!isOwnerAuthorized) {
                console.log("   🔧 Authorizing owner wallet to issue rewards...");
                const authTx = await chatUtility!.authorizeRewardIssuer(ownerWalletAddress);
                await authTx.wait();
                console.log(`   ✅ Owner wallet authorized to issue rewards`);
                console.log(`   Transaction: ${authTx.hash}`);
            } else {
                console.log("   ✅ Owner wallet already authorized to issue rewards");
            }
        }
        console.log("");
    } catch (error: any) {
        console.error("   ❌ Authorization setup failed:", error.message);
        console.log("   ⚠️  You may need to authorize the owner wallet manually");
        console.log("");
    }

    // ==================== STEP 4: Transfer ownership to Timelock ====================
    console.log("4️⃣ Transferring ownership to TimelockController for DAO governance...");
    console.log(`   Timelock Address: ${timelockAddress}`);

    try {
        const tx = await chatUtility!.transferOwnership(timelockAddress);
        await tx.wait();
        console.log("   ✅ Ownership transferred to Timelock");
        console.log(`   Transaction: ${tx.hash}`);
        console.log(`   🏛️  LCAIChatUtility is now controlled by DAO governance`);
        console.log("");
    } catch (error: any) {
        console.error("   ❌ Ownership transfer failed:", error.message);
        console.log("   ⚠️  Contract deployed but ownership not transferred");
        console.log("   💡 You can manually transfer ownership later");
        console.log("");
    }

    // ==================== STEP 5: Fund LCAIChatUtility ====================
    console.log("5️⃣ Funding LCAIChatUtility contract...");

    try {
        const roleAssigner = new RoleAssigner(deployer, explorerUrl, ethers);
        const fundingSuccess = await roleAssigner.fundContract(chatUtilityAddress, 'LCAIChatUtility', '100.0');

        if (fundingSuccess) {
            console.log("   ✅ LCAIChatUtility successfully funded with 100 LCAI");
        } else {
            console.warn("   ⚠️  LCAIChatUtility funding failed, but deployment completed");
        }
        console.log("");
    } catch (error: any) {
        console.error("   ❌ Funding failed:", error.message);
        console.log("   ⚠️  You can manually fund the contract later");
        console.log(`   💡 Send LCAI to: ${chatUtilityAddress}`);
        console.log("");
    }

    // Create comprehensive deployment data
    const chatUtilityAbiPath = 'src/blockchain/abi/LCAIChatUtility.json';
    let chatUtilityAbiRaw = [];
    try {
        const abiJson = JSON.parse(fs.readFileSync(chatUtilityAbiPath, 'utf8'));
        chatUtilityAbiRaw = abiJson.abi || abiJson;
    } catch (e: any) {
        console.warn(`⚠️ Failed to read ABI for LCAIChatUtility at ${chatUtilityAbiPath}:`, e.message);
    }

    const timelockAbiPath = 'src/blockchain/abi/TimelockController.json';
    let timelockAbiRaw = [];
    try {
        const abiJson = JSON.parse(fs.readFileSync(timelockAbiPath, 'utf8'));
        timelockAbiRaw = abiJson.abi || abiJson;
    } catch (e: any) {
        console.warn(`⚠️ Failed to read ABI for TimelockController at ${timelockAbiPath}:`, e.message);
    }

    const deploymentData = {
        deploymentId: Date.now().toString(),
        deployedBy: deployer.address,
        network: networkName,
        chainId,
        rpcUrl,
        explorerUrl,
        deployedAt: new Date().toISOString(),
        deploymentType: 'chat_utility_with_timelock',
        abiPath: 'src/blockchain/abi',
        contracts: {
            TimelockController: {
                name: 'TimelockController',
                address: timelockAddress,
                explorerUrl: `${explorerUrl}/address/${timelockAddress}`,
                abiPath: timelockAbiPath,
                abiRaw: timelockAbiRaw,
                constructorArgs: [
                    minDelay.toString(),
                    proposers,
                    executors,
                    admin,
                ],
            },
            LCAIChatUtility: {
                name: 'LCAIChatUtility',
                address: chatUtilityAddress,
                explorerUrl: `${explorerUrl}/address/${chatUtilityAddress}`,
                abiPath: chatUtilityAbiPath,
                abiRaw: chatUtilityAbiRaw,
                constructorArgs: [
                    CONFIG.initialChatFee.toString(),
                    CONFIG.baseReward.toString(),
                    CONFIG.epochDuration.toString(),
                    CONFIG.maxRewardPerEpoch.toString(),
                ],
            },
        },
        configuration: {
            initialChatFee: ethers.formatEther(CONFIG.initialChatFee),
            baseReward: ethers.formatEther(CONFIG.baseReward),
            epochDuration: CONFIG.epochDuration,
            maxRewardPerEpoch: ethers.formatEther(CONFIG.maxRewardPerEpoch),
            timelock: timelockAddress,
            minDelay: minDelay,
            note: "LCAIChatUtility itself is the reward vault (holds and distributes rewards)",
        },
    };

    // Log deployment to all required locations
    try {
        logChatUtilityDeployment(deploymentData);
    } catch (error: any) {
        console.warn('⚠️ Failed to log deployment data:', error.message);
    }
    console.log("");

    // Print next steps
    console.log("📋 Next Steps:");
    console.log("==============");
    console.log("1. Verify the contracts on the block explorer:");
    console.log("");
    console.log("   TimelockController:");
    console.log(`   npx hardhat verify --network ${networkName} ${timelockAddress} \\`);
    console.log(`     "${minDelay}" \\`);
    console.log(`     "[${proposers.join(',')}]" \\`);
    console.log(`     "[${executors.join(',')}]" \\`);
    console.log(`     "${admin}"`);
    console.log("");
    console.log("   LCAIChatUtility:");
    console.log(`   npx hardhat verify --network ${networkName} ${chatUtilityAddress} \\`);
    console.log(`     "${CONFIG.initialChatFee}" \\`);
    console.log(`     "${CONFIG.baseReward}" \\`);
    console.log(`     "${CONFIG.epochDuration}" \\`);
    console.log(`     "${CONFIG.maxRewardPerEpoch}"`);
    console.log("");
    console.log("2. Update frontend contract addresses:");
    console.log(`   TimelockController: ${timelockAddress}`);
    console.log(`   LCAIChatUtility: ${chatUtilityAddress}`);
    console.log("");
    console.log("3. ✅ Contract Funding:");
    console.log(`   - LCAIChatUtility has been funded with 100 LCAI`);
    console.log(`   - This contract IS the reward vault (holds and distributes rewards)`);
    console.log(`   - To add more funds, send LCAI to: ${chatUtilityAddress}`);
    console.log("");
    console.log("4. ✅ Reward issuer authorization:");
    const ownerWalletAddr = process.env.OWNER_WALLET_ADDRESS || deployer.address;
    console.log(`   - Owner wallet (${ownerWalletAddr}) is authorized to issue rewards`);
    console.log(`   - Deployer wallet (${deployer.address}) is also authorized`);
    console.log(`   - To authorize additional addresses, call through TimelockController`);
    console.log("");
    console.log("5. Test the deployment:");
    console.log(`   - Call prepayMessages() to test fee collection`);
    console.log(`   - Call storeSession() to test session storage`);
    console.log(`   - Call issueChatReward() to test reward distribution (as authorized deployer)`);
    console.log(`   - Verify events are emitted correctly`);
    console.log("");

    console.log("✅ Deployment completed successfully!");
    console.log("");

    // Print summary
    console.log('\n📋 Deployment Summary:');
    console.log('=======================');
    console.log(`   🏛️  TimelockController: ${timelockAddress}`);
    console.log(`   💬 LCAIChatUtility: ${chatUtilityAddress}`);
    console.log(`   🌐 Network: ${networkName} (chainId: ${chainId})`);
    console.log(`   👤 Deployer: ${deployer.address}`);
    console.log(`   🔗 Explorer: ${explorerUrl}`);
    console.log(`   📅 Timestamp: ${deploymentData.deployedAt}`);
    console.log("");

    console.log('📊 Configuration:');
    console.log('=================');
    console.log(`   Chat Fee: ${ethers.formatEther(CONFIG.initialChatFee)} LCAI`);
    console.log(`   Base Reward: ${ethers.formatEther(CONFIG.baseReward)} LCAI`);
    console.log(`   Epoch Duration: ${CONFIG.epochDuration} seconds (${CONFIG.epochDuration / (24 * 60 * 60)} days)`);
    console.log(`   Max Reward/Epoch: ${ethers.formatEther(CONFIG.maxRewardPerEpoch)} LCAI`);
    console.log(`   💰 Reward Vault: LCAIChatUtility itself (${chatUtilityAddress})`);
    console.log(`   💵 Funded with: 100 LCAI`);
    console.log(`   👑 Owner: TimelockController (${timelockAddress})`);
    console.log(`   🔐 Authorized Reward Issuers: ${deployer.address}${process.env.OWNER_WALLET_ADDRESS ? ', ' + process.env.OWNER_WALLET_ADDRESS : ''}`);
    console.log(`   ⏱️  Timelock Delay: ${minDelay} seconds`);
    console.log("");

    console.log('📁 Files Created:');
    console.log('=================');
    console.log(`   ✓ deployments/chat-utility-deployment.json`);
    console.log(`   ✓ src/blockchain/data/chatUtilitydeploymentsHistory.json`);
    console.log(`   ✓ lcai-chat/lib/data/chatUtilitycontractsData.json`);
    console.log(`   ✓ src/blockchain/abi/LCAIChatUtility.json`);
    console.log(`   ✓ src/blockchain/abi/TimelockController.json`);
    console.log("");

    return {
        timelock: timelockAddress,
        chatUtility: chatUtilityAddress,
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