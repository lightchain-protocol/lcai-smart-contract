# LCAI Core + DAO Smart Contracts (PoI + AIVM)

This package contains the on-chain contracts for the Lightchain AI testnet v2 stack. It covers **LCAI core protocol anchors** (AIVM inference, PoI attestations, model/benchmark registries, node onboarding & staking, dispute bonds) and **DAO governance/economics** (governor, timelock, treasury, chat payments & subscriptions).

Primary architecture references:
- `PoI_AIVM_Architecture_Document.pdf`
- `AIVM/AIVM Technical Lifecycle Flow.md`
- `PoI-Consensus/README.md`
- `PoI-Consensus/consensus-go/docs/POI_TASK_LIFECYCLE.md`
- `PoI-Consensus/consensus-go/docs/POI_SIGNING.md`
- `lcai-smart-contract/docs/AIVM-ONCHAIN-INTEGRATION.md`

## Scope and boundaries

**On-chain (this repo)**
- Inference request anchoring + PoI attestation quorum checks.
- Model/benchmark registries, access policy, ticket receipts.
- Node onboarding with attestation metadata, staking, and slashing hooks.
- Dispute bonds + challenge resolution hooks.
- DAO governance (Governor + Timelock) and treasuries.
- Chat utility and subscription economics.

**Off-chain / consensus layer (other repos)**
- PoI consensus engine (commit -> reveal -> verify -> attest -> aggregate -> finalize).
- Committee selection, VRF spot-checks, and data availability publishing.
- TEE quote verification at inference time and ZK spot-check execution.
- Consensus API (task submission, status lifecycle) and Geth-based execution layer.

## Protocol context (from PoI/AIVM docs)

- PoI = objective commitment (hash of inference + metadata) + TEE attestation binding that commitment to an approved enclave.
- Layers: User (UI/SDK/API gateway), Compute (TEE workers), Execution (EVM), Consensus & Verification (PoI + PoS, committee signatures, bonded challengers, dispute window).
- Node roles: Validators (PoI consensus + attestation verification), Workers (TEE inference + attestation generation), Challengers (permissionless bonded disputes).
- Lifecycle phases: Registration & node readiness -> Task initiation & committee selection -> Worker execution & objective commitment -> Validator verification & provisional finality -> Payload encryption & data availability -> Dispute window & slashing -> Settlement & hard finality.

Note: The documents define target parameters (committee size, dispute window length, spot-check probability). The contracts here implement the on-chain anchors; committee selection, DA publishing, and spot-check orchestration live in the consensus/off-chain stack.

## Design targets (from PoI/AIVM docs, largely off-chain)

These items are described in the architecture docs and are implemented in the consensus stack and services, not directly in Solidity:

- **Committee selection**: VRF-based committee selection (docs often cite N=6; consensus-go defaults may differ).
- **Provisional vs hard finality**: Provisional finality via K-of-N signatures; hard finality after the dispute window.
- **Encryption flow**: Prompt encrypted with a session key (Ks); response encrypted once with a response key (Kr). Validators only receive wrapped Kr when selected for spot-check/dispute.
- **Data availability**: Prompt/response artifacts published to IPFS; pinning and retrievability checks; optional DA layers (e.g., Celestia).
- **Spot checks**: VRF-triggered spot checks (rho ~ 1%) with optional ZK proofs.
- **Economics split**: Architecture docs cite 60/20/20 or 50/30/20 splits; on-chain settlement is currently simpler (see gaps section).

## Repository layout (quick guide)

- `contracts/` - Solidity contracts
- `scripts/` - deployment + utilities
- `docs/` - on-chain integration notes
- `abi/` - generated ABIs for off-chain bindings
- `data/deployments/` - deployment history
- `test/` - Hardhat tests

## Architecture -> contracts map

| Architecture component | Contracts in this repo | Notes |
| --- | --- | --- |
| ModelRegistry | `AIVMModelRegistry.sol` | Base models, variants, validation, challenges, access policy + ticket receipts |
| NodeRegistry | `NodeOnboarding.sol`, `NodeStaking.sol`, `LCAIValidatorRegistry.sol` | `NodeOnboarding` is the full registry; `LCAIValidatorRegistry` is the simple PoI attestation registry used by `AIVMInferenceV2` |
| AIInference | `AIVMInferenceV2.sol` | Request/commit/reveal + PoI attestations + fee settlement |
| ChatUtility | `LCAIChatUtility.sol` | Session storage, rewards, leaderboard, admin controls |
| PaymentSettlement | `AIVMInferenceV2.sol`, `LCAITreasury.sol` | Fee split handled on finalize; no standalone settlement contract yet |
| DisputeArbiter | `ChallengeBondEscrow.sol`, `AIVMInferenceV2.sol`, `AIVMModelRegistry.sol` | Bonded disputes and resolution hooks |
| SpotCheckVRF | (consensus/off-chain) | Not implemented as a standalone contract in this repo |

