import { expect } from "chai";
import { network } from "hardhat";

describe("Counter", function () {
  it("Should emit the Increment event when calling the inc() function", async function () {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();

    const counter = await ethers.deployContract("Counter", [deployer.address]);

    await expect(counter.inc()).to.emit(counter, "Increment").withArgs(1n);
  });

  it("The sum of the Increment events should match the current value", async function () {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();

    const counter = await ethers.deployContract("Counter", [deployer.address]);

    // run a series of increments
    for (let i = 1n; i <= 10n; i++) {
      await counter.incBy(i);
    }

    // Get events using queryFilter
    const filter = counter.filters.Increment();
    const events = await counter.queryFilter(filter);

    // check that the aggregated events match the current value
    let total = 0n;
    for (const event of events) {
      if ('args' in event) {
        total += BigInt(event.args.by.toString());
      }
    }

    expect(total).to.equal(await counter.x());
  });
});
