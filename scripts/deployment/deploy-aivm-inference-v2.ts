import fs from "node:fs";
import path from "node:path";
import { network } from "hardhat";

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function readDeploymentAddress(networkName: string, contractName: string): string | undefined {
  const p = path.join(
    process.cwd(),
    "data",
    "deployments",
    networkName,
    `${contractName}.json`
  );
  if (!fs.existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    const addr = typeof parsed?.address === "string" ? parsed.address : undefined;
    return addr?.trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const registryAddr =
    process.env.AIVM_VALIDATOR_REGISTRY_ADDRESS ||
    process.env.VALIDATOR_REGISTRY_ADDRESS ||
    readDeploymentAddress(network.name, "LCAIValidatorRegistry");

  const registry = requireValue("validator registry address", registryAddr);

  console.log("🚀 Deploying AIVMInferenceV2");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("ValidatorRegistry:", registry);

  const Factory = await ethers.getContractFactory("AIVMInferenceV2", deployer);
  const contract = await Factory.deploy(registry);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ AIVMInferenceV2 deployed at:", address);
  console.log("AIVM_INFERENCE_V2_ADDRESS=" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

