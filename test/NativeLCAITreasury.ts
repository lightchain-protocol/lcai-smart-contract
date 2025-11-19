import { expect } from "chai";
import { network } from "hardhat";
import { parseEther } from "ethers";

const { ethers, networkHelpers } = await network.connect();
const [deployer, admin, recipient1, recipient2, recipient3, nonAdmin] =
  await ethers.getSigners();

describe("NativeLCAITreasury", function () {
  // ===== HELPER FUNCTIONS =====

  async function deployTreasuryContracts() {
    // Deploy a mock admin contract (simulates Gnosis Safe)
    const adminContract = await ethers.deployContract("MockAdmin", [
      admin.address, // owner of the admin contract
    ]);

    // Deploy treasury with deployer as initial owner for testing
    // In production, this would be the timelock
    const treasury = await ethers.deployContract("NativeLCAITreasury", [
      deployer.address, // owner (for testing, would be timelock in production)
      await adminContract.getAddress(),
    ]);

    return { treasury, adminContract };
  }

  async function fundTreasury(treasury: any, amount: string) {
    // Send ETH to treasury
    await deployer.sendTransaction({
      to: await treasury.getAddress(),
      value: parseEther(amount),
    });
  }

  async function callAsAdmin(
    adminContract: any,
    target: any,
    functionName: string,
    args: any[] = []
  ) {
    const calldata = target.interface.encodeFunctionData(functionName, args);
    return await adminContract
      .connect(admin)
      .execute(await target.getAddress(), calldata);
  }

  // ===== DEPLOYMENT TESTS =====

  it("Should deploy with correct initial state", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Check owner is deployer
    const owner = await treasury.owner();
    expect(owner).to.equal(deployer.address);

    // Check admin is adminContract
    const adminAddress = await treasury.admin();
    expect(adminAddress).to.equal(await adminContract.getAddress());

    // Check initial state
    expect(await treasury.spent()).to.equal(0n);
    expect(await treasury.isWhitelisted()).to.equal(false);
    expect(await treasury.isBlacklisted()).to.equal(false);
    expect(await treasury.paused()).to.equal(false);
  });

  it("Should reject deployment with EOA admin", async function () {
    // Try to deploy with EOA as admin (should fail)
    await expect(
      ethers.deployContract("NativeLCAITreasury", [
        deployer.address,
        admin.address, // EOA instead of contract
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("NativeLCAITreasury"),
      "AdminMustBeMultisig"
    );
  });

  it("Should receive ETH", async function () {
    const { treasury } = await deployTreasuryContracts();

    await fundTreasury(treasury, "10");

    const balance = await treasury.getBalance();
    expect(balance).to.equal(parseEther("10"));
  });

  // ===== TRANSFER TESTS =====

  it("Should allow owner to transfer funds", async function () {
    const { treasury } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    const balanceBefore = await ethers.provider.getBalance(recipient1.address);

    // Owner (deployer) transfers funds
    await treasury
      .connect(deployer)
      .transfer(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));

    // Check spent tracking
    expect(await treasury.spent()).to.equal(parseEther("5"));
  });

  it("Should prevent non-owner from transferring funds", async function () {
    const { treasury } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    await expect(
      treasury.connect(nonAdmin).transfer(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
  });

  it("Should prevent transfer when paused", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Admin pauses treasury
    await callAsAdmin(adminContract, treasury, "pause");

    // Try to transfer (should fail)
    await expect(
      treasury.connect(deployer).transfer(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "EnforcedPause");
  });

  it("Should revert on insufficient balance", async function () {
    const { treasury } = await deployTreasuryContracts();
    await fundTreasury(treasury, "5");

    await expect(
      treasury.connect(deployer).transfer(recipient1.address, parseEther("10"))
    ).to.be.revertedWithCustomError(treasury, "InsufficientBalance");
  });

  // ===== WHITELIST TESTS =====

  it("Should allow admin to add address to whitelist", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "setWhitelistedAddress", [
        recipient1.address,
        true,
      ])
    )
      .to.emit(treasury, "WhitelistedAddressUpdated")
      .withArgs(recipient1.address, true);

    expect(await treasury.whitelistedAddresses(recipient1.address)).to.equal(
      true
    );
  });

  it("Should allow admin to remove address from whitelist", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Add to whitelist
    await callAsAdmin(adminContract, treasury, "setWhitelistedAddress", [
      recipient1.address,
      true,
    ]);
    expect(await treasury.whitelistedAddresses(recipient1.address)).to.equal(
      true
    );

    // Remove from whitelist
    await callAsAdmin(adminContract, treasury, "setWhitelistedAddress", [
      recipient1.address,
      false,
    ]);
    expect(await treasury.whitelistedAddresses(recipient1.address)).to.equal(
      false
    );
  });

  it("Should prevent non-admin from modifying whitelist", async function () {
    const { treasury } = await deployTreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).setWhitelistedAddress(recipient1.address, true)
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should allow admin to enable whitelist mode", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [true])
    )
      .to.emit(treasury, "WhitelistedStatusUpdated")
      .withArgs(false, true);

    expect(await treasury.isWhitelisted()).to.equal(true);
  });

  it("Should block transfers to non-whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Enable whitelist mode
    await callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [
      true,
    ]);

    // Try to transfer to non-whitelisted address (should fail)
    await expect(
      treasury.connect(deployer).transfer(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "WhitelistedAddressNotAllowed");
  });

  it("Should allow transfers to whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Enable whitelist mode
    await callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [
      true,
    ]);

    // Add recipient to whitelist
    await callAsAdmin(adminContract, treasury, "setWhitelistedAddress", [
      recipient1.address,
      true,
    ]);

    const balanceBefore = await ethers.provider.getBalance(recipient1.address);

    // Transfer should succeed
    await treasury
      .connect(deployer)
      .transfer(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));
  });

  // ===== BLACKLIST TESTS =====

  it("Should allow admin to add address to blacklist", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
        recipient1.address,
        true,
      ])
    )
      .to.emit(treasury, "BlacklistedAddressUpdated")
      .withArgs(recipient1.address, true);

    expect(await treasury.blacklistedAddresses(recipient1.address)).to.equal(
      true
    );
  });

  it("Should allow admin to remove address from blacklist", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Add to blacklist
    await callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
      recipient1.address,
      true,
    ]);
    expect(await treasury.blacklistedAddresses(recipient1.address)).to.equal(
      true
    );

    // Remove from blacklist
    await callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
      recipient1.address,
      false,
    ]);
    expect(await treasury.blacklistedAddresses(recipient1.address)).to.equal(
      false
    );
  });

  it("Should prevent non-admin from modifying blacklist", async function () {
    const { treasury } = await deployTreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).setBlacklistedAddress(recipient1.address, true)
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should allow admin to enable blacklist mode", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateBlacklistedStatus", [true])
    )
      .to.emit(treasury, "BlacklistedStatusUpdated")
      .withArgs(false, true);

    expect(await treasury.isBlacklisted()).to.equal(true);
  });

  it("Should block transfers to blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Enable blacklist mode
    await callAsAdmin(adminContract, treasury, "updateBlacklistedStatus", [
      true,
    ]);

    // Add recipient to blacklist
    await callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
      recipient1.address,
      true,
    ]);

    // Try to transfer to blacklisted address (should fail)
    await expect(
      treasury.connect(deployer).transfer(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "BlacklistedAddressNotAllowed");
  });

  it("Should allow transfers to non-blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Enable blacklist mode
    await callAsAdmin(adminContract, treasury, "updateBlacklistedStatus", [
      true,
    ]);

    // Add recipient2 to blacklist (but not recipient1)
    await callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
      recipient2.address,
      true,
    ]);

    const balanceBefore = await ethers.provider.getBalance(recipient1.address);

    // Transfer to non-blacklisted address should succeed
    await treasury
      .connect(deployer)
      .transfer(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));
  });

  // ===== ADMIN MANAGEMENT TESTS =====

  it("Should allow admin to update admin address", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Deploy new admin contract
    const newAdminContract = await ethers.deployContract("MockAdmin", [
      recipient1.address,
    ]);

    await expect(
      callAsAdmin(adminContract, treasury, "updateAdmin", [
        await newAdminContract.getAddress(),
      ])
    )
      .to.emit(treasury, "AdminUpdated")
      .withArgs(
        await adminContract.getAddress(),
        await newAdminContract.getAddress()
      );

    expect(await treasury.admin()).to.equal(
      await newAdminContract.getAddress()
    );
  });

  it("Should prevent non-admin from updating admin", async function () {
    const { treasury } = await deployTreasuryContracts();

    const newAdminContract = await ethers.deployContract("MockAdmin", [
      recipient1.address,
    ]);

    await expect(
      treasury
        .connect(nonAdmin)
        .updateAdmin(await newAdminContract.getAddress())
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should reject EOA as new admin", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateAdmin", [recipient1.address])
    ).to.be.revertedWith("MockAdmin: execution failed");
  });

  // ===== PAUSE/UNPAUSE TESTS =====

  it("Should allow admin to pause treasury", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    await callAsAdmin(adminContract, treasury, "pause");

    expect(await treasury.paused()).to.equal(true);
  });

  it("Should allow admin to unpause treasury", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Pause
    await callAsAdmin(adminContract, treasury, "pause");
    expect(await treasury.paused()).to.equal(true);

    // Unpause
    await callAsAdmin(adminContract, treasury, "unpause");
    expect(await treasury.paused()).to.equal(false);
  });

  it("Should prevent non-admin from pausing", async function () {
    const { treasury } = await deployTreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).pause()
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should prevent non-admin from unpausing", async function () {
    const { treasury, adminContract } = await deployTreasuryContracts();

    // Admin pauses
    await callAsAdmin(adminContract, treasury, "pause");

    // Non-admin tries to unpause
    await expect(
      treasury.connect(nonAdmin).unpause()
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  // ===== INTEGRATION TESTS =====

  it("Should track spent amount correctly across multiple transfers", async function () {
    const { treasury } = await deployTreasuryContracts();
    await fundTreasury(treasury, "100");

    // Transfer 1
    await treasury
      .connect(deployer)
      .transfer(recipient1.address, parseEther("10"));
    expect(await treasury.spent()).to.equal(parseEther("10"));

    // Transfer 2
    await treasury
      .connect(deployer)
      .transfer(recipient2.address, parseEther("25"));
    expect(await treasury.spent()).to.equal(parseEther("35"));

    // Transfer 3
    await treasury
      .connect(deployer)
      .transfer(recipient3.address, parseEther("15"));
    expect(await treasury.spent()).to.equal(parseEther("50"));

    // Check balance
    expect(await treasury.getBalance()).to.equal(parseEther("50"));
  });

  it("Should work with both whitelist and blacklist disabled", async function () {
    const { treasury } = await deployTreasuryContracts();
    await fundTreasury(treasury, "10");

    // Both modes disabled by default
    expect(await treasury.isWhitelisted()).to.equal(false);
    expect(await treasury.isBlacklisted()).to.equal(false);

    // Should allow transfer to any address
    await treasury
      .connect(deployer)
      .transfer(recipient1.address, parseEther("5"));

    expect(await treasury.spent()).to.equal(parseEther("5"));
  });
});