## Core contracts by domain

### LCAI core protocol (AIVM + PoI)

- `AIVMInferenceV2.sol`
  - On-chain anchor for inference requests without leaking prompt bytes (stores `promptHash` + `promptId`).
  - Worker flow: `requestInferenceV2` -> `commitInference` -> `revealInference`.
  - PoI bridge: validators submit EIP-712 attestations (`taskId`, `resultHash`, `transcriptHash`, `slot`).
  - Quorum enforced via `LCAIValidatorRegistry`; matching `resultHash` finalizes and releases fees.
  - Anti-spam + safety: min request fee, max pending per requester, worker bond, timeouts, challenge bond + resolver.

- `LCAIValidatorRegistry.sol`
  - Simple BLS-key registry with active flags used by `AIVMInferenceV2` for PoI quorum checks.

- `AIVMModelRegistry.sol`
  - Registers base models and model variants with IPFS CIDs and validation policy.
  - Aggregator submits aggregated results; contract manages approval, challenge windows, finalization.
  - Access policies per variant (ticket requirement, min stake), with ticket receipts stored on-chain.
  - Challenge flow with staking + governance slashing hooks.
  - **Staking uses native L1 value (msg.value)**, not an ERC20 token.

- `AIVMTicketManager.sol`
  - Issues and revokes short-lived access tickets used by validators/trainers.

- `BenchmarkRegistry.sol`
  - Curated registry of benchmark datasets (domain/task mapping, metadata, wrapped DEK, versioning).

- `NodeOnboarding.sol`
  - Registers validators/workers with BLS keys or node keys + TEE attestation quotes.
  - Tracks MR_ENCLAVE, TCB status, model readiness, heartbeats, exit/unbonding.
  - Optional allowlist for approved enclaves and TCB thresholds.

- `NodeStaking.sol`
  - Holds stake balances; integrates with NodeOnboarding to enforce safe withdrawals.
  - Supports slashing by authorized roles (consensus/dispute components).
  - **Staking uses native L1 value (msg.value)**, not an ERC20 token.

- `ChallengeBondEscrow.sol`
  - Minimal bond escrow for challenge/slashing flows.
  - Used by dispute resolvers to refund or slash bonds.

### DAO governance + economics

- `LCAIGovernor.sol`, `LCAITimeLock.sol`
  - OpenZeppelin-based Governor + Timelock for protocol upgrades and parameter changes.

- `PresaleVotingPower.sol`, `WLCAI.sol`
  - Voting strategies: manual voting power assignment or ETH-backed governance token.

- `LCAITreasury.sol`, `NativeLCAITreasury.sol`
  - Treasury contracts for protocol funds with whitelist/blacklist controls.

- `LCAIChatUtility.sol`
  - Stores chat session metadata, manages rewards, and exposes leaderboard stats.

- `LCAIChatSubscription.sol`, `NativeLCAIChatSubscription.sol`
  - Tiered subscription payments (ERC20 or native) routed to treasury.

### Tokens & utilities

- `LightChainAIToken.sol`, `Token.sol`, `BaseToken.sol`, `WrappedToken.sol`, `WLCAI.sol`
- `LCAIAirdrop.sol`, `MultiSender.sol`, `Counter.sol`, mocks and test helpers

## AIVM lifecycle mapping (contract touchpoints)

Phase 1: Registration & node readiness
- Validators/workers stake via `NodeStaking` and register with `NodeOnboarding` using TEE attestation quotes.
- Validator keys can also be registered in `LCAIValidatorRegistry` for PoI attestation quorum checks.

Phase 2: Task initiation & committee selection
- Off-chain gateway/orchestrator selects committee (PoI consensus) and workers.
- Users pay/authorize access via `LCAIChatSubscription` / `LCAIChatUtility` (session storage + rewards).
- Request anchored on-chain via `AIVMInferenceV2.requestInferenceV2` with `promptHash`, `promptId`, `modelDigest`, `detConfigHash`.

