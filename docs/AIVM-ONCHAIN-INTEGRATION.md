# AIVM On-Chain Integration (LC-211)

This document captures the smart-contract updates introduced for LC-211 in support of the Week-5 on-chain integration roadmap.

## Aggregated Score Finalization
- `AIVMModelRegistry` now stores an `aggregator` address representing the off-chain median-of-means service.
- `submitAggregatedResult` replaces the previous owner-only validation entrypoint, requiring the caller to match the configured aggregator.
- `submitScore(variantId, score, reportCID)` is a convenience wrapper that derives validator counts from on-chain stakes so the aggregator only needs to provide the score/report payload promised in `CONTRACT_DEPLOYMENT.md`.
- The function records validator participation metadata, emits `AggregatedResultSubmitted`, toggles challenge windows, and drives approval/rejection based on policy thresholds.
- `setAggregator(address)` allows governance/operators to rotate the authorized off-chain service address without redeploying the registry.

## Access Policy Configuration
- Each variant can now be bound to an `AccessPolicyConfig` via `setAccessPolicy(variantId, requireTicket, minStakeRequired, ticketManager, ticketTTL)`.
- Policies are exposed through `getAccessPolicy`, enabling off-chain services (stake-gating, CLI preflight checks, etc.) to read the requirements without hard-coded configuration.
- Events (`AccessPolicyUpdated`) surface changes so downstream indexers or the access service can react in real time.
- Trainers and validators can call `requestDecryptionTicket(variantId)` once a variant is Approved/Finalized; the registry delegates to `AIVMTicketManager`, persists ticket receipts, and emits `DecryptionTicketRequested`.
- Helper views `getTicketReceipt`, `getAccountTicketIds`, and `getVariantTicketIds` give APIs/SDKs an easy way to display active tickets without re-querying multiple contracts.

## Challenge Outcome Recording
- A new helper `recordChallengeOutcome` delegates to the internal `_processChallengeOutcome` routine. This mirrors `resolveChallenge` but clarifies the integration point for the re-validation committee once a dispute is adjudicated.
- Dispute flow now matches the docs: `challengeVariant(variantId, evidenceCID, reason)` starts an on-chain challenge with stake + evidence, and `slashValidators(variantId, validatorAddresses, reason, rejectVariant, rewardChallenger)` lets governance target bad actors, close the challenge window, and optionally slash the trainer/issue challenger rewards.
- `getChallengeReceipt` exposes currently-active challenge metadata so the access service and dashboards can render pending disputes.

## Ticket Lifecycle Contract
- `AIVMTicketManager` is a lightweight Ownable + ReentrancyGuard contract responsible for issuing and revoking workflow access tickets.
- Core functions:
  - `issueTicket(wallet, variantId, ttl)` → emits `TicketIssued` with the derived ticket ID.
  - `validateTicket(ticketId, wallet, variantId)` → stateless verification used by APIs/CLIs.
  - `revokeTicket(ticketId)` → allows operators to invalidate compromised or expired tickets ahead of TTL.
  - `getTicket(ticketId)` → exposes issuance metadata for audit tooling.
- Tickets derive their ID from the wallet, variant, and block context, yielding unique per-request credentials without storing secrets on-chain.

## Tests
- `test/ModelRegistry.test.ts` now covers aggregator authorization and access policy read/write flows.
- `test/AIVMTicketManager.test.ts` validates ticket issuance, retrieval, validation, and revocation semantics using ethers v6 patterns.

## Benchmark Catalog Registry
- `BenchmarkRegistry.sol` is now part of `main` and stores encrypted benchmark metadata (domain, taskType, manifest hash, wrapped DEK) so validators can discover datasets without relying on off-chain spreadsheets.
- `registerBenchmark` is owner-gated (curated list) and automatically creates the default assignment for a domain/task pair while emitting `BenchmarkRegistered`.
- Assignment helpers (`setBenchmarkForDomainTask`, `getBenchmarkForVariant`) allow the DAO or curator to rotate benchmarks as new versions go live; queries revert if the benchmark is inactive.
- Listing helpers (`listBenchmarksByDomain`, `listBenchmarksByTask`, `listBenchmarks`) mirror the SDK requirements for surfacing catalog filters in the CLI and dashboard.
- Deployment scripts now emit the BenchmarkRegistry address, save its ABI under `abi/BenchmarkRegistry.json`, and include it in `data/deployments` so downstream services can pin to the same network coordinates.

## Next Steps
- Wire the access service (LC-206) to call `issueTicket`/`revokeTicket` as part of validator and trainer onboarding flows.
- Extend deployment scripts to surface the new contract addresses and aggregator configuration via deployment artifacts.
- Integrate aggregator CLI/SDK components so the new `AggregatedResultSubmitted` event feeds analytics and monitoring dashboards.
