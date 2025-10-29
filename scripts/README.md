# Scripts Directory

This directory contains various utility scripts for the LCAI DAO smart contract project.

## Directory Structure

```
scripts/
├── abi/                    # ABI management scripts
│   ├── cleanAbis.mjs      # Clean and organize ABI files
│   └── saveAbi.mjs        # Save contract ABIs
│
├── deployment/            # Contract deployment scripts
│   ├── deploy.ts          # Main Hardhat deployment script
│   ├── deploy-smart-contracts.mjs
│   └── deploy-chat-utility.mjs
│
├── gnosis-safe/          # Gnosis Safe emergency admin tools
│   ├── generate-safe-calldata.mjs    # Generate calldata for emergency ops
│   ├── generate-from-proposal.mjs    # Generate from proposal JSON
│   └── example-proposal.json         # Example proposal format
│
├── logs/                 # Logging utilities
│   ├── console/
│   │   └── console_logger.mjs
│   └── data/
│       └── data_logger.mjs
│
└── roles/               # Role management scripts
    └── assignRoles.mjs  # Assign roles to contracts
```

## Quick Start

### Deploy Contracts
```bash
npx hardhat run scripts/deployment/deploy.ts --network <network>
```

### Generate Emergency Calldata
```bash
node scripts/gnosis-safe/generate-safe-calldata.mjs pause
```

### Manage ABIs
```bash
node scripts/abi/saveAbi.mjs
node scripts/abi/cleanAbis.mjs
```

### Assign Roles
```bash
node scripts/roles/assignRoles.mjs
```

## Documentation

- **Gnosis Safe Operations**: See `GNOSIS_SAFE_DEPLOYMENT_RUNBOOK.md` in root
- **Deployment Guide**: See README in `deployment/` folder
- **Safe Scripts Guide**: See README in `gnosis-safe/` folder

## Requirements

- Node.js v18+
- Hardhat
- ethers.js v6.x
- Properly configured `.env` file

## Environment Variables

Required `.env` variables:
```
PRIVATE_KEY=your_private_key
RPC_URL=your_rpc_url
ETHERSCAN_API_KEY=your_api_key (for verification)
```

## Support

For questions or issues, refer to the main project README or contact the development team.

