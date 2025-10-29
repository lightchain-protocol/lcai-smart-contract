# Gnosis Safe Emergency Admin - Deployment and Operation Runbook

## Overview
This runbook provides step-by-step instructions for deploying and operating the LCAIGovernor with a Gnosis Safe multisig as the emergency admin.

## Prerequisites

- 5 secure owner wallets created offline
- Deployed Timelock and Governor on the target network
- Access to Gnosis Safe Transaction Builder
- Foundry (for generating calldata) or Node.js with ethers.js

## Deployment Steps

### 1. Create Gnosis Safe

1. Navigate to https://app.safe.global/
2. Click "Create new Safe"
3. Select your target network
4. Add 5 owner addresses
5. Set threshold to 3 of 5
6. Review and deploy the Safe
7. **Document the Safe address** - you'll need this for deployment/configuration

### 2. Fund the Safe

Send sufficient ETH to the Safe address for gas costs (~0.1 ETH recommended for multiple emergency operations).

### 3. Deploy or Configure Governor

#### For New Deployment:

Deploy the LCAIGovernor with the Safe address as the `_admin` parameter:

```bash
# Using Hardhat
npx hardhat run scripts/deployment/deploy.ts --network <your-network>

# In your deployment script, pass Safe address as admin
const governor = await ethers.deployContract("LCAIGovernor", [
  tokenAddress,
  timelockAddress,
  safeAddress  // Your Gnosis Safe address
]);
```

#### For Existing Deployment:

If the Governor is already deployed with a different admin, you must update it through governance:

1. Create a governance proposal calling `updateAdmin(<SafeAddress>)`
2. Vote and pass the proposal
3. Queue the proposal in the timelock
4. Wait for the timelock delay to pass
5. Execute the proposal

Example proposal script:
```javascript
const targets = [governorAddress];
const values = [0];
const calldatas = [
  governorInterface.encodeFunctionData("updateAdmin", [safeAddress])
];
const description = "Transfer admin to Gnosis Safe multisig";

// Submit proposal through standard governance process
```

### 4. Verify Configuration

Run verification script:
```bash
# Create a verification script if needed
npx hardhat run scripts/deployment/verify-safe-admin.ts --network <your-network>
```

Or manually verify:
```javascript
const admin = await governor.admin();
console.log("Current admin:", admin);
console.log("Expected Safe address:", safeAddress);
// Verify admin.code.length > 0 (is a contract)
```

## Emergency Operations

### Emergency Cancel a Proposal

When you need to cancel a malicious or erroneous proposal:

#### Step 1: Gather Proposal Details

You need the exact parameters that were used to create the proposal:
- `targets[]` - Array of target addresses
- `values[]` - Array of ETH values
- `calldatas[]` - Array of function call data
- `descriptionHash` - keccak256 hash of the proposal description

```bash
# Get descriptionHash
cast keccak "$(cat proposal-description.txt)"
```

#### Step 2: Generate Calldata

**Option A: Using Foundry**

```bash
# Install foundry if needed
# curl -L https://foundry.paradigm.xyz | bash
# foundryup

# Generate calldata
cast calldata \
  "emergencyCancel(address[],uint256[],bytes[],bytes32)" \
  "[0xTargetAddress1,0xTargetAddress2]" \
  "[0,0]" \
  "[0xCalldata1,0xCalldata2]" \
  "0x<descriptionHash>"
```

**Option B: Using the Helper Script**

```bash
# Use the provided helper script
node scripts/gnosis-safe/generate-safe-calldata.mjs emergencyCancel \
  "0xTargetAddress1,0xTargetAddress2" \
  "0,0" \
  "0xCalldata1,0xCalldata2" \
  "Your proposal description"

# Or from a proposal JSON file
node scripts/gnosis-safe/generate-from-proposal.mjs path/to/proposal.json
```

See `scripts/gnosis-safe/README.md` for detailed usage instructions.

#### Step 3: Submit to Safe Transaction Builder

