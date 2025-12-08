#!/usr/bin/env node
/**
 * Quick deploy script for LCAIValidatorRegistry
 * Uses ethers.js directly without waiting for hardhat compilation
 * 
 * Usage: node scripts/deployment/quick-deploy-validator-registry.cjs [--rpc URL]
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_RPC = process.env.RPC_URL || 'http://localhost:8555';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '930679cdfe7c09c650df89bb57e4df72fa0d445cbd4fcb22ecf971ce0e1ddcad';

// Config files to update (relative to repo root)
const CONSENSUS_CONFIG_FILES = [
    'PoI-Consensus/consensus-go/config/consensus.yaml',
    'PoI-Consensus/consensus-go/config/consensus-example.yaml',
    'lcai-testnet-v2/network/rpc/config/consensus.yaml',
    'lcai-testnet-v2/network/rpc/config/consensus-node2.yaml',
    'lcai-testnet-v2/network/rpc/config/consensus-node3.yaml',
    'lcai-testnet-v2/network/rpc/config/consensus-node4.yaml',
    'lcai-testnet-v2/network/engine-v2-dev/consensus-dev.yaml',
];

// Parse command line arguments
let rpcUrl = DEFAULT_RPC;
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--rpc' && process.argv[i + 1]) {
        rpcUrl = process.argv[i + 1];
        i++;
    }
    if (process.argv[i] === '--private-key' && process.argv[i + 1]) {
        // Override from command line (dangerous but useful for testing)
        process.env.PRIVATE_KEY = process.argv[i + 1];
        i++;
    }
}

function getRepoRoot() {
    // Navigate up from lcai-smart-contract/scripts/deployment to repo root
    return path.resolve(__dirname, '../../..');
}

function updateConfigFile(configPath, newAddress) {
    try {
        if (!fs.existsSync(configPath)) {
            console.log(`  ⚠️  Config file not found: ${configPath}`);
            return false;
        }

        let content = fs.readFileSync(configPath, 'utf-8');

        // Match and replace validator_registry_address
        const oldContent = content;
        content = content.replace(
            /^(\s*validator_registry_address:\s*["']?)0x[a-fA-F0-9]{40}(["']?\s*)$/gm,
            `$1${newAddress}$2`
        );

        // Also handle empty or placeholder values  
        content = content.replace(
            /^(\s*validator_registry_address:\s*["'])["']\s*$/gm,
            `$1${newAddress}"`
        );

        if (content !== oldContent) {
            fs.writeFileSync(configPath, content);
            console.log(`  ✅ Updated: ${path.basename(configPath)}`);
            return true;
        } else {
            console.log(`  ⚠️  No changes needed: ${path.basename(configPath)}`);
            return false;
        }
    } catch (error) {
        console.error(`  ❌ Error updating ${configPath}:`, error.message);
        return false;
    }
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  LCAIValidatorRegistry Quick Deploy');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Load contract artifact
    const artifactPath = path.join(__dirname, '../../artifacts/contracts/LCAIValidatorRegistry.sol/LCAIValidatorRegistry.json');

    if (!fs.existsSync(artifactPath)) {
        console.error('❌ Contract artifact not found. Please run: pnpm hardhat compile');
        console.error('   Expected path:', artifactPath);
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    console.log('📋 Contract Details:');
    console.log(`  Bytecode length: ${artifact.bytecode.length} chars`);
    console.log(`  ABI functions: ${artifact.abi.length}`);

    // Connect to RPC
    console.log(`\n🔗 Connecting to: ${rpcUrl}`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {
        const network = await provider.getNetwork();
        console.log(`  Chain ID: ${network.chainId}`);
    } catch (error) {
        console.error('❌ Cannot connect to RPC:', error.message);
        process.exit(1);
    }

    // Create wallet
    const privateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`  Deployer: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.error('❌ Deployer account has no balance');
        process.exit(1);
    }

    // Check if already deployed at a known address
    const knownAddresses = [
        '0x79C3473d3249fb3a70E2D3e386e9C45abE62752D',
        '0xaBe5eAF18CFe388BeDC2fe6B6E71c43eB55b286e',
    ];

    for (const addr of knownAddresses) {
        const code = await provider.getCode(addr);
        if (code !== '0x') {
            console.log(`\n⚠️  Contract already deployed at: ${addr}`);
            console.log('   Skipping deployment. Use this address.');
            return;
        }
    }

    // Deploy contract
    console.log('\n🚀 Deploying LCAIValidatorRegistry...');

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();

    console.log(`  Transaction: ${contract.deploymentTransaction().hash}`);
    console.log('  Waiting for confirmation...');

    await contract.waitForDeployment();
    const deployedAddress = await contract.getAddress();

    console.log(`\n✅ LCAIValidatorRegistry deployed at: ${deployedAddress}\n`);

    // Get repo root
    const repoRoot = getRepoRoot();
    console.log(`📁 Repo root: ${repoRoot}\n`);

    // Save deployment record
    console.log('💾 Saving deployment record...');
    const outDir = path.join(__dirname, '../../data/deployments/lcai_testnet_v2');
    fs.mkdirSync(outDir, { recursive: true });

    const deploymentRecord = {
        address: deployedAddress,
        chain: 'lcai_testnet_v2',
        deployedBy: wallet.address,
        timestamp: new Date().toISOString(),
        ts: Date.now(),
        txHash: contract.deploymentTransaction().hash,
    };

    fs.writeFileSync(
        path.join(outDir, 'LCAIValidatorRegistry.json'),
        JSON.stringify(deploymentRecord, null, 2)
    );
    console.log(`  ✅ Saved: ${path.join(outDir, 'LCAIValidatorRegistry.json')}\n`);

    // Update consensus config files
    console.log('🔧 Updating consensus config files...');
    let updatedCount = 0;
    let skippedCount = 0;

    for (const configFile of CONSENSUS_CONFIG_FILES) {
        const fullPath = path.join(repoRoot, configFile);
        if (updateConfigFile(fullPath, deployedAddress)) {
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log(`\n📊 Config Update Summary:`);
    console.log(`  Updated: ${updatedCount} files`);
    console.log(`  Skipped: ${skippedCount} files\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Deployment Complete!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`📍 Contract Address: ${deployedAddress}`);
    console.log(`\n💡 Next Steps:`);
    console.log(`  1. Restart consensus clients to pick up the new registry address`);
    console.log(`  2. Register validators using the register-validator CLI`);
}

main().catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
});
