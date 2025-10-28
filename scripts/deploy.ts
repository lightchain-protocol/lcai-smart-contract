import { network } from "hardhat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { ethers } = await network.connect();

  const [deployer] = await ethers.getSigners();

  const timelock = await ethers.deployContract("LCAITimeLock", [
    172800n, // 2 days delay
    [], // proposers (set to governor)
    [], // executors (set to governor)
    deployer.address,
  ]);
  console.log("Timelock deployed to:", await timelock.getAddress());

  const presaleTotalSupply = 10000000n;
  const PresaleVotingPower = await ethers.deployContract("PresaleVotingPower", [
    presaleTotalSupply,
  ]);
  console.log(
    "PresaleVotingPower deployed to:",
    await PresaleVotingPower.getAddress()
  );

  const governor = await ethers.deployContract("LCAIGovernor", [
    await PresaleVotingPower.getAddress(),
    await timelock.getAddress(),
    deployer.address, // <-- NEW: multisigAddress admin address for emergency actions
  ]);
  console.log("Governor deployed to:", await governor.getAddress());

  // Wait for 5 seconds to ensure the contract is deployed
  await sleep(5000);

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const cancelRole = await timelock.CANCELLER_ROLE();
  await timelock.grantRole(proposerRole, await governor.getAddress());
  await timelock.grantRole(executorRole, await governor.getAddress());
  await timelock.grantRole(cancelRole, await governor.getAddress());

  console.log("Timelock roles set");

  const counter = await ethers.deployContract("Counter", [
    await timelock.getAddress(),
  ]);
  console.log("Counter deployed to:", await counter.getAddress());
}

main().catch(console.error);