1. Go to your Safe at https://app.safe.global/
2. Click "New Transaction" → "Transaction Builder"
3. Enter contract details:
   - **Address**: `<LCAIGovernorAddress>`
   - **Value (ETH)**: `0`
   - **Data (Hex encoded)**: Paste the generated calldata
4. Review transaction details
5. Click "Create Batch"
6. Click "Send Batch"

#### Step 4: Collect Signatures

1. Share the transaction with other Safe owners
2. Each owner reviews and signs the transaction
3. Once 3 of 5 signatures are collected, execute the transaction

### Pause Governance

To freeze all governance operations (propose, queue, execute):

#### Generate Pause Calldata

```bash
# The pause() function selector
cast sig "pause()"
# Output: 0x8456cb59
```

Or use the helper script:
```bash
node scripts/gnosis-safe/generate-safe-calldata.mjs pause
```

#### Submit to Safe

1. Go to Safe Transaction Builder
2. **Address**: `<LCAIGovernorAddress>`
3. **Value**: `0`
4. **Data**: `0x8456cb59`
5. Submit, collect 3 signatures, and execute

### Unpause Governance

To restore governance operations:

#### Generate Unpause Calldata

```bash
# The unpause() function selector
cast sig "unpause()"
# Output: 0x3f4ba83a
```

#### Submit to Safe

1. Go to Safe Transaction Builder
2. **Address**: `<LCAIGovernorAddress>`
3. **Value**: `0`
4. **Data**: `0x3f4ba83a`
5. Submit, collect 3 signatures, and execute

## Verification and Monitoring

### Verify Emergency Cancel

After executing an emergency cancel:

```javascript
// Check proposal state
const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
const state = await governor.state(proposalId);
// state should be 2 (Canceled)

// Check for EmergencyCancellation event
const filter = governor.filters.EmergencyCancellation(proposalId);
const events = await governor.queryFilter(filter);
console.log("Emergency cancellation events:", events);
```

### Verify Pause State

```javascript
const isPaused = await governor.paused();
console.log("Governor paused:", isPaused);

// Check for Paused/Unpaused events
const pausedFilter = governor.filters.Paused();
const unpausedFilter = governor.filters.Unpaused();
```

## Security Best Practices

1. **Owner Key Management**
   - Store owner private keys offline in hardware wallets
   - Use different hardware wallets for each owner
   - Never store keys in cloud services or on internet-connected devices

2. **Transaction Verification**
   - Always verify transaction details before signing
   - Use multiple Safe UI instances to verify transaction data
   - Cross-check proposal IDs and calldata with on-chain data

3. **Emergency Response**
   - Maintain up-to-date contact information for all 5 owners
   - Establish communication channels for emergency coordination
   - Practice emergency response procedures periodically

4. **Monitoring**
   - Set up alerts for governance proposals
   - Monitor governor contract for unusual activity
   - Keep track of admin updates and verify after execution

5. **Access Control**
   - Only use the Safe for emergency operations
   - Never use owner wallets for other purposes
   - Regularly audit Safe transaction history

## Troubleshooting

### Transaction Fails: "UnauthorizedAdmin"

- Verify the Safe is the current admin: `await governor.admin()`
- Ensure the transaction is being sent from the Safe, not an owner wallet

### Transaction Fails: "GovernorUnexpectedProposalState"

- Cannot cancel already executed or canceled proposals
- Verify proposal state before attempting to cancel

### Transaction Fails: "EnforcedPause"

- Governor is currently paused
- You must unpause before normal operations can resume

### Cannot Find Proposal Data

- Query ProposalCreated events to get original proposal parameters
- Check governance frontend or block explorer for proposal details

## Support Contacts

- Technical Lead: [Contact Info]
- Safe Owners: [List of 5 owner contacts]
- Emergency Response Team: [Contact Info]

## References

- Gnosis Safe Documentation: https://docs.safe.global/
- OpenZeppelin Governor: https://docs.openzeppelin.com/contracts/governance
- Foundry Documentation: https://book.getfoundry.sh/

