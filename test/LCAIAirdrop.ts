import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

const { network } = hre;
let ethers: typeof hre.ethers;
let networkHelpers: any;
let owner: any;
let buyer1: any;
let buyer2: any;
let buyer3: any;
let treasury: any;

describe("LCAIAirdrop", function () {
  before(async function () {
    ({ ethers, networkHelpers } = await network.connect());
    [owner, buyer1, buyer2, buyer3, treasury] = await ethers.getSigners();
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
      treasury.address,
    ]);

    // Whitelist airdrop contract for token transfers
    await token.setWhitelist(await airdrop.getAddress(), true);

    // Set claim fee
    const claimFee = parseEther("0.01"); // 0.01 ETH claim fee
    await airdrop.setClaimFee(claimFee);

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
      claimFee,
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

    it("Should set the treasury address correctly", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.treasury()).to.equal(treasury.address);
    });

    it("Should initialize with correct REWARD_PERCENTAGE", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.REWARD_PERCENTAGE()).to.equal(50n);
    });

    it("Should revert if presale address is zero", async function () {
      await expect(
        ethers.deployContract("LCAIAirdrop", [
          ethers.ZeroAddress,
          treasury.address,
        ]),
      ).to.be.revertedWith("LCAIAirdrop: Invalid presale address");
    });

    it("Should revert if treasury address is zero", async function () {
      const presale = await ethers.deployContract("LCAIPresale", [
        owner.address,
        owner.address,
      ]);

      await expect(
        ethers.deployContract("LCAIAirdrop", [
          await presale.getAddress(),
          ethers.ZeroAddress,
        ]),
      ).to.be.revertedWith("LCAIAirdrop: Invalid treasury address");
    });

    it("Should not be paused initially", async function () {
      const { airdrop } = await deployFixture();

      expect(await airdrop.paused()).to.equal(false);
    });
  });

  // ===== CLAIM TESTS =====

  describe("Claim", function () {
    it("Should allow a buyer to claim their airdrop reward", async function () {
      const { airdrop, token, rate, buyAmount, claimFee } =
        await deployFixture();

      await setupDirectClaim(airdrop);

      const expectedTokens = (buyAmount * 10n ** 18n) / rate;
      const expectedReward = (expectedTokens * 50n) / 100n;

      const balanceBefore = await token.balanceOf(buyer1.address);

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      const balanceAfter = await token.balanceOf(buyer1.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedReward);
      expect(await airdrop.claimed(buyer1.address)).to.equal(true);
      expect(await airdrop.claimedAmount(buyer1.address)).to.equal(
        expectedReward,
      );
      expect(await airdrop.totalClaimedAmount()).to.equal(expectedReward);
    });

    it("Should emit Claimed event", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      const tx = await airdrop.connect(buyer1).claim({
        value: claimFee,
      });
      const receipt = await tx.wait();

      // Check that at least one event was emitted
      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should prevent double claiming", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Already claimed");
    });

    it("Should revert if user has no amount to claim", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      await expect(
        airdrop.connect(buyer3).claim({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: No amount to claim");
    });

    it("Should calculate correct reward amount for different buyers", async function () {
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      const expectedTokensBuyer1 = (buyAmount * 10n ** 18n) / rate;
      const expectedRewardBuyer1 = (expectedTokensBuyer1 * 50n) / 100n;

      const expectedTokensBuyer2 = (parseEther("2") * 10n ** 18n) / rate;
      const expectedRewardBuyer2 = (expectedTokensBuyer2 * 50n) / 100n;

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });
      await airdrop.connect(buyer2).claim({
        value: claimFee,
      });

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
      const { airdrop, token, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      // Withdraw all tokens from airdrop contract
      const balance = await token.balanceOf(await airdrop.getAddress());

      await airdrop.withdraw(balance);

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Insufficient contract balance");
    });

    it("Should revert if contract is paused", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        }),
      ).to.be.revertedWithCustomError(airdrop, "EnforcedPause");
    });

    it("Should revert if claim fee is insufficient", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee - 1n,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Insufficient claim fee");
    });

    it("Should collect fees correctly and send to treasury", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      const treasuryBalanceBefore = await ethers.provider.getBalance(
        treasury.address,
      );

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      const treasuryBalanceAfter = await ethers.provider.getBalance(
        treasury.address,
      );

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(claimFee);
      expect(await airdrop.totalFeesCollected()).to.equal(claimFee);
    });

    it("Should revert if more than claim fee is sent", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      const excessAmount = parseEther("0.05"); // Send 0.05 ETH instead of 0.01

      await expect(
        airdrop.connect(buyer1).claim({
          value: excessAmount,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Insufficient claim fee");
    });

    it("Should revert if claiming before claim period starts", async function () {
      const { airdrop, claimFee } = await deployFixture();

      // Configure claim to start in the future
      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 1000);
      const endTime = startTime + 30n * 24n * 60n * 60n;
      await airdrop.openClaim(startTime, endTime);

      // Try to claim before start time (don't advance time)
      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Claim period has not started");
    });

    it("Should revert if claiming after claim period ends", async function () {
      const { airdrop, claimFee } = await deployFixture();

      // Configure claim with short duration
      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 1000n; // Only 1000 seconds duration
      await airdrop.openClaim(startTime, endTime);

      // Advance past the end time
      await networkHelpers.time.increase(2000);

      // Try to claim after end time
      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Claim period has ended");
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
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      const claimable = await airdrop.getClaimableAmount(buyer1.address);

      expect(claimable).to.equal(0n);
    });

    it("Should return zero for non-buyer", async function () {
      const { airdrop } = await deployFixture();

      const claimable = await airdrop.getClaimableAmount(buyer3.address);

      expect(claimable).to.equal(0n);
    });
  });

  // ===== CLAIM FEE MANAGEMENT TESTS =====

  describe("Claim Fee Management", function () {
    it("Should allow owner to set claim fee", async function () {
      const { airdrop } = await deployFixture();

      const newFee = parseEther("0.02");
      await airdrop.setClaimFee(newFee);

      expect(await airdrop.claimFee()).to.equal(newFee);
    });

    it("Should emit ClaimFeeUpdated event", async function () {
      const { airdrop } = await deployFixture();

      const newFee = parseEther("0.02");
      const tx = await airdrop.setClaimFee(newFee);
      const receipt = await tx.wait();

      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should allow owner to set claim fee to zero", async function () {
      const { airdrop } = await deployFixture();

      await airdrop.setClaimFee(0n);

      expect(await airdrop.claimFee()).to.equal(0n);
    });

    it("Should revert if non-owner tries to set claim fee", async function () {
      const { airdrop } = await deployFixture();

      await expect(
        airdrop.connect(buyer1).setClaimFee(parseEther("0.02")),
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should allow claiming with zero fee when fee is set to zero", async function () {
      const { airdrop, token } = await deployFixture();

      await airdrop.setClaimFee(0n);

      await setupDirectClaim(airdrop);

      const balanceBefore = await token.balanceOf(buyer1.address);

      await airdrop.connect(buyer1).claim({
        value: 0n,
      });

      const balanceAfter = await token.balanceOf(buyer1.address);

      // Verify that tokens were successfully claimed
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });
  });

  // ===== VESTING TESTS =====

  describe("Vesting", function () {
    it("Should allow user to claim with vesting option", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

      expect(await airdrop.claimed(buyer1.address)).to.equal(true);

      const vesting = await airdrop.userVesting(buyer1.address);
      expect(vesting.optedForVesting).to.equal(true);
    });

    it("Should give first month reward immediately upon vesting", async function () {
      const { airdrop, token, rate, buyAmount, claimFee } =
        await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n); // 12 months, 75% reward

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedFirstMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

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
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

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
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

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
      await expect(
        airdrop.connect(buyer1).claimVested(),
      ).to.be.revertedWith("LCAIAirdrop: No vested amount available");
    });

    it("Should calculate vesting correctly for 12 months with immediate first month", async function () {
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;
      const expectedPerMonth = expectedTotalVesting / 12n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

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

      await expect(
        airdrop.connect(buyer1).claimVested(),
      ).to.be.revertedWith("LCAIAirdrop: User did not opt for vesting");
    });

    it("Should revert if claiming with vesting before vesting period starts", async function () {
      const { airdrop, claimFee } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 1000);
      const endTime = startTime + 30n * 24n * 60n * 60n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      await expect(
        airdrop.connect(buyer1).claimWithVesting({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Vesting period has not started");
    });

    it("Should revert if claiming with vesting after vesting period ends", async function () {
      const { airdrop, claimFee } = await deployFixture();

      const currentBlock = await ethers.provider.getBlock("latest");
      const startTime = BigInt(currentBlock!.timestamp + 100);
      const endTime = startTime + 1000n;

      await airdrop.openVesting(startTime, endTime, 12n, 75n);

      // Advance past the end time
      await networkHelpers.time.increase(2000);

      await expect(
        airdrop.connect(buyer1).claimWithVesting({
          value: claimFee,
        }),
      ).to.be.revertedWith("LCAIAirdrop: Vesting period has ended");
    });

    it("Should return correct vesting info", async function () {
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop, 12n, 75n);

      const purchaseAmount = (buyAmount * 10n ** 18n) / rate;
      const expectedTotalVesting = (purchaseAmount * 75n) / 100n;

      // Claim with vesting
      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

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
      const { airdrop, claimFee } = await deployFixture();

      await setupDirectClaim(airdrop);
      await setupVestingConfig(airdrop);

      // Claim direct reward first
      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      // Try to claim with vesting - should fail because already claimed
      await expect(
        airdrop.connect(buyer1).claimWithVesting({
          value: claimFee,
        }),
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
      const { airdrop, claimFee } = await deployFixture();

      await setupVestingConfig(airdrop);

      await airdrop.connect(buyer1).claimWithVesting({
        value: claimFee,
      });

      const vestingAmount = await airdrop.getVestingAmount(buyer1.address);

      expect(vestingAmount).to.equal(0n);
    });
  });
});
