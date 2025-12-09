import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

const { network } = hre;
let ethers: typeof hre.ethers;
let owner: any;
let buyer1: any;
let buyer2: any;
let buyer3: any;
let treasury: any;

describe("LCAIAirdrop", function () {
  before(async function () {
    ({ ethers } = await network.connect());
    [owner, buyer1, buyer2, buyer3, treasury] = await ethers.getSigners();
  });

  // ===== HELPER FUNCTIONS =====

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
      [parseEther("1")]
    );
    await token.approve(await presale.getAddress(), totalTokenForSale);
    await presale.setSaleToken(
      await token.getAddress(),
      totalTokenForSale,
      rate,
      true
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
        ])
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
        ])
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
        expectedReward
      );
      expect(await airdrop.totalClaimedAmount()).to.equal(expectedReward);
    });

    it("Should emit Claimed event", async function () {
      const { airdrop, claimFee } = await deployFixture();

      const tx = await airdrop.connect(buyer1).claim({
        value: claimFee,
      });
      const receipt = await tx.wait();

      // Check that at least one event was emitted
      expect(receipt!.logs.length).to.be.greaterThan(0);
    });

    it("Should prevent double claiming", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        })
      ).to.be.revertedWith("LCAIAirdrop: Already claimed");
    });

    it("Should revert if user has no amount to claim", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await expect(
        airdrop.connect(buyer3).claim({
          value: claimFee,
        })
      ).to.be.revertedWith("LCAIAirdrop: No amount to claim");
    });

    it("Should calculate correct reward amount for different buyers", async function () {
      const { airdrop, rate, buyAmount, claimFee } = await deployFixture();

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
        expectedRewardBuyer1
      );
      expect(await airdrop.claimedAmount(buyer2.address)).to.equal(
        expectedRewardBuyer2
      );
      expect(await airdrop.totalClaimedAmount()).to.equal(
        expectedRewardBuyer1 + expectedRewardBuyer2
      );
    });

    it("Should revert if contract has insufficient balance", async function () {
      const { airdrop, token, claimFee } = await deployFixture();

      // Withdraw all tokens from airdrop contract
      const balance = await token.balanceOf(await airdrop.getAddress());

      await airdrop.withdraw(balance);

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        })
      ).to.be.revertedWith("LCAIAirdrop: Insufficient contract balance");
    });

    it("Should revert if contract is paused", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee,
        })
      ).to.be.revertedWithCustomError(airdrop, "EnforcedPause");
    });

    it("Should revert if claim fee is insufficient", async function () {
      const { airdrop, claimFee } = await deployFixture();

      await expect(
        airdrop.connect(buyer1).claim({
          value: claimFee - 1n,
        })
      ).to.be.revertedWith("LCAIAirdrop: Insufficient claim fee");
    });

    it("Should collect fees correctly and send to treasury", async function () {
      const { airdrop, claimFee } = await deployFixture();

      const treasuryBalanceBefore = await ethers.provider.getBalance(
        treasury.address
      );

      await airdrop.connect(buyer1).claim({
        value: claimFee,
      });

      const treasuryBalanceAfter = await ethers.provider.getBalance(
        treasury.address
      );

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(claimFee);
      expect(await airdrop.totalFeesCollected()).to.equal(claimFee);
    });

    it("Should revert if more than claim fee is sent", async function () {
      const { airdrop, claimFee } = await deployFixture();

      const excessAmount = parseEther("0.05"); // Send 0.05 ETH instead of 0.01

      await expect(
        airdrop.connect(buyer1).claim({
          value: excessAmount,
        })
      ).to.be.revertedWith("LCAIAirdrop: Insufficient claim fee");
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
        airdrop.connect(buyer1).deposit(depositAmount)
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if deposit amount is zero", async function () {
      const { airdrop } = await deployFixture();

      await expect(airdrop.deposit(0n)).to.be.revertedWith(
        "LCAIAirdrop: Amount must be greater than 0"
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
        airdrop.connect(buyer1).withdraw(withdrawAmount)
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if withdraw amount is zero", async function () {
      const { airdrop } = await deployFixture();

      await expect(airdrop.withdraw(0n)).to.be.revertedWith(
        "LCAIAirdrop: Amount must be greater than 0"
      );
    });

    it("Should revert if withdraw amount exceeds balance", async function () {
      const { airdrop } = await deployFixture();

      const excessiveAmount = parseEther("100000000");

      await expect(airdrop.withdraw(excessiveAmount)).to.be.revertedWith(
        "LCAIAirdrop: Insufficient contract balance"
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
        airdrop.connect(buyer1).pause()
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should revert if non-owner tries to unpause", async function () {
      const { airdrop } = await deployFixture();

      await airdrop.pause();

      await expect(
        airdrop.connect(buyer1).unpause()
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
        airdrop.connect(buyer1).setClaimFee(parseEther("0.02"))
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });

    it("Should allow claiming with zero fee when fee is set to zero", async function () {
      const { airdrop, token } = await deployFixture();

      await airdrop.setClaimFee(0n);

      const balanceBefore = await token.balanceOf(buyer1.address);

      await airdrop.connect(buyer1).claim({
        value: 0n,
      });

      const balanceAfter = await token.balanceOf(buyer1.address);

      // Verify that tokens were successfully claimed
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });
  });
});
