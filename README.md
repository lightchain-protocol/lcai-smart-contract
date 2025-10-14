# LCAI DAO Governance System

A comprehensive decentralized governance system built with OpenZeppelin Governor contracts, featuring multiple voting strategies and timelock-controlled execution. This project demonstrates advanced DAO governance patterns with flexible voting power mechanisms.

## 🏗️ Architecture Overview

### Core Contracts

- **`LCAIGovernor.sol`** - Main governance contract with proposal creation, voting, and execution
- **`LCAITimeLock.sol`** - Timelock controller for delayed execution of approved proposals
- **`WLCAI.sol`** - ETH-backed governance token with 1:1 ETH deposits and withdrawals
- **`PresaleVotingPower.sol`** - Admin-controlled voting power assignment system
- **`Counter.sol`** - Example target contract for testing governance actions

### Governance Features

- ✅ **Proposal Creation & Voting** - Create proposals and vote with multiple support options
- ✅ **Timelock Protection** - 2-day delay between approval and execution for security
- ✅ **Quorum Requirements** - 4% of total voting power required for proposal validity
- ✅ **Multiple Voting Strategies** - Choose between token-based or admin-controlled voting
- ✅ **Delegation Support** - Token holders can delegate voting power (token strategy only)
- ✅ **Batch Operations** - Efficient multi-account voting power management

## 🎯 Voting Strategies

### 1. Token-Based Voting (`Token.sol`)

**Decentralized approach using ERC20 tokens**

```solidity
// Users acquire tokens and delegate to activate voting power
await token.write.transfer([voterAddress, parseEther("1000")]);
await token.write.delegate([voterAddress], { account: voter });
```

**Characteristics:**

- Market-driven voting power distribution
- Requires token acquisition and delegation
- Supports delegation chains
- Standard ERC20 compatibility

### 2. ETH-Backed Voting (`WLCAI.sol`)

**ETH-collateralized governance tokens with 1:1 backing**

```solidity
// Users deposit ETH to mint governance tokens
await user.sendTransaction({
  to: wLCAI.address,
  value: parseEther("10"), // Deposit 10 ETH
});
await wLCAI.write.delegate([voterAddress], { account: user });
```

**Characteristics:**

- ETH-backed governance tokens (1:1 ratio)
- Users must lock ETH to participate in governance
- Full delegation and snapshot support
- Withdraw ETH anytime by burning tokens
- No token economics - direct ETH commitment

### 3. Manual Votes Strategy (`PresaleVotingPower.sol`)

**Admin-controlled voting power assignment**

```solidity
// Admin directly sets voting power for any address
await votesStrategy.write.setVotingPower([voterAddress, parseEther("5000")]);
```

**Characteristics:**

- Full administrative control
- No token economics required
- Delegation disabled for security
- Flexible voting power distribution

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd lcai-dao

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### Environment Setup

**Required:** Create a `.env` file in the project root to securely store your private keys and configuration:

```bash
# Copy the example environment file
cp .env.example .env

# Or create manually
touch .env
```

**Edit your `.env` file** and replace the placeholder values:

```bash
# Required: Your wallet private key for deployments
OWNER_WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE  # Replace with your actual private key

# Optional: RPC URLs (uses defaults if not set)
SEPOLIA_RPC_URL=https://rpc.sepolia.org
LCAI_TESTNET_RPC_URL=https://light-testnet-rpc.lightchain.ai

# Optional: Sepolia deployment (uses hardhat-keystore if not set)
SEPOLIA_PRIVATE_KEY=0xYOUR_SEPOLIA_PRIVATE_KEY_HERE  # Replace if deploying to Sepolia
```

**💡 Tip:** The `.env.example` file contains detailed comments and security best practices.

**Security Notes:**

- ⚠️ **Never commit your `.env` file** - It's already in `.gitignore`
- 🔐 **Keep your private keys secure** - Never share or expose them
- 🔑 **Use separate wallets** for development and production
- 💡 **Alternative:** Use `hardhat-keystore` for encrypted key storage

**Getting Your Private Key:**

1. **From MetaMask:** Settings → Security & Privacy → Reveal Private Key
2. **From other wallets:** Check your wallet's export/backup options
3. **For testing:** Use one of Hardhat's test accounts

**Verify Setup:**

```bash
# Check if your environment is configured correctly
npx hardhat console --network lcaiTestnet

# In console, check your address
> const [signer] = await ethers.getSigners();
> await signer.getAddress();
```

### Running Tests

Execute the comprehensive test suite covering both voting strategies:

```bash
# Run all governance tests
npx hardhat test ./test/LCAIGovernor.ts

# Run WLCAI tests
npx hardhat test ./test/WLCAI.ts

# Run all tests in the project
npx hardhat test
```

**Test Coverage:**

- ✅ Complete governance flow (create → vote → queue → execute)
- ✅ Quorum enforcement for all voting strategies
- ✅ ETH deposit/withdrawal functionality with 1:1 backing
- ✅ Timelock delay protection
- ✅ Dynamic voting power updates
- ✅ Delegation controls and restrictions
- ✅ Reentrancy protection and security measures

## 📦 Deployment

### Local Development

Deploy to local Hardhat network for testing:

```bash
# Start local node
npx hardhat node

# Deploy contracts (in another terminal)
npx hardhat ignition deploy ignition/modules/Counter.ts --network localhost
```

### Testnet Deployment

