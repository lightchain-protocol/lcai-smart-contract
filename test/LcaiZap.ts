import { expect } from "chai";
import { network } from "hardhat";
import { parseEther, zeroPadValue, ZeroAddress } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers, networkHelpers } = await network.connect();

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const POOL_FEE = 3000;
const DESTINATION_DOMAIN = 9200;
const RATE = parseEther("2500000"); // 2.5M LCAI per ETH
const GAS_QUOTE = parseEther("0.001");

describe("LcaiZap", function () {
  let user: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let lcai: any;
  let swapRouter: any;
  let warpRoute: any;
  let zap: any;

  beforeEach(async function () {
    [, user, recipient] = await ethers.getSigners();

    lcai = await ethers.deployContract("MockLcai");
    swapRouter = await ethers.deployContract("MockSwapRouter", [await lcai.getAddress(), RATE]);
    warpRoute = await ethers.deployContract("MockWarpRoute", [await lcai.getAddress(), GAS_QUOTE]);
    zap = await ethers.deployContract("LcaiZap", [
      await swapRouter.getAddress(),
      await warpRoute.getAddress(),
      await lcai.getAddress(),
      WETH,
      POOL_FEE,
      DESTINATION_DOMAIN,
    ]);
  });

  async function deadline(offset = 600) {
    return BigInt((await networkHelpers.time.latest()) + offset);
  }

  it("exposes the warp route gas quote", async function () {
    expect(await zap.gasPayment()).to.equal(GAS_QUOTE);
  });

  it("swaps ETH minus gas payment and bridges all LCAI to the recipient", async function () {
    const value = parseEther("1");
    const expectedLcai = ((value - GAS_QUOTE) * RATE) / parseEther("1");

    await expect(
      zap.connect(user).zapToLightchain(expectedLcai, recipient.address, await deadline(), { value }),
    )
      .to.emit(zap, "Zapped")
      .withArgs(
        user.address,
        recipient.address,
        value - GAS_QUOTE,
        GAS_QUOTE,
        expectedLcai,
        (id: string) => id !== ethers.ZeroHash,
      );

    expect(await warpRoute.lastDestination()).to.equal(DESTINATION_DOMAIN);
    expect(await warpRoute.lastRecipient()).to.equal(zeroPadValue(recipient.address, 32));
    expect(await warpRoute.lastAmount()).to.equal(expectedLcai);
    expect(await warpRoute.lastValue()).to.equal(GAS_QUOTE);

    // Nothing left behind
    expect(await lcai.balanceOf(await zap.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await zap.getAddress())).to.equal(0n);
    expect(await lcai.allowance(await zap.getAddress(), await warpRoute.getAddress())).to.equal(0n);
  });

  it("reverts when the swap output is below minLcaiOut", async function () {
    const value = parseEther("1");
    const tooHigh = ((value - GAS_QUOTE) * RATE) / parseEther("1") + 1n;
    await expect(
      zap.connect(user).zapToLightchain(tooHigh, recipient.address, await deadline(), { value }),
    ).to.be.revertedWithCustomError(swapRouter, "TooLittleReceived");
  });

  it("reverts when value does not cover the gas payment", async function () {
    await expect(
      zap.connect(user).zapToLightchain(0, recipient.address, await deadline(), { value: GAS_QUOTE }),
    ).to.be.revertedWithCustomError(zap, "InsufficientValue");
  });

  it("reverts on zero recipient", async function () {
    await expect(
      zap.connect(user).zapToLightchain(0, ZeroAddress, await deadline(), { value: parseEther("1") }),
    ).to.be.revertedWithCustomError(zap, "ZeroRecipient");
  });

  it("reverts after the deadline", async function () {
    await expect(
      zap.connect(user).zapToLightchain(0, recipient.address, await deadline(-1), { value: parseEther("1") }),
    ).to.be.revertedWithCustomError(zap, "Expired");
  });

  it("forwards any ETH the warp route refunds back to the caller", async function () {
    const refund = parseEther("0.0004");
    await warpRoute.setRefundAmount(refund);
    await user.sendTransaction({ to: await warpRoute.getAddress(), value: parseEther("0.1") });

    const value = parseEther("1");
    const before = await ethers.provider.getBalance(user.address);
    const tx = await zap.connect(user).zapToLightchain(0, recipient.address, await deadline(), { value });
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(user.address);

    expect(before - after).to.equal(value - refund + gasCost);
    expect(await ethers.provider.getBalance(await zap.getAddress())).to.equal(0n);
  });

  it("reads the gas quote live from the warp route", async function () {
    // Raise the quote after deployment: zap reads it live, so it still works.
    const newQuote = parseEther("0.01");
    await warpRoute.setGasQuote(newQuote);
    const value = parseEther("1");
    const expectedLcai = ((value - newQuote) * RATE) / parseEther("1");
    await zap.connect(user).zapToLightchain(expectedLcai, recipient.address, await deadline(), { value });
    expect(await warpRoute.lastValue()).to.equal(newQuote);
  });
});
