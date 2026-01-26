# Deployment Scripts

This folder contains scripts for deploying smart contracts.

## Scripts

### Core Contracts
- **`deploy.ts`** - Main DAO governance system deployment script
- **`deploy-smart-contracts.ts`** - Complete deployment script for all contracts
- **`deploy-chat-utility.ts`** - Deployment script for chat utility contracts

### Individual Contract Deployments
- **`deploy-lcai-treasury.ts`** - Deploy LCAITreasury contract
- **`deploy-lcai-chat-subscription.ts`** - Deploy LCAIChatSubscription contract
- **`deploy-node-onboarding.ts`** - Deploy NodeStaking + NodeOnboarding with attestation policy defaults

## Usage

### Deploy Complete System

```bash
# Deploy DAO governance system
npx hardhat run scripts/deployment/deploy.ts --network <network-name>

# Deploy all contracts (DAO + Chat Utility)
npx hardhat run scripts/deployment/deploy-smart-contracts.ts --network <network-name>

# Deploy chat utility only
npx hardhat run scripts/deployment/deploy-chat-utility.ts --network <network-name>

# Deploy node onboarding contracts
npx hardhat run scripts/deployment/deploy-node-onboarding.ts --network <network-name>
```

### Deploy Individual Contracts

#### LCAITreasury

```bash
# Set environment variables
export TIMELOCK_ADDRESS=0xYourTimelockAddress
export ADMIN_ADDRESS=0xYourMultisigAddress

# Deploy
npx hardhat run scripts/deployment/deploy-lcai-treasury.ts --network <network-name>
```

**Required Environment Variables:**
- `TIMELOCK_ADDRESS`: Address of the timelock contract (owner)
- `ADMIN_ADDRESS`: Address of the admin contract (must be multisig, NOT EOA)

**Important:** The admin address MUST be a contract (e.g., Gnosis Safe multisig), not an externally owned account (EOA). The deployment will revert if an EOA is provided.

#### LCAIChatSubscription

```bash
# Set environment variables
export TREASURY_ADDRESS=0xYourTreasuryAddress
export DEFAULT_ADMIN_ADDRESS=0xYourAdminAddress

# Deploy with default pricing
npx hardhat run scripts/deployment/deploy-lcai-chat-subscription.ts --network <network-name>

# Deploy with custom pricing
export UPDATE_PRICING=true
export TIER_1_MONTHLY=3
export TIER_1_YEARLY=30
export TIER_2_MONTHLY=6
export TIER_2_YEARLY=60
export TIER_3_MONTHLY=12
export TIER_3_YEARLY=120

npx hardhat run scripts/deployment/deploy-lcai-chat-subscription.ts --network <network-name>
```

**Required Environment Variables:**
- `TREASURY_ADDRESS`: Address where subscription payments will be sent
- `DEFAULT_ADMIN_ADDRESS`: Address of the default admin (can be EOA or contract)

**Optional Environment Variables:**
- `UPDATE_PRICING`: Set to "true" to update pricing after deployment
- `TIER_1_MONTHLY`: Tier 1 monthly price in LCAI (default: 2)
- `TIER_1_YEARLY`: Tier 1 yearly price in LCAI (default: 20)
- `TIER_2_MONTHLY`: Tier 2 monthly price in LCAI (default: 5)
- `TIER_2_YEARLY`: Tier 2 yearly price in LCAI (default: 50)
- `TIER_3_MONTHLY`: Tier 3 monthly price in LCAI (default: 10)
- `TIER_3_YEARLY`: Tier 3 yearly price in LCAI (default: 100)

**Default Pricing:**
- Tier 1: 2 LCAI/month, 20 LCAI/year
- Tier 2: 5 LCAI/month, 50 LCAI/year
- Tier 3: 10 LCAI/month, 100 LCAI/year

#### NodeStaking + NodeOnboarding

```bash
# Deploy with defaults
npx hardhat run scripts/deployment/deploy-node-onboarding.ts --network <network-name>

# Optional overrides
export MIN_VALIDATOR_STAKE_ETH=32
export MIN_WORKER_STAKE_ETH=1
export UNBONDING_PERIOD_SECONDS=604800
export ATTESTATION_VERIFIER_ADDRESS=0xYourVerifierAddress
export ENFORCE_ENCLAVE_ALLOWLIST=true
export MR_ENCLAVE_ALLOWLIST=0xYourMrEnclaveHash,0xAnotherMrEnclaveHash
export MIN_TCB_STATUS=1
export HEARTBEAT_TIMEOUT_SECONDS=300

npx hardhat run scripts/deployment/deploy-node-onboarding.ts --network <network-name>
```

