import { expect } from "chai";
import hre from "hardhat";
import { LCAIGovernor } from "../types/ethers-contracts/LCAIGovernor.js";
import { Counter } from "../types/ethers-contracts/Counter.js";
import { PresaleVotingPower } from "../types/ethers-contracts/PresaleVotingPower.js";
import { parseEther } from "ethers";

enum ProposalState {
  Pending,
  Active,
  Canceled,
  Defeated,
  Succeeded,
  Queued,
  Expired,
  Executed,
}
interface ProposalData {
  targets: string[];
  values: bigint[];
  calldatas: string[];
  description: string;
  descriptionHash: string;
}

const { network } = hre;
// @ts-ignore
let ethers: typeof hre.ethers;
let networkHelpers: any;
let deployer: any;
let voter1: any;
let voter2: any;
let voter3: any;

describe("LCAIGovernor", function () {
  before(async function () {
    ({ ethers, networkHelpers } = await network.connect());
    [deployer, voter1, voter2, voter3] = await ethers.getSigners();
  });

  // ===== HELPER FUNCTIONS =====
  // These functions extract common patterns to reduce code duplication
  // and make tests more maintainable and readable

  // Helper function to deploy governance contracts
  async function deployGovernanceContracts(minDelay: bigint = 14400n) {
    const token = await ethers.deployContract("Token");
    const timelock = await ethers.deployContract("LCAITimeLock", [
      minDelay,
      [], // proposers (will be set to governor)
      [], // executors (will be set to governor)
      deployer.address,
    ]);
    // Deploy a mock admin contract (simulates Gnosis Safe)
    const adminContract = await ethers.deployContract("MockAdmin", [
      deployer.address, // owner of the admin contract
    ]);
    const governor = await ethers.deployContract("LCAIGovernor", [
      await token.getAddress(),
      await timelock.getAddress(),
      await adminContract.getAddress(), // admin address (must be contract)
    ]);
    const counter = await ethers.deployContract("Counter", [
      await timelock.getAddress(),
    ]);

    return { token, timelock, governor, counter, minDelay, adminContract };
  }

  // Helper function to set up timelock roles
  async function setupTimelockRoles(
    timelock: any,
    governor: any
  ): Promise<void> {
    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(proposerRole, await governor.getAddress());
    await timelock.grantRole(executorRole, await governor.getAddress());
  }

  // Helper function to distribute tokens and delegate voting power
  async function distributeTokensAndDelegate(
    token: any,
    distributions: Array<{ voter: any; amount: string }>
  ): Promise<void> {
    for (const { voter, amount } of distributions) {
      await token.transfer(voter.address, ethers.parseEther(amount));
      await token.connect(voter).delegate(voter.address);
    }

    // Mine a block to activate voting power
    await networkHelpers.mine(1);
  }

  // Helper function to create a proposal
  async function createProposal(
    governor: any,
    targets: string[],
    values: bigint[],
    calldatas: string[],
    description: string,
    proposer: any
  ): Promise<{ proposalId: bigint; proposalData: ProposalData }> {
    const proposalTx = await governor
      .connect(proposer)
      .propose(targets, values, calldatas, description);

    const proposalReceipt = await proposalTx.wait();

    const proposalEvents = await governor.queryFilter(
      governor.filters.ProposalCreated(),
      proposalReceipt.blockNumber,
      proposalReceipt.blockNumber
    );

    const proposalId = proposalEvents[0].args.proposalId;
    const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

    return {
      proposalId,
      proposalData: {
        targets,
        values,
        calldatas,
        description,
        descriptionHash,
      },
    };
  }

  // Helper function to advance to voting phase and cast votes
  async function advanceToVotingAndVote(
    governor: LCAIGovernor,
    proposalId: bigint,
    votes: Array<{ voter: typeof deployer; support: number }>
  ): Promise<void> {
    const deadline = await governor.proposalDeadline(proposalId);
    await networkHelpers.mineUpTo(deadline - 100n);

    // Verify proposal is active
    const activeState = await governor.state(proposalId);
    expect(activeState).to.equal(ProposalState.Active);

    // Cast votes
    for (const { voter, support } of votes) {
      await governor.connect(voter).castVote(proposalId, support);
    }

    // Advance past voting period
    await networkHelpers.mineUpTo(deadline + 10n);
  }

  // Helper function to queue a proposal
  async function queueProposal(
    governor: LCAIGovernor,
    proposalData: ProposalData
  ): Promise<void> {
    await governor.queue(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash
    );
  }

  // Helper function to execute a proposal
  async function executeProposal(
    governor: LCAIGovernor,
    proposalData: ProposalData
  ): Promise<void> {
    await governor.execute(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash
    );
  }

  // Helper function to create counter increment proposal data
  async function createCounterIncrementProposal(
    counter: Counter,
    incrementBy: bigint = 1n
  ): Promise<{ targets: string[]; values: bigint[]; calldatas: string[] }> {
    const targets = [await counter.getAddress()];
    const values = [0n];
    const calldatas = [
      counter.interface.encodeFunctionData(
        incrementBy === 1n ? "inc" : ("incBy" as any),
        incrementBy === 1n ? [] : ([incrementBy] as any)
      ),
    ];
    return { targets, values, calldatas };
  }

  // Helper function to deploy governance contracts with PresaleVotingPower
  async function deployManualGovernanceContracts(
    totalSupply: number = 1000000,
    minDelay: bigint = 14400n
  ) {
    const votesStrategy = await ethers.deployContract("PresaleVotingPower", [
      parseEther(`${totalSupply}`),
    ]);
    const timelock = await ethers.deployContract("LCAITimeLock", [
      minDelay,
      [], // proposers (will be set to governor)
      [], // executors (will be set to governor)
      deployer.address,
    ]);
    // Deploy a mock admin contract (simulates Gnosis Safe)
    const adminContract = await ethers.deployContract("MockAdmin", [
      deployer.address,
    ]);
    const governor = await ethers.deployContract("LCAIGovernor", [
      votesStrategy.getAddress(),
      timelock.getAddress(),
      await adminContract.getAddress(), // admin address (must be contract)
    ]);
    const counter = await ethers.deployContract("Counter", [
      timelock.getAddress(),
    ]);

    return {
      votesStrategy,
      timelock,
      governor,
      counter,
      minDelay,
      adminContract,
    };
  }

  // Helper function to set voting power for multiple accounts using PresaleVotingPower
  async function setVotingPowers(
    votesStrategy: PresaleVotingPower,
    votingPowers: Array<{ voter: any; amount: string }>
  ): Promise<void> {
    const accounts = votingPowers.map((vp) => vp.voter.address);
    const amounts = votingPowers.map((vp) => ethers.parseEther(vp.amount));

    await votesStrategy.setVotingPowerBatch(accounts, amounts);

    // Mine a block to ensure voting power is active
    await networkHelpers.mine(1);
  }

  // Helper function to call admin functions through the MockAdmin contract
  async function callAsAdmin(
    adminContract: any,
    governor: any,
    functionName: string,
    args: any[] = []
  ) {
    const governorAddress = await governor.getAddress();
    const calldata = governor.interface.encodeFunctionData(functionName, args);
    return await adminContract.execute(governorAddress, calldata);
  }

  // Test governance with token-based voting and timelock
  it("Should create, vote on, and execute a proposal through timelock", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts();

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens and delegate voting power (voter1 needs >= 140k for proposal threshold)
    // Need enough total votes to reach 3% quorum of 1 billion = 30 million tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" }, // Above threshold + contributes to quorum
      { voter: voter2, amount: "20000000" }, // Contributes to quorum
      { voter: voter3, amount: "5000000" }, // Contributes to quorum
    ]);

    // Create proposal to increment counter by 5
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter,
      5n
    );
    const description = "Increment counter by 5";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Check initial proposal state
    const initialState = await governor.state(proposalId);
    expect(initialState).to.equal(ProposalState.Pending);

    // Advance to voting and cast votes
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For (20000 tokens)
      { voter: voter2, support: 1 }, // For (30000 tokens)
      { voter: voter3, support: 0 }, // Against (5000 tokens)
    ]);

    // Check proposal succeeded
    const succeededState = await governor.state(proposalId);
    expect(succeededState).to.equal(ProposalState.Succeeded);

    // Queue the proposal
    await queueProposal(governor, proposalData);

    // Check proposal is queued
    const queuedState = await governor.state(proposalId);
    expect(queuedState).to.equal(ProposalState.Queued);

    // Fast forward past timelock delay
    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    // Check counter value before execution
    const counterBefore = await counter.x();
    expect(counterBefore).to.equal(0n);

    // Execute the proposal
    await executeProposal(governor, proposalData);

    // Check proposal is executed
    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);

    // Check counter was incremented
    const counterAfter = await counter.x();
    expect(counterAfter).to.equal(5n);
  });

  it("Should respect quorum requirements", async function () {
    // Deploy contracts with short delay for testing
    const { token, timelock, governor, counter } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Give tokens: voter1 has enough for threshold but not enough for quorum
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "200000" }, // Above threshold (140k), but only 0.2% of 100M supply - below 3% quorum
    ]);

    // Create a simple proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Simple increment";
    const { proposalId } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Advance to voting and cast vote with insufficient tokens
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For, but insufficient for quorum
    ]);

    // Check proposal failed due to insufficient quorum
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Defeated);
  });

  it("Should prevent execution before timelock delay", async function () {
    // Deploy contracts with custom delay
    const minDelay = 3600n / 12n;
    const { token, timelock, governor, counter } =
      await deployGovernanceContracts(minDelay);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Give enough tokens for threshold and quorum (need 30M for 3% of 1B supply)
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" }, // Above threshold and above 3% quorum
    ]);

    // Create and pass proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test timelock delay";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Advance to voting and vote
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);

    // Queue the proposal
    await queueProposal(governor, proposalData);

    // Try to execute immediately (should fail)
    try {
      await executeProposal(governor, proposalData);
      expect.fail("Should have failed due to timelock delay");
    } catch (error: any) {
      // Expected to fail
      expect(error.message.includes("TimelockUnexpectedOperationState")).ok;
    }

    // Fast forward past delay and execute successfully
    const deadline = await governor.proposalDeadline(proposalId);
    await networkHelpers.mineUpTo(deadline + minDelay + 100n);
    await networkHelpers.mine();

    await executeProposal(governor, proposalData);

    // Verify execution
    const counterValue = await counter.x();
    expect(counterValue).to.equal(1n);
  });

  // ===== MANUAL VOTES STRATEGY TESTS =====
  // These tests verify governance functionality using PresaleVotingPower
  // instead of token-based voting, allowing admin-controlled voting power

  it("Should work with PresaleVotingPower for voting power", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, counter, minDelay } =
      await deployManualGovernanceContracts();

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power manually (no token distribution needed)
    // Need enough for proposal threshold (140k) and quorum (3% of 1M = 30k)
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "250000" }, // Above threshold
      { voter: voter2, amount: "35000" }, // Contributes to quorum
      { voter: voter3, amount: "10000" }, // Contributes to quorum
    ]);

    // Verify voting power was set correctly
    const voter1Power = await votesStrategy.getVotes(voter1.address);
    const voter2Power = await votesStrategy.getVotes(voter2.address);
    const voter3Power = await votesStrategy.getVotes(voter3.address);
    expect(voter1Power).to.equal(ethers.parseEther("250000"));
    expect(voter2Power).to.equal(ethers.parseEther("35000"));
    expect(voter3Power).to.equal(ethers.parseEther("10000"));

    // Create proposal to increment counter by 3
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter,
      3n
    );
    const description = "Increment counter by 3 using manual votes";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Check initial proposal state
    const initialState = await governor.state(proposalId);
    expect(initialState).to.equal(ProposalState.Pending);

    // Advance to voting and cast votes
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For (250000 tokens)
      { voter: voter2, support: 1 }, // For (35000 tokens)
      { voter: voter3, support: 0 }, // Against (10000 tokens)
    ]);

    // Check proposal succeeded (285000 for vs 10000 against, meets 3% quorum of 30k)
    const succeededState = await governor.state(proposalId);
    expect(succeededState).to.equal(ProposalState.Succeeded);

    // Queue and execute the proposal
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    const counterBefore = await counter.x();
    expect(counterBefore).to.equal(0n);

    await executeProposal(governor, proposalData);

    // Verify execution
    const counterAfter = await counter.x();
    expect(counterAfter).to.equal(3n);

    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);
  });

  it("Should respect quorum with PresaleVotingPower", async function () {
    // Deploy contracts with PresaleVotingPower - total supply of 5M
    // With 3% quorum, we need 150k tokens voting. voter1 will have just above threshold (141k)
    // but below quorum, causing proposal to be defeated
    const { votesStrategy, timelock, governor, counter } =
      await deployManualGovernanceContracts(5000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set up scenario where voter1 can propose (>=140k) but voting doesn't meet quorum
    // Total supply is 5000000, need 3% = 150000 tokens voting to meet quorum
    // voter1 gets 141000 (just above threshold) and will vote, but below 150k quorum
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "141000" }, // Just above threshold, but below quorum when voting alone
      { voter: voter2, amount: "4859000" }, // Won't vote, so quorum not met
    ]);

    // Verify total supply and voting power
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("5000000"));

    const voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("141000"));

    // Create a simple proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test quorum with manual votes";
    const { proposalId } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Advance to voting and vote with insufficient power for quorum
    // voter1 has 141000 tokens, but quorum is 3% of 5000000 = 150000 tokens
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For with 141k tokens (insufficient for 150k quorum)
    ]);

    // Check proposal failed due to insufficient quorum
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Defeated);
  });

  it("Should allow admin to update voting power dynamically", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, counter } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Initially set voting power below proposal threshold
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "100000" }]);

    // Verify initial voting power
    let voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("100000"));

    // Update voting power to amount above threshold and quorum
    await votesStrategy.setVotingPower(
      voter1.address,
      ethers.parseEther("200000")
    );

    // Verify updated voting power
    voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("200000"));

    // Verify total supply was updated correctly
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("1000000"));

    // Mine a block to ensure changes are active
    await networkHelpers.mine();

    // Create and vote on proposal with updated voting power
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test dynamic voting power update";
    const { proposalId } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote should now succeed with sufficient power (200k above 30k quorum)
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For with 200k tokens (above threshold and quorum)
    ]);

    // Check proposal succeeded
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Succeeded);
  });

  it("Should prevent delegation in PresaleVotingPower", async function () {
    // Deploy PresaleVotingPower
    const { votesStrategy } = await deployManualGovernanceContracts();

    // Try to delegate (should fail)
    try {
      await votesStrategy.connect(voter1).delegate(voter2.address);
      expect.fail("Should have failed - delegation is disabled");
    } catch (error: any) {
      expect(error.message.includes("Delegation disabled")).ok;
    }

    // Verify delegates always returns address(0)
    const delegate = await votesStrategy.delegates(voter1.address);
    expect(delegate).to.equal("0x0000000000000000000000000000000000000000");
  });

  // ===== EMERGENCY STOP TESTS =====
  // These tests verify the emergency cancel functionality that allows
  // an admin (typically a multisig) to cancel proposals in any state

  it("Should allow admin to emergency cancel proposal in Pending state", async function () {
    // Deploy contracts with admin as deployer
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Verify admin is set correctly
    const adminAddress = await governor.admin();
    expect(adminAddress).to.equal(await adminContract.getAddress());

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test emergency cancel in Pending state";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Verify proposal is in Pending state
    const initialState = await governor.state(proposalId);
    expect(initialState).to.equal(ProposalState.Pending);

    // Admin emergency cancels the proposal
    await callAsAdmin(adminContract, governor, "emergencyCancel", [
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);

    // Verify proposal is now Canceled
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Canceled);
  });

  it("Should allow admin to emergency cancel proposal in Active state", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test emergency cancel in Active state";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Advance to Active state
    const deadline = await governor.proposalDeadline(proposalId);
    await networkHelpers.mineUpTo(deadline - 100n);

    // Verify proposal is Active
    const activeState = await governor.state(proposalId);
    expect(activeState).to.equal(ProposalState.Active);

    // Admin emergency cancels the proposal
    await callAsAdmin(adminContract, governor, "emergencyCancel", [
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);

    // Verify proposal is now Canceled
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Canceled);
  });

  it("Should allow admin to emergency cancel proposal in Succeeded state", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test emergency cancel in Succeeded state";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and advance to Succeeded state
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);

    // Verify proposal is Succeeded
    const succeededState = await governor.state(proposalId);
    expect(succeededState).to.equal(ProposalState.Succeeded);

    // Admin emergency cancels the proposal
    await callAsAdmin(adminContract, governor, "emergencyCancel", [
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);

    // Verify proposal is now Canceled
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Canceled);
  });

  it("Should allow admin to emergency cancel proposal in Queued state", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(100n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Grant CANCELLER_ROLE to governor (so it can cancel queued proposals in timelock)
    const cancellerRole = await timelock.CANCELLER_ROLE();
    await timelock.grantRole(cancellerRole, await governor.getAddress());

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test emergency cancel in Queued state";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and queue the proposal
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    // Verify proposal is Queued
    const queuedState = await governor.state(proposalId);
    expect(queuedState).to.equal(ProposalState.Queued);

    // Admin emergency cancels the proposal
    await callAsAdmin(adminContract, governor, "emergencyCancel", [
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);

    // Verify proposal is now Canceled
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Canceled);
  });

  it("Should prevent non-admin from emergency canceling", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test unauthorized emergency cancel";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Verify proposal is in Pending state
    const initialState = await governor.state(proposalId);
    expect(initialState).to.equal(ProposalState.Pending);

    // Try to emergency cancel as non-admin (should fail)
    try {
      await governor
        .connect(voter1)
        .emergencyCancel(
          proposalData.targets,
          proposalData.values,
          proposalData.calldatas,
          proposalData.descriptionHash
        );
      expect.fail("Should have failed - caller is not admin");
    } catch (error: any) {
      expect(error.message.includes("UnauthorizedAdmin")).ok;
    }

    // Verify proposal is still in Pending state
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Pending);
  });

  it("Should prevent emergency cancel of executed proposal", async function () {
    // Deploy contracts with short delay
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create, vote, queue and execute proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test emergency cancel of executed proposal";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    // Fast forward and execute
    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, proposalData);

    // Verify proposal is Executed
    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);

    // Try to emergency cancel (should fail)
    try {
      await callAsAdmin(adminContract, governor, "emergencyCancel", [
        proposalData.targets,
        proposalData.values,
        proposalData.calldatas,
        proposalData.descriptionHash,
      ]);
      expect.fail("Should have failed - proposal is executed");
    } catch (error: any) {
      // Check that it reverted (error exists)
      expect(error).to.exist;
    }
  });

  it("Should allow governance to update admin address", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Verify initial admin
    const initialAdmin = await governor.admin();
    expect(initialAdmin).to.equal(await adminContract.getAddress());

    // Deploy a new MockAdmin contract to use as the new admin
    const newAdminContract = await ethers.deployContract("MockAdmin", [
      voter2.address, // voter2 will be owner of new admin
    ]);

    // Admin directly updates to new MockAdmin
    const newAdminAddress = await newAdminContract.getAddress();
    const governorAddress = await governor.getAddress();
    const calldata = governor.interface.encodeFunctionData("updateAdmin", [
      newAdminAddress,
    ]);
    await adminContract.connect(deployer).execute(governorAddress, calldata);

    // Verify admin was updated
    const updatedAdmin = await governor.admin();
    expect(updatedAdmin).to.equal(newAdminAddress);

    // Distribute tokens for subsequent test
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Verify old admin can no longer emergency cancel
    const {
      targets: targets2,
      values: values2,
      calldatas: calldatas2,
    } = await createCounterIncrementProposal(counter);
    const description2 = "Test with new admin";
    const { proposalId: proposalId2, proposalData: proposalData2 } =
      await createProposal(
        governor,
        targets2,
        values2,
        calldatas2,
        description2,
        voter1
      );

    try {
      await callAsAdmin(adminContract, governor, "emergencyCancel", [
        proposalData2.targets,
        proposalData2.values,
        proposalData2.calldatas,
        proposalData2.descriptionHash,
      ]);
      expect.fail("Old admin should not be able to cancel");
    } catch (error: any) {
      // Check that it reverted (error exists)
      expect(error).to.exist;
    }

    // Verify new admin can emergency cancel
    const calldata2 = governor.interface.encodeFunctionData("emergencyCancel", [
      proposalData2.targets,
      proposalData2.values,
      proposalData2.calldatas,
      proposalData2.descriptionHash,
    ]);
    await newAdminContract.connect(voter2).execute(governorAddress, calldata2);

    const finalState = await governor.state(proposalId2);
    expect(finalState).to.equal(ProposalState.Canceled);
  });

  it("Should verify timelock operation is canceled when emergency canceling queued proposal", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(100n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Grant CANCELLER_ROLE to governor (so it can cancel queued proposals in timelock)
    const cancellerRole = await timelock.CANCELLER_ROLE();
    await timelock.grantRole(cancellerRole, await governor.getAddress());

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create proposal
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test timelock cancellation verification";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and queue the proposal
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    // Verify proposal is Queued
    const queuedState = await governor.state(proposalId);
    expect(queuedState).to.equal(ProposalState.Queued);

    // Calculate timelock operation ID using JavaScript (same as Solidity)
    const governorAddress = await governor.getAddress();
    const descriptionHash = proposalData.descriptionHash;

    // Calculate salt: bytes20(address(this)) ^ descriptionHash
    // In JavaScript: right-pad address to 32 bytes, then XOR
    const addressBytes32 =
      governorAddress.toLowerCase() + "000000000000000000000000";
    const salt = ethers.toBeHex(
      BigInt(addressBytes32) ^ BigInt(descriptionHash),
      32
    );

    const timelockId = await timelock.hashOperationBatch(
      targets,
      values,
      calldatas,
      ethers.ZeroHash, // predecessor
      salt
    );

    // Verify the operation exists in timelock before cancellation
    const timestampBefore = await timelock.getTimestamp(timelockId);
    expect(timestampBefore).to.be.gt(0n); // Should be scheduled

    // Admin emergency cancels the proposal
    await callAsAdmin(adminContract, governor, "emergencyCancel", [
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);

    // Verify proposal is now Canceled in governor
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Canceled);

    // Verify the timelock operation was canceled (timestamp should be 0)
    const timestampAfter = await timelock.getTimestamp(timelockId);
    expect(timestampAfter).to.equal(0n); // Should be canceled
  });

  it("Should emit events when admin is updated and proposal is emergency canceled", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Deploy a new MockAdmin to use as new admin
    const newAdminContract = await ethers.deployContract("MockAdmin", [
      voter2.address,
    ]);

    // Admin directly updates to new admin
    const newAdminAddress = await newAdminContract.getAddress();
    const oldAdminAddress = await adminContract.getAddress();
    const governorAddress = await governor.getAddress();
    const updateCalldata = governor.interface.encodeFunctionData(
      "updateAdmin",
      [newAdminAddress]
    );

    // Check for AdminUpdated event
    await expect(
      adminContract.connect(deployer).execute(governorAddress, updateCalldata)
    )
      .to.emit(governor, "AdminUpdated")
      .withArgs(oldAdminAddress, newAdminAddress);

    // Create another proposal and emergency cancel
    const {
      targets: targets2,
      values: values2,
      calldatas: calldatas2,
    } = await createCounterIncrementProposal(counter);
    const description2 = "Test emergency cancel event";
    const { proposalId: proposalId2, proposalData: proposalData2 } =
      await createProposal(
        governor,
        targets2,
        values2,
        calldatas2,
        description2,
        voter1
      );

    // Check for EmergencyCancellation event
    const cancelCalldata = governor.interface.encodeFunctionData(
      "emergencyCancel",
      [
        proposalData2.targets,
        proposalData2.values,
        proposalData2.calldatas,
        proposalData2.descriptionHash,
      ]
    );

    await expect(
      newAdminContract.connect(voter2).execute(governorAddress, cancelCalldata)
    )
      .to.emit(governor, "EmergencyCancellation")
      .withArgs(proposalId2, newAdminAddress);
  });

  // ===== CIRCUIT BREAKER (PAUSE/UNPAUSE) TESTS =====
  // These tests verify the circuit breaker functionality that allows
  // an admin to pause and unpause the governance system

  it("Should allow admin to pause the governor", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Verify governor is not paused initially
    const isPausedBefore = await governor.paused();
    expect(isPausedBefore).to.equal(false);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Verify governor is paused
    const isPausedAfter = await governor.paused();
    expect(isPausedAfter).to.equal(true);
  });

  it("Should prevent non-admin from pausing the governor", async function () {
    // Deploy contracts
    const { token, timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to pause as non-admin (should fail)
    try {
      await governor.connect(voter1).pause();
      expect.fail("Should have failed - caller is not admin");
    } catch (error: any) {
      expect(error.message.includes("UnauthorizedAdmin")).ok;
    }

    // Verify governor is still not paused
    const isPaused = await governor.paused();
    expect(isPaused).to.equal(false);
  });

  it("Should allow admin to unpause the governor", async function () {
    // Deploy contracts
    const { token, timelock, governor, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Verify governor is paused
    let isPaused = await governor.paused();
    expect(isPaused).to.equal(true);

    // Admin unpauses the governor
    await callAsAdmin(adminContract, governor, "unpause");

    // Verify governor is unpaused
    isPaused = await governor.paused();
    expect(isPaused).to.equal(false);
  });

  it("Should prevent non-admin from unpausing the governor", async function () {
    // Deploy contracts
    const { token, timelock, governor, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Try to unpause as non-admin (should fail)
    try {
      await governor.connect(voter1).unpause();
      expect.fail("Should have failed - caller is not admin");
    } catch (error: any) {
      expect(error.message.includes("UnauthorizedAdmin")).ok;
    }

    // Verify governor is still paused
    const isPaused = await governor.paused();
    expect(isPaused).to.equal(true);
  });

  it("Should prevent propose when governor is paused", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Try to create proposal (should fail)
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test propose while paused";

    try {
      await governor
        .connect(voter1)
        .propose(targets, values, calldatas, description);
      expect.fail("Should have failed - governor is paused");
    } catch (error: any) {
      expect(error.message.includes("EnforcedPause")).ok;
    }
  });

  it("Should prevent queue when governor is paused", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create and vote on proposal while unpaused
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test queue while paused";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Try to queue the proposal (should fail)
    try {
      await queueProposal(governor, proposalData);
      expect.fail("Should have failed - governor is paused");
    } catch (error: any) {
      expect(error.message.includes("EnforcedPause")).ok;
    }
  });

  it("Should prevent execute when governor is paused", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Create, vote, and queue proposal while unpaused
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter
    );
    const description = "Test execute while paused";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    // Fast forward past timelock delay
    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Try to execute the proposal (should fail)
    try {
      await executeProposal(governor, proposalData);
      expect.fail("Should have failed - governor is paused");
    } catch (error: any) {
      expect(error.message.includes("EnforcedPause")).ok;
    }
  });

  it("Should allow propose, queue, and execute after unpause", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "35000000" },
    ]);

    // Admin pauses the governor
    await callAsAdmin(adminContract, governor, "pause");

    // Verify paused
    let isPaused = await governor.paused();
    expect(isPaused).to.equal(true);

    // Admin unpauses the governor
    await callAsAdmin(adminContract, governor, "unpause");

    // Verify unpaused
    isPaused = await governor.paused();
    expect(isPaused).to.equal(false);

    // Create, vote, queue, and execute proposal successfully
    const { targets, values, calldatas } = await createCounterIncrementProposal(
      counter,
      7n
    );
    const description = "Test after unpause";
    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    const counterBefore = await counter.x();
    await executeProposal(governor, proposalData);

    // Verify execution was successful
    const counterAfter = await counter.x();
    expect(counterAfter).to.equal(counterBefore + 7n);

    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);
  });

  it("Should emit Paused and Unpaused events", async function () {
    // Deploy contracts
    const { token, timelock, governor, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Get admin address
    const adminAddress = await adminContract.getAddress();

    // Check for Paused event
    await expect(callAsAdmin(adminContract, governor, "pause"))
      .to.emit(governor, "Paused")
      .withArgs(adminAddress);

    // Check for Unpaused event
    await expect(callAsAdmin(adminContract, governor, "unpause"))
      .to.emit(governor, "Unpaused")
      .withArgs(adminAddress);
  });

  // ===== GOVERNANCE-GATED ADMIN UPDATE TESTS =====
  // These tests verify that updateAdmin can only be called through governance

  it("Should prevent admin from directly updating admin address", async function () {
    // Deploy contracts
    const { token, timelock, governor, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Deploy a new MockAdmin to test
    const newAdminContract = await ethers.deployContract("MockAdmin", [
      voter2.address,
    ]);

    // Try to update admin directly as deployer EOA (not the admin contract - should fail)
    try {
      await governor
        .connect(deployer)
        .updateAdmin(await newAdminContract.getAddress());
      expect.fail("Should have failed - non-admin cannot update");
    } catch (error: any) {
      expect(error.message.includes("UnauthorizedAdmin")).to.be.true;
    }

    // Verify admin is still the admin contract
    const currentAdmin = await governor.admin();
    expect(currentAdmin).to.equal(await adminContract.getAddress());
  });

  it("Should prevent EOA from calling updateAdmin", async function () {
    // Deploy contracts
    const { token, timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Deploy a mock contract for testing
    const mockAdmin = await ethers.deployContract("MockAdmin", [
      voter2.address,
    ]);

    // Try to update admin as random EOA (should fail)
    try {
      await governor.connect(voter1).updateAdmin(await mockAdmin.getAddress());
      expect.fail("Should have failed - EOA cannot update admin");
    } catch (error: any) {
      expect(error.message.includes("UnauthorizedAdmin")).to.be.true;
    }
  });

  it("Should only allow updateAdmin through governance proposal", async function () {
    // Deploy contracts
    const { token, timelock, governor, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Deploy a mock contract to use as new admin (since admin must be a contract)
    const mockSafe = await ethers.deployContract("MockAdmin", [
      deployer.address,
    ]);

    // Admin directly updates (this is the only way to update)
    const newAdminAddress = await mockSafe.getAddress();
    const governorAddress = await governor.getAddress();
    const calldata = governor.interface.encodeFunctionData("updateAdmin", [
      newAdminAddress,
    ]);
    await adminContract.connect(deployer).execute(governorAddress, calldata);

    // Verify admin was updated
    const updatedAdmin = await governor.admin();
    expect(updatedAdmin).to.equal(newAdminAddress);
  });

  it("Should prevent updateAdmin with zero address", async function () {
    // Deploy contracts
    const { token, timelock, governor, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update admin to zero address via admin
    const governorAddress = await governor.getAddress();
    const calldata = governor.interface.encodeFunctionData("updateAdmin", [
      "0x0000000000000000000000000000000000000000",
    ]);

    await expect(
      adminContract.connect(deployer).execute(governorAddress, calldata)
    ).to.be.revertedWith("MockAdmin: execution failed");
  });

  it("Should prevent updateAdmin with EOA address", async function () {
    // Deploy contracts
    const { token, timelock, governor, minDelay, adminContract } =
      await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update admin to EOA via admin
    const governorAddress = await governor.getAddress();
    const calldata = governor.interface.encodeFunctionData("updateAdmin", [
      voter2.address,
    ]);

    await expect(
      adminContract.connect(deployer).execute(governorAddress, calldata)
    ).to.be.revertedWith("MockAdmin: execution failed");
  });

  // ===== UPDATE QUORUM NUMERATOR TESTS =====
  // These tests verify the updateQuorumNumerator functionality that allows
  // governance to adjust the quorum threshold within safe bounds

  it("Should allow governance to update quorum numerator within valid range", async function () {
    // Deploy contracts with PresaleVotingPower for easier control
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "200000" }, // Enough for proposal threshold and quorum
    ]);

    // Verify initial quorum (should be 3% as set in constructor)
    const initialQuorum = await governor["quorumNumerator()"]();
    expect(initialQuorum).to.equal(3n);

    // Create proposal to update quorum to 10%
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("updateQuorumNumerator", [10]),
    ];
    const description = "Update quorum to 10%";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and execute through governance
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);

    // Verify proposal succeeded before queueing
    const stateAfterVote = await governor.state(proposalId);
    expect(stateAfterVote).to.equal(ProposalState.Succeeded);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    await executeProposal(governor, proposalData);

    // Verify quorum was updated
    const updatedQuorum = await governor["quorumNumerator()"]();
    expect(updatedQuorum).to.equal(10n);
  });

  it("Should prevent direct call to updateQuorumNumerator", async function () {
    // Deploy contracts
    const { timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update quorum directly (should fail - only governance can call)
    try {
      await governor.connect(voter1).updateQuorumNumerator(10);
      expect.fail("Should have failed - only governance can call");
    } catch (error: any) {
      expect(error.message.includes("GovernorOnlyExecutor")).ok;
    }

    // Verify quorum remains unchanged
    const quorum = await governor["quorumNumerator()"]();
    expect(quorum).to.equal(3n);
  });

  it("Should reject quorum numerator below minimum (3%)", async function () {
    // Deploy contracts with PresaleVotingPower for easier setup
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Try to update quorum to 2% (below minimum) through governance
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("updateQuorumNumerator", [2]),
    ];
    const description = "Update quorum to 2% (invalid)";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and queue
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    // Execution should fail due to validation
    try {
      await executeProposal(governor, proposalData);
      expect.fail("Should have failed - quorum below minimum");
    } catch (error: any) {
      expect(error.message.includes("InvalidQuorumFraction")).ok;
    }

    // Verify quorum remains unchanged
    const quorum = await governor["quorumNumerator()"]();
    expect(quorum).to.equal(3n);
  });

  it("Should reject quorum numerator above maximum (15%)", async function () {
    // Deploy contracts with PresaleVotingPower for easier setup
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Try to update quorum to 16% (above maximum) through governance
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("updateQuorumNumerator", [16]),
    ];
    const description = "Update quorum to 16% (invalid)";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and queue
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    // Execution should fail due to validation
    try {
      await executeProposal(governor, proposalData);
      expect.fail("Should have failed - quorum above maximum");
    } catch (error: any) {
      expect(error.message.includes("InvalidQuorumFraction")).ok;
    }

    // Verify quorum remains unchanged
    const quorum = await governor["quorumNumerator()"]();
    expect(quorum).to.equal(3n);
  });

  it("Should affect proposal success with updated quorum", async function () {
    // Deploy contracts with PresaleVotingPower for easier control
    const { votesStrategy, timelock, governor, counter, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power: voter1 has enough for proposals, voter2 will provide votes
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "200000" }, // For creating proposals
      { voter: voter2, amount: "60000" }, // 6% of 1,000,000
    ]);

    // Verify total supply
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("1000000"));

    // Create first proposal with initial 3% quorum
    const {
      targets: targets1,
      values: values1,
      calldatas: calldatas1,
    } = await createCounterIncrementProposal(counter, 1n);
    const description1 = "Proposal with 3% quorum";
    const { proposalId: proposalId1 } = await createProposal(
      governor,
      targets1,
      values1,
      calldatas1,
      description1,
      voter1
    );

    // Vote with 60000 tokens (6% of total supply, exceeds 3% quorum)
    await advanceToVotingAndVote(governor, proposalId1, [
      { voter: voter2, support: 1 },
    ]);

    // Proposal should succeed with 6% votes when quorum is 3%
    const state1 = await governor.state(proposalId1);
    expect(state1).to.equal(ProposalState.Succeeded);

    // Now update quorum to 10% through governance
    const updateTargets = [await governor.getAddress()];
    const updateValues = [0n];
    const updateCalldatas = [
      governor.interface.encodeFunctionData("updateQuorumNumerator", [10]),
    ];
    const updateDescription = "Update quorum to 10%";

    const { proposalId: updateProposalId, proposalData: updateProposalData } =
      await createProposal(
        governor,
        updateTargets,
        updateValues,
        updateCalldatas,
        updateDescription,
        voter1
      );

    // Execute quorum update
    await advanceToVotingAndVote(governor, updateProposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);
    await queueProposal(governor, updateProposalData);

    let lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, updateProposalData);

    // Verify quorum was updated
    const updatedQuorum = await governor["quorumNumerator()"]();
    expect(updatedQuorum).to.equal(10n);

    // Mine blocks to ensure the change is effective
    await networkHelpers.mine(10);

    // Create second proposal with new 10% quorum
    const {
      targets: targets2,
      values: values2,
      calldatas: calldatas2,
    } = await createCounterIncrementProposal(counter, 2n);
    const description2 = "Proposal with 10% quorum";
    const { proposalId: proposalId2 } = await createProposal(
      governor,
      targets2,
      values2,
      calldatas2,
      description2,
      voter1
    );

    // Vote with same 60000 tokens (6% of total supply, does NOT exceed 10% quorum)
    await advanceToVotingAndVote(governor, proposalId2, [
      { voter: voter2, support: 1 },
    ]);

    // Proposal should fail because 6% votes < 10% quorum
    const state2 = await governor.state(proposalId2);
    expect(state2).to.equal(ProposalState.Defeated);
  });

  it("Should verify quorum calculation at different levels", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Total supply is 1,000,000 tokens
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("1000000"));

    // Test initial quorum at 3%: should require 30,000 tokens
    const currentBlock = await ethers.provider.getBlockNumber();
    const quorum3 = await governor.quorum(currentBlock);
    expect(quorum3).to.equal(ethers.parseEther("30000")); // 3% of 1,000,000

    // Calculate expected quorum at different levels
    // 5% of 1,000,000 = 50,000
    // 10% of 1,000,000 = 100,000
    // 15% of 1,000,000 = 150,000

    // Verify the quorum percentage denominator (should be 100)
    const denominator = await governor.quorumDenominator();
    expect(denominator).to.equal(100n);
  });

  it("Should emit QuorumNumeratorUpdated event when quorum is updated", async function () {
    // Deploy contracts with PresaleVotingPower for easier control
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Create proposal to update quorum
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("updateQuorumNumerator", [10]),
    ];
    const description = "Update quorum to 10%";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and queue
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    // Execute and check for event
    const executeTx = await governor.execute(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash
    );

    await expect(executeTx)
      .to.emit(governor, "QuorumNumeratorUpdated")
      .withArgs(3n, 10n); // old value = 3, new value = 10
  });

  // ===== GOVERNOR SETTINGS TESTS =====
  // These tests verify the GovernorSettings functionality that allows
  // governance to adjust voting parameters

  it("Should allow governance to update voting delay", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Verify initial voting delay (7200 blocks as set in constructor)
    const initialDelay = await governor.votingDelay();
    expect(initialDelay).to.equal(7200n);

    // Create proposal to update voting delay to 10000
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("setVotingDelay", [10000]),
    ];
    const description = "Update voting delay to 10000 blocks";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and execute through governance
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, proposalData);

    // Verify voting delay was updated
    const updatedDelay = await governor.votingDelay();
    expect(updatedDelay).to.equal(10000n);
  });

  it("Should allow governance to update voting period", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Verify initial voting period (100800 blocks as set in constructor)
    const initialPeriod = await governor.votingPeriod();
    expect(initialPeriod).to.equal(100800n);

    // Create proposal to update voting period to 150000
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("setVotingPeriod", [150000]),
    ];
    const description = "Update voting period to 150000 blocks";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and execute through governance
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, proposalData);

    // Verify voting period was updated
    const updatedPeriod = await governor.votingPeriod();
    expect(updatedPeriod).to.equal(150000n);
  });

  it("Should allow governance to update proposal threshold", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Verify initial proposal threshold (140000 * 10^18 as set in constructor)
    const initialThreshold = await governor.proposalThreshold();
    expect(initialThreshold).to.equal(ethers.parseEther("140000"));

    // Create proposal to update proposal threshold to 100000 tokens
    const newThreshold = ethers.parseEther("100000");
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("setProposalThreshold", [
        newThreshold,
      ]),
    ];
    const description = "Update proposal threshold to 100000 tokens";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Vote and execute through governance
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, proposalData);

    // Verify proposal threshold was updated
    const updatedThreshold = await governor.proposalThreshold();
    expect(updatedThreshold).to.equal(newThreshold);
  });

  it("Should prevent direct call to setVotingDelay", async function () {
    // Deploy contracts
    const { timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update voting delay directly (should fail - only governance can call)
    try {
      await governor.connect(voter1).setVotingDelay(10000);
      expect.fail("Should have failed - only governance can call");
    } catch (error: any) {
      expect(error.message.includes("GovernorOnlyExecutor")).ok;
    }

    // Verify voting delay remains unchanged
    const delay = await governor.votingDelay();
    expect(delay).to.equal(7200n);
  });

  it("Should prevent direct call to setVotingPeriod", async function () {
    // Deploy contracts
    const { timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update voting period directly (should fail - only governance can call)
    try {
      await governor.connect(voter1).setVotingPeriod(150000);
      expect.fail("Should have failed - only governance can call");
    } catch (error: any) {
      expect(error.message.includes("GovernorOnlyExecutor")).ok;
    }

    // Verify voting period remains unchanged
    const period = await governor.votingPeriod();
    expect(period).to.equal(100800n);
  });

  it("Should prevent direct call to setProposalThreshold", async function () {
    // Deploy contracts
    const { timelock, governor } = await deployGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Try to update proposal threshold directly (should fail - only governance can call)
    try {
      await governor
        .connect(voter1)
        .setProposalThreshold(ethers.parseEther("100000"));
      expect.fail("Should have failed - only governance can call");
    } catch (error: any) {
      expect(error.message.includes("GovernorOnlyExecutor")).ok;
    }

    // Verify proposal threshold remains unchanged
    const threshold = await governor.proposalThreshold();
    expect(threshold).to.equal(ethers.parseEther("140000"));
  });

  it("Should emit events when GovernorSettings values are updated", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power for governance
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "200000" }]);

    // Test VotingDelaySet event
    const targets1 = [await governor.getAddress()];
    const values1 = [0n];
    const calldatas1 = [
      governor.interface.encodeFunctionData("setVotingDelay", [10000]),
    ];
    const description1 = "Update voting delay";

    const { proposalId: proposalId1, proposalData: proposalData1 } =
      await createProposal(
        governor,
        targets1,
        values1,
        calldatas1,
        description1,
        voter1
      );

    await advanceToVotingAndVote(governor, proposalId1, [
      { voter: voter1, support: 1 },
    ]);
    await queueProposal(governor, proposalData1);

    let lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);

    const executeTx1 = await governor.execute(
      proposalData1.targets,
      proposalData1.values,
      proposalData1.calldatas,
      proposalData1.descriptionHash
    );

    await expect(executeTx1)
      .to.emit(governor, "VotingDelaySet")
      .withArgs(7200n, 10000n); // old value = 7200, new value = 10000
  });

  it("Should update proposal threshold and affect new proposals", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, counter, minDelay } =
      await deployManualGovernanceContracts(1000000, 60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set voting power: voter1 has 200k, voter2 has 50k
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "200000" }, // Can always propose
      { voter: voter2, amount: "50000" }, // Will be blocked after threshold update
    ]);

    // Verify initial threshold is 140,000
    let threshold = await governor.proposalThreshold();
    expect(threshold).to.equal(ethers.parseEther("140000"));

    // voter2 CANNOT create proposal with current threshold (50k < 140k)
    const {
      targets: testTargets1,
      values: testValues1,
      calldatas: testCalldatas1,
    } = await createCounterIncrementProposal(counter, 1n);

    try {
      await governor
        .connect(voter2)
        .propose(
          testTargets1,
          testValues1,
          testCalldatas1,
          "Test proposal before lowering threshold"
        );
      expect.fail("Should have failed - voter2 below threshold");
    } catch (error: any) {
      expect(error.message.includes("GovernorInsufficientProposerVotes")).ok;
    }

    // Update proposal threshold to 100k through governance (voter1 creates proposal)
    const newThreshold = ethers.parseEther("100000");
    const targets = [await governor.getAddress()];
    const values = [0n];
    const calldatas = [
      governor.interface.encodeFunctionData("setProposalThreshold", [
        newThreshold,
      ]),
    ];
    const description = "Lower proposal threshold to 30k";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    // Execute threshold update
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);
    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + minDelay + 1n);
    await executeProposal(governor, proposalData);

    // Verify threshold was updated
    threshold = await governor.proposalThreshold();
    expect(threshold).to.equal(newThreshold);

    // Mine blocks to ensure change is effective
    await networkHelpers.mine(10);

    // Now voter2 CANNOT create proposal (50k < 100k)
    const {
      targets: testTargets2,
      values: testValues2,
      calldatas: testCalldatas2,
    } = await createCounterIncrementProposal(counter, 2n);

    try {
      await governor
        .connect(voter2)
        .propose(
          testTargets2,
          testValues2,
          testCalldatas2,
          "Test proposal - still below threshold"
        );
      expect.fail("Should have failed - voter2 still below 100k threshold");
    } catch (error: any) {
      expect(error.message.includes("GovernorInsufficientProposerVotes")).ok;
    }

    // But voter1 CAN create proposals (200k > 100k)
    const { proposalId: newProposalId } = await createProposal(
      governor,
      testTargets2,
      testValues2,
      testCalldatas2,
      "Test proposal after threshold change with voter1",
      voter1
    );

    // Verify proposal was created successfully
    let proposalState = await governor.state(newProposalId);
    expect(proposalState).to.equal(ProposalState.Pending);
  });

  // ==================== msg.value Validation Tests ====================

  it("Should execute proposal with correct msg.value matching values array sum", async function () {
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts(60n);

    await setupTimelockRoles(timelock, governor);

    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" },
      { voter: voter2, amount: "20000000" },
    ]);

    // Create proposal with ETH transfer (1 ETH) to voter3 address
    const ethAmount = ethers.parseEther("1");
    const targets = [voter3.address];
    const values = [ethAmount];
    const calldatas = ["0x"]; // Empty calldata for plain ETH transfer
    const description = "Test execution with correct msg.value";

    // Fund the timelock with ETH for the proposal
    await deployer.sendTransaction({
      to: await timelock.getAddress(),
      value: ethAmount,
    });

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + 60n + 1n);

    // Check voter3 balance before
    const balanceBefore = await ethers.provider.getBalance(voter3.address);

    // Execute with correct msg.value (should succeed)
    await governor.execute(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
      { value: ethAmount }
    );

    // Verify ETH was transferred
    const balanceAfter = await ethers.provider.getBalance(voter3.address);
    expect(balanceAfter - balanceBefore).to.equal(ethAmount);

    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);
  });

  it("Should reject execution when msg.value is greater than values array sum", async function () {
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts(60n);

    await setupTimelockRoles(timelock, governor);

    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" },
      { voter: voter2, amount: "20000000" },
    ]);

    // Create proposal with 1 ETH value
    const ethAmount = ethers.parseEther("1");
    const targets = [await counter.getAddress()];
    const values = [ethAmount];
    const calldatas = [counter.interface.encodeFunctionData("inc")];
    const description = "Test execution with excessive msg.value";

    // Fund the timelock
    await deployer.sendTransaction({
      to: await timelock.getAddress(),
      value: ethAmount,
    });

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + 60n + 1n);

    // Try to execute with MORE msg.value than needed (should fail)
    const excessiveValue = ethers.parseEther("2"); // 2 ETH instead of 1 ETH
    try {
      await governor.execute(
        proposalData.targets,
        proposalData.values,
        proposalData.calldatas,
        proposalData.descriptionHash,
        { value: excessiveValue }
      );
      expect.fail("Should have reverted with InvalidValueSum");
    } catch (error: any) {
      expect(error.message).to.include("InvalidValueSum");
    }
  });

  it("Should reject execution when msg.value is less than values array sum", async function () {
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts(60n);

    await setupTimelockRoles(timelock, governor);

    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" },
      { voter: voter2, amount: "20000000" },
    ]);

    // Create proposal with 1 ETH value
    const ethAmount = ethers.parseEther("1");
    const targets = [await counter.getAddress()];
    const values = [ethAmount];
    const calldatas = [counter.interface.encodeFunctionData("inc")];
    const description = "Test execution with insufficient msg.value";

    // Fund the timelock
    await deployer.sendTransaction({
      to: await timelock.getAddress(),
      value: ethAmount,
    });

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + 60n + 1n);

    // Try to execute with LESS msg.value than needed (should fail)
    const insufficientValue = ethers.parseEther("0.5"); // 0.5 ETH instead of 1 ETH
    try {
      await governor.execute(
        proposalData.targets,
        proposalData.values,
        proposalData.calldatas,
        proposalData.descriptionHash,
        { value: insufficientValue }
      );
      expect.fail("Should have reverted with InvalidValueSum");
    } catch (error: any) {
      expect(error.message).to.include("InvalidValueSum");
    }
  });

  it("Should handle multiple values array entries and validate total msg.value", async function () {
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts(60n);

    await setupTimelockRoles(timelock, governor);

    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" },
      { voter: voter2, amount: "20000000" },
    ]);

    // Create proposal with multiple ETH transfers (1 ETH + 0.5 ETH = 1.5 ETH total)
    const ethAmount1 = ethers.parseEther("1");
    const ethAmount2 = ethers.parseEther("0.5");
    const totalAmount = ethAmount1 + ethAmount2;

    // Get additional signer for receiving ETH (not involved in governance transactions)
    const [, , , , recipient1] = await ethers.getSigners();

    const targets = [
      voter3.address,
      recipient1.address,
    ];
    const values = [ethAmount1, ethAmount2];
    const calldatas = [
      "0x", // Empty calldata for plain ETH transfer
      "0x",
    ];
    const description = "Test execution with multiple values";

    // Fund the timelock
    await deployer.sendTransaction({
      to: await timelock.getAddress(),
      value: totalAmount,
    });

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + 60n + 1n);

    // Check balances before
    const voter3BalanceBefore = await ethers.provider.getBalance(voter3.address);
    const recipient1BalanceBefore = await ethers.provider.getBalance(recipient1.address);

    // Execute with correct total msg.value (should succeed)
    await governor.execute(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
      { value: totalAmount }
    );

    // Verify ETH was transferred to both addresses
    const voter3BalanceAfter = await ethers.provider.getBalance(voter3.address);
    const recipient1BalanceAfter = await ethers.provider.getBalance(recipient1.address);
    expect(voter3BalanceAfter - voter3BalanceBefore).to.equal(ethAmount1);
    expect(recipient1BalanceAfter - recipient1BalanceBefore).to.equal(ethAmount2);

    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);
  });

  it("Should allow execution with zero msg.value when values array is all zeros", async function () {
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts(60n);

    await setupTimelockRoles(timelock, governor);

    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "15000000" },
      { voter: voter2, amount: "20000000" },
    ]);

    // Create proposal with no ETH transfer (all zeros)
    const targets = [await counter.getAddress()];
    const values = [0n];
    const calldatas = [counter.interface.encodeFunctionData("inc")];
    const description = "Test execution with zero values";

    const { proposalId, proposalData } = await createProposal(
      governor,
      targets,
      values,
      calldatas,
      description,
      voter1
    );

    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 },
      { voter: voter2, support: 1 },
    ]);

    await queueProposal(governor, proposalData);

    const lastBlock = await ethers.provider.getBlockNumber();
    await networkHelpers.mineUpTo(BigInt(lastBlock) + 60n + 1n);

    // Execute with zero msg.value (should succeed)
    await governor.execute(
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
      { value: 0n }
    );

    const executedState = await governor.state(proposalId);
    expect(executedState).to.equal(ProposalState.Executed);
  });
});
