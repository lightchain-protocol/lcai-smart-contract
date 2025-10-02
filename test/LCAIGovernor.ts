import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, encodeFunctionData, keccak256, toHex } from "viem";
import { network } from "hardhat";

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

interface GovernanceSetup {
  token: any;
  timelock: any;
  governor: any;
  counter: any;
  minDelay: bigint;
}

interface ManualGovernanceSetup {
  votesStrategy: any;
  timelock: any;
  governor: any;
  counter: any;
  minDelay: bigint;
}

interface ProposalData {
  targets: string[];
  values: bigint[];
  calldatas: string[];
  description: string;
  descriptionHash: string;
}

describe("LCAIGovernor", async function () {
  const { viem, networkHelpers } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, voter1, voter2, voter3] = await viem.getWalletClients();

  // ===== HELPER FUNCTIONS =====
  // These functions extract common patterns to reduce code duplication
  // and make tests more maintainable and readable

  // Helper function to deploy governance contracts
  async function deployGovernanceContracts(
    minDelay: bigint = 14400n
  ): Promise<GovernanceSetup> {
    const token = await viem.deployContract("Token");
    const timelock = await viem.deployContract("LCAITimeLock", [
      minDelay,
      [], // proposers (will be set to governor)
      [], // executors (will be set to governor)
      deployer.account.address,
    ]);
    const governor = await viem.deployContract("LCAIGovernor", [
      token.address,
      timelock.address,
    ]);
    const counter = await viem.deployContract("Counter", [timelock.address]);

    return { token, timelock, governor, counter, minDelay };
  }

  // Helper function to setup timelock roles
  async function setupTimelockRoles(
    timelock: any,
    governor: any
  ): Promise<void> {
    const proposerRole = await timelock.read.PROPOSER_ROLE();
    const executorRole = await timelock.read.EXECUTOR_ROLE();
    await timelock.write.grantRole([proposerRole, governor.address]);
    await timelock.write.grantRole([executorRole, governor.address]);
  }

  // Helper function to distribute tokens and delegate voting power
  async function distributeTokensAndDelegate(
    token: any,
    distributions: Array<{ voter: any; amount: string }>
  ): Promise<void> {
    for (const { voter, amount } of distributions) {
      await token.write.transfer([voter.account.address, parseEther(amount)]);
      await token.write.delegate([voter.account.address], {
        account: voter.account,
      });
    }

    // Mine a block to activate voting power
    await publicClient.waitForTransactionReceipt({
      hash: await distributions[0].voter.sendTransaction({
        to: distributions[0].voter.account.address,
        value: 0n,
      }),
    });
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
    const proposalTx = await governor.write.propose(
      [targets, values, calldatas, description],
      { account: proposer.account }
    );

    const proposalReceipt = await publicClient.waitForTransactionReceipt({
      hash: proposalTx,
    });

    const proposalEvents = await publicClient.getContractEvents({
      address: governor.address,
      abi: governor.abi,
      eventName: "ProposalCreated",
      fromBlock: proposalReceipt.blockNumber,
      toBlock: proposalReceipt.blockNumber,
    });

    const proposalId = (proposalEvents[0] as any).args.proposalId!;
    const descriptionHash = keccak256(toHex(description));

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
    governor: any,
    proposalId: bigint,
    votes: Array<{ voter: any; support: number }>
  ): Promise<void> {
    const deadline = await governor.read.proposalDeadline([proposalId]);
    await networkHelpers.mineUpTo(deadline - 100n);

    // Verify proposal is active
    const activeState = await governor.read.state([proposalId]);
    assert.equal(activeState, ProposalState.Active);

    // Cast votes
    for (const { voter, support } of votes) {
      await governor.write.castVote([proposalId, support], {
        account: voter.account,
      });
    }

    // Advance past voting period
    await networkHelpers.mineUpTo(deadline + 10n);
  }

  // Helper function to queue a proposal
  async function queueProposal(
    governor: any,
    proposalData: ProposalData
  ): Promise<void> {
    await governor.write.queue([
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);
  }

  // Helper function to execute a proposal
  async function executeProposal(
    governor: any,
    proposalData: ProposalData
  ): Promise<void> {
    await governor.write.execute([
      proposalData.targets,
      proposalData.values,
      proposalData.calldatas,
      proposalData.descriptionHash,
    ]);
  }

  // Helper function to create counter increment proposal data
  function createCounterIncrementProposal(
    counter: any,
    incrementBy: bigint = 1n
  ): { targets: string[]; values: bigint[]; calldatas: string[] } {
    const targets = [counter.address];
    const values = [0n];
    const calldatas = [
      encodeFunctionData({
        abi: counter.abi,
        functionName: incrementBy === 1n ? "inc" : "incBy",
        args: incrementBy === 1n ? [] : [incrementBy],
      }),
    ];
    return { targets, values, calldatas };
  }

  // Helper function to deploy governance contracts with ManualVotesStrategy
  async function deployManualGovernanceContracts(minDelay: bigint = 14400n): Promise<ManualGovernanceSetup> {
    const votesStrategy = await viem.deployContract("ManualVotesStrategy");
    const timelock = await viem.deployContract("LCAITimeLock", [
      minDelay,
      [], // proposers (will be set to governor)
      [], // executors (will be set to governor)
      deployer.account.address,
    ]);
    const governor = await viem.deployContract("LCAIGovernor", [
      votesStrategy.address,
      timelock.address,
    ]);
    const counter = await viem.deployContract("Counter", [timelock.address]);

    return { votesStrategy, timelock, governor, counter, minDelay };
  }

  // Helper function to set voting power for multiple accounts using ManualVotesStrategy
  async function setVotingPowers(
    votesStrategy: any,
    votingPowers: Array<{ voter: any; amount: string }>
  ): Promise<void> {
    const accounts = votingPowers.map(vp => vp.voter.account.address);
    const amounts = votingPowers.map(vp => parseEther(vp.amount));
    
    await votesStrategy.write.setVotingPowerBatch([accounts, amounts]);

    // Mine a block to ensure voting power is active
    await publicClient.waitForTransactionReceipt({
      hash: await votingPowers[0].voter.sendTransaction({
        to: votingPowers[0].voter.account.address,
        value: 0n,
      }),
    });
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
    const { targets, values, calldatas } = createCounterIncrementProposal(
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
    const initialState = await governor.read.state([proposalId]);
    assert.equal(initialState, ProposalState.Pending);

    // Advance to voting and cast votes
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For (20000 tokens)
      { voter: voter2, support: 1 }, // For (30000 tokens)
      { voter: voter3, support: 0 }, // Against (5000 tokens)
    ]);

    // Check proposal succeeded
    const succeededState = await governor.read.state([proposalId]);
    assert.equal(succeededState, ProposalState.Succeeded);

    // Queue the proposal
    await queueProposal(governor, proposalData);

    // Check proposal is queued
    const queuedState = await governor.read.state([proposalId]);
    assert.equal(queuedState, ProposalState.Queued);

    // Fast forward past timelock delay
    const lastBlock = await publicClient.getBlockNumber();
    await networkHelpers.mineUpTo(lastBlock + minDelay + 1n);

    // Check counter value before execution
    const counterBefore = await counter.read.x();
    assert.equal(counterBefore, 0n);

    // Execute the proposal
    await executeProposal(governor, proposalData);

    // Check proposal is executed
    const executedState = await governor.read.state([proposalId]);
    assert.equal(executedState, ProposalState.Executed);

    // Check counter was incremented
    const counterAfter = await counter.read.x();
    assert.equal(counterAfter, 5n);
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
    const { targets, values, calldatas } =
      createCounterIncrementProposal(counter);
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
    const finalState = await governor.read.state([proposalId]);
    assert.equal(finalState, ProposalState.Defeated);
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
    const { targets, values, calldatas } =
      createCounterIncrementProposal(counter);
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
      assert.fail("Should have failed due to timelock delay");
    } catch (error: any) {
      // Expected to fail
      assert.ok(error.message.includes("TimelockUnexpectedOperationState"));
    }

    // Fast forward past delay and execute successfully
    const deadline = await governor.read.proposalDeadline([proposalId]);
    await networkHelpers.mineUpTo(deadline + minDelay + 100n);
    await networkHelpers.mine();

    await executeProposal(governor, proposalData);

    // Verify execution
    const counterValue = await counter.read.x();
    assert.equal(counterValue, 1n);
  });

  // ===== MANUAL VOTES STRATEGY TESTS =====
  // These tests verify governance functionality using ManualVotesStrategy
  // instead of token-based voting, allowing admin-controlled voting power
  
  it("Should work with ManualVotesStrategy for voting power", async function () {
    // Deploy contracts with ManualVotesStrategy
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
    const voter1Power = await votesStrategy.read.getVotes([voter1.account.address]);
    const voter2Power = await votesStrategy.read.getVotes([voter2.account.address]);
    const voter3Power = await votesStrategy.read.getVotes([voter3.account.address]);
    assert.equal(voter1Power, parseEther("25000"));
    assert.equal(voter2Power, parseEther("35000"));
    assert.equal(voter3Power, parseEther("10000"));

    // Create proposal to increment counter by 3
    const { targets, values, calldatas } = createCounterIncrementProposal(counter, 3n);
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
    const initialState = await governor.read.state([proposalId]);
    assert.equal(initialState, ProposalState.Pending);

    // Advance to voting and cast votes
    await advanceToVotingAndVote(governor, proposalId, [
      { voter: voter1, support: 1 }, // For (25000 tokens)
      { voter: voter2, support: 1 }, // For (35000 tokens)
      { voter: voter3, support: 0 }, // Against (10000 tokens)
    ]);

    // Check proposal succeeded (60000 for vs 10000 against, meets quorum)
    const succeededState = await governor.read.state([proposalId]);
    assert.equal(succeededState, ProposalState.Succeeded);

    // Queue and execute the proposal
    await queueProposal(governor, proposalData);
    
    const lastBlock = await publicClient.getBlockNumber();
    await networkHelpers.mineUpTo(lastBlock + minDelay + 1n);
    
    const counterBefore = await counter.read.x();
    assert.equal(counterBefore, 0n);
    
    await executeProposal(governor, proposalData);

    // Verify execution
    const counterAfter = await counter.read.x();
    assert.equal(counterAfter, 3n);
    
    const executedState = await governor.read.state([proposalId]);
    assert.equal(executedState, ProposalState.Executed);
  });

  it("Should respect quorum with ManualVotesStrategy", async function () {
    // Deploy contracts with ManualVotesStrategy
    const { votesStrategy, timelock, governor, counter } = 
      await deployManualGovernanceContracts(60n);
    
    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Set up scenario where total supply is large but voter has insufficient power
    // Total supply will be 100000, voter1 gets only 1000 (1%), which is less than 4% quorum
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "1000" },   // 1000 tokens for voter1
      { voter: voter2, amount: "99000" },  // 99000 tokens for voter2 (won't vote)
    ]);

    // Verify total supply and that voter1 has insufficient power for quorum
    const totalSupply = await votesStrategy.read.totalSupply();
    assert.equal(totalSupply, parseEther("100000"));
    
    const voter1Power = await votesStrategy.read.getVotes([voter1.account.address]);
    assert.equal(voter1Power, parseEther("1000"));

    // Create a simple proposal
    const { targets, values, calldatas } = createCounterIncrementProposal(counter);
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
    const finalState = await governor.read.state([proposalId]);
    assert.equal(finalState, ProposalState.Defeated);
  });

  it("Should allow admin to update voting power dynamically", async function () {
    // Deploy contracts with ManualVotesStrategy
    const { votesStrategy, timelock, governor, counter } = 
      await deployManualGovernanceContracts(60n);
    
    // Setup timelock roles
    await setupTimelockRoles(timelock, governor);

    // Initially set low voting power
    await setVotingPowers(votesStrategy, [
      { voter: voter1, amount: "100" },
    ]);

    // Verify initial voting power
    let voter1Power = await votesStrategy.read.getVotes([voter1.account.address]);
    assert.equal(voter1Power, parseEther("100"));

    // Update voting power to higher amount
    await votesStrategy.write.setVotingPower([voter1.account.address, parseEther("50000")]);

    // Verify updated voting power
    voter1Power = await votesStrategy.read.getVotes([voter1.account.address]);
    assert.equal(voter1Power, parseEther("50000"));

    // Verify total supply was updated correctly
    const totalSupply = await votesStrategy.read.totalSupply();
    assert.equal(totalSupply, parseEther("50000"));

    // Mine a block to ensure changes are active
    await publicClient.waitForTransactionReceipt({
      hash: await voter1.sendTransaction({
        to: voter1.account.address,
        value: 0n,
      }),
    });

    // Create and vote on proposal with updated voting power
    const { targets, values, calldatas } = createCounterIncrementProposal(counter);
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
    const finalState = await governor.read.state([proposalId]);
    assert.equal(finalState, ProposalState.Succeeded);
  });

  it("Should prevent delegation in ManualVotesStrategy", async function () {
    // Deploy ManualVotesStrategy
    const { votesStrategy } = await deployManualGovernanceContracts();

    // Try to delegate (should fail)
    try {
      await votesStrategy.write.delegate([voter2.account.address], { account: voter1.account });
      assert.fail("Should have failed - delegation is disabled");
    } catch (error: any) {
      assert.ok(error.message.includes("Delegation disabled"));
    }

    // Verify delegates always returns address(0)
    const delegate = await votesStrategy.read.delegates([voter1.account.address]);
    assert.equal(delegate, "0x0000000000000000000000000000000000000000");
  });
});
