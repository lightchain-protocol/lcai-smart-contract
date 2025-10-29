#!/usr/bin/env node

// @ts-nocheck
/**
 * Generate Safe calldata from a proposal JSON file
 * 
 * Usage:
 *   node scripts/gnosis-safe/generate-from-proposal.ts <proposal-file.json>
 */

import { ethers } from "ethers";
import { readFileSync } from "fs";

interface ProposalData {
  targets: string[];
  values: string[];
  calldatas: string[];
  description: string;
}

const GOVERNOR_ABI = [
    "function emergencyCancel(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)"
];

const iface = new ethers.Interface(GOVERNOR_ABI);

function keccak256(text: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error("Error: Please provide a proposal JSON file");
    console.error("Usage: node scripts/generate-from-proposal.mjs <proposal-file.json>");
    process.exit(1);
}

const proposalFile = args[0];

try {
    console.log(`\nReading proposal from: ${proposalFile}\n`);

    const proposalData: ProposalData = JSON.parse(readFileSync(proposalFile, "utf8"));

    // Validate proposal data
    if (!proposalData.targets || !proposalData.values || !proposalData.calldatas || !proposalData.description) {
        throw new Error("Invalid proposal format. Must contain: targets, values, calldatas, description");
    }

    // Parse values to BigInt
    const targets = proposalData.targets;
    const values = proposalData.values.map(v => BigInt(v));
    const calldatas = proposalData.calldatas;
    const description = proposalData.description;
    const descriptionHash = keccak256(description);

    console.log("=== Proposal Details ===\n");
    console.log("Targets:", targets);
    console.log("Values:", values.map(v => v.toString()));
    console.log("Calldatas:", calldatas);
    console.log("Description:", description);
    console.log("Description Hash:", descriptionHash);
    console.log();

    // Generate calldata
    const calldata = iface.encodeFunctionData("emergencyCancel", [
        targets,
        values,
        calldatas,
        descriptionHash
    ]);

    console.log("=== Generated Calldata ===\n");
    console.log(calldata);
    console.log();

    console.log("=== Safe Transaction Builder Instructions ===");
    console.log("1. Go to your Gnosis Safe at https://app.safe.global/");
    console.log("2. Click 'New Transaction' → 'Transaction Builder'");
    console.log("3. Enter:");
    console.log("   - Address: <YOUR_LCAI_GOVERNOR_ADDRESS>");
    console.log("   - Value (ETH): 0");
    console.log("   - Data (Hex): " + calldata);
    console.log("4. Review transaction carefully");
    console.log("5. Submit for signing and collect 3 of 5 signatures");
    console.log();

} catch (error) {
    console.error("\nError:", error.message);
    if (error.code === "ENOENT") {
        console.error(`File not found: ${proposalFile}`);
    }
    process.exit(1);
}