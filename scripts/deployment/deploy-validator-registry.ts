import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Usage:
//   npx hardhat run scripts/deployment/deploy-validator-registry.ts --network <network>

async function main() {
    const { ethers } = await network.connect()
    const [deployer] = await ethers.getSigners();

    console.log("Deploying LCAIValidatorRegistry with:", { from: deployer.address, network: 'lcai_testnet_v2' });

    const Registry = await ethers.getContractFactory("LCAIValidatorRegistry", deployer);
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const addr = await registry.getAddress();
    console.log("LCAIValidatorRegistry deployed at:", addr);

    // Save deployment record
    const outDir = path.join("data", "deployments", "lcai_testnet_v2");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, "LCAIValidatorRegistry.json"),
        JSON.stringify({ address: addr, chain: "lcai_testnet_v2", deployedBy: deployer.address, ts: Date.now() }, null, 2)
    );

    // Export to .env-style file for convenience
    const envOut = path.join(outDir, ".env");
    // Append or write
    try {
        fs.appendFileSync(envOut, `VALIDATOR_REGISTRY_ADDRESS=${addr}\n`);
    } catch (e) {
        fs.writeFileSync(envOut, `VALIDATOR_REGISTRY_ADDRESS=${addr}\n`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
