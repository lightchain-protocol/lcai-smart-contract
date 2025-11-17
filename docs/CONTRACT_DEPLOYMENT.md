# Contract Deployment Runbook

Use this guide when promoting the Week-5 contracts (DAO, access flow, benchmark catalog) to a new network.

## Prerequisites
- `pnpm install` (or `npm install`) from the repo root.
- Fund the deployer wallet and export `OWNER_WALLET_PRIVATE_KEY`, `ADMIN_CONTRACT_ADDRESS` (or enable `USE_MOCK_ADMIN=true` for local testing).
- Set `TIMELOCK_ADDRESS` / `ADMIN_ADDRESS` when invoking one-off scripts such as `deploy-lcai-treasury.ts`.

## End-to-End Deployment (`deploy-smart-contracts.ts`)
Run:
```
pnpm hardhat run scripts/deployment/deploy-smart-contracts.ts --network <target>
```

What happens:
1. Deploys `PresaleVotingPower`, `LCAITimeLock`, `LCAIGovernor`.
2. Deploys `BenchmarkRegistry` and writes `abi/BenchmarkRegistry.json`.
3. Deploys `AIVMTicketManager` and writes `abi/AIVMTicketManager.json`.
4. Deploys `AIVMModelRegistry` (requires `TREASURY_ADDRESS` env var, defaults to timelock) and writes `abi/AIVMModelRegistry.json`.
5. Deploys `LCAIChatUtility`, grants roles, and logs funding steps.
6. Records every address + constructor arg inside `data/deployments/` and prints explorer links for copy/paste.

## Staging/Testnet Deployment (`deploy-staging.ts`)
For deploying AIVM core contracts (AIVMModelRegistry, AIVMTicketManager, BenchmarkRegistry) to staging/testnet with verification and smoke tests:

```
pnpm hardhat run scripts/deployment/deploy-staging.ts --network <target>
```

Environment Variables:
- `TREASURY_ADDRESS` (optional): Treasury contract address for AIVMModelRegistry. Defaults to `TIMELOCK_ADDRESS` or deployer.
- `AGGREGATOR_ADDRESS` (optional): Aggregator address for AIVMModelRegistry. Defaults to deployer.
- `TIMELOCK_ADDRESS` (optional): Timelock address (used as treasury fallback).

What happens:
1. Deploys `BenchmarkRegistry`, `AIVMTicketManager`, and `AIVMModelRegistry`.
2. Verifies all contracts on the block explorer.
3. Runs smoke tests (owner checks, ticket issuance, registry queries).
4. Saves deployment artifact JSON with verification proofs to `data/deployments/staging-<network>-<timestamp>.json`.
5. Logs addresses to `data/deployments/deploymentsHistory.json`.

## Minimal Governance Deployment (`deploy.ts`)
- Also deploys `BenchmarkRegistry` so even partial bring-ups have access to benchmark discovery.
- Summary output now includes the registry address; review `deploymentsHistory.json` after the script finishes.

## ABI / SDK Consumption
- ABI exports live under `abi/*.json`. Regenerate by rerunning the deployment scripts (which call `saveAbi`) or by executing:
  ```
  node scripts/abi/saveAbi.js BenchmarkRegistry
  node scripts/abi/saveAbi.js AIVMTicketManager
  node scripts/abi/saveAbi.js AIVMModelRegistry
  ```
- SDKs/CLIs can import:
  - `abi/BenchmarkRegistry.json` to issue `registerBenchmark`/`listBenchmarks*` calls.
  - `abi/AIVMTicketManager.json` to issue `issueTicket`/`validateTicket`/`revokeTicket` calls.
  - `abi/AIVMModelRegistry.json` to issue `registerVariant`/`submitScore`/`requestDecryptionTicket`/`challengeVariant` calls.

## SDK/Environment Configuration
After deployment, update your SDK or environment configuration with the deployed addresses:

```bash
# Example .env or config file
AIVM_MODEL_REGISTRY_ADDRESS=0x...
AIVM_TICKET_MANAGER_ADDRESS=0x...
BENCHMARK_REGISTRY_ADDRESS=0x...
TREASURY_ADDRESS=0x...
AGGREGATOR_ADDRESS=0x...
```

The deployment scripts automatically save addresses to `data/deployments/deploymentsHistory.json` for reference.

## Verification & Post-Deploy Tasks
1. **Automatic Verification**: The `deploy-staging.ts` script automatically verifies all contracts. For manual verification:
   ```bash
   npx hardhat verify --network <target> <BenchmarkRegistryAddress>
   npx hardhat verify --network <target> <AIVMTicketManagerAddress>
   npx hardhat verify --network <target> <AIVMModelRegistryAddress> <TreasuryAddress>
   ```

2. **Update Downstream Configs**: Update `chat-api-service`, CLI, SDK, and frontend with the deployed addresses from `data/deployments/deploymentsHistory.json`.

3. **Smoke Tests**: The staging deployment script runs smoke tests automatically. For manual testing:
   - Register a base model on AIVMModelRegistry
   - Issue a ticket via AIVMTicketManager
   - Register a benchmark on BenchmarkRegistry

4. **Access Control Setup**: 
   - Grant aggregator role in AIVMModelRegistry (via `setAggregator`)
   - Transfer AIVMTicketManager ownership to DAO timelock (if needed)

5. **Announcement**: Share deployment addresses in Slack with explorer links and reference LC-217.

6. **Production Checklist**: For production deployments:
   - Rotate ownership/roles to the DAO timelock
   - Revoke deployer privileges
   - Archive verification logs and multisig approvals
   - Update all SDK/env templates with production addresses

