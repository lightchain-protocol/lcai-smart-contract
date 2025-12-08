import { ethers } from "hardhat";

async function main() {
  console.log("Deploying LCAIValidatorRegistry...");
  
  const LCAIValidatorRegistry = await ethers.getContractFactory("LCAIValidatorRegistry");
  const registry = await LCAIValidatorRegistry.deploy();
  
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  
  console.log(`LCAIValidatorRegistry deployed to: ${address}`);
  console.log("Update your consensus.yaml with this address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
