#!/usr/bin/env node
// @ts-nocheck

/**
 * Gnosis Safe Transaction Builder - Calldata Generator
 * 
 * This script generates ABI-encoded calldata for LCAIGovernor emergency operations
 * to be used with the Gnosis Safe Transaction Builder.
 * 
 * Usage:
 *   node scripts/generate-safe-calldata.mjs <operation> [args...]
 * 
 * Operations:
 *   emergencyCancel <targets> <values> <calldatas> <description>
 *   pause
 *   unpause
 */

import { ethers } from "ethers";

const GOVERNOR_ABI = [
    "function emergencyCancel(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)",
    "function pause()",
    "function unpause()"
];

const iface = new ethers.Interface(GOVERNOR_ABI);

function keccak256(text) {
    return ethers.keccak256(ethers.toUtf8Bytes(text));
}

function generateEmergencyCancel(targets, values, calldatas, description) {
    console.log("\n=== Emergency Cancel Calldata Generator ===\n");

    // Parse inputs
    const targetsArray = targets.split(",").map(t => t.trim());
    const valuesArray = values.split(",").map(v => BigInt(v.trim()));
    const calldatasArray = calldatas.split(",").map(c => c.trim());

    // Calculate description hash
    const descriptionHash = keccak256(description);

    console.log("Proposal Parameters:");
    console.log("  Targets:", targetsArray);
    console.log("  Values:", valuesArray.map(v => v.toString()));
    console.log("  Calldatas:", calldatasArray);
    console.log("  Description:", description);
    console.log("  Description Hash:", descriptionHash);
    console.log();

    // Generate calldata
    const calldata = iface.encodeFunctionData("emergencyCancel", [
        targetsArray,
        valuesArray,
        calldatasArray,
        descriptionHash
    ]);

    console.log("Generated Calldata:");
    console.log(calldata);
    console.log();
    console.log("=== Safe Transaction Builder Instructions ===");
    console.log("1. Go to your Gnosis Safe at https://app.safe.global/");
    console.log("2. Click 'New Transaction' → 'Transaction Builder'");
    console.log("3. Enter:");
    console.log("   - Address: <YOUR_LCAI_GOVERNOR_ADDRESS>");
    console.log("   - Value (ETH): 0");
    console.log("   - Data (Hex): " + calldata);
    console.log("4. Review and submit for signing");
    console.log();

    return calldata;
}

function generatePause(): string {
    console.log("\n=== Pause Calldata Generator ===\n");

    const calldata = iface.encodeFunctionData("pause", []);

    console.log("Function: pause()");
    console.log("Function Selector: 0x8456cb59");
    console.log();
    console.log("Generated Calldata:");
    console.log(calldata);
    console.log();
    console.log("=== Safe Transaction Builder Instructions ===");
    console.log("1. Go to your Gnosis Safe at https://app.safe.global/");
    console.log("2. Click 'New Transaction' → 'Transaction Builder'");
    console.log("3. Enter:");
    console.log("   - Address: <YOUR_LCAI_GOVERNOR_ADDRESS>");
    console.log("   - Value (ETH): 0");
    console.log("   - Data (Hex): " + calldata);
    console.log("4. Review and submit for signing");
    console.log();

    return calldata;
}

function generateUnpause(): string {
    console.log("\n=== Unpause Calldata Generator ===\n");

    const calldata = iface.encodeFunctionData("unpause", []);

    console.log("Function: unpause()");
    console.log("Function Selector: 0x3f4ba83a");
    console.log();
    console.log("Generated Calldata:");
    console.log(calldata);
    console.log();
    console.log("=== Safe Transaction Builder Instructions ===");
    console.log("1. Go to your Gnosis Safe at https://app.safe.global/");
    console.log("2. Click 'New Transaction' → 'Transaction Builder'");
    console.log("3. Enter:");
    console.log("   - Address: <YOUR_LCAI_GOVERNOR_ADDRESS>");
    console.log("   - Value (ETH): 0");
    console.log("   - Data (Hex): " + calldata);
    console.log("4. Review and submit for signing");
    console.log();

    return calldata;
}

function printUsage(): void {
    console.log(`
Usage: node scripts/generate-safe-calldata.mjs <operation> [args...]

Operations:

  emergencyCancel <targets> <values> <calldatas> <description>
    Generate calldata for emergency canceling a proposal
    
    Arguments:
      targets     - Comma-separated list of target addresses
      values      - Comma-separated list of ETH values (in wei)
      calldatas   - Comma-separated list of calldata (hex strings)
      description - Original proposal description text
    
    Example:
      node scripts/generate-safe-calldata.mjs emergencyCancel \\
        "0x1234...,0x5678..." \\
        "0,0" \\
        "0xabcd...,0xef01..." \\
        "Malicious proposal to drain treasury"

  pause
    Generate calldata for pausing the governor
    
    Example:
      node scripts/generate-safe-calldata.mjs pause

  unpause
    Generate calldata for unpausing the governor
    
    Example:
      node scripts/generate-safe-calldata.mjs unpause

Examples with Proposal File:
  
  If you have a proposal JSON file, you can use:
    node scripts/generate-from-proposal.mjs proposal.json

  proposal.json format:
    {
      "targets": ["0x..."],
      "values": ["0"],
      "calldatas": ["0x..."],
      "description": "..."
    }
`);
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    printUsage();
    process.exit(1);
}

const operation = args[0].toLowerCase();

try {
    switch (operation) {
        case "emergencycancel":
            if (args.length !== 5) {
                console.error("Error: emergencyCancel requires 4 arguments");
                printUsage();
                process.exit(1);
            }
            generateEmergencyCancel(args[1], args[2], args[3], args[4]);
            break;

        case "pause":
            generatePause();
            break;

        case "unpause":
            generateUnpause();
            break;

        case "help":
        case "--help":
        case "-h":
            printUsage();
            break;

        default:
            console.error(`Error: Unknown operation "${operation}"`);
            printUsage();
            process.exit(1);
    }
} catch (error) {
    console.error("\nError:", error.message);
    process.exit(1);
}