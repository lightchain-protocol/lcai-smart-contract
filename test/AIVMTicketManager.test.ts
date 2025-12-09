import { expect } from "chai";
import hre from "hardhat";

const { network } = hre;
let ethers: typeof hre.ethers;
let owner: any;
let alice: any;

describe("AIVMTicketManager", function () {
  before(async function () {
    ({ ethers } = await network.connect());
    [owner, alice] = await ethers.getSigners();
  });

  async function deployTicketManager() {
    const ticketManager = await ethers.deployContract("AIVMTicketManager");
    await ticketManager.waitForDeployment();
    return { ticketManager };
  }

  it("issues and validates a ticket", async function () {
    const deployment = await deployTicketManager();
    const ticketManager = deployment.ticketManager;
    const ttl = 3600;
    const tx = await ticketManager.issueTicket(alice.address, "var-001", ttl);
    const receipt = await tx.wait();
    const ticketIssuedLog = receipt!.logs
      .map(log => {
        try {
          return ticketManager.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .find(parsed => parsed && parsed.name === "TicketIssued");
    const ticketId = ticketIssuedLog!.args.ticketId as string;

    const stored = await ticketManager.getTicket(ticketId);
    expect(stored.issuedTo).to.equal(alice.address);
    expect(stored.variantId).to.equal("var-001");

    const valid = await ticketManager.validateTicket(ticketId, alice.address, "var-001");
    expect(valid).to.equal(true);
  });

  it("revokes a ticket", async function () {
    const deployment = await deployTicketManager();
    const ticketManager = deployment.ticketManager;
    const tx = await ticketManager.issueTicket(alice.address, "var-002", 0);
    const receipt = await tx.wait();
    const ticketIssuedLog = receipt!.logs
      .map(log => {
        try {
          return ticketManager.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .find(parsed => parsed && parsed.name === "TicketIssued");
    const ticketId = ticketIssuedLog!.args.ticketId as string;

    const revokeTx = await ticketManager.revokeTicket(ticketId);
    await revokeTx.wait();

    const isValid = await ticketManager.validateTicket(ticketId, alice.address, "var-002");
    expect(isValid).to.equal(false);
  });
});
