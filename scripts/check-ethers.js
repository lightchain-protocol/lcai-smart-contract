import hre from "hardhat";

async function main() {
    console.log("Checking HRE...");
    if (hre.ethers) {
        console.log("Ethers is present in HRE");
        const [signer] = await hre.ethers.getSigners();
        console.log("Signer address:", signer.address);
    } else {
        console.error("Ethers is NOT present in HRE");
        console.log("Plugins loaded:", hre.config.plugins); // This might not be populated but worth a shot
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
