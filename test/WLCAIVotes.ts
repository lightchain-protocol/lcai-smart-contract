import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther } from "viem";

import { network } from "hardhat";

describe("WLCAI", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  it("Should deploy with correct name and symbol", async function () {
    const wrappedETH = await viem.deployContract("WLCAI");

    assert.equal(await wrappedETH.read.name(), "Wrapped LCAI Votes");
    assert.equal(await wrappedETH.read.symbol(), "WLCAIV");
    assert.equal(await wrappedETH.read.decimals(), 18);
    assert.equal(await wrappedETH.read.totalSupply(), 0n);
  });

  it("Should deposit ETH and mint tokens", async function () {
    const [user] = await viem.getWalletClients();
    const wrappedETH = await viem.deployContract("WLCAI");

    const depositAmount = parseEther("1");

    // Send ETH directly to contract via receive function
    await user.sendTransaction({
      to: wrappedETH.address,
      value: depositAmount,
    });

    assert.equal(
      await wrappedETH.read.balanceOf([user.account.address]),
      depositAmount
    );
    assert.equal(await wrappedETH.read.totalSupply(), depositAmount);
    assert.equal(await wrappedETH.read.totalETH(), depositAmount);
  });

  it("Should withdraw ETH and burn tokens", async function () {
    const [user] = await viem.getWalletClients();
    const wrappedETH = await viem.deployContract("WLCAI");

    const depositAmount = parseEther("2");
    const withdrawAmount = parseEther("1");

    // Deposit first
    await user.sendTransaction({
      to: wrappedETH.address,
      value: depositAmount,
    });

    // Withdraw
    await wrappedETH.write.withdraw([withdrawAmount], {
      account: user.account,
    });

    // Check token balance decreased
    assert.equal(
      await wrappedETH.read.balanceOf([user.account.address]),
      depositAmount - withdrawAmount
    );
    assert.equal(
      await wrappedETH.read.totalSupply(),
      depositAmount - withdrawAmount
    );
  });

  it("Should support delegation for governance", async function () {
    const [user, delegate] = await viem.getWalletClients();
    const wrappedETH = await viem.deployContract("WLCAI");

    const depositAmount = parseEther("10");

    // Deposit and delegate
    await user.sendTransaction({
      to: wrappedETH.address,
      value: depositAmount,
    });

    await wrappedETH.write.delegate([delegate.account.address], {
      account: user.account,
    });

    // Check voting power
    assert.equal(
      await wrappedETH.read.getVotes([delegate.account.address]),
      depositAmount
    );
    assert.equal(await wrappedETH.read.getVotes([user.account.address]), 0n);
  });

  it("Should maintain 1:1 ratio between totalSupply and totalETH", async function () {
    const [user1, user2] = await viem.getWalletClients();
    const wrappedETH = await viem.deployContract("WLCAI");

    // Multiple deposits
    await user1.sendTransaction({
      to: wrappedETH.address,
      value: parseEther("1"),
    });

    await user2.sendTransaction({
      to: wrappedETH.address,
      value: parseEther("2"),
    });

    const totalSupply = await wrappedETH.read.totalSupply();
    const totalETH = await wrappedETH.read.totalETH();

    assert.equal(totalSupply, totalETH);
    assert.equal(totalSupply, parseEther("3"));

    // After withdrawal
    await wrappedETH.write.withdraw([parseEther("0.5")], {
      account: user1.account,
    });

    const newTotalSupply = await wrappedETH.read.totalSupply();
    const newTotalETH = await wrappedETH.read.totalETH();

    assert.equal(newTotalSupply, newTotalETH);
    assert.equal(newTotalSupply, parseEther("2.5"));
  });
});