Phase 3: Worker execution & objective commitment
- Worker locks bond and commits `commitInference`, then reveals `revealInference`.
- Response payload can be stored off-chain; on-chain stores the hash and an optional response string.

Phase 4: Validator verification & provisional finality
- Validators attest off-chain; attestations are submitted on-chain via `submitPoIAttestation`.
- `AIVMInferenceV2` finalizes once quorum is met and `resultHash` matches.

Phase 5: Payload encryption & data availability
- Prompt/response artifacts are published to IPFS/DA layers (off-chain); hashes/CIDs are anchored on-chain as needed.

Phase 6: Dispute window & slashing
- `AIVMInferenceV2.challenge` + `resolveChallenge` handle bonded disputes.
- `ChallengeBondEscrow` and `NodeStaking.slash` enforce economic penalties.
- `AIVMModelRegistry.challengeVariant` + `slashValidators` cover model validation disputes.

Phase 7: Settlement & rewards
- `AIVMInferenceV2` releases fees: worker payout + protocol fee to treasury.
- Chat rewards and subscription revenue flow into the treasury contracts.

## PoI consensus integration (consensus-go)

- The PoI consensus engine (see `PoI-Consensus/README.md`) coordinates commit -> reveal -> verify -> attest -> aggregate -> assemble -> fork-choice with validator networking and BLS signature aggregation.
- **PoI signing uses validator BLS keys as the single source of truth** (see `PoI-Consensus/consensus-go/docs/POI_SIGNING.md`).
- `consensus-go` consumes ABIs from `lcai-smart-contract/abi/` and deployment addresses from `lcai-smart-contract/data/deployments/` (see `PoI-Consensus/consensus-go/docs/CONTRACT_INTEGRATION.md`).

## Governance defaults (current contract settings)

`LCAIGovernor.sol` sets these defaults in its constructor:

| Parameter | Value |
| --- | --- |
| Voting delay | 7200 blocks |
| Voting period | 100800 blocks |
| Proposal threshold | 140,000 tokens |
| Quorum | 3% (governance can update to 3-15%) |

Timelock delay is set at deployment; see the deployment scripts for the value used per network.

## Roadmap checklist (docs vs current contracts)

The architecture docs describe the **target system**. The contracts here cover the on-chain anchors, but several items are still off-chain or not yet implemented in Solidity. Track them here with owners/PRs:

| Status | Roadmap item | Owner | PR/Issue |
| --- | --- | --- | --- |
| ☐ | **BLS attestation verification on-chain** (align with PoI aggregation; replace or extend EIP-712 ECDSA in `AIVMInferenceV2`) | TBD | TBD |
| ☐ | **TEE quote binding on-chain** (store/verify quote hash per task) | TBD | TBD |
| ☐ | **Batch merkle roots + DA proof verification** (InferenceRegistry-style contract) | TBD | TBD |
| ☐ | **Spot-check VRF + ZK proof hooks** (on-chain trigger/verification) | TBD | TBD |
| ☐ | **Validator reward settlement on-chain** (move from off-chain accounting to contract split) | TBD | TBD |
| ☐ | **Worker registry TEE encryption pubkey** (add `tee_encrypt_pubkey` field/flow) | TBD | TBD |
| ☐ | **Chat credits/session flow** (align contract interfaces with `deposit/createSession/deductCredits/withdraw` UX) | TBD | TBD |
| ☐ | **ModelRegistry MR_ENCLAVE mapping** (bind model IDs to MR_ENCLAVE at registry level) | TBD | TBD |
| ☐ | **requestInferenceV3 parity** (align API naming/flow with docs) | TBD | TBD |
| ☐ | **Consensus defaults sync** (document actual `committee_size`/`quorum_threshold` values used) | TBD | TBD |
| ☐ | **Off-chain payload storage only** (remove or gate on-chain response string) | TBD | TBD |
| ☐ | **Token staking alignment** (move staking from native value to LCAI token or document L1-native explicitly) | TBD | TBD |

These gaps are intentionally documented so the on-chain implementation stays honest and aligned with the consensus stack roadmap.

## Implementation status (per contract)

### Core protocol contracts

| Contract | Status | Notes |
| --- | --- | --- |
| `AIVMInferenceV2.sol` | Implemented | On-chain inference anchor + PoI attestation quorum |
| `AIVMModelRegistry.sol` | Implemented | Model/variant registry + validation + challenges |
| `AIVMTicketManager.sol` | Implemented | Short-lived access tickets |
| `BenchmarkRegistry.sol` | Implemented | Benchmark catalog + assignments |
| `NodeOnboarding.sol` | Implemented | Node registry + attestation metadata |
| `NodeStaking.sol` | Implemented | Native-value staking + slashing hooks |
| `LCAIValidatorRegistry.sol` | Implemented | Simple validator set for PoI quorum |
| `ChallengeBondEscrow.sol` | Implemented | Bond escrow for disputes |

