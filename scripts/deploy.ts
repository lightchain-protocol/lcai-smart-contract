import { network } from "hardhat";

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

  const manualVotesStrategy = await ethers.deployContract(
    "ManualVotesStrategy",
    []
  );
  console.log(
    "ManualVotesStrategy deployed to:",
    await manualVotesStrategy.getAddress()
  );

  const governor = await ethers.deployContract("LCAIGovernor", [
    await manualVotesStrategy.getAddress(),
    await timelock.getAddress(),
  ]);
  console.log("Governor deployed to:", await governor.getAddress());

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  await timelock.grantRole(proposerRole, await governor.getAddress());
  await timelock.grantRole(executorRole, await governor.getAddress());

  console.log("Timelock roles set");

  const votingPower = [
    { voter: "0x14b02E90305Cb16493475cb764194CCDA163c46C", amount: "100000" },
    { voter: "0x9893Ccf1070B61D44295EA9A668142b8350D8eC4", amount: "50000" },
    { voter: "0xfFe46696dA1E322EB80e9b04D7b324292d725B64", amount: "50000" },
    { voter: "0xd6297dc08a53abF0d965c9ab3DCD1bAeA30fa029", amount: "50000" },
  ] as const;

  for (const vp of votingPower) {
    await deployer.sendTransaction({
      to: vp.voter,
      value: ethers.parseEther("1"),
    });
  }

  await manualVotesStrategy.setVotingPowerBatch(
    votingPower.map((vp) => vp.voter),
    votingPower.map((vp) => ethers.parseEther(vp.amount))
  );

  console.log("Voting powers set");

  const counter = await ethers.deployContract("Counter", [
    await timelock.getAddress(),
  ]);
  console.log("Counter deployed to:", await counter.getAddress());
}

main().catch(console.error);
