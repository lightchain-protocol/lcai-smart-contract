import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
describe("WLCAI", async function () {
  it("Should deploy with correct name and symbol", async function () {
    const wrappedETH = await ethers.deployContract("WLCAI");

    expect(await wrappedETH.name()).to.equal("Wrapped LCAI Votes");
    expect(await wrappedETH.symbol()).to.equal("WLCAIV");
    expect(await wrappedETH.decimals()).to.equal(18);
    expect(await wrappedETH.totalSupply()).to.equal(0n);
  });

  it("Should deposit ETH and mint tokens", async function () {
    const [user] = await ethers.getSigners();
    const wrappedETH = await ethers.deployContract("WLCAI");

    const depositAmount = ethers.parseEther("1");

    // Send ETH directly to contract via receive function
    await user.sendTransaction({
      to: await wrappedETH.getAddress(),
      value: depositAmount,
    });

    expect(await wrappedETH.balanceOf(user.address)).to.equal(depositAmount);
    expect(await wrappedETH.totalSupply()).to.equal(depositAmount);
    expect(await wrappedETH.totalETH()).to.equal(depositAmount);
  });

  it("Should withdraw ETH and burn tokens", async function () {
    const [user] = await ethers.getSigners();
    const wrappedETH = await ethers.deployContract("WLCAI");

    const depositAmount = ethers.parseEther("2");
    const withdrawAmount = ethers.parseEther("1");

    // Deposit first
    await user.sendTransaction({
      to: await wrappedETH.getAddress(),
      value: depositAmount,
    });

    // Withdraw
    await wrappedETH.withdraw(withdrawAmount);

    // Check token balance decreased
    expect(await wrappedETH.balanceOf(user.address)).eq(
      depositAmount - withdrawAmount
    );
    expect(await wrappedETH.totalSupply()).eq(depositAmount - withdrawAmount);
  });

  it("Should support delegation for governance", async function () {
    const [user, delegate] = await ethers.getSigners();
    const wrappedETH = await ethers.deployContract("WLCAI");

    const depositAmount = ethers.parseEther("10");

    // Deposit and delegate
    await user.sendTransaction({
      to: await wrappedETH.getAddress(),
      value: depositAmount,
    });

    await wrappedETH.delegate(delegate.address);

    // Check voting power
    expect(await wrappedETH.getVotes(delegate.address)).eq(depositAmount);
    expect(await wrappedETH.getVotes(user.address)).eq(0n);
  });

  it("Should maintain 1:1 ratio between totalSupply and totalETH", async function () {
    const [user1, user2] = await ethers.getSigners();
    const wrappedETH = await ethers.deployContract("WLCAI");

    // Multiple deposits
    await user1.sendTransaction({
      to: await wrappedETH.getAddress(),
      value: ethers.parseEther("1"),
    });

    await user2.sendTransaction({
      to: await wrappedETH.getAddress(),
      value: ethers.parseEther("2"),
    });

    const totalSupply = await wrappedETH.totalSupply();
    const totalETH = await wrappedETH.totalETH();

    expect(totalSupply).eq(totalETH);
    expect(totalSupply).eq(ethers.parseEther("3"));

    // After withdrawal
    await wrappedETH.withdraw(ethers.parseEther("0.5"));

    const newTotalSupply = await wrappedETH.totalSupply();
    const newTotalETH = await wrappedETH.totalETH();

    expect(newTotalSupply).eq(newTotalETH);
    expect(newTotalSupply).eq(ethers.parseEther("2.5"));
  });
});
