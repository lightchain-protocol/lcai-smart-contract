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
3. Deploys `LCAIChatUtility`, grants roles, and logs funding steps.
4. Records every address + constructor arg inside `data/deployments/` and prints explorer links for copy/paste.

## Minimal Governance Deployment (`deploy.ts`)
- Also deploys `BenchmarkRegistry` so even partial bring-ups have access to benchmark discovery.
- Summary output now includes the registry address; review `deploymentsHistory.json` after the script finishes.

## Node Onboarding Deployment (`deploy-node-onboarding.ts`)
Run:
```
pnpm hardhat run scripts/deployment/deploy-node-onboarding.ts --network <target>
```

What happens:
1. Deploys `NodeStaking` and `NodeOnboarding`.
2. Links `NodeStaking` to the onboarding registry.
3. Applies attestation policy defaults (MR_ENCLAVE allowlist enforcement, minimum TCB status, heartbeat timeout).
4. Optionally sets the attestation verifier and MR_ENCLAVE allowlist entries.

**Environment overrides:**
- `MIN_VALIDATOR_STAKE_ETH` (default: `32`)
- `MIN_WORKER_STAKE_ETH` (default: `1`)
- `UNBONDING_PERIOD_SECONDS` (default: `604800`)
- `ATTESTATION_VERIFIER_ADDRESS` (default: unset, disables attestation checks)
- `ENFORCE_ENCLAVE_ALLOWLIST` (default: `true`)
- `MR_ENCLAVE_ALLOWLIST` (default: empty, comma-separated list of `0x...` hashes)
- `MIN_TCB_STATUS` (default: `1`)
- `HEARTBEAT_TIMEOUT_SECONDS` (default: `300`)

**Policy notes:**
- When `ENFORCE_ENCLAVE_ALLOWLIST=true`, at least one MR_ENCLAVE hash should be set or attestation verification will revert.
- The attestation verifier must be deployed separately and referenced via `ATTESTATION_VERIFIER_ADDRESS`.

## ABI / SDK Consumption
- ABI exports live under `abi/*.json`. Regenerate by rerunning the deployment scripts (which call `saveAbi`) or by executing:
  ```
  node scripts/abi/saveAbi.js BenchmarkRegistry
  ```
- SDKs/CLIs can import `abi/BenchmarkRegistry.json` to issue `registerBenchmark`/`listBenchmarks*` calls.

## Verification & Post-Deploy Tasks
1. Verify contracts (e.g., `npx hardhat verify --network <target> <BenchmarkRegistryAddress>`).
2. Update downstream configs (`chat-api-service`, CLI, SDK) with the printed addresses.
3. Announce the deployment in Slack with explorer links and the LC-214 Jira ticket.
4. For production, rotate ownership/roles to the DAO timelock and revoke deployer privileges.
