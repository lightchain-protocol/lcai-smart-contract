## Smart Contract Inventory

This folder contains the on-chain components that power the Lightchain staking, benchmarking, and chat-access flows. Each contract lives under `contracts/` with matching tests inside `test/` and ABI exports under `abi/`.

### BenchmarkRegistry.sol
- Ownable registry that records encrypted benchmark datasets and exposes helpers for domain/task discovery.
- Key functions: `registerBenchmark`, `setBenchmarkForDomainTask`, `setBenchmarkActive`, `getBenchmark`, `getBenchmarkForVariant`, `listBenchmarks*`.
- Events: `BenchmarkRegistered`, `BenchmarkAssignmentUpdated`, `BenchmarkStatusUpdated`.
- Deployment: automatically deployed by `scripts/deployment/deploy-smart-contracts.ts` and `scripts/deployment/deploy.ts`; addresses are logged to `data/deployments/*` and the ABI is written to `abi/BenchmarkRegistry.json`.

### AIVMModelRegistry.sol
- Stores model variants, aggregated score submissions, and access policy metadata.
- `submitScore` (aggregator-only) records the promised `score/reportCID` payload while deriving validator counts from on-chain stakes and emitting `ScoreSubmitted`.
- `requestDecryptionTicket` wraps `AIVMTicketManager.issueTicket`, persisting ticket receipts (`getTicketReceipt`, `getAccountTicketIds`, `getVariantTicketIds`) so downstream services have a single registry touchpoint.
- Integrates with `AIVMTicketManager` for ticket-aware access control.

### AIVMTicketManager.sol
- Issues/revokes workflow tickets that allow validators/trainers to decrypt benchmark data.
- Used by the access service (LC-206) and by the CLI to validate readiness.

### Treasury & Governance Contracts
- `LCAITreasury.sol`, `WLCAITreasury.sol`, `LCAIGovernor.sol`, `LCAITimeLock.sol`, and `PresaleVotingPower.sol` implement DAO governance controls.
- See `docs/AIVM-ONCHAIN-INTEGRATION.md` and `docs/CONTRACT_DEPLOYMENT.md` for deployment instructions and operator playbooks.

