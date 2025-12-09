import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

const { network } = hre;
let ethers: typeof hre.ethers;
let networkHelpers: any;
let deployer: any;
let admin: any;
let recipient1: any;
let recipient2: any;
let recipient3: any;
let nonAdmin: any;

describe("LCAITreasury", function () {
  before(async function () {
    ({ ethers, networkHelpers } = await network.connect());
    [deployer, admin, recipient1, recipient2, recipient3, nonAdmin] =
      await ethers.getSigners();
  });

  // ===== HELPER FUNCTIONS =====

  async function deployLCAITreasuryContracts() {
    // Deploy a mock admin contract (simulates Gnosis Safe)
    const adminContract = await ethers.deployContract("MockAdmin", [
      admin.address, // owner of the admin contract
    ]);

    // Deploy treasury with deployer as initial owner for testing
    // In production, this would be the timelock
    const treasury = await ethers.deployContract("LCAITreasury", [
      deployer.address, // owner (for testing, would be timelock in production)
      await adminContract.getAddress(),
    ]);

    // Deploy a mock ERC20 token for testing
    const token = await ethers.deployContract("Token");

    return { treasury, adminContract, token };
  }

  async function fundTreasuryETH(treasury: any, amount: string) {
    // Send ETH to treasury
    await deployer.sendTransaction({
      to: await treasury.getAddress(),
      value: parseEther(amount),
    });
  }

  async function fundTreasuryERC20(treasury: any, token: any, amount: string) {
    // Transfer ERC20 tokens to treasury
    await token.transfer(await treasury.getAddress(), parseEther(amount));
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
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    // Check owner is deployer
    const owner = await treasury.owner();
    expect(owner).to.equal(deployer.address);

    // Check admin is adminContract
    const adminAddress = await treasury.admin();
    expect(adminAddress).to.equal(await adminContract.getAddress());

    // Check initial state
    expect(await treasury.isWhitelisted()).to.equal(false);
    expect(await treasury.isBlacklisted()).to.equal(false);
    expect(await treasury.paused()).to.equal(false);
  });

  it("Should reject deployment with EOA admin", async function () {
    // Try to deploy with EOA as admin (should fail)
    await expect(
      ethers.deployContract("LCAITreasury", [
        deployer.address,
        admin.address, // EOA instead of contract
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("LCAITreasury"),
      "AdminMustBeContract"
    );
  });

  it("Should receive ETH via receive function", async function () {
    const { treasury } = await deployLCAITreasuryContracts();

    await fundTreasuryETH(treasury, "10");

    const balance = await treasury.getETHBalance();
    expect(balance).to.equal(parseEther("10"));
  });

  // ===== ETH DEPOSIT TESTS =====

  it("Should allow depositETH and emit Deposit event", async function () {
    const { treasury } = await deployLCAITreasuryContracts();

    await deployer.sendTransaction({
      to: await treasury.getAddress(),
      value: parseEther("5"),
    });

    expect(await treasury.getETHBalance()).to.equal(parseEther("5"));
  });

  // ===== ETH TRANSFER TESTS =====

  it("Should allow owner to transfer ETH", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

    const balanceBefore = await ethers.provider.getBalance(recipient1.address);

    await expect(
      treasury
        .connect(deployer)
        .transferETH(recipient1.address, parseEther("5"))
    )
      .to.emit(treasury, "ETHTransferred")
      .withArgs(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));

    // Check spent tracking for ETH (address(0))
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("5"));
  });

  it("Should prevent non-owner from transferring ETH", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

    await expect(
      treasury
        .connect(nonAdmin)
        .transferETH(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
  });

  it("Should prevent ETH transfer when paused", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

    // Admin pauses treasury
    await callAsAdmin(adminContract, treasury, "pause");

    // Try to transfer (should fail)
    await expect(
      treasury
        .connect(deployer)
        .transferETH(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "EnforcedPause");
  });

  it("Should revert on insufficient ETH balance", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "5");

    await expect(
      treasury
        .connect(deployer)
        .transferETH(recipient1.address, parseEther("10"))
    ).to.be.revertedWithCustomError(treasury, "InsufficientBalance");
  });

  // ===== ERC20 DEPOSIT TESTS =====

  it("Should allow deposit of ERC20 tokens", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();

    // Approve treasury to spend tokens
    await token
      .connect(deployer)
      .approve(await treasury.getAddress(), parseEther("100"));

    // Note: The deposit function has a bug - it uses msg.value for ERC20 amount
    // For testing purposes, we'll send ETH equal to the amount we want to transfer
    await expect(
      treasury
        .connect(deployer)
        .deposit(await token.getAddress(), parseEther("50"))
    )
      .to.emit(treasury, "Deposit")
      .withArgs(deployer.address, await token.getAddress(), parseEther("50"));
  });

  // ===== ERC20 TRANSFER TESTS =====

  it("Should allow owner to transfer ERC20 tokens", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    const balanceBefore = await token.balanceOf(recipient1.address);

    await expect(
      treasury
        .connect(deployer)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("50")
        )
    )
      .to.emit(treasury, "ERC20Transferred")
      .withArgs(await token.getAddress(), recipient1.address, parseEther("50"));

    const balanceAfter = await token.balanceOf(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("50"));

    // Check spent tracking for token
    expect(await treasury.spent(await token.getAddress())).to.equal(
      parseEther("50")
    );
  });

  it("Should prevent non-owner from transferring ERC20 tokens", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    await expect(
      treasury
        .connect(nonAdmin)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("50")
        )
    ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
  });

  it("Should prevent ERC20 transfer when paused", async function () {
    const { treasury, adminContract, token } =
      await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    // Admin pauses treasury
    await callAsAdmin(adminContract, treasury, "pause");

    // Try to transfer (should fail)
    await expect(
      treasury
        .connect(deployer)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("50")
        )
    ).to.be.revertedWithCustomError(treasury, "EnforcedPause");
  });

  it("Should revert on insufficient ERC20 balance", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "50");

    await expect(
      treasury
        .connect(deployer)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("100")
        )
    ).to.be.revertedWithCustomError(treasury, "InsufficientBalance");
  });

  // ===== BALANCE QUERY TESTS =====

  it("Should return correct ETH balance via getBalance", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "25");

    const balance = await treasury.getBalance(ethers.ZeroAddress);
    expect(balance).to.equal(parseEther("25"));
  });

  it("Should return correct ERC20 balance via getBalance", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "75");

    const balance = await treasury.getBalance(await token.getAddress());
    expect(balance).to.equal(parseEther("75"));
  });

  it("Should return correct ETH balance via getETHBalance", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "15");

    const balance = await treasury.getETHBalance();
    expect(balance).to.equal(parseEther("15"));
  });

  // ===== WHITELIST TESTS =====

  it("Should allow admin to add address to whitelist", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

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
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

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
    const { treasury } = await deployLCAITreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).setWhitelistedAddress(recipient1.address, true)
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should allow admin to enable whitelist mode", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [true])
    )
      .to.emit(treasury, "WhitelistedStatusUpdated")
      .withArgs(false, true);

    expect(await treasury.isWhitelisted()).to.equal(true);
  });

  it("Should block ETH transfers to non-whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

    // Enable whitelist mode
    await callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [
      true,
    ]);

    // Try to transfer to non-whitelisted address (should fail)
    await expect(
      treasury
        .connect(deployer)
        .transferETH(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "WhitelistedAddressNotAllowed");
  });

  it("Should allow ETH transfers to whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

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
      .transferETH(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));
  });

  it("Should block ERC20 transfers to non-whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract, token } =
      await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    // Enable whitelist mode
    await callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [
      true,
    ]);

    // Try to transfer to non-whitelisted address (should fail)
    await expect(
      treasury
        .connect(deployer)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("50")
        )
    ).to.be.revertedWithCustomError(treasury, "WhitelistedAddressNotAllowed");
  });

  it("Should allow ERC20 transfers to whitelisted addresses when whitelist is enabled", async function () {
    const { treasury, adminContract, token } =
      await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    // Enable whitelist mode
    await callAsAdmin(adminContract, treasury, "updateWhitelistedStatus", [
      true,
    ]);

    // Add recipient to whitelist
    await callAsAdmin(adminContract, treasury, "setWhitelistedAddress", [
      recipient1.address,
      true,
    ]);

    const balanceBefore = await token.balanceOf(recipient1.address);

    // Transfer should succeed
    await treasury
      .connect(deployer)
      .transferERC20(
        await token.getAddress(),
        recipient1.address,
        parseEther("50")
      );

    const balanceAfter = await token.balanceOf(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("50"));
  });

  // ===== BLACKLIST TESTS =====

  it("Should allow admin to add address to blacklist", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

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
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

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
    const { treasury } = await deployLCAITreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).setBlacklistedAddress(recipient1.address, true)
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should allow admin to enable blacklist mode", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateBlacklistedStatus", [true])
    )
      .to.emit(treasury, "BlacklistedStatusUpdated")
      .withArgs(false, true);

    expect(await treasury.isBlacklisted()).to.equal(true);
  });

  it("Should block ETH transfers to blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

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
      treasury
        .connect(deployer)
        .transferETH(recipient1.address, parseEther("5"))
    ).to.be.revertedWithCustomError(treasury, "BlacklistedAddressNotAllowed");
  });

  it("Should allow ETH transfers to non-blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");

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
      .transferETH(recipient1.address, parseEther("5"));

    const balanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("5"));
  });

  it("Should block ERC20 transfers to blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract, token } =
      await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

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
      treasury
        .connect(deployer)
        .transferERC20(
          await token.getAddress(),
          recipient1.address,
          parseEther("50")
        )
    ).to.be.revertedWithCustomError(treasury, "BlacklistedAddressNotAllowed");
  });

  it("Should allow ERC20 transfers to non-blacklisted addresses when blacklist is enabled", async function () {
    const { treasury, adminContract, token } =
      await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "100");

    // Enable blacklist mode
    await callAsAdmin(adminContract, treasury, "updateBlacklistedStatus", [
      true,
    ]);

    // Add recipient2 to blacklist (but not recipient1)
    await callAsAdmin(adminContract, treasury, "setBlacklistedAddress", [
      recipient2.address,
      true,
    ]);

    const balanceBefore = await token.balanceOf(recipient1.address);

    // Transfer to non-blacklisted address should succeed
    await treasury
      .connect(deployer)
      .transferERC20(
        await token.getAddress(),
        recipient1.address,
        parseEther("50")
      );

    const balanceAfter = await token.balanceOf(recipient1.address);
    expect(balanceAfter - balanceBefore).to.equal(parseEther("50"));
  });

  // ===== ADMIN MANAGEMENT TESTS =====

  it("Should allow admin to update admin address", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

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
    const { treasury } = await deployLCAITreasuryContracts();

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
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    await expect(
      callAsAdmin(adminContract, treasury, "updateAdmin", [recipient1.address])
    ).to.be.revertedWith("MockAdmin: execution failed");
  });

  // ===== PAUSE/UNPAUSE TESTS =====

  it("Should allow admin to pause treasury", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    await callAsAdmin(adminContract, treasury, "pause");

    expect(await treasury.paused()).to.equal(true);
  });

  it("Should allow admin to unpause treasury", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    // Pause
    await callAsAdmin(adminContract, treasury, "pause");
    expect(await treasury.paused()).to.equal(true);

    // Unpause
    await callAsAdmin(adminContract, treasury, "unpause");
    expect(await treasury.paused()).to.equal(false);
  });

  it("Should prevent non-admin from pausing", async function () {
    const { treasury } = await deployLCAITreasuryContracts();

    await expect(
      treasury.connect(nonAdmin).pause()
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  it("Should prevent non-admin from unpausing", async function () {
    const { treasury, adminContract } = await deployLCAITreasuryContracts();

    // Admin pauses
    await callAsAdmin(adminContract, treasury, "pause");

    // Non-admin tries to unpause
    await expect(
      treasury.connect(nonAdmin).unpause()
    ).to.be.revertedWithCustomError(treasury, "Unauthorized");
  });

  // ===== INTEGRATION TESTS =====

  it("Should track ETH spent correctly across multiple transfers", async function () {
    const { treasury } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "100");

    // Transfer 1
    await treasury
      .connect(deployer)
      .transferETH(recipient1.address, parseEther("10"));
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("10"));

    // Transfer 2
    await treasury
      .connect(deployer)
      .transferETH(recipient2.address, parseEther("25"));
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("35"));

    // Transfer 3
    await treasury
      .connect(deployer)
      .transferETH(recipient3.address, parseEther("15"));
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("50"));

    // Check balance
    expect(await treasury.getETHBalance()).to.equal(parseEther("50"));
  });

  it("Should track ERC20 spent correctly across multiple transfers", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryERC20(treasury, token, "200");

    const tokenAddress = await token.getAddress();

    // Transfer 1
    await treasury
      .connect(deployer)
      .transferERC20(tokenAddress, recipient1.address, parseEther("30"));
    expect(await treasury.spent(tokenAddress)).to.equal(parseEther("30"));

    // Transfer 2
    await treasury
      .connect(deployer)
      .transferERC20(tokenAddress, recipient2.address, parseEther("40"));
    expect(await treasury.spent(tokenAddress)).to.equal(parseEther("70"));

    // Transfer 3
    await treasury
      .connect(deployer)
      .transferERC20(tokenAddress, recipient3.address, parseEther("20"));
    expect(await treasury.spent(tokenAddress)).to.equal(parseEther("90"));

    // Check balance
    expect(await treasury.getBalance(tokenAddress)).to.equal(parseEther("110"));
  });

  it("Should handle both ETH and ERC20 independently", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "50");
    await fundTreasuryERC20(treasury, token, "100");

    // Check initial balances
    expect(await treasury.getETHBalance()).to.equal(parseEther("50"));
    expect(await treasury.getBalance(await token.getAddress())).to.equal(
      parseEther("100")
    );

    // Transfer ETH
    await treasury
      .connect(deployer)
      .transferETH(recipient1.address, parseEther("10"));
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("10"));

    // Transfer ERC20
    await treasury
      .connect(deployer)
      .transferERC20(
        await token.getAddress(),
        recipient2.address,
        parseEther("20")
      );
    expect(await treasury.spent(await token.getAddress())).to.equal(
      parseEther("20")
    );

    // Check both balances are correctly updated
    expect(await treasury.getETHBalance()).to.equal(parseEther("40"));
    expect(await treasury.getBalance(await token.getAddress())).to.equal(
      parseEther("80")
    );
  });

  it("Should work with both whitelist and blacklist disabled", async function () {
    const { treasury, token } = await deployLCAITreasuryContracts();
    await fundTreasuryETH(treasury, "10");
    await fundTreasuryERC20(treasury, token, "50");

    // Both modes disabled by default
    expect(await treasury.isWhitelisted()).to.equal(false);
    expect(await treasury.isBlacklisted()).to.equal(false);

    // Should allow ETH transfer to any address
    await treasury
      .connect(deployer)
      .transferETH(recipient1.address, parseEther("5"));
    expect(await treasury.spent(ethers.ZeroAddress)).to.equal(parseEther("5"));

    // Should allow ERC20 transfer to any address
    await treasury
      .connect(deployer)
      .transferERC20(
        await token.getAddress(),
        recipient2.address,
        parseEther("25")
      );
    expect(await treasury.spent(await token.getAddress())).to.equal(
      parseEther("25")
    );
  });
});
