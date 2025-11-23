
import { network } from "hardhat";

async function main() {
    const { ethers } = await network.connect()
    const contractAddress = "0xaBe5eAF18CFe388BeDC2fe6B6E71c43eB55b286e"; // Deployed address

    // Get the deployer or a new random wallet
    const [deployer] = await ethers.getSigners();
    console.log("Registering validator with account:", deployer.address);

    // Get the contract instance
    const validatorRegistry = await ethers.getContractAt("LCAIValidatorRegistry", contractAddress);

    // Generate a random BLS public key (48 bytes)
    // In a real scenario, this would be generated from a BLS secret key
    const blsPublicKey = ethers.hexlify(ethers.randomBytes(48));
    console.log("Generated random BLS Public Key:", blsPublicKey);

    // Register the validator
    // We need to send some ETH as stake (e.g., 1 ETH)
    const stakeAmount = ethers.parseEther("1.0");

    console.log(`Registering validator with stake: ${ethers.formatEther(stakeAmount)} ETH...`);

    try {
        const tx = await validatorRegistry.registerValidator(blsPublicKey, {
            value: stakeAmount,
        });

        console.log("Transaction sent:", tx.hash);
        await tx.wait();

        console.log("✅ Validator registered successfully!");
    } catch (error: any) {
        console.error("❌ Registration failed:", error.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
