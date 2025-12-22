
import { network } from "hardhat";

function requireValue(name: string, value: string | undefined): string {
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing ${name}`);
    }
    return value.trim();
}

async function main() {
    const { ethers } = await network.connect()
    const contractAddress =
        process.env.VALIDATOR_REGISTRY_ADDRESS ||
        process.env.AIVM_VALIDATOR_REGISTRY_ADDRESS ||
        process.argv[2];

    // Get the deployer or a new random wallet
    const [deployer] = await ethers.getSigners();
    console.log("Registering validator with account:", deployer.address);

    // Get the contract instance
    const addr = requireValue("validator registry address", contractAddress);
    const validatorRegistry = await ethers.getContractAt("LCAIValidatorRegistry", addr);

    // Generate a random BLS public key (48 bytes)
    // In a real scenario, this would be generated from a BLS secret key
    const blsPublicKey =
        process.env.BLS_PUBLIC_KEY ||
        process.env.VALIDATOR_BLS_PUBLIC_KEY ||
        ethers.hexlify(ethers.randomBytes(48));
    console.log("Generated random BLS Public Key:", blsPublicKey);

    // Register the validator
    // We need to send some ETH as stake (e.g., 1 ETH)
    const stakeEth = process.env.VALIDATOR_STAKE_ETH || "1.0";
    const stakeAmount = ethers.parseEther(stakeEth);

    console.log(`Registering validator with stake: ${ethers.formatEther(stakeAmount)} ETH...`);

    try {
        const tx = await validatorRegistry.registerValidator(blsPublicKey, {
            value: stakeAmount,
        });

        console.log("Transaction sent:", tx.hash);
        await tx.wait();

        console.log("✅ Validator registered successfully!");
        console.log("VALIDATOR_REGISTRY_ADDRESS=" + addr);
        console.log("VALIDATOR_ADDRESS=" + deployer.address);
    } catch (error: any) {
        console.error("❌ Registration failed:", error.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
