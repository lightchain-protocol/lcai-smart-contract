import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying LCAIValidatorRegistry (simple)");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("LCAIValidatorRegistry", deployer);
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ LCAIValidatorRegistry deployed at:", address);
  console.log("VALIDATOR_REGISTRY_ADDRESS=" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

