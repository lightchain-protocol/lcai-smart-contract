import { expect } from "chai";
import "@nomicfoundation/hardhat-ethers-chai-matchers";
import hre from "hardhat";

const { network } = hre;
let ethers: typeof hre.ethers;

describe("ChallengeBondEscrow", function () {
  before(async function () {
    ({ ethers } = await network.connect());
  });

  it("posts, refunds, and slashes bonds with proper gating", async function () {
    const [deployer, resolver, challenger, treasury, other] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory("ChallengeBondEscrow", deployer);

    // Constructor: (timelock, resolver, treasury, minBond, challengeWindowSecs)
    const minBond = ethers.parseEther("1");
    const window = 100n;
    const escrow = await Escrow.deploy(deployer.address, resolver.address, treasury.address, minBond, window);
    await escrow.waitForDeployment();

    // Post bond (>= minBond)
    const challengeId = ethers.keccak256(ethers.toUtf8Bytes("challenge-1"));
    await expect(escrow.connect(challenger).postBond(challengeId, { value: minBond }))
      .to.emit(escrow, "BondPosted");

    // Cannot post twice for same challengeId
    await expect(escrow.connect(challenger).postBond(challengeId, { value: minBond }))
      .to.be.revertedWithCustomError(escrow, "BondExists");

    // Non-resolver cannot refund
    await expect(escrow.connect(other).refundBond(challengeId, challenger.address))
      .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");

    // Resolver refunds to challenger
    const balBefore = await ethers.provider.getBalance(challenger.address);
    const tx = await escrow.connect(resolver).refundBond(challengeId, challenger.address);
    const rc = await tx.wait();
    const gas = rc!.gasUsed * rc!.gasPrice!;
    const balAfter = await ethers.provider.getBalance(challenger.address);
    expect(balAfter - balBefore).to.equal(minBond);

    // Cannot refund again
    await expect(escrow.connect(resolver).refundBond(challengeId, challenger.address))
      .to.be.revertedWithCustomError(escrow, "AlreadySettled");

    // New challenge: post then slash
    const challengeId2 = ethers.keccak256(ethers.toUtf8Bytes("challenge-2"));
    await escrow.connect(challenger).postBond(challengeId2, { value: minBond });
    const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
    await expect(escrow.connect(resolver).slashBond(challengeId2, treasury.address, minBond))
      .to.emit(escrow, "BondSlashed")
      .withArgs(challengeId2, treasury.address, minBond);
    const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryBalAfter - treasuryBalBefore).to.equal(minBond);

    // Pause blocks posting
    await escrow.connect(deployer).pause();
    const challengeId3 = ethers.keccak256(ethers.toUtf8Bytes("challenge-3"));
    await expect(escrow.connect(challenger).postBond(challengeId3, { value: minBond }))
      .to.be.revertedWithCustomError(escrow, "EnforcedPause");
    await escrow.connect(deployer).unpause();
  });
});
