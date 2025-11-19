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

