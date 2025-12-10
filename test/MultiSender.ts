import { expect } from "chai";
import { network } from "hardhat";
import { parseEther } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers, networkHelpers } = await network.connect();

describe("MultiSender", function () {
  let multiSender: any;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;
  let recipient1: HardhatEthersSigner;
  let recipient2: HardhatEthersSigner;
  let recipient3: HardhatEthersSigner;
  let mockToken: any;

  const ARRAY_LIMIT = 100;

  beforeEach(async function () {
    [owner, user1, user2, user3, recipient1, recipient2, recipient3] =
      await ethers.getSigners();

    // Deploy MultiSender
    multiSender = await ethers.deployContract("MultiSender", [ARRAY_LIMIT]);

    // Deploy a mock ERC20 token for testing
    // Token mints all supply to deployer (owner) in constructor
    mockToken = await ethers.deployContract("Token");

    // Transfer tokens to user1 for testing
    await mockToken.transfer(user1.address, parseEther("1000"));
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await multiSender.owner()).to.equal(owner.address);
    });

    it("should set the correct array limit", async function () {
      expect(await multiSender.arrayLimit()).to.equal(ARRAY_LIMIT);
    });
  });

  describe("setArrayLimit", function () {
    it("should allow owner to update array limit", async function () {
      const newLimit = 200;
      await expect(multiSender.setArrayLimit(newLimit))
        .to.emit(multiSender, "ArrayLimitUpdated")
        .withArgs(ARRAY_LIMIT, newLimit);

      expect(await multiSender.arrayLimit()).to.equal(newLimit);
    });

    it("should revert when non-owner tries to update array limit", async function () {
      await expect(
        multiSender.connect(user1).setArrayLimit(200)
      ).to.be.revertedWithCustomError(multiSender, "OwnableUnauthorizedAccount");
    });

    it("should allow setting array limit to zero", async function () {
      await multiSender.setArrayLimit(0);
      expect(await multiSender.arrayLimit()).to.equal(0);
    });
  });

  describe("multisendToken - ERC20", function () {
    it("should successfully send tokens to multiple recipients", async function () {
      const recipients = [recipient1.address, recipient2.address, recipient3.address];
      const amounts = [parseEther("10"), parseEther("20"), parseEther("30")];
      const totalAmount = parseEther("60");

      // Approve MultiSender to spend tokens
      await mockToken.connect(user1).approve(await multiSender.getAddress(), totalAmount);

      const tx = await multiSender
        .connect(user1)
        .multisendToken(await mockToken.getAddress(), recipients, amounts);

      await expect(tx)
        .to.emit(multiSender, "Multisended")
        .withArgs(totalAmount, await mockToken.getAddress());

      // Verify balances
      expect(await mockToken.balanceOf(recipient1.address)).to.equal(parseEther("10"));
      expect(await mockToken.balanceOf(recipient2.address)).to.equal(parseEther("20"));
      expect(await mockToken.balanceOf(recipient3.address)).to.equal(parseEther("30"));
      expect(await mockToken.balanceOf(user1.address)).to.equal(parseEther("940"));
    });

    it("should revert when arrays have different lengths", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [parseEther("10")]; // Mismatched length

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.be.revertedWith("Array length must match");
    });

    it("should revert when array exceeds limit", async function () {
      const recipients = new Array(ARRAY_LIMIT + 1).fill(recipient1.address);
      const amounts = new Array(ARRAY_LIMIT + 1).fill(parseEther("1"));

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.be.revertedWith("You passed the array limit");
    });

    it("should revert when recipient is zero address", async function () {
      const recipients = [recipient1.address, ethers.ZeroAddress, recipient3.address];
      const amounts = [parseEther("10"), parseEther("20"), parseEther("30")];

      await mockToken.connect(user1).approve(await multiSender.getAddress(), parseEther("60"));

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.be.revertedWithCustomError(multiSender, "ZeroAddress");
    });

    it("should revert when insufficient token allowance", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [parseEther("10"), parseEther("20")];

      // Approve less than needed
      await mockToken.connect(user1).approve(await multiSender.getAddress(), parseEther("15"));

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.be.revertedWithCustomError(mockToken, "ERC20InsufficientAllowance");
    });

    it("should revert when user has insufficient balance", async function () {
      const recipients = [recipient1.address];
      const amounts = [parseEther("2000")]; // More than user1 has

      await mockToken.connect(user1).approve(await multiSender.getAddress(), parseEther("2000"));

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.be.revertedWithCustomError(mockToken, "ERC20InsufficientBalance");
    });

    it("should handle empty arrays correctly", async function () {
      const recipients: string[] = [];
      const amounts: bigint[] = [];

      const tx = await multiSender
        .connect(user1)
        .multisendToken(await mockToken.getAddress(), recipients, amounts);

      await expect(tx)
        .to.emit(multiSender, "Multisended")
        .withArgs(0, await mockToken.getAddress());
    });

    it("should handle single recipient", async function () {
      const recipients = [recipient1.address];
      const amounts = [parseEther("50")];

      await mockToken.connect(user1).approve(await multiSender.getAddress(), parseEther("50"));

      await multiSender
        .connect(user1)
        .multisendToken(await mockToken.getAddress(), recipients, amounts);

      expect(await mockToken.balanceOf(recipient1.address)).to.equal(parseEther("50"));
    });
  });

  describe("multisendToken - ETH", function () {
    it("should successfully send ETH to multiple recipients", async function () {
      const recipients = [recipient1.address, recipient2.address, recipient3.address];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const totalAmount = parseEther("6");

      const balanceBefore1 = await ethers.provider.getBalance(recipient1.address);
      const balanceBefore2 = await ethers.provider.getBalance(recipient2.address);
      const balanceBefore3 = await ethers.provider.getBalance(recipient3.address);

      const tx = await multiSender
        .connect(user1)
        .multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: totalAmount,
        });

      await expect(tx)
        .to.emit(multiSender, "Multisended")
        .withArgs(totalAmount, ethers.ZeroAddress);

      // Verify balances increased
      expect(await ethers.provider.getBalance(recipient1.address)).to.equal(
        balanceBefore1 + parseEther("1")
      );
      expect(await ethers.provider.getBalance(recipient2.address)).to.equal(
        balanceBefore2 + parseEther("2")
      );
      expect(await ethers.provider.getBalance(recipient3.address)).to.equal(
        balanceBefore3 + parseEther("3")
      );
    });

    it("should revert when insufficient ETH sent", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [parseEther("1"), parseEther("2")];
      const requiredAmount = parseEther("3");
      const sentAmount = parseEther("2"); // Less than required

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: sentAmount,
        })
      ).to.be.revertedWithCustomError(multiSender, "InsufficientEthSent")
        .withArgs(requiredAmount, sentAmount);
    });

    it("should revert when excess ETH sent", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [parseEther("1"), parseEther("2")];
      const requiredAmount = parseEther("3");
      const sentAmount = parseEther("4"); // More than required

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: sentAmount,
        })
      ).to.be.revertedWithCustomError(multiSender, "ExcessEthSent")
        .withArgs(requiredAmount, sentAmount);
    });

    it("should revert when recipient is zero address", async function () {
      const recipients = [recipient1.address, ethers.ZeroAddress];
      const amounts = [parseEther("1"), parseEther("2")];

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: parseEther("3"),
        })
      ).to.be.revertedWithCustomError(multiSender, "ZeroAddress");
    });

    it("should handle ETH transfer to contract that rejects", async function () {
      // Deploy a contract that rejects ETH
      const rejecter = await ethers.deployContract("EthRejecter");
      const recipients = [await rejecter.getAddress()];
      const amounts = [parseEther("1")];

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: parseEther("1"),
        })
      ).to.be.revertedWithCustomError(multiSender, "TransferFailed");
    });

    it("should send exact amount with zero remainder", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [parseEther("0.5"), parseEther("0.5")];
      const totalAmount = parseEther("1");

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: totalAmount,
        })
      ).to.emit(multiSender, "Multisended")
        .withArgs(totalAmount, ethers.ZeroAddress);
    });

    it("should handle empty arrays for ETH", async function () {
      const recipients: string[] = [];
      const amounts: bigint[] = [];

      const tx = await multiSender
        .connect(user1)
        .multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: 0,
        });

      await expect(tx)
        .to.emit(multiSender, "Multisended")
        .withArgs(0, ethers.ZeroAddress);
    });
  });

  describe("withdraw", function () {
    beforeEach(async function () {
      // Send some tokens to the MultiSender contract
      await mockToken.transfer(await multiSender.getAddress(), parseEther("100"));
    });

    it("should allow owner to withdraw tokens", async function () {
      const withdrawAmount = parseEther("50");
      const ownerBalanceBefore = await mockToken.balanceOf(owner.address);

      await expect(
        multiSender.withdraw(await mockToken.getAddress(), withdrawAmount)
      )
        .to.emit(multiSender, "TokensWithdrawn")
        .withArgs(await mockToken.getAddress(), owner.address, withdrawAmount);

      expect(await mockToken.balanceOf(owner.address)).to.equal(ownerBalanceBefore + withdrawAmount);
      expect(await mockToken.balanceOf(await multiSender.getAddress())).to.equal(
        parseEther("50")
      );
    });

    it("should revert when non-owner tries to withdraw", async function () {
      await expect(
        multiSender.connect(user1).withdraw(await mockToken.getAddress(), parseEther("50"))
      ).to.be.revertedWithCustomError(multiSender, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to withdraw all tokens", async function () {
      const ownerBalanceBefore = await mockToken.balanceOf(owner.address);
      const contractBalance = parseEther("100");

      await expect(multiSender.withdrawAll(await mockToken.getAddress()))
        .to.emit(multiSender, "TokensWithdrawn")
        .withArgs(await mockToken.getAddress(), owner.address, contractBalance);

      expect(await mockToken.balanceOf(owner.address)).to.equal(ownerBalanceBefore + contractBalance);
      expect(await mockToken.balanceOf(await multiSender.getAddress())).to.equal(0);
    });
  });

  describe("withdrawETH", function () {
    beforeEach(async function () {
      // Send ETH to the MultiSender contract
      await owner.sendTransaction({
        to: await multiSender.getAddress(),
        value: parseEther("10"),
      });
    });

    it("should allow owner to withdraw ETH", async function () {
      const withdrawAmount = parseEther("5");
      const balanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await multiSender.withdrawETH(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      await expect(tx)
        .to.emit(multiSender, "EthWithdrawn")
        .withArgs(owner.address, withdrawAmount);

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter).to.equal(balanceBefore + withdrawAmount - gasUsed);

      expect(await ethers.provider.getBalance(await multiSender.getAddress())).to.equal(
        parseEther("5")
      );
    });

    it("should revert when non-owner tries to withdraw ETH", async function () {
      await expect(
        multiSender.connect(user1).withdrawETH(parseEther("5"))
      ).to.be.revertedWithCustomError(multiSender, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to withdraw all ETH", async function () {
      const contractBalance = await ethers.provider.getBalance(await multiSender.getAddress());

      await expect(multiSender.withdrawAllETH())
        .to.emit(multiSender, "EthWithdrawn")
        .withArgs(owner.address, contractBalance);

      expect(await ethers.provider.getBalance(await multiSender.getAddress())).to.equal(0);
    });

    it("should revert when withdrawing more ETH than available", async function () {
      await expect(
        multiSender.withdrawETH(parseEther("20")) // More than the 10 ETH available
      ).to.be.revertedWithCustomError(multiSender, "TransferFailed");
    });
  });

  describe("Gas optimization tests", function () {
    it("should efficiently handle large batch of token transfers", async function () {
      const batchSize = 50;
      const recipients = new Array(batchSize).fill(0).map(() => ethers.Wallet.createRandom().address);
      const amounts = new Array(batchSize).fill(parseEther("1"));
      const totalAmount = parseEther(batchSize.toString());

      await mockToken.connect(user1).approve(await multiSender.getAddress(), totalAmount);

      const tx = await multiSender
        .connect(user1)
        .multisendToken(await mockToken.getAddress(), recipients, amounts);

      const receipt = await tx.wait();
      console.log(`Gas used for ${batchSize} token transfers: ${receipt!.gasUsed.toString()}`);

      expect(receipt!.gasUsed).to.be.lessThan(5000000n); // Should be efficient
    });

    it("should efficiently handle large batch of ETH transfers", async function () {
      const batchSize = 50;
      const recipients = new Array(batchSize).fill(0).map(() => ethers.Wallet.createRandom().address);
      const amounts = new Array(batchSize).fill(parseEther("0.1"));
      const totalAmount = parseEther("5");

      const tx = await multiSender
        .connect(user1)
        .multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: totalAmount,
        });

      const receipt = await tx.wait();
      console.log(`Gas used for ${batchSize} ETH transfers: ${receipt!.gasUsed.toString()}`);

      expect(receipt!.gasUsed).to.be.lessThan(3000000n); // Should be efficient
    });
  });

  describe("Edge cases", function () {
    it("should handle maximum array size correctly", async function () {
      await multiSender.setArrayLimit(3);

      const recipients = [recipient1.address, recipient2.address, recipient3.address];
      const amounts = [parseEther("1"), parseEther("1"), parseEther("1")];

      await mockToken.connect(user1).approve(await multiSender.getAddress(), parseEther("3"));

      // Should not revert - using explicit success check instead of .not.be.reverted
      const tx = multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts);
      await expect(tx).to.emit(multiSender, "Multisended");
    });

    it("should handle zero amount transfers", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [0n, 0n];

      await mockToken.connect(user1).approve(await multiSender.getAddress(), 0);

      await expect(
        multiSender.connect(user1).multisendToken(await mockToken.getAddress(), recipients, amounts)
      ).to.emit(multiSender, "Multisended")
        .withArgs(0, await mockToken.getAddress());
    });

    it("should handle very small ETH amounts", async function () {
      const recipients = [recipient1.address];
      const amounts = [1n]; // 1 wei

      await expect(
        multiSender.connect(user1).multisendToken(ethers.ZeroAddress, recipients, amounts, {
          value: 1n,
        })
      ).to.emit(multiSender, "Multisended")
        .withArgs(1n, ethers.ZeroAddress);
    });
  });
});
