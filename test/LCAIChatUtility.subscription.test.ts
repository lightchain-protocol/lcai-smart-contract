import { expect } from "chai";
import hre from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const { network } = hre;
let ethers: typeof hre.ethers;
describe("LCAIChatUtility - Subscription System", function () {
  let chatUtility: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let treasury: SignerWithAddress;

  // Set after ethers is initialized in beforeEach
  let INITIAL_CHAT_FEE: bigint;
  let BASE_REWARD: bigint;
  const EPOCH_DURATION = 86400; // 1 day
  let MAX_REWARD_PER_EPOCH: bigint;

  before(async function () {
    ({ ethers } = await network.connect());
  });

  beforeEach(async function () {
    [owner, user1, user2, treasury] = await ethers.getSigners();

    INITIAL_CHAT_FEE = ethers.parseEther("0.001");
    BASE_REWARD = ethers.parseEther("0.0001");
    MAX_REWARD_PER_EPOCH = ethers.parseEther("1");

    const LCAIChatUtilityFactory = await ethers.getContractFactory("LCAIChatUtility");
    chatUtility = await LCAIChatUtilityFactory.deploy(
      INITIAL_CHAT_FEE,
      BASE_REWARD,
      EPOCH_DURATION,
      MAX_REWARD_PER_EPOCH
    );

    // Set treasury address
    await chatUtility.setTreasuryAddress(treasury.address);
  });

  describe("Subscription Plan Management", function () {
    it("Should allow owner to create subscription plan", async function () {
      const monthlyUSD = 2500; // $25.00
      const yearlyUSD = 24000; // $240.00 (20% discount)
      const tokenLimit = 10000;
      const modelAccess = "base";

      await chatUtility.updateSubscriptionPlan(
        0, // tier
        monthlyUSD,
        yearlyUSD,
        tokenLimit,
        modelAccess
      );

      const plan = await chatUtility.getSubscriptionPlan(0);
      expect(plan.monthlyPriceUSD).to.equal(monthlyUSD);
      expect(plan.yearlyPriceUSD).to.equal(yearlyUSD);
      expect(plan.tokenLimit).to.equal(tokenLimit);
      expect(plan.modelAccess).to.equal(modelAccess);
      expect(plan.isActive).to.be.true;
    });

    it("Should support multiple tiers", async function () {
      // Base tier
      await chatUtility.updateSubscriptionPlan(0, 2500, 24000, 10000, "base");
      // Pro tier
      await chatUtility.updateSubscriptionPlan(1, 5000, 48000, 50000, "pro");
      // Premium tier
      await chatUtility.updateSubscriptionPlan(2, 10000, 96000, 0, "premium");

      const base = await chatUtility.getSubscriptionPlan(0);
      const pro = await chatUtility.getSubscriptionPlan(1);
      const premium = await chatUtility.getSubscriptionPlan(2);

      expect(base.monthlyPriceUSD).to.equal(2500);
      expect(pro.monthlyPriceUSD).to.equal(5000);
      expect(premium.monthlyPriceUSD).to.equal(10000);
      expect(premium.tokenLimit).to.equal(0); // unlimited
    });
  });

  describe("Subscription Purchase", function () {
    beforeEach(async function () {
      // Set up base plan
      await chatUtility.updateSubscriptionPlan(0, 2500, 24000, 10000, "base");
    });

    it("Should allow user to purchase monthly subscription", async function () {
      const paymentAmount = ethers.parseEther("1.0"); // 1 LCAI (placeholder)
      const tier = 0;
      const duration = 0; // monthly

      await expect(
        chatUtility.connect(user1).subscribePlan(tier, duration, { value: paymentAmount })
      ).to.emit(chatUtility, "SubscriptionPurchased");

      const hasActive = await chatUtility.hasActiveSubscription(user1.address);
      expect(hasActive).to.be.true;
    });

    it("Should allow user to purchase yearly subscription", async function () {
      const paymentAmount = ethers.parseEther("10.0"); // 10 LCAI (placeholder for yearly)
      const tier = 0;
      const duration = 1; // yearly

      await chatUtility.connect(user1).subscribePlan(tier, duration, { value: paymentAmount });

      const hasActive = await chatUtility.hasActiveSubscription(user1.address);
      expect(hasActive).to.be.true;

      const expiry = await chatUtility.getSubscriptionExpiry(user1.address);
      expect(expiry).to.be.greaterThan(0);
    });

    it("Should route payment to treasury", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      const tier = 0;
      const duration = 0;

      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      await chatUtility.connect(user1).subscribePlan(tier, duration, { value: paymentAmount });

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(paymentAmount);
    });

    it("Should extend existing subscription", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      const tier = 0;
      const duration = 0; // monthly

      // First subscription
      await chatUtility.connect(user1).subscribePlan(tier, duration, { value: paymentAmount });
      const firstExpiry = await chatUtility.getSubscriptionExpiry(user1.address);

      // Wait a bit (simulate time passing - in real test would use time manipulation)
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine", []);

      // Second subscription (should extend)
      await chatUtility.connect(user1).subscribePlan(tier, duration, { value: paymentAmount });
      const secondExpiry = await chatUtility.getSubscriptionExpiry(user1.address);

      expect(secondExpiry).to.be.greaterThan(firstExpiry);
    });

    it("Should reject subscription when treasury not set", async function () {
      // Deploy new contract without treasury
      const LCAIChatUtilityFactory = await ethers.getContractFactory("LCAIChatUtility");
      const newChatUtility = await LCAIChatUtilityFactory.deploy(
        INITIAL_CHAT_FEE,
        BASE_REWARD,
        EPOCH_DURATION,
        MAX_REWARD_PER_EPOCH
      );

      await newChatUtility.updateSubscriptionPlan(0, 2500, 24000, 10000, "base");

      const paymentAmount = ethers.parseEther("1.0");

      await expect(
        newChatUtility.connect(user1).subscribePlan(0, 0, { value: paymentAmount })
      ).to.be.revertedWith("Treasury address not set");
    });
  });

  describe("Subscription Verification", function () {
    beforeEach(async function () {
      await chatUtility.updateSubscriptionPlan(0, 2500, 24000, 10000, "base");
    });

    it("Should return false for user without subscription", async function () {
      const hasActive = await chatUtility.hasActiveSubscription(user1.address);
      expect(hasActive).to.be.false;
    });

    it("Should return true for user with active subscription", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      await chatUtility.connect(user1).subscribePlan(0, 0, { value: paymentAmount });

      const hasActive = await chatUtility.hasActiveSubscription(user1.address);
      expect(hasActive).to.be.true;
    });

    it("Should return false after subscription expires", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      await chatUtility.connect(user1).subscribePlan(0, 0, { value: paymentAmount });

      // Fast forward past expiry (30 days + 1 second)
      await ethers.provider.send("evm_increaseTime", [30 * 86400 + 1]);
      await ethers.provider.send("evm_mine", []);

      const hasActive = await chatUtility.hasActiveSubscription(user1.address);
      expect(hasActive).to.be.false;
    });

    it("Should return correct expiry timestamp", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      const blockBefore = await ethers.provider.getBlock("latest");
      const timestampBefore = blockBefore!.timestamp;

      await chatUtility.connect(user1).subscribePlan(0, 0, { value: paymentAmount });

      const expiry = await chatUtility.getSubscriptionExpiry(user1.address);
      const expectedExpiry = timestampBefore + 30 * 86400; // 30 days

      // Allow 5 second tolerance for block mining
      expect(expiry).to.be.closeTo(expectedExpiry, 5);
    });
  });

  describe("Access Control", function () {
    it("Should reject non-owner updating subscription plan", async function () {
      await expect(
        chatUtility.connect(user1).updateSubscriptionPlan(0, 2500, 24000, 10000, "base")
      )
        .to.be.revertedWithCustomError(chatUtility, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("Should reject non-owner setting treasury", async function () {
      await expect(
        chatUtility.connect(user1).setTreasuryAddress(treasury.address)
      )
        .to.be.revertedWithCustomError(chatUtility, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await chatUtility.updateSubscriptionPlan(0, 2500, 24000, 10000, "base");
    });

    it("Should reject invalid tier", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      
      await expect(
        chatUtility.connect(user1).subscribePlan(999, 0, { value: paymentAmount })
      ).to.be.revertedWith("Plan tier not active");
    });

    it("Should reject invalid duration", async function () {
      const paymentAmount = ethers.parseEther("1.0");
      
      await expect(
        chatUtility.connect(user1).subscribePlan(0, 5, { value: paymentAmount })
      ).to.be.revertedWith("Invalid duration (0=monthly, 1=yearly)");
    });

    it("Should reject zero payment", async function () {
      await expect(
        chatUtility.connect(user1).subscribePlan(0, 0, { value: 0 })
      ).to.be.revertedWith("Payment required");
    });
  });
});
