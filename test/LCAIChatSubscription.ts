import { expect } from "chai";
import { network } from "hardhat";
import { parseEther } from "ethers";

const { ethers, networkHelpers } = await network.connect();
const [deployer, admin, treasury, user1, user2, user3, nonAdmin] =
  await ethers.getSigners();

describe("LCAIChatSubscription", function () {
  // ===== CONSTANTS =====
  const TIER_1 = 0n;
  const TIER_2 = 1n;
  const TIER_3 = 2n;
  const DURATION_MONTHLY = 0n;
  const DURATION_YEARLY = 1n;
  const MONTHLY_DURATION = 30n * 24n * 60n * 60n; // 30 days in seconds
  const YEARLY_DURATION = 365n * 24n * 60n * 60n; // 365 days in seconds

  // ===== HELPER FUNCTIONS =====

  async function deploySubscriptionContract() {
    const subscription = await ethers.deployContract("LCAIChatSubscription", [
      treasury.address,
      admin.address,
    ]);

    return { subscription };
  }

  async function getTimestamp(): Promise<bigint> {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block!.timestamp);
  }

  // ===== DEPLOYMENT TESTS =====

  it("Should deploy with correct initial state", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Check treasury
    expect(await subscription.treasury()).to.equal(treasury.address);

    // Check admin has admin role
    expect(await subscription.isAdmin(admin.address)).to.equal(true);

    // Check default admin role
    const DEFAULT_ADMIN_ROLE = await subscription.DEFAULT_ADMIN_ROLE();
    expect(
      await subscription.hasRole(DEFAULT_ADMIN_ROLE, admin.address)
    ).to.equal(true);

    // Check initial subscriber count
    expect(await subscription.getTotalActiveSubscribers()).to.equal(0n);

    // Check contract is not paused
    expect(await subscription.paused()).to.equal(false);
  });

  it("Should reject deployment with zero treasury address", async function () {
    await expect(
      ethers.deployContract("LCAIChatSubscription", [
        ethers.ZeroAddress,
        admin.address,
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("LCAIChatSubscription"),
      "InvalidAddress"
    );
  });

  it("Should reject deployment with zero admin address", async function () {
    await expect(
      ethers.deployContract("LCAIChatSubscription", [
        treasury.address,
        ethers.ZeroAddress,
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("LCAIChatSubscription"),
      "InvalidAddress"
    );
  });

  it("Should initialize with default plan prices", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Check tier 1
    const [tier1Monthly, tier1Yearly, tier1Active] = await subscription.getPlan(
      TIER_1
    );
    expect(tier1Monthly).to.equal(parseEther("2"));
    expect(tier1Yearly).to.equal(parseEther("20"));
    expect(tier1Active).to.equal(true);

    // Check tier 2
    const [tier2Monthly, tier2Yearly, tier2Active] = await subscription.getPlan(
      TIER_2
    );
    expect(tier2Monthly).to.equal(parseEther("5"));
    expect(tier2Yearly).to.equal(parseEther("50"));
    expect(tier2Active).to.equal(true);

    // Check tier 3
    const [tier3Monthly, tier3Yearly, tier3Active] = await subscription.getPlan(
      TIER_3
    );
    expect(tier3Monthly).to.equal(parseEther("10"));
    expect(tier3Yearly).to.equal(parseEther("100"));
    expect(tier3Active).to.equal(true);
  });

  // ===== SUBSCRIPTION PURCHASE TESTS =====

  it("Should allow user to purchase monthly tier 1 subscription", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");
    const treasuryBalanceBefore = await ethers.provider.getBalance(
      treasury.address
    );
    const timestamp = await getTimestamp();

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly })
    )
      .to.emit(subscription, "SubscriptionPurchased")
      .withArgs(
        user1.address,
        TIER_1,
        DURATION_MONTHLY,
        tier1Monthly,
        timestamp + MONTHLY_DURATION + 1n
      );

    // Check treasury received payment
    const treasuryBalanceAfter = await ethers.provider.getBalance(
      treasury.address
    );
    expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(tier1Monthly);

    // Check subscription status
    expect(await subscription.hasActiveSubscription(user1.address)).to.equal(
      true
    );

    // Check subscription details
    const [tier, expiry, isExpired] = await subscription.getSubscription(
      user1.address
    );
    expect(tier).to.equal(TIER_1);
    expect(isExpired).to.equal(false);

    // Check subscriber count
    expect(await subscription.getTotalActiveSubscribers()).to.equal(1n);
  });

  it("Should allow user to purchase yearly tier 2 subscription", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier2Yearly = parseEther("50");
    const treasuryBalanceBefore = await ethers.provider.getBalance(
      treasury.address
    );
    const timestamp = await getTimestamp();

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_2, DURATION_YEARLY, { value: tier2Yearly })
    )
      .to.emit(subscription, "SubscriptionPurchased")
      .withArgs(
        user1.address,
        TIER_2,
        DURATION_YEARLY,
        tier2Yearly,
        timestamp + YEARLY_DURATION + 1n
      );

    // Check treasury received payment
    const treasuryBalanceAfter = await ethers.provider.getBalance(
      treasury.address
    );
    expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(tier2Yearly);

    // Check subscription status
    expect(await subscription.hasActiveSubscription(user1.address)).to.equal(
      true
    );

    // Check subscription details
    const [tier, expiry, isExpired] = await subscription.getSubscription(
      user1.address
    );
    expect(tier).to.equal(TIER_2);
    expect(isExpired).to.equal(false);
  });

  it("Should allow user to purchase tier 3 subscription", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier3Monthly = parseEther("10");

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_3, DURATION_MONTHLY, { value: tier3Monthly })
    ).to.emit(subscription, "SubscriptionPurchased");

    expect(await subscription.hasActiveSubscription(user1.address)).to.equal(
      true
    );

    const [tier] = await subscription.getSubscription(user1.address);
    expect(tier).to.equal(TIER_3);
  });

  it("Should reject subscription with incorrect payment amount", async function () {
    const { subscription } = await deploySubscriptionContract();

    const wrongAmount = parseEther("0.005"); // Less than tier 1 monthly

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: wrongAmount })
    ).to.be.revertedWithCustomError(subscription, "IncorrectPayment");
  });

  it("Should reject subscription with invalid tier", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");

    await expect(
      subscription
        .connect(user1)
        .subscribe(10, DURATION_MONTHLY, { value: tier1Monthly })
    ).to.be.revertedWithCustomError(subscription, "InvalidTier");
  });

  it("Should reject subscription with invalid duration", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");

    await expect(
      subscription.connect(user1).subscribe(TIER_1, 2, { value: tier1Monthly })
    ).to.be.revertedWithCustomError(subscription, "InvalidDuration");
  });

  it("Should reject subscription to inactive plan", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Admin deactivates tier 1
    await subscription.connect(admin).updatePlanPrice(
      TIER_1,
      parseEther("2"),
      parseEther("20"),
      false // inactive
    );

    const tier1Monthly = parseEther("2");

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly })
    ).to.be.revertedWithCustomError(subscription, "PlanNotActive");
  });

  it("Should reject subscription when paused", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Admin pauses contract
    await subscription.connect(admin).pause();

    const tier1Monthly = parseEther("2");

    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly })
    ).to.be.revertedWithCustomError(subscription, "EnforcedPause");
  });

  // ===== SUBSCRIPTION RENEWAL TESTS =====

  it("Should reject subscription renewal while still active", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");

    // Purchase initial subscription
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    // Try to renew subscription while still active (should fail)
    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly })
    ).to.be.revertedWithCustomError(subscription, "HaveActiveSubscription");
  });

  it("Should reject switching tiers while subscription is active", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");
    const tier2Monthly = parseEther("5");

    // Purchase tier 1
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    // Try to switch to tier 2 while tier 1 is still active (should fail)
    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_2, DURATION_MONTHLY, { value: tier2Monthly })
    ).to.be.revertedWithCustomError(subscription, "HaveActiveSubscription");
  });

  it("Should handle subscription after expiry", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");

    // Purchase subscription
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    // Fast forward past expiry
    await networkHelpers.time.increase(31n * 24n * 60n * 60n); // 31 days

    // Check subscription is expired
    const [, , isExpired] = await subscription.getSubscription(user1.address);
    expect(isExpired).to.equal(true);
    expect(await subscription.hasActiveSubscription(user1.address)).to.equal(
      false
    );

    // Renew after expiry should start fresh
    const timestamp = await getTimestamp();
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    const [, newExpiry] = await subscription.getSubscription(user1.address);
    expect(newExpiry).to.be.closeTo(timestamp + MONTHLY_DURATION + 2n, 5n);
  });

  // ===== ADMIN FUNCTIONS TESTS =====

  it("Should allow admin to update plan prices", async function () {
    const { subscription } = await deploySubscriptionContract();

    const newMonthlyPrice = parseEther("0.02");
    const newYearlyPrice = parseEther("0.2");

    await expect(
      subscription
        .connect(admin)
        .updatePlanPrice(TIER_1, newMonthlyPrice, newYearlyPrice, true)
    )
      .to.emit(subscription, "PlanPriceUpdated")
      .withArgs(TIER_1, newMonthlyPrice, newYearlyPrice, true);

    const [monthly, yearly, isActive] = await subscription.getPlan(TIER_1);
    expect(monthly).to.equal(newMonthlyPrice);
    expect(yearly).to.equal(newYearlyPrice);
    expect(isActive).to.equal(true);
  });

  it("Should reject price update with zero price", async function () {
    const { subscription } = await deploySubscriptionContract();

    await expect(
      subscription
        .connect(admin)
        .updatePlanPrice(TIER_1, 0, parseEther("20"), true)
    ).to.be.revertedWithCustomError(subscription, "InvalidPrice");

    await expect(
      subscription
        .connect(admin)
        .updatePlanPrice(TIER_1, parseEther("2"), 0, true)
    ).to.be.revertedWithCustomError(subscription, "InvalidPrice");
  });

  it("Should reject price update from non-admin", async function () {
    const { subscription } = await deploySubscriptionContract();

    const ADMIN_ROLE = await subscription.ADMIN_ROLE();

    await expect(
      subscription
        .connect(nonAdmin)
        .updatePlanPrice(TIER_1, parseEther("0.02"), parseEther("0.2"), true)
    )
      .to.be.revertedWithCustomError(
        subscription,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(nonAdmin.address, ADMIN_ROLE);
  });

  it("Should allow default admin to update treasury", async function () {
    const { subscription } = await deploySubscriptionContract();

    const newTreasury = user3.address;

    await expect(subscription.connect(admin).updateTreasury(newTreasury))
      .to.emit(subscription, "TreasuryUpdated")
      .withArgs(treasury.address, newTreasury);

    expect(await subscription.treasury()).to.equal(newTreasury);
  });

  it("Should reject treasury update with zero address", async function () {
    const { subscription } = await deploySubscriptionContract();

    await expect(
      subscription.connect(admin).updateTreasury(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(subscription, "InvalidAddress");
  });

  it("Should reject treasury update from non-default-admin", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Add user2 as regular admin (not default admin)
    await subscription.connect(admin).addAdmin(user2.address);

    const DEFAULT_ADMIN_ROLE = await subscription.DEFAULT_ADMIN_ROLE();

    await expect(subscription.connect(user2).updateTreasury(user3.address))
      .to.be.revertedWithCustomError(
        subscription,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(user2.address, DEFAULT_ADMIN_ROLE);
  });

  it("Should allow default admin to add new admin", async function () {
    const { subscription } = await deploySubscriptionContract();

    await expect(subscription.connect(admin).addAdmin(user2.address))
      .to.emit(subscription, "AdminAdded")
      .withArgs(user2.address);

    expect(await subscription.isAdmin(user2.address)).to.equal(true);

    // New admin should be able to update prices
    await expect(
      subscription
        .connect(user2)
        .updatePlanPrice(TIER_1, parseEther("0.02"), parseEther("0.2"), true)
    ).to.emit(subscription, "PlanPriceUpdated");
  });

  it("Should allow default admin to remove admin", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Add admin
    await subscription.connect(admin).addAdmin(user2.address);
    expect(await subscription.isAdmin(user2.address)).to.equal(true);

    // Remove admin
    await expect(subscription.connect(admin).removeAdmin(user2.address))
      .to.emit(subscription, "AdminRemoved")
      .withArgs(user2.address);

    expect(await subscription.isAdmin(user2.address)).to.equal(false);

    // Removed admin should not be able to update prices
    const ADMIN_ROLE = await subscription.ADMIN_ROLE();
    await expect(
      subscription
        .connect(user2)
        .updatePlanPrice(TIER_1, parseEther("0.02"), parseEther("0.2"), true)
    )
      .to.be.revertedWithCustomError(
        subscription,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(user2.address, ADMIN_ROLE);
  });

  it("Should allow admin to pause contract", async function () {
    const { subscription } = await deploySubscriptionContract();

    await subscription.connect(admin).pause();

    expect(await subscription.paused()).to.equal(true);
  });

  it("Should allow admin to unpause contract", async function () {
    const { subscription } = await deploySubscriptionContract();

    await subscription.connect(admin).pause();
    await subscription.connect(admin).unpause();

    expect(await subscription.paused()).to.equal(false);
  });

  it("Should reject pause from non-admin", async function () {
    const { subscription } = await deploySubscriptionContract();

    const ADMIN_ROLE = await subscription.ADMIN_ROLE();

    await expect(subscription.connect(nonAdmin).pause())
      .to.be.revertedWithCustomError(
        subscription,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(nonAdmin.address, ADMIN_ROLE);
  });

  // ===== VIEW FUNCTIONS TESTS =====

  it("Should return correct remaining time", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    const remaining = await subscription.getRemainingTime(user1.address);
    expect(remaining).to.be.closeTo(MONTHLY_DURATION, 5n);

    // Fast forward 15 days
    await networkHelpers.time.increase(15n * 24n * 60n * 60n);

    const remainingAfter = await subscription.getRemainingTime(user1.address);
    expect(remainingAfter).to.be.closeTo(15n * 24n * 60n * 60n, 5n);
  });

  it("Should return zero remaining time for expired subscription", async function () {
    const { subscription } = await deploySubscriptionContract();

    const tier1Monthly = parseEther("2");
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: tier1Monthly });

    // Fast forward past expiry
    await networkHelpers.time.increase(31n * 24n * 60n * 60n);

    const remaining = await subscription.getRemainingTime(user1.address);
    expect(remaining).to.equal(0n);
  });

  it("Should return zero remaining time for non-subscriber", async function () {
    const { subscription } = await deploySubscriptionContract();

    const remaining = await subscription.getRemainingTime(user1.address);
    expect(remaining).to.equal(0n);
  });

  it("Should return all plan details", async function () {
    const { subscription } = await deploySubscriptionContract();

    const plans = await subscription.getAllPlans();

    // Check monthly prices
    expect(plans[0].monthlyPrice).to.equal(parseEther("2"));
    expect(plans[1].monthlyPrice).to.equal(parseEther("5"));
    expect(plans[2].monthlyPrice).to.equal(parseEther("10"));

    // Check yearly prices
    expect(plans[0].yearlyPrice).to.equal(parseEther("20"));
    expect(plans[1].yearlyPrice).to.equal(parseEther("50"));
    expect(plans[2].yearlyPrice).to.equal(parseEther("100"));

    // Check active status
    expect(plans[0].isActive).to.equal(true);
    expect(plans[1].isActive).to.equal(true);
    expect(plans[2].isActive).to.equal(true);
  });

  it("Should track total active subscribers correctly", async function () {
    const { subscription } = await deploySubscriptionContract();

    expect(await subscription.getTotalActiveSubscribers()).to.equal(0n);

    // User 1 subscribes
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: parseEther("2") });
    expect(await subscription.getTotalActiveSubscribers()).to.equal(1n);

    // User 2 subscribes
    await subscription
      .connect(user2)
      .subscribe(TIER_2, DURATION_MONTHLY, { value: parseEther("5") });
    expect(await subscription.getTotalActiveSubscribers()).to.equal(2n);

    // User 3 subscribes
    await subscription
      .connect(user3)
      .subscribe(TIER_3, DURATION_MONTHLY, { value: parseEther("10") });
    expect(await subscription.getTotalActiveSubscribers()).to.equal(3n);
  });

  // ===== INTEGRATION TESTS =====

  it("Should handle multiple users with different tiers", async function () {
    const { subscription } = await deploySubscriptionContract();

    // User 1: Tier 1 Monthly
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: parseEther("2") });

    // User 2: Tier 2 Yearly
    await subscription
      .connect(user2)
      .subscribe(TIER_2, DURATION_YEARLY, { value: parseEther("50") });

    // User 3: Tier 3 Monthly
    await subscription
      .connect(user3)
      .subscribe(TIER_3, DURATION_MONTHLY, { value: parseEther("10") });

    // Check all subscriptions
    expect(await subscription.hasActiveSubscription(user1.address)).to.equal(
      true
    );
    expect(await subscription.hasActiveSubscription(user2.address)).to.equal(
      true
    );
    expect(await subscription.hasActiveSubscription(user3.address)).to.equal(
      true
    );

    const [tier1] = await subscription.getSubscription(user1.address);
    const [tier2] = await subscription.getSubscription(user2.address);
    const [tier3] = await subscription.getSubscription(user3.address);

    expect(tier1).to.equal(TIER_1);
    expect(tier2).to.equal(TIER_2);
    expect(tier3).to.equal(TIER_3);
  });

  it("Should route all payments to treasury", async function () {
    const { subscription } = await deploySubscriptionContract();

    const initialBalance = await ethers.provider.getBalance(treasury.address);

    // Multiple subscriptions
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: parseEther("2") });
    await subscription
      .connect(user2)
      .subscribe(TIER_2, DURATION_YEARLY, { value: parseEther("50") });
    await subscription
      .connect(user3)
      .subscribe(TIER_3, DURATION_MONTHLY, { value: parseEther("10") });

    const finalBalance = await ethers.provider.getBalance(treasury.address);
    const expectedTotal = parseEther("2") + parseEther("50") + parseEther("10");

    expect(finalBalance - initialBalance).to.equal(expectedTotal);
  });

  it("Should handle price updates and new subscriptions", async function () {
    const { subscription } = await deploySubscriptionContract();

    // User subscribes at old price
    await subscription
      .connect(user1)
      .subscribe(TIER_1, DURATION_MONTHLY, { value: parseEther("2") });

    // Admin updates price
    const newPrice = parseEther("25");
    await subscription
      .connect(admin)
      .updatePlanPrice(TIER_1, newPrice, parseEther("205"), true);

    // User 1 cannot renew while subscription is active
    await expect(
      subscription
        .connect(user1)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: newPrice })
    ).to.be.revertedWithCustomError(subscription, "HaveActiveSubscription");

    // New user (user2) subscribes at new price
    await expect(
      subscription
        .connect(user2)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: newPrice })
    ).to.emit(subscription, "SubscriptionPurchased");

    // Old price should fail for new subscriptions
    await expect(
      subscription
        .connect(user3)
        .subscribe(TIER_1, DURATION_MONTHLY, { value: parseEther("2") })
    ).to.be.revertedWithCustomError(subscription, "IncorrectPayment");
  });

  it("Should reject direct ETH transfers", async function () {
    const { subscription } = await deploySubscriptionContract();

    await expect(
      deployer.sendTransaction({
        to: await subscription.getAddress(),
        value: parseEther("1"),
      })
    ).to.be.revertedWith("Use subscribe() function");
  });

  it("Should allow multiple admins to manage the contract", async function () {
    const { subscription } = await deploySubscriptionContract();

    // Add second admin
    await subscription.connect(admin).addAdmin(user2.address);

    // Both admins should be able to update prices
    await subscription
      .connect(admin)
      .updatePlanPrice(TIER_1, parseEther("25"), parseEther("205"), true);
    await subscription
      .connect(user2)
      .updatePlanPrice(TIER_2, parseEther("0.03"), parseEther("0.3"), true);

    const [tier1Monthly] = await subscription.getPlan(TIER_1);
    const [tier2Monthly] = await subscription.getPlan(TIER_2);

    expect(tier1Monthly).to.equal(parseEther("25"));
    expect(tier2Monthly).to.equal(parseEther("0.03"));

    // Both admins should be able to pause
    await subscription.connect(user2).pause();
    expect(await subscription.paused()).to.equal(true);

    await subscription.connect(admin).unpause();
    expect(await subscription.paused()).to.equal(false);
  });
});
