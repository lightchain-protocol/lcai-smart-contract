import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Usage:
//   npx hardhat run scripts/deploy-challenge-bond-escrow.ts --network <network>
//
// Env (optional):
//   TIMLOCK=0x...   RESOLVER=0x...   TREASURY=0x...
//   MIN_BOND_WEI=100000000000000000000   CHALLENGE_WINDOW_SECS=96

async function main() {
  const [deployer] = await ethers.getSigners();

  const timelock = process.env.TIMLOCK ?? deployer.address;
  const resolver = process.env.RESOLVER ?? deployer.address;
  const treasury = process.env.TREASURY ?? deployer.address;
  const minBondWei = process.env.MIN_BOND_WEI ?? ethers.parseEther("100").toString();
  const windowSecs = process.env.CHALLENGE_WINDOW_SECS ?? "0";

  console.log("Deploying ChallengeBondEscrow with:", { timelock, resolver, treasury, minBondWei, windowSecs, from: deployer.address, network: network.name });

  const Escrow = await ethers.getContractFactory("ChallengeBondEscrow", deployer);
  const escrow = await Escrow.deploy(
    timelock,
    resolver,
    treasury,
    BigInt(minBondWei),
    BigInt(windowSecs)
  );
  await escrow.waitForDeployment();

  const addr = await escrow.getAddress();
  console.log("ChallengeBondEscrow deployed at:", addr);

  // Save deployment record
  const outDir = path.join("Smart Contract", "data", "deployments", network.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "ChallengeBondEscrow.json"),
    JSON.stringify({ address: addr, chain: network.name, timelock, resolver, treasury, minBondWei, windowSecs, deployedBy: deployer.address, ts: Date.now() }, null, 2)
  );

  // Export to .env-style file for convenience
  const envOut = path.join(outDir, ".env");
  fs.writeFileSync(envOut, `BOND_ESCROW_ADDRESS=${addr}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