**Defaults:**
- `MIN_VALIDATOR_STAKE_ETH`: 32
- `MIN_WORKER_STAKE_ETH`: 1
- `UNBONDING_PERIOD_SECONDS`: 604800 (7 days)
- `ENFORCE_ENCLAVE_ALLOWLIST`: true
- `MIN_TCB_STATUS`: 1
- `HEARTBEAT_TIMEOUT_SECONDS`: 300

**Notes:**
- If `ATTESTATION_VERIFIER_ADDRESS` is unset, attestation checks are disabled and `isAttested` stays false.
- If allowlist enforcement is enabled without any `MR_ENCLAVE_ALLOWLIST` entries, all attestations will be rejected.

## Example Workflow

### Deploy Treasury and Subscription Together

```bash
# 1. Deploy LCAITreasury first
export TIMELOCK_ADDRESS=0xYourTimelockAddress
export ADMIN_ADDRESS=0xYourMultisigAddress
npx hardhat run scripts/deployment/deploy-lcai-treasury.ts --network sepolia

# Output: LCAITreasury deployed at: 0xTreasuryAddress...

# 2. Deploy LCAIChatSubscription using treasury address
export TREASURY_ADDRESS=0xTreasuryAddress
export DEFAULT_ADMIN_ADDRESS=0xYourAdminAddress
npx hardhat run scripts/deployment/deploy-lcai-chat-subscription.ts --network sepolia

# Output: LCAIChatSubscription deployed at: 0xSubscriptionAddress...
```

## Post-Deployment

### Verify Contracts

```bash
# Verify LCAITreasury
npx hardhat verify --network <network> <TREASURY_ADDRESS> \
  "<TIMELOCK_ADDRESS>" \
  "<ADMIN_ADDRESS>"

# Verify LCAIChatSubscription
npx hardhat verify --network <network> <SUBSCRIPTION_ADDRESS> \
  "<TREASURY_ADDRESS>" \
  "<DEFAULT_ADMIN_ADDRESS>"
```

### Test Deployments

#### Test LCAITreasury
```bash
# Fund the treasury
cast send <TREASURY_ADDRESS> --value 100ether --rpc-url <RPC_URL>

# Check balance
cast call <TREASURY_ADDRESS> "getBalance()" --rpc-url <RPC_URL>
```

#### Test LCAIChatSubscription
```bash
# Check plan pricing
cast call <SUBSCRIPTION_ADDRESS> "getPlan(uint256)" 0 --rpc-url <RPC_URL>

# Subscribe to tier 1 monthly (2 LCAI)
cast send <SUBSCRIPTION_ADDRESS> "subscribe(uint256,uint256)" 0 0 \
  --value 2ether --rpc-url <RPC_URL> --private-key <KEY>

# Check subscription status
cast call <SUBSCRIPTION_ADDRESS> "hasActiveSubscription(address)" <USER_ADDRESS> \
  --rpc-url <RPC_URL>
```

## Notes

- Make sure to configure your `.env` file with the required private keys and RPC URLs
- Test deployments on testnet (e.g., Sepolia) before deploying to mainnet
- Always verify contracts after deployment
- Deployment data is saved to `deployments/` directory
- ABIs are saved to `src/blockchain/abi/` directory

## Troubleshooting

### LCAITreasury Issues

**Error: "AdminMustBeMultisig"**
- The admin address must be a contract, not an EOA
- Deploy a Gnosis Safe or use an existing multisig address

### LCAIChatSubscription Issues

**Error: "InvalidAddress"**
- Check that treasury and admin addresses are valid
- Ensure addresses are properly checksummed

**Subscription not working**
- Verify treasury address is correct
- Check that plans are active with `getPlan()`
- Ensure payment amount matches plan price

## Security Checklist

Before mainnet deployment:

- [ ] Audit all contract code
- [ ] Verify all addresses are correct
- [ ] Test on testnet first
- [ ] Confirm treasury/admin addresses
- [ ] Verify pricing is correct
- [ ] Ensure multisig signers are correct
- [ ] Test pause functionality
- [ ] Verify role assignments
- [ ] Document all admin keys/addresses
- [ ] Set up monitoring for contract events
