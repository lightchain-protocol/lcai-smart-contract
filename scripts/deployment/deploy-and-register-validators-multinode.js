#!/usr/bin/env node
/**
 * Deploy LCAIValidatorRegistry and register validators for multi-node setup
 *
 * This script is designed to run inside a Docker container as part of the
 * docker-compose.multi-node.yml bootstrap process.
 *
 * Usage: node deploy-and-register-validators-multinode.js \
 *   --rpc <RPC_URL> \
 *   --private-key <PRIVATE_KEY> \
 *   --validators <VALIDATORS_JSON_PATH> \
 *   --stake <STAKE_ETH> \
 *   --artifact <ARTIFACT_PATH> \
 *   --config-dir <CONFIG_DIR>
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
    const args = {
        rpc: 'http://localhost:8545',
        privateKey: '',
        validators: '',
        stake: '1.0',
        artifact: '',
        configDir: ''
    };

    for (let i = 2; i < process.argv.length; i++) {
        switch (process.argv[i]) {
            case '--rpc':
                args.rpc = process.argv[++i];
                break;
            case '--private-key':
                args.privateKey = process.argv[++i];
                break;
            case '--validators':
                args.validators = process.argv[++i];
                break;
            case '--stake':
                args.stake = process.argv[++i];
                break;
            case '--artifact':
                args.artifact = process.argv[++i];
                break;
            case '--config-dir':
                args.configDir = process.argv[++i];
                break;
        }
    }

    return args;
}

// Update validator_registry_address in YAML config files
function updateConfigFiles(configDir, newAddress) {
    if (!configDir || !fs.existsSync(configDir)) {
        console.log('  Config directory not found, skipping config updates');
        return 0;
    }

    const configFiles = fs.readdirSync(configDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    let updatedCount = 0;

    for (const filename of configFiles) {
        const configPath = path.join(configDir, filename);
        try {
            let content = fs.readFileSync(configPath, 'utf-8');
            const originalContent = content;

            // Replace existing validator_registry_address
            content = content.replace(
                /^(\s*validator_registry_address:\s*["']?)0x[a-fA-F0-9]{40}(["']?\s*)$/gm,
                `$1${newAddress}$2`
            );

            // Also handle empty values
            content = content.replace(
                /^(\s*validator_registry_address:\s*["'])["']\s*$/gm,
                `$1${newAddress}"`
            );

            if (content !== originalContent) {
                fs.writeFileSync(configPath, content);
                console.log(`  Updated: ${filename}`);
                updatedCount++;
            }
        } catch (err) {
            console.log(`  Failed to update ${filename}: ${err.message}`);
        }
    }

    return updatedCount;
}

// Generate BLS public key from secret key hex (simplified - uses hash as placeholder)
// In production, this should use proper BLS key derivation
function deriveBLSPublicKey(secretKeyHex) {
    // For testnet purposes, we generate a deterministic 48-byte "public key"
    // from the secret key. Real BLS would derive the actual G1 point.
    const hash = ethers.keccak256('0x' + secretKeyHex);
    // Generate 48 bytes by hashing multiple times
    const hash2 = ethers.keccak256(hash);
    // Concatenate and take first 48 bytes (96 hex chars)
    const combined = hash.slice(2) + hash2.slice(2);
    return '0x' + combined.slice(0, 96);
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const args = parseArgs();

    console.log('\n' + '='.repeat(65));
    console.log('  LCAIValidatorRegistry Deployment & Registration (Multi-Node)');
    console.log('='.repeat(65) + '\n');

    // Validate inputs
    if (!args.privateKey) {
        throw new Error('Missing --private-key');
    }
    if (!args.validators) {
        throw new Error('Missing --validators');
    }
    if (!args.artifact) {
        throw new Error('Missing --artifact');
    }

    // Load artifact
    if (!fs.existsSync(args.artifact)) {
        throw new Error(`Artifact not found: ${args.artifact}`);
    }
    const artifact = JSON.parse(fs.readFileSync(args.artifact, 'utf-8'));

    // Load validators
    if (!fs.existsSync(args.validators)) {
        throw new Error(`Validators file not found: ${args.validators}`);
    }
    const validatorsData = JSON.parse(fs.readFileSync(args.validators, 'utf-8'));
    const validators = validatorsData.validators || [];

    console.log('Configuration:');
    console.log(`  RPC URL: ${args.rpc}`);
    console.log(`  Validators: ${validators.length}`);
    console.log(`  Stake per validator: ${args.stake} ETH`);
    console.log(`  Config dir: ${args.configDir || 'not specified'}`);

    // Connect to network with retry
    console.log('\nConnecting to network...');
    let provider;
    let connected = false;

    for (let attempt = 1; attempt <= 10; attempt++) {
        try {
            provider = new ethers.JsonRpcProvider(args.rpc);
            const network = await provider.getNetwork();
            console.log(`  Chain ID: ${network.chainId}`);
            connected = true;
            break;
        } catch (e) {
            console.log(`  Connection attempt ${attempt}/10 failed, retrying...`);
            await sleep(2000);
        }
    }

    if (!connected) {
        throw new Error('Failed to connect to RPC after 10 attempts');
    }

    // Create wallet
    const privateKey = args.privateKey.startsWith('0x') ? args.privateKey : `0x${args.privateKey}`;
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`  Deployer: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

    const requiredBalance = ethers.parseEther(args.stake) * BigInt(validators.length) + ethers.parseEther('1');
    if (balance < requiredBalance) {
        console.log(`\n  WARNING: May have insufficient balance for ${validators.length} validators`);
        console.log(`  Required (approx): ${ethers.formatEther(requiredBalance)} ETH`);
    }

    // Check for existing deployment in data directory
    let registryAddress;
    const deploymentRecordDir = path.join(path.dirname(args.artifact), '../../data/deployments/lcai_testnet_v2');
    const deploymentRecordPath = path.join(deploymentRecordDir, 'LCAIValidatorRegistry.json');

    if (fs.existsSync(deploymentRecordPath)) {
        try {
            const existingDeployment = JSON.parse(fs.readFileSync(deploymentRecordPath, 'utf-8'));
            const code = await provider.getCode(existingDeployment.address);
            if (code !== '0x') {
                registryAddress = existingDeployment.address;
                console.log(`\nContract already deployed at: ${registryAddress}`);
            }
        } catch (e) {
            // Ignore errors reading existing deployment
        }
    }

    // Deploy if needed
    if (!registryAddress) {
        console.log('\nDeploying LCAIValidatorRegistry...');

        // Wait for at least one block
        let blockNumber = await provider.getBlockNumber();
        if (blockNumber === 0) {
            console.log('  Waiting for first block...');
            while (blockNumber === 0) {
                await sleep(2000);
                blockNumber = await provider.getBlockNumber();
            }
            console.log(`  Block ${blockNumber} confirmed`);
        }

        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
        const contract = await factory.deploy();
        console.log(`  Transaction: ${contract.deploymentTransaction().hash}`);
        console.log('  Waiting for confirmation...');

        await contract.waitForDeployment();
        registryAddress = await contract.getAddress();
        console.log(`  Deployed at: ${registryAddress}`);

        // Save deployment record
        fs.mkdirSync(deploymentRecordDir, { recursive: true });
        const deploymentRecord = {
            address: registryAddress,
            chain: 'lcai_testnet_v2_multinode',
            deployedBy: wallet.address,
            timestamp: new Date().toISOString(),
            ts: Date.now(),
            txHash: contract.deploymentTransaction().hash,
        };
        fs.writeFileSync(deploymentRecordPath, JSON.stringify(deploymentRecord, null, 2));
        console.log(`  Saved deployment record`);
    }

    // Update config files
    if (args.configDir) {
        console.log('\nUpdating config files...');
        const updatedCount = updateConfigFiles(args.configDir, registryAddress);
        console.log(`  Updated ${updatedCount} config files`);
    }

    // Get contract instance
    const registry = new ethers.Contract(registryAddress, artifact.abi, wallet);

    // Check which validators are already registered
    console.log('\nChecking existing validators...');
    const existingCount = await registry.getValidatorCount();
    console.log(`  Existing validators: ${existingCount}`);

    // If all validators are registered, exit early
    if (Number(existingCount) >= validators.length) {
        console.log('\nAll validators already registered, nothing to do.');
        console.log(`VALIDATOR_REGISTRY_ADDRESS=${registryAddress}`);
        return;
    }

    // Register validators
    console.log('\nRegistering validators...');
    const stakeAmount = ethers.parseEther(args.stake);
    let registered = 0;
    let skipped = 0;
    let failed = 0;

    for (const validator of validators) {
        const validatorId = validator.id;
        const secretKeyHex = validator.secret_key_hex;

        // Create a wallet for this validator from their secret key
        const validatorPrivateKey = secretKeyHex.startsWith('0x') ? secretKeyHex : `0x${secretKeyHex}`;

        let validatorWallet;
        try {
            validatorWallet = new ethers.Wallet(validatorPrivateKey, provider);
        } catch (e) {
            console.log(`  [${validatorId}] Invalid key format, skipping`);
            failed++;
            continue;
        }

        // Check if already registered
        try {
            const existingValidator = await registry.getValidator(validatorWallet.address);
            if (existingValidator.validatorAddress !== ethers.ZeroAddress) {
                console.log(`  [${validatorId}] Already registered at ${validatorWallet.address.slice(0, 12)}...`);
                skipped++;
                continue;
            }
        } catch (e) {
            // Not registered, proceed
        }

        // Fund the validator wallet if needed
        const validatorBalance = await provider.getBalance(validatorWallet.address);
        const requiredForRegistration = stakeAmount + ethers.parseEther('0.1'); // stake + gas

        if (validatorBalance < requiredForRegistration) {
            const fundAmount = requiredForRegistration - validatorBalance + ethers.parseEther('0.05');
            console.log(`  [${validatorId}] Funding with ${ethers.formatEther(fundAmount)} ETH...`);

            try {
                const fundTx = await wallet.sendTransaction({
                    to: validatorWallet.address,
                    value: fundAmount
                });
                await fundTx.wait();
            } catch (e) {
                console.log(`  [${validatorId}] Funding failed: ${e.message}`);
                failed++;
                continue;
            }
        }

        // Generate BLS public key
        const blsPublicKey = deriveBLSPublicKey(secretKeyHex);

        // Register validator (from their own wallet)
        const validatorRegistry = new ethers.Contract(registryAddress, artifact.abi, validatorWallet);

        try {
            console.log(`  [${validatorId}] Registering ${validatorWallet.address.slice(0, 12)}...`);
            const tx = await validatorRegistry.registerValidator(blsPublicKey, {
                value: stakeAmount,
                gasLimit: 300000
            });
            await tx.wait();
            console.log(`  [${validatorId}] Registered (tx: ${tx.hash.slice(0, 18)}...)`);
            registered++;
        } catch (e) {
            console.log(`  [${validatorId}] Registration failed: ${e.message}`);
            failed++;
        }

        // Small delay between registrations to avoid nonce issues
        await sleep(500);
    }

    // Summary
    console.log('\n' + '='.repeat(65));
    console.log('  Summary');
    console.log('='.repeat(65));
    console.log(`  Contract Address: ${registryAddress}`);
    console.log(`  Validators Registered: ${registered}`);
    console.log(`  Validators Skipped: ${skipped}`);
    console.log(`  Validators Failed: ${failed}`);
    console.log(`  Total Validators: ${validators.length}`);

    // Final validator count
    const finalCount = await registry.getValidatorCount();
    console.log(`\n  Registry Total: ${finalCount} validators`);
    console.log('='.repeat(65) + '\n');

    // Output for scripts to capture
    console.log(`VALIDATOR_REGISTRY_ADDRESS=${registryAddress}`);
}

main().catch((error) => {
    console.error('\nERROR:', error.message);
    process.exit(1);
});
