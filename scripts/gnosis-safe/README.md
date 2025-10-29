# Gnosis Safe Emergency Admin Scripts

This folder contains utilities for generating calldata for Gnosis Safe multisig emergency operations on the LCAIGovernor contract.

## Scripts

### `generate-safe-calldata.ts`
Main CLI tool for generating calldata for emergency operations.

**Usage:**
```bash
# Emergency cancel a proposal
node scripts/gnosis-safe/generate-safe-calldata.ts emergencyCancel \
  "0xTarget1,0xTarget2" \
  "0,0" \
  "0xCalldata1,0xCalldata2" \
  "Proposal description"

# Pause the governor
node scripts/gnosis-safe/generate-safe-calldata.ts pause

# Unpause the governor
node scripts/gnosis-safe/generate-safe-calldata.ts unpause

# Show help
node scripts/gnosis-safe/generate-safe-calldata.ts help
```

### `generate-from-proposal.ts`
Generate emergency cancel calldata from a proposal JSON file.

**Usage:**
```bash
node scripts/gnosis-safe/generate-from-proposal.ts proposal.json
```

**Proposal JSON Format:**
```json
{
  "targets": ["0x..."],
  "values": ["0"],
  "calldatas": ["0x..."],
  "description": "..."
}
```

### `example-proposal.json`
Example proposal file showing the expected format.

## Workflow

1. **Generate Calldata**
   - Use one of the scripts above to generate the calldata
   
2. **Submit to Safe**
   - Go to https://app.safe.global/
   - Click "New Transaction" → "Transaction Builder"
   - Enter:
     - Address: Your LCAIGovernor address
     - Value: 0
     - Data: Paste the generated calldata
   
3. **Collect Signatures**
   - Share transaction with Safe owners
   - Collect 3 of 5 signatures
   
4. **Execute**
   - Execute the transaction once threshold is reached

## Documentation

See `GNOSIS_SAFE_DEPLOYMENT_RUNBOOK.md` in the root directory for complete operational procedures.

## Requirements

- Node.js with ES modules support
- ethers.js (installed as dependency)

