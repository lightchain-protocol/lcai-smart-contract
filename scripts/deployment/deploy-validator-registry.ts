import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Usage:
//   npx hardhat run scripts/deployment/deploy-validator-registry.ts --network <network>
//
// This script:
// 1. Deploys the LCAIValidatorRegistry contract
// 2. Saves deployment record to data/deployments/<network>/
// 3. Automatically updates all consensus config files with the new address

// Config files to update (relative to repo root)
const CONSENSUS_CONFIG_FILES = [
    "PoI-Consensus/consensus-go/config/consensus.yaml",
    "PoI-Consensus/consensus-go/config/consensus-example.yaml",
    "lcai-testnet-v2/network/rpc/config/consensus.yaml",
    "lcai-testnet-v2/network/rpc/config/consensus-node2.yaml",
    "lcai-testnet-v2/network/rpc/config/consensus-node3.yaml",
    "lcai-testnet-v2/network/rpc/config/consensus-node4.yaml",
    "lcai-testnet-v2/network/engine-v2-dev/consensus-dev.yaml",
];

function getRepoRoot(): string {
    // Navigate up from lcai-smart-contract to the root
    return path.resolve(__dirname, "../../../..");
}

function updateConfigFile(configPath: string, newAddress: string): boolean {
    try {
        if (!fs.existsSync(configPath)) {
            console.log(`  ⚠️  Config file not found: ${configPath}`);
            return false;
        }

        let content = fs.readFileSync(configPath, "utf-8");

        // Match validator_registry_address with various formats
        const patterns = [
            // YAML format: validator_registry_address: "0x..."
            /^(\s*validator_registry_address:\s*["']?)0x[a-fA-F0-9]{40}(["']?\s*)$/gm,
            // YAML format: validator_registry_address: "" (empty)
            /^(\s*validator_registry_address:\s*["'])(["']\s*)$/gm,
        ];

        let updated = false;
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                content = content.replace(pattern, `$1${newAddress}$2`);
                updated = true;
                break;
            }
        }

        // If no existing address found, try to add it after execution: section
        if (!updated) {
            if (content.includes("validator_registry_address:")) {
                // Replace empty or placeholder value
                content = content.replace(
                    /^(\s*validator_registry_address:\s*).*$/gm,
                    `$1"${newAddress}"`
                );
                updated = true;
            }
        }

        if (updated) {
            fs.writeFileSync(configPath, content);
            console.log(`  ✅ Updated: ${path.basename(configPath)}`);
            return true;
        } else {
            console.log(`  ⚠️  No validator_registry_address field found in: ${path.basename(configPath)}`);
            return false;
        }
    } catch (error) {
        console.error(`  ❌ Error updating ${configPath}:`, error);
        return false;
    }
}

async function main() {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();
    const networkName = network.name;

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  LCAIValidatorRegistry Deployment");
    console.log("═══════════════════════════════════════════════════════════════\n");

    console.log("📋 Deployment Details:");
    console.log(`  Network:  ${networkName}`);
    console.log(`  Deployer: ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`  Balance:  ${ethers.formatEther(balance)} ETH\n`);

    // Deploy contract
    console.log("🚀 Deploying LCAIValidatorRegistry...");
    const Registry = await ethers.getContractFactory("LCAIValidatorRegistry", deployer);
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const addr = await registry.getAddress();
    console.log(`\n✅ LCAIValidatorRegistry deployed at: ${addr}\n`);

    // Get repo root
    const repoRoot = getRepoRoot();
    console.log(`📁 Repo root: ${repoRoot}\n`);

    // Save deployment record
    console.log("💾 Saving deployment record...");
    const outDir = path.join("data", "deployments", networkName);
    fs.mkdirSync(outDir, { recursive: true });

    const deploymentRecord = {
        address: addr,
        chain: networkName,
        deployedBy: deployer.address,
        timestamp: new Date().toISOString(),
        ts: Date.now(),
        txHash: registry.deploymentTransaction()?.hash || "unknown",
        blockNumber: registry.deploymentTransaction()?.blockNumber || "pending",
    };

    fs.writeFileSync(
        path.join(outDir, "LCAIValidatorRegistry.json"),
        JSON.stringify(deploymentRecord, null, 2)
    );
    console.log(`  ✅ Saved to: ${path.join(outDir, "LCAIValidatorRegistry.json")}\n`);

    // Export to .env-style file for convenience
    const envOut = path.join(outDir, ".env");
    const envContent = `# LCAIValidatorRegistry Deployment
# Deployed: ${new Date().toISOString()}
# Network: ${networkName}
VALIDATOR_REGISTRY_ADDRESS=${addr}
`;
    fs.writeFileSync(envOut, envContent);
    console.log(`  ✅ Saved to: ${envOut}\n`);

    // Update consensus config files
    console.log("🔧 Updating consensus config files...");
    let updatedCount = 0;
    let skippedCount = 0;

    for (const configFile of CONSENSUS_CONFIG_FILES) {
        const fullPath = path.join(repoRoot, configFile);
        if (updateConfigFile(fullPath, addr)) {
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log(`\n📊 Config Update Summary:`);
    console.log(`  Updated: ${updatedCount} files`);
    console.log(`  Skipped: ${skippedCount} files\n`);

    // Summary
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Deployment Complete!");
    console.log("═══════════════════════════════════════════════════════════════\n");
    console.log(`📍 Contract Address: ${addr}`);
    console.log(`📁 Deployment Record: ${path.join(outDir, "LCAIValidatorRegistry.json")}`);
    console.log(`\n💡 Next Steps:`);
    console.log(`  1. Restart consensus clients to pick up the new registry address`);
    console.log(`  2. Register validators using:`);
    console.log(`     ./bin/register-validator register --rpc <RPC_URL> --registry ${addr} --private-key <KEY> --pubkey <PUBKEY>`);
    console.log(`  3. Verify registration with:`);
    console.log(`     ./bin/register-validator status --rpc <RPC_URL> --registry ${addr}\n`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
