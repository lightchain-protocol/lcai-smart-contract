# Deployment Scripts

This folder contains scripts for deploying smart contracts.

## Scripts

- **`deploy.ts`** - Main DAO governance system deployment script
- **`deploy-smart-contracts.ts`** - Complete deployment script for all contracts
- **`deploy-chat-utility.ts`** - Deployment script for chat utility contracts

## Usage

```bash
# Deploy DAO governance system
npx hardhat run scripts/deployment/deploy.ts --network <network-name>

# Deploy all contracts (DAO + Chat Utility)
npx hardhat run scripts/deployment/deploy-smart-contracts.ts --network <network-name>

# Deploy chat utility only
npx hardhat run scripts/deployment/deploy-chat-utility.ts --network <network-name>
```

## Notes

- Make sure to configure your `.env` file with the required private keys and RPC URLs
- Test deployments on testnet before deploying to mainnet
- Always verify contracts after deployment