#### LCAI Testnet Deployment

1. **Ensure `.env` is configured** with `OWNER_WALLET_PRIVATE_KEY` (see Environment Setup above)

2. **Deploy to LCAI Testnet:**

```bash
# Deploy governance system
npx hardhat run scripts/deploy.ts --network lcaiTestnet

# Or use ignition
npx hardhat ignition deploy ignition/modules/Counter.ts --network lcaiTestnet
```

#### Sepolia Testnet Deployment

1. **Add Sepolia credentials to `.env`:**

```bash
SEPOLIA_PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://rpc.sepolia.org
```

Or use hardhat-keystore (recommended):

```bash
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

2. **Deploy to Sepolia:**

```bash
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```

### Production Deployment

For mainnet deployment, ensure:

- [ ] Comprehensive security audit completed
- [ ] Multi-sig wallet setup for admin functions
- [ ] Voting strategy chosen and parameters set
- [ ] Emergency procedures documented

## 🎮 Usage Examples

### ETH-Backed Governance Flow

```typescript
// 1. Deploy governance contracts with WLCAI strategy
const wLCAI = await viem.deployContract("WLCAI");
const timelock = await viem.deployContract("LCAITimeLock", [
  172800n, // 2 days delay
  [], // proposers (set to governor)
  [], // executors (set to governor)
  adminAddress,
]);
const governor = await viem.deployContract("LCAIGovernor", [
  wLCAI.address,
  timelock.address,
]);

// 2. Users deposit ETH to get voting power
await user.sendTransaction({
  to: wLCAI.address,
  value: parseEther("10"), // deposit 10 ETH
});
await wLCAI.write.delegate([voterAddress], { account: user });

// 3. Create proposal
const proposalTx = await governor.write.propose(
  [
    [targetContract.address], // targets
    [0n], // values
    [encodedCalldata], // calldatas
    "Proposal description",
  ],
  { account: proposer }
);

// 4. Vote on proposal (after voting delay)
await governor.write.castVote([proposalId, 1], { account: voter }); // 1 = For

// 5. Queue proposal (after voting period ends)
await governor.write.queue([targets, values, calldatas, descriptionHash]);

// 6. Execute proposal (after timelock delay)
await governor.write.execute([targets, values, calldatas, descriptionHash]);

// 7. Users can withdraw their ETH anytime (burns tokens)
await wLCAI.write.withdraw([parseEther("5")], { account: user }); // Withdraw 5 LCAI
```

### Manual Voting Strategy Flow

```typescript
// 1. Deploy with manual voting strategy
const votesStrategy = await viem.deployContract("PresaleVotingPower");
const governor = await viem.deployContract("LCAIGovernor", [
  votesStrategy.address,
  timelock.address,
]);

// 2. Set voting power (admin only)
await votesStrategy.write.setVotingPowerBatch([
  [voter1Address, voter2Address],
  [parseEther("5000"), parseEther("3000")],
]);

// 3. Governance flow continues same as token-based
// (create → vote → queue → execute)
```

## 🔧 Configuration

### Governance Parameters

| Parameter          | Value                   | Description                        |
| ------------------ | ----------------------- | ---------------------------------- |
| Voting Delay       | 7200 blocks (~1 day)    | Time before voting starts          |
| Voting Period      | 50400 blocks (~1 week)  | Duration of voting phase           |
| Proposal Threshold | 0 tokens                | Minimum tokens to create proposal  |
| Quorum             | 4%                      | Minimum participation for validity |
| Timelock Delay     | 172800 seconds (2 days) | Execution delay after approval     |

### Network Configuration

The project supports multiple networks:

- **Local Hardhat** - Development and testing
- **Sepolia** - Testnet deployment
- **Mainnet** - Production deployment (configure separately)

## 🛡️ Security Considerations

### Timelock Protection

- 2-day delay between proposal approval and execution
- Allows community to review and potentially cancel malicious proposals
- Admin can cancel proposals during delay period

### Access Controls

- Governor contract controls timelock proposer/executor roles
- PresaleVotingPower owner can update voting power
- Multi-sig recommended for production admin functions

## 🤝 What You Can Do With This System

### DAO Operations

- **Treasury Management** - Control DAO funds and investments
- **Protocol Upgrades** - Vote on smart contract upgrades
- **Parameter Changes** - Adjust system parameters and fees
- **Grant Allocation** - Distribute funding to contributors
- **Partnership Decisions** - Approve strategic partnerships

### Governance Experiments

- **Hybrid Voting** - Combine token and manual strategies
- **Delegation Strategies** - Test different delegation patterns
- **Quorum Optimization** - Find optimal participation thresholds
- **Proposal Templates** - Create standardized proposal formats

### Integration Possibilities

- **Multi-DAO Coordination** - Connect with other governance systems
- **Cross-Chain Governance** - Extend to multiple blockchains
- **Off-Chain Integration** - Connect with traditional voting systems
- **Analytics Dashboard** - Build governance metrics and insights

## 📚 Technical Details

Built with:

- **Hardhat 3 Beta** - Development environment with native Node.js testing
- **OpenZeppelin Contracts** - Battle-tested governance primitives
- **Viem** - Type-safe Ethereum interactions
- **TypeScript** - Full type safety and developer experience
- **Solidity 0.8.28** - Latest Solidity features with optimization

---

_Built for the LCAI DAO community to enable decentralized governance and decision-making._
