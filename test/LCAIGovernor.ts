import { expect } from "chai";
import { network } from "hardhat";
import { LCAIGovernor } from "../types/ethers-contracts/LCAIGovernor.js";
import { Counter } from "../types/ethers-contracts/Counter.js";
import { PresaleVotingPower } from "../types/ethers-contracts/PresaleVotingPower.js";

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

const { ethers, networkHelpers } = await network.connect();
const [deployer, voter1, voter2, voter3] = await ethers.getSigners();

describe("LCAIGovernor", function () {
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
    const governor = await ethers.deployContract("LCAIGovernor", [
      await token.getAddress(),
      await timelock.getAddress(),
    ]);
    const counter = await ethers.deployContract("Counter", [
      await timelock.getAddress(),
    ]);

    return { token, timelock, governor, counter, minDelay };
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
  async function deployManualGovernanceContracts(minDelay: bigint = 14400n) {
    const votesStrategy = await ethers.deployContract("PresaleVotingPower");
    const timelock = await ethers.deployContract("LCAITimeLock", [
      minDelay,
      [], // proposers (will be set to governor)
      [], // executors (will be set to governor)
      deployer.address,
    ]);
    const governor = await ethers.deployContract("LCAIGovernor", [
      votesStrategy.getAddress(),
      timelock.getAddress(),
    ]);
    const counter = await ethers.deployContract("Counter", [
      timelock.getAddress(),
    ]);

    return { votesStrategy, timelock, governor, counter, minDelay };
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

  // Test governance with token-based voting and timelock
  it("Should create, vote on, and execute a proposal through timelock", async function () {
    // Deploy contracts
    const { token, timelock, governor, counter, minDelay } =
      await deployGovernanceContracts();

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Distribute tokens and delegate voting power
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "20000" },
      { voter: voter2, amount: "30000" },
      { voter: voter3, amount: "5000" },
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

    // Give small amount of tokens to voter1 (not enough for quorum)
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "10" }, // Insufficient for 4% quorum
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

    // Give enough tokens for quorum
    await distributeTokensAndDelegate(token, [
      { voter: voter1, amount: "50000" },
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
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "25000" },
      { voter: voter2, amount: "35000" },
      { voter: voter3, amount: "10000" },
    ]);

    // Verify voting power was set correctly
    const voter1Power = await votesStrategy.getVotes(voter1.address);
    const voter2Power = await votesStrategy.getVotes(voter2.address);
    const voter3Power = await votesStrategy.getVotes(voter3.address);
    expect(voter1Power).to.equal(ethers.parseEther("25000"));
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
      { voter: voter1, support: 1 }, // For (25000 tokens)
      { voter: voter2, support: 1 }, // For (35000 tokens)
      { voter: voter3, support: 0 }, // Against (10000 tokens)
    ]);

    // Check proposal succeeded (60000 for vs 10000 against, meets quorum)
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
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, counter } =
      await deployManualGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set up scenario where total supply is large but voter has insufficient power
    // Total supply will be 100000, voter1 gets only 1000 (1%), which is less than 4% quorum
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "1000" }, // 1000 tokens for voter1
      { voter: voter2, amount: "99000" }, // 99000 tokens for voter2 (won't vote)
    ]);

    // Verify total supply and that voter1 has insufficient power for quorum
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("100000"));

    const voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("1000"));

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
    // voter1 has 1000 tokens, but quorum is 4% of 100000 = 4000 tokens
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For with 1000 tokens (insufficient for 4000 token quorum)
    ]);

    // Check proposal failed due to insufficient quorum
    const finalState = await governor.state(proposalId);
    expect(finalState).to.equal(ProposalState.Defeated);
  });

  it("Should allow admin to update voting power dynamically", async function () {
    // Deploy contracts with PresaleVotingPower
    const { votesStrategy, timelock, governor, counter } =
      await deployManualGovernanceContracts(60n);

    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Initially set low voting power
    await setVotingPowers(votesStrategy, [{ voter: voter1, amount: "100" }]);

    // Verify initial voting power
    let voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("100"));

    // Update voting power to higher amount
    await votesStrategy.setVotingPower(
      voter1.address,
      ethers.parseEther("50000")
    );

    // Verify updated voting power
    voter1Power = await votesStrategy.getVotes(voter1.address);
    expect(voter1Power).to.equal(ethers.parseEther("50000"));

    // Verify total supply was updated correctly
    const totalSupply = await votesStrategy.totalSupply();
    expect(totalSupply).to.equal(ethers.parseEther("50000"));

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

    // Vote should now succeed with sufficient power
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For with 50000 tokens (sufficient for quorum)
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
});