### DAO governance + economics

| Contract | Status | Notes |
| --- | --- | --- |
| `LCAIGovernor.sol` | Implemented | Governor with timelock control |
| `LCAITimeLock.sol` | Implemented | Timelock controller |
| `PresaleVotingPower.sol` | Implemented | Manual voting power strategy |
| `WLCAI.sol` | Implemented | ETH-backed governance token |
| `LCAITreasury.sol` | Implemented | Treasury with whitelist/blacklist |
| `NativeLCAITreasury.sol` | Implemented | Native treasury variant |
| `LCAIChatUtility.sol` | Implemented | Sessions + rewards |
| `LCAIChatSubscription.sol` | Implemented | ERC20 subscription payments |
| `NativeLCAIChatSubscription.sol` | Implemented | Native subscription payments |

### Tokens, utilities, demos, tests

| Contract | Status | Notes |
| --- | --- | --- |
| `LightChainAIToken.sol` | Implemented | Token implementation (not wired into core flows) |
| `Token.sol` | Implemented | Utility/test token |
| `BaseToken.sol` | Implemented | Base token helper |
| `WrappedToken.sol` | Implemented | Wrapped token helper |
| `LCAIAirdrop.sol` | Implemented | Airdrop utility |
| `LCAIPresale.sol` | Implemented | Presale contract |
| `DummyLCAIPresale.sol` | Test/Demo | Dummy presale for testing |
| `MultiSender.sol` | Utility | Batch transfers |
| `Counter.sol` | Example | Example contract |
| `MockAdmin.sol` | Test/Helper | Deployment helper for admin role |
| `EthRejecter.sol` | Test/Helper | ETH-rejecting contract for tests |

## Getting started

### Prerequisites

- Node.js 22+
- npm or pnpm
- Git

### Install and compile

```bash
cd lcai-smart-contract
npm install
npx hardhat compile
```

### Environment setup

Create a `.env` file in `lcai-smart-contract/`:

```bash
cp .env.example .env
```

Edit `.env` with your private key and RPC URLs. See `.env.example` for the full list of variables.

### Running tests

```bash
npx hardhat test
```

## Deployment

### Makefile quick start

```bash
make help
make dev-setup
make deploy-all
```

### Lightchain testnet v2 deployment

```bash
pnpm install
pnpm deploy:testnet

# Optional follow-ups
pnpm deploy:testnet:treasury
pnpm deploy:testnet:chat-subscription
```

Deployment scripts write history to `data/deployments/`. The treasury/chat-subscription scripts also sync addresses into `lcai-testnet-v2/genesis/genesis_v2.json`, `lcai-testnet-v2/network/rpc/config/consensus.yaml`, and the local `.env` (see `scripts/deployment/utils/updateDeploymentArtifacts.ts`).

### Verify on Blockscout

```bash
pnpm exec hardhat verify --network lcai_testnet_v2 <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Challenge Bond Escrow (dispute bonds)

`ChallengeBondEscrow.sol` provides the minimal escrow used for challenge bonds.

- Owner: `LCAITimeLock`
- Roles: `RESOLVER_ROLE` can refund/slash bonds
- Config: `minBond`, `challengeWindowSecs`, `treasury`

Key methods:
- `postBond(bytes32 challengeId)` payable
- `refundBond(bytes32 challengeId, address to)` onlyResolver
- `slashBond(bytes32 challengeId, address beneficiary, uint256 amount)` onlyResolver

The dispute manager derives `challengeId = sha256(disputeID)` so off-chain disputes map 1:1 to on-chain events.

## Docs

- `lcai-smart-contract/docs/AIVM-ONCHAIN-INTEGRATION.md`
- `lcai-smart-contract/docs/CONTRACT_DEPLOYMENT.md`
- `PoI_AIVM_Architecture_Document.pdf`
- `AIVM/AIVM Technical Lifecycle Flow.md`
- `PoI-Consensus/README.md`
- `PoI-Consensus/consensus-go/docs/POI_TASK_LIFECYCLE.md`
- `PoI-Consensus/consensus-go/docs/CONTRACT_INTEGRATION.md`
