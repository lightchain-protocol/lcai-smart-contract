import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

const { network } = hre;
// @ts-ignore
let ethers: typeof hre.ethers;
let networkHelpers: any;
let owner: any;
let buyer1: any;
let buyer2: any;
let buyer3: any;

describe("LCAIAirdrop", function () {
  before(async function () {
    ({ ethers, networkHelpers } = await network.connect());
    [owner, buyer1, buyer2, buyer3] = await ethers.getSigners();
  });

  // ===== HELPER FUNCTIONS =====

  async function setupDirectClaim(airdrop: any) {
    const currentBlock = await ethers.provider.getBlock("latest");
    const startTime = BigInt(currentBlock!.timestamp + 100);
    const endTime = startTime + 30n * 24n * 60n * 60n; // 30 days
    await airdrop.openClaim(startTime, endTime);
    await networkHelpers.time.increase(150);
  }

  async function setupVestingConfig(
    airdrop: any,
    durationMonths: bigint = 12n,
    rewardPercentage: bigint = 75n,
  ) {
    const currentBlock = await ethers.provider.getBlock("latest");
    const startTime = BigInt(currentBlock!.timestamp + 100);
    const endTime = startTime + 30n * 24n * 60n * 60n; // 30 days
    await airdrop.openVesting(
      startTime,
      endTime,
      durationMonths,
      rewardPercentage,
    );
    await networkHelpers.time.increase(150);
  }

  async function deployFixture() {
    // Deploy the token
    const token = await ethers.deployContract("LightChainAI");

    // Deploy USDT for presale
    const usdt = await ethers.deployContract("contracts/Token.sol:Token");

    // Deploy presale contract with team and marketing wallets
    const presale = await ethers.deployContract("LCAIPresale", [
      owner.address,
      owner.address,
    ]);

    const totalTokenForSale = parseEther("20000000");
    const rate = parseEther("0.00004");

    // Setup presale
    await presale.addPayableTokens(
      [await usdt.getAddress()],
      [parseEther("1")],
    );
    await token.approve(await presale.getAddress(), totalTokenForSale);
    await presale.setSaleToken(
      await token.getAddress(),
      totalTokenForSale,
      rate,
      true,
    );
    await token.setWhitelist(await presale.getAddress(), true);

    // Enable trading for the token so airdrop claims can work
    await token.enableTrading();

    // Whitelist buyers for token transfers
    await token.setWhitelist(buyer1.address, true);
    await token.setWhitelist(buyer2.address, true);
    await token.setWhitelist(buyer3.address, true);

    // Simulate some purchases in the presale
    const buyAmount = parseEther("1");

    // Buyer1 buys tokens
    await presale.connect(buyer1).buyToken(ethers.ZeroAddress, buyAmount, {
      value: buyAmount,
    });

    // Buyer2 buys tokens
    await presale
      .connect(buyer2)
      .buyToken(ethers.ZeroAddress, parseEther("2"), {
        value: parseEther("2"),
      });

    // Deploy airdrop contract
    const airdrop = await ethers.deployContract("LCAIAirdrop", [
      await presale.getAddress(),
    ]);

    // Whitelist airdrop contract for token transfers
    await token.setWhitelist(await airdrop.getAddress(), true);

    // Fund the airdrop contract with tokens for rewards
    const airdropFunds = parseEther("5000000"); // 5M tokens for airdrop
    await token.approve(await airdrop.getAddress(), airdropFunds);
    await airdrop.deposit(airdropFunds);

    return {
      presale,
      airdrop,
      token,
      usdt,
      rate,
      buyAmount,
    };
  }

  // ===== DEPLOYMENT TESTS =====

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.owner()).to.equal(owner.address);
    });

    it("Should set the presale address correctly", async function () {
      const { airdrop, presale } = await deployFixture();

      expect(await airdrop.lcaiPresale()).to.equal(await presale.getAddress());
    });

    it("Should set the token address correctly", async function () {
      const { airdrop, token } = await deployFixture();

      expect(await airdrop.token()).to.equal(await token.getAddress());
    });

    it("Should initialize with correct REWARD_PERCENTAGE", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.REWARD_PERCENTAGE()).to.equal(50n);
    });

    it("Should revert if presale address is zero", async function () {
      await expect(
        ethers.deployContract("LCAIAirdrop", [ethers.ZeroAddress]),
      ).to.be.revertedWith("LCAIAirdrop: Invalid presale address");
    });

    it("Should not be paused initially", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.paused()).to.equal(false);
    });
  });

  // ===== CLAIM TESTS =====

  describe("Claim", function () {
    it("Should allow a buyer to claim their airdrop reward", async function () {
      const { airdrop, token, rate, buyAmount } = await deployFixture();

      await setupDirectClaim(airdrop);

      const expectedTokens = (buyAmount * 10n ** 18n) / rate;
      const expectedReward = (expectedTokens * 50n) / 100n;

      const balanceBefore = await token.balanceOf(buyer1.address);

      await airdrop.connect(buyer1).claim();

      const balanceAfter = await token.balanceOf(buyer1.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedReward);
      expect(await airdrop.claimed(buyer1.address)).to.equal(true);
      expect(await airdrop.claimedAmount(buyer1.address)).to.equal(
        expectedReward,
      );
      expect(await airdrop.totalClaimedAmount()).to.equal(expectedReward);
    });

    it("Should emit Claimed event", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);

      const tx = await airdrop.connect(buyer1).claim();
      const receipt = await tx.wait();

      // Check that at least one event was emitted
      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should prevent double claiming", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.connect(buyer1).claim();

      await expect(airdrop.connect(buyer1).claim()).to.be.revertedWith(
        "LCAIAirdrop: Already claimed",
      );
    });

    it("Should revert if user has no amount to claim", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);

      await expect(airdrop.connect(buyer3).claim()).to.be.revertedWith(
        "LCAIAirdrop: No amount to claim",
      );
    });

    it("Should calculate correct reward amount for different buyers", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupDirectClaim(airdrop);

      const expectedTokensBuyer1 = (buyAmount * 10n ** 18n) / rate;
      const expectedRewardBuyer1 = (expectedTokensBuyer1 * 50n) / 100n;

      const expectedTokensBuyer2 = (parseEther("2") * 10n ** 18n) / rate;
      const expectedRewardBuyer2 = (expectedTokensBuyer2 * 50n) / 100n;

      await airdrop.connect(buyer1).claim();
      await airdrop.connect(buyer2).claim();

      expect(await airdrop.claimedAmount(buyer1.address)).to.equal(
        expectedRewardBuyer1,
      );
      expect(await airdrop.claimedAmount(buyer2.address)).to.equal(
        expectedRewardBuyer2,
      );
      expect(await airdrop.totalClaimedAmount()).to.equal(
        expectedRewardBuyer1 + expectedRewardBuyer2,
      );
    });

    it("Should revert if contract has insufficient balance", async function () {
      const { airdrop, token } = await deployFixture();

      await setupDirectClaim(airdrop);

      // Withdraw all tokens from airdrop contract
      const balance = await token.balanceOf(await airdrop.getAddress());

      await airdrop.withdraw(balance);

      await expect(airdrop.connect(buyer1).claim()).to.be.revertedWith(
        "LCAIAirdrop: Insufficient contract balance",
      );
    });

    it("Should revert if contract is paused", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).claim(),
      ).to.be.revertedWithCustomError(airdrop, "EnforcedPause");
    });

    it("Should revert if claiming before claim period starts", async function () {
      const { airdrop } = await deployFixture();

      // Configure claim to start in the future
      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 1000);
      const endTime = startTime + 30n * 24n * 60n * 60n;
      await airdrop.openClaim(startTime, endTime);

      // Try to claim before start time (don't advance time)
      await expect(airdrop.connect(buyer1).claim()).to.be.revertedWith(
        "LCAIAirdrop: Claim period has not started",
      );
    });

    it("Should revert if claiming after claim period ends", async function () {
      const { airdrop } = await deployFixture();

      // Configure claim with short duration
      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 1000n; // Only 1000 seconds duration
      await airdrop.openClaim(startTime, endTime);

      // Advance past the end time
      await networkHelpers.time.increase(2000);

      // Try to claim after end time
      await expect(airdrop.connect(buyer1).claim()).to.be.revertedWith(
        "LCAIAirdrop: Claim period has ended",
      );
    });
  });

  // ===== DEPOSIT TESTS =====

  describe("Deposit", function () {
    it("Should allow owner to deposit tokens", async function () {
      const { airdrop, token } = await deployFixture();

      const depositAmount = parseEther("1000");
      const balanceBefore = await token.balanceOf(await airdrop.getAddress());

      await token.approve(await airdrop.getAddress(), depositAmount);
      await airdrop.deposit(depositAmount);

      const balanceAfter = await token.balanceOf(await airdrop.getAddress());

      expect(balanceAfter - balanceBefore).to.equal(depositAmount);
    });

    it("Should emit TokensDeposited event", async function () {
      const { airdrop, token } = await deployFixture();

      const depositAmount = parseEther("1000");
      await token.approve(await airdrop.getAddress(), depositAmount);

      const tx = await airdrop.deposit(depositAmount);
      const receipt = await tx.wait();

      // Check that at least one event was emitted
      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if non-owner tries to deposit", async function () {
      const { airdrop, token } = await deployFixture();

      const depositAmount = parseEther("1000");
      await token.transfer(buyer1.address, depositAmount);
      await token
        .connect(buyer1)
        .approve(await airdrop.getAddress(), depositAmount);

      await expect(
        airdrop.connect(buyer1).deposit(depositAmount),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if deposit amount is zero", async function () {
      const { airdrop } = await deployFixture();

      await expect(airdrop.deposit(0n)).to.be.revertedWith(
        "LCAIAirdrop: Amount must be greater than 0",
      );
    });
  });

  // ===== WITHDRAW TESTS =====

  describe("Withdraw", function () {
    it("Should allow owner to withdraw tokens", async function () {
      const { airdrop, token } = await deployFixture();

      const withdrawAmount = parseEther("1000");
      const balanceBefore = await token.balanceOf(owner.address);

      await airdrop.withdraw(withdrawAmount);

      const balanceAfter = await token.balanceOf(owner.address);

      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("Should emit TokensWithdrawn event", async function () {
      const { airdrop } = await deployFixture();

      const withdrawAmount = parseEther("1000");

      const tx = await airdrop.withdraw(withdrawAmount);
      const receipt = await tx.wait();

      // Check that at least one event was emitted
      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      const { airdrop } = await deployFixture();

      const withdrawAmount = parseEther("1000");

      await expect(
        airdrop.connect(buyer1).withdraw(withdrawAmount),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if withdraw amount is zero", async function () {
      const { airdrop } = await deployFixture();

      await expect(airdrop.withdraw(0n)).to.be.revertedWith(
        "LCAIAirdrop: Amount must be greater than 0",
      );
    });

    it("Should revert if withdraw amount exceeds balance", async function () {
      const { airdrop } = await deployFixture();

      const excessiveAmount = parseEther("100000000");

      await expect(airdrop.withdraw(excessiveAmount)).to.be.revertedWith(
        "LCAIAirdrop: Insufficient contract balance",
      );
    });
  });

  // ===== PAUSE/UNPAUSE TESTS =====

  describe("Pause/Unpause", function () {
    it("Should allow owner to pause the contract", async function () {
      const { airdrop } = await deployFixture();

      await airdrop.pause();

      expect(await airdrop.paused()).to.equal(true);
    });

    it("Should allow owner to unpause the contract", async function () {
      const { airdrop } = await deployFixture();

      await airdrop.pause();
      await airdrop.unpause();

      expect(await airdrop.paused()).to.equal(false);
    });

    it("Should revert if non-owner tries to pause", async function () {
      const { airdrop } = await deployFixture();

      await expect(
        airdrop.connect(buyer1).pause(),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if non-owner tries to unpause", async function () {
      const { airdrop } = await deployFixture();

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).unpause(),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });
  });

  // ===== GET CLAIMABLE AMOUNT TESTS =====

  describe("GetClaimableAmount", function () {
    it("Should return correct claimable amount for unclaimed buyer", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      const expectedTokens = (buyAmount * 10n ** 18n) / rate;
      const expectedReward = (expectedTokens * 50n) / 100n;

      const claimable = await airdrop.getClaimableAmount(buyer1.address);

      expect(claimable).to.equal(expectedReward);
    });

    it("Should return zero for claimed buyer", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.connect(buyer1).claim();

      const claimable = await airdrop.getClaimableAmount(buyer1.address);

      expect(claimable).to.equal(0n);
    });

    it("Should return zero for non-buyer", async function () {
      const { airdrop } = await deployFixture();

      const claimable = await airdrop.getClaimableAmount(buyer3.address);

      expect(claimable).to.equal(0n);
    });
  });

  // ===== OPEN VESTING TESTS =====

  describe("OpenVesting", function () {
    it("Should allow owner to open vesting", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      expect(await airdrop.vestingEnabled()).to.equal(true);
      const config = await airdrop.vestingConfig();
      expect(config.durationMonths).to.equal(12n);
      expect(config.rewardPercentage).to.equal(75n);
    });

    it("Should emit VestingConfigured event", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      const tx = await airdrop.openVesting(startTime, endTime, 12n, 75n);
      const receipt = await tx.wait();

      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if non-owner tries to open vesting", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await expect(
        airdrop.connect(buyer1).openVesting(startTime, endTime, 12n, 75n),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if vesting already configured", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      await expect(
        airdrop.openVesting(startTime, endTime, 6n, 80n),
      ).to.be.revertedWith("LCAIAirdrop: Vesting already configured");
    });

    it("Should revert if duration months is zero", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await expect(
        airdrop.openVesting(startTime, endTime, 0n, 75n),
      ).to.be.revertedWith("LCAIAirdrop: Invalid vesting duration");
    });

    it("Should revert if reward percentage exceeds 100", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await expect(
        airdrop.openVesting(startTime, endTime, 12n, 101n),
      ).to.be.revertedWith("LCAIAirdrop: Reward percentage cannot exceed 100%");
    });

    it("Should revert if end time is not after start time", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 1000);
      const endTime = startTime - 100n;

      await expect(
        airdrop.openVesting(startTime, endTime, 12n, 75n),
      ).to.be.revertedWith("LCAIAirdrop: End time must be after start time");
    });

    it("Should allow 100% reward percentage", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openVesting(startTime, endTime, 12n, 100n);

      const config = await airdrop.vestingConfig();
      expect(config.rewardPercentage).to.equal(100n);
    });
  });

  // ===== OPEN CLAIM TESTS =====

  describe("OpenClaim", function () {
    it("Should allow owner to open claim", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openClaim(startTime, endTime);

      expect(await airdrop.claimEnabled()).to.equal(true);
      const config = await airdrop.claimConfig();
      expect(config.startTime).to.equal(startTime);
      expect(config.endTime).to.equal(endTime);
    });

    it("Should emit ClaimOpened event", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      const tx = await airdrop.openClaim(startTime, endTime);
      const receipt = await tx.wait();

      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if non-owner tries to open claim", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await expect(
        airdrop.connect(buyer1).openClaim(startTime, endTime),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if claim already configured", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openClaim(startTime, endTime);

      await expect(
        airdrop.openClaim(startTime + 1000n, endTime + 1000n),
      ).to.be.revertedWith("LCAIAirdrop: Claim already configured");
    });
  });
  // ===== EMERGENCY TOKEN RECOVERY TESTS =====

  describe("Emergency Token Recovery", function () {
    it("Should allow owner to recover non-airdrop tokens", async function () {
      const { airdrop, usdt } = await deployFixture();

      // Send some USDT to the airdrop contract
      const recoveryAmount = parseEther("100");
      await usdt.transfer(await airdrop.getAddress(), recoveryAmount);

      const balanceBefore = await usdt.balanceOf(owner.address);

      await airdrop.emergencyTokenRecovery(
        await usdt.getAddress(),
        recoveryAmount,
      );

      const balanceAfter = await usdt.balanceOf(owner.address);

      expect(balanceAfter - balanceBefore).to.equal(recoveryAmount);
    });

    it("Should emit TokensRecovered event", async function () {
      const { airdrop, usdt } = await deployFixture();

      const recoveryAmount = parseEther("100");
      await usdt.transfer(await airdrop.getAddress(), recoveryAmount);

      const tx = await airdrop.emergencyTokenRecovery(
        await usdt.getAddress(),
        recoveryAmount,
      );
      const receipt = await tx.wait();

      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should revert if non-owner tries to recover tokens", async function () {
      const { airdrop, usdt } = await deployFixture();

      const recoveryAmount = parseEther("100");
      await usdt.transfer(await airdrop.getAddress(), recoveryAmount);

      await expect(
        airdrop
          .connect(buyer1)
          .emergencyTokenRecovery(await usdt.getAddress(), recoveryAmount),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert when trying to recover the airdrop token", async function () {
      const { airdrop, token } = await deployFixture();

      await expect(
        airdrop.emergencyTokenRecovery(
          await token.getAddress(),
          parseEther("100"),
        ),
      ).to.be.revertedWith("LCAIAirdrop: Cannot recover airdrop token");
    });
  });

  // ===== VESTING TESTS =====

  describe("Vesting", function () {
    it("Should allow user to claim with vesting option", async function () {
      const { airdrop } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting();

      expect(await airdrop.claimed(buyer1.address)).to.equal(true);

      const vesting = await airdrop.userVesting(buyer1.address);
      expect(vesting.optedForVesting).to.equal(true);
    });

    it("Should give first month reward immediately upon vesting", async function () {
      const { airdrop, token, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n); // 12 months, 75% reward

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedFirstMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();

      // Check available amount immediately (should be 1/12)
      const availableAmount = await airdrop.getVestedAmount(buyer1.address);
      expect(availableAmount).to.equal(expectedFirstMonth);

      // Claim the first month immediately
      const balanceBefore = await token.balanceOf(buyer1.address);
      await airdrop.connect(buyer1).claimVested();
      const balanceAfter = await token.balanceOf(buyer1.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedFirstMonth);
    });

    it("Should unlock second month after 30 days", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();

      // Claim first month
      await airdrop.connect(buyer1).claimVested();

      // Fast forward 30 days
      await networkHelpers.time.increase(30 * 24 * 60 * 60);

      // Check available amount (should be another 1/12)
      const availableAmount = await airdrop.getVestedAmount(buyer1.address);
      expect(availableAmount).to.equal(expectedPerMonth);

      // Claim second month
      await airdrop.connect(buyer1).claimVested();

      // Total claimed should be 2/12
      const vesting = await airdrop.userVesting(buyer1.address);
      expect(vesting.claimedVestingAmount).to.equal(expectedPerMonth * 2n);
    });

    it("Should not allow claiming more than total vesting amount", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();

      // Fast forward past all 12 months (365 days)
      await networkHelpers.time.increase(365 * 24 * 60 * 60);

      // Claim all vested tokens
      await airdrop.connect(buyer1).claimVested();

      const vesting = await airdrop.userVesting(buyer1.address);
      expect(vesting.claimedVestingAmount).to.equal(expectedTotalVesting);

      // Try to claim again - should have 0 available
      const availableAmount = await airdrop.getVestedAmount(buyer1.address);
      expect(availableAmount).to.equal(0n);

      // Try to claim again - should revert
      await expect(airdrop.connect(buyer1).claimVested()).to.be.revertedWith(
        "LCAIAirdrop: No vested amount available",
      );
    });

    it("Should calculate vesting correctly for 12 months with immediate first month", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();

      // Month 0 (immediate): 1/12
      let available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth);

      // Month 1 (after 30 days): 2/12 total
      await networkHelpers.time.increase(30 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth * 2n);

      // Month 2 (after 60 days): 3/12 total
      await networkHelpers.time.increase(30 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth * 3n);

      // Month 11 (after 330 days): 12/12 total
      await networkHelpers.time.increase(270 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedTotalVesting);

      // Beyond 12 months: still 12/12
      await networkHelpers.time.increase(100 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedTotalVesting);
    });

    it("Should prevent claiming vested tokens if user didn't opt for vesting", async function () {
      const { airdrop } = await deployFixture();

      await expect(airdrop.connect(buyer1).claimVested()).to.be.revertedWith(
        "LCAIAirdrop: User did not opt for vesting",
      );
    });

    it("Should revert if claiming with vesting before vesting period starts", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 1000);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      await expect(
        airdrop.connect(buyer1).claimWithVesting(),
      ).to.be.revertedWith("LCAIAirdrop: Vesting period has not started");
    });

    it("Should revert if claiming with vesting after vesting period ends", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 1000n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      // Advance past the end time
      await networkHelpers.time.increase(2000);

      await expect(
        airdrop.connect(buyer1).claimWithVesting(),
      ).to.be.revertedWith("LCAIAirdrop: Vesting period has ended");
    });

    it("Should return correct vesting info", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();

      const vestingInfo = await airdrop.getVestingInfo(buyer1.address);

      expect(vestingInfo.optedForVesting).to.equal(true);
      expect(vestingInfo.totalVestingAmount).to.equal(expectedTotalVesting);
      expect(vestingInfo.claimedVestingAmount).to.equal(0n);
      expect(vestingInfo.availableAmount).to.equal(expectedTotalVesting / 12n);
      expect(vestingInfo.vestingStartTime).to.be.greaterThan(0n);
      expect(vestingInfo.vestingEndTime).to.be.greaterThan(
        vestingInfo.vestingStartTime,
      );
    });

    it("Should prevent user from claiming both direct and vesting rewards", async function () {
      const { airdrop } = await deployFixture();

      await setupDirectClaim(airdrop);
      await setupVestingConfig(airdrop);

      // Claim direct reward first
      await airdrop.connect(buyer1).claim();

      // Try to claim with vesting - should fail because already claimed
      await expect(
        airdrop.connect(buyer1).claimWithVesting(),
      ).to.be.revertedWith("LCAIAirdrop: Already claimed");
    });

    it("Should return correct vesting amount before claiming", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedVestingAmount = (purchaseAmount * 75n) / 100n;

      const vestingAmount = await airdrop.getVestingAmount(buyer1.address);

      expect(vestingAmount).to.equal(expectedVestingAmount);
    });

    it("Should return zero vesting amount after claiming", async function () {
      const { airdrop } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting();

      const vestingAmount = await airdrop.getVestingAmount(buyer1.address);

      expect(vestingAmount).to.equal(0n);
    });

    it("Should revert if claiming vested tokens when paused", async function () {
      const { airdrop } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting();

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).claimVested(),
      ).to.be.revertedWithCustomError(airdrop, "EnforcedPause");
    });

    it("Should revert when claimWithVesting if user has no amount to claim", async function () {
      const { airdrop } = await deployFixture();

      await setupVestingConfig(airdrop);

      await expect(
        airdrop.connect(buyer3).claimWithVesting(),
      ).to.be.revertedWith("LCAIAirdrop: No amount to claim");
    });

    it("Should handle vesting with different durations correctly (6 months)", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 6n, 80n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 80n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 6n;

      await airdrop.connect(buyer1).claimWithVesting();

      // Immediate: 1/6
      let available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth);

      // After 30 days: 2/6
      await networkHelpers.time.increase(30 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth * 2n);

      // After 150 days (5 months): 6/6 (all vested)
      await networkHelpers.time.increase(120 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedTotalVesting);
    });

    it("Should update totalClaimedAmount correctly when claiming vested tokens", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedFirstMonth = expectedTotalVesting / 12n;

      await airdrop.connect(buyer1).claimWithVesting();

      expect(await airdrop.totalClaimedAmount()).to.equal(0n);

      await airdrop.connect(buyer1).claimVested();

      expect(await airdrop.totalClaimedAmount()).to.equal(expectedFirstMonth);
      expect(await airdrop.claimedAmount(buyer1.address)).to.equal(
        expectedFirstMonth,
      );
    });

    it("Should revert if insufficient contract balance when claiming vested tokens", async function () {
      const { airdrop, token } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting();

      // Withdraw all tokens from airdrop contract
      const balance = await token.balanceOf(await airdrop.getAddress());
      await airdrop.withdraw(balance);

      await expect(airdrop.connect(buyer1).claimVested()).to.be.revertedWith(
        "LCAIAirdrop: Insufficient contract balance",
      );
    });

    it("Should return zero vesting amount when vesting is not enabled", async function () {
      const { airdrop } = await deployFixture();

      const vestingAmount = await airdrop.getVestingAmount(buyer1.address);

      expect(vestingAmount).to.equal(0n);
    });

    it("Should emit VestedTokensClaimed event when claiming vested tokens", async function () {
      const { airdrop } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting();

      const tx = await airdrop.connect(buyer1).claimVested();
      const receipt = await tx.wait();

      expect(receipt!.logs.length).to.be.greaterThan(0);
    });
  });

  // ===== EDGE CASES AND BOUNDARY TESTS =====

  describe("Edge Cases and Boundary Tests", function () {
    it("Should allow claiming at exact start time boundary", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 30n * 24n * 60n * 60n;
      await airdrop.openClaim(startTime, endTime);

      // Mine to exact start time
      await networkHelpers.time.increaseTo(Number(startTime));

      // Should not revert - claim successfully
      await airdrop.connect(buyer1).claim();

      expect(await airdrop.claimed(buyer1.address)).to.equal(true);
    });

    it("Should allow claiming at exact end time boundary", async function () {
      const { airdrop } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 1000n;
      await airdrop.openClaim(startTime, endTime);

      // Mine to just before end time (endTime - 2 to account for transaction timing)
      await networkHelpers.time.increaseTo(Number(endTime) - 2);

      // Should not revert - claim successfully at end time boundary
      await airdrop.connect(buyer1).claim();

      expect(await airdrop.claimed(buyer1.address)).to.equal(true);
    });

    it("Should handle vesting with 1 month duration", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 1n, 100n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 100n) / 100n;

      await airdrop.connect(buyer1).claimWithVesting();

      // Immediate: 100% (all vested for 1 month)
      const available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedTotalVesting);

      await airdrop.connect(buyer1).claimVested();

      const vesting = await airdrop.userVesting(buyer1.address);
      expect(vesting.claimedVestingAmount).to.equal(expectedTotalVesting);
    });

    it("Should handle vesting with 24 months duration", async function () {
      const { airdrop, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 24n, 90n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 90n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 24n;

      await airdrop.connect(buyer1).claimWithVesting();

      // Immediate: 1/24
      let available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedPerMonth);

      // After 23 months (690 days): 24/24
      await networkHelpers.time.increase(690 * 24 * 60 * 60);
      available = await airdrop.getVestedAmount(buyer1.address);
      expect(available).to.equal(expectedTotalVesting);
    });

    it("Should handle multiple users claiming partial vested tokens over time", async function () {
      const { airdrop, token, rate, buyAmount } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      // Both buyers claim with vesting
      await airdrop.connect(buyer1).claimWithVesting();
      await airdrop.connect(buyer2).claimWithVesting();

      const purchaseAmount1 = (buyAmount * 10n ** 18n) / rate;
      const purchaseAmount2 = (parseEther("2") * 10n ** 18n) / rate;
      const expectedPerMonth1 = (purchaseAmount1 * 75n) / 100n / 12n;
      const expectedPerMonth2 = (purchaseAmount2 * 75n) / 100n / 12n;

      // Claim first month
      await airdrop.connect(buyer1).claimVested();
      await airdrop.connect(buyer2).claimVested();

      let balance1 = await token.balanceOf(buyer1.address);
      let balance2 = await token.balanceOf(buyer2.address);

      expect(balance1).to.be.greaterThan(0n);
      expect(balance2).to.be.greaterThan(0n);

      // Fast forward 30 days and claim second month
      await networkHelpers.time.increase(30 * 24 * 60 * 60);

      await airdrop.connect(buyer1).claimVested();
      await airdrop.connect(buyer2).claimVested();

      const newBalance1 = await token.balanceOf(buyer1.address);
      const newBalance2 = await token.balanceOf(buyer2.address);

      expect(newBalance1 - balance1).to.equal(expectedPerMonth1);
      expect(newBalance2 - balance2).to.equal(expectedPerMonth2);
    });

    it("Should handle claim not enabled scenario", async function () {
      const { airdrop } = await deployFixture();

      // Don't call openClaim

      await expect(airdrop.connect(buyer1).claim()).to.be.revertedWith(
        "LCAIAirdrop: Claim not configured",
      );
    });

    it("Should handle vesting not enabled scenario", async function () {
      const { airdrop } = await deployFixture();

      // Don't call openVesting

      await expect(
        airdrop.connect(buyer1).claimWithVesting(),
      ).to.be.revertedWith("LCAIAirdrop: Vesting not configured");
    });
  });
});
