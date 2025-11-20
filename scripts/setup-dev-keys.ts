/**
 * Development Private Key Management Utility
 * 
 * This script provides CLI utilities for viewing and managing development keys.
 * 
 * NOTE: The core key management logic is inlined in hardhat.config.ts to avoid
 * ES module import issues during config loading. This file provides convenience
 * functions for viewing keys and wallet addresses.
 * 
 * Usage:
 *   npx hardhat run scripts/setup-dev-keys.ts  - View development key addresses
 */
import { Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ES module compatibility: get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single source of truth for key file paths
const DEV_KEYS_DIR = path.join(__dirname, "..", ".dev-keys");
const OWNER_KEY_FILE = path.join(DEV_KEYS_DIR, "owner.key");
const SEPOLIA_KEY_FILE = path.join(DEV_KEYS_DIR, "sepolia.key");

/**
 * Generate a new random wallet and save its private key
 */
function generateAndSaveKey(keyFile: string, label: string): string {
    const wallet = Wallet.createRandom();
    fs.writeFileSync(keyFile, wallet.privateKey);
    console.log(`✨ Generated new ${label} development key`);
    console.log(`   Address: ${wallet.address}`);
    return wallet.privateKey;
}

/**
 * Load an existing private key from file
 */
function loadKey(keyFile: string, label: string): string {
    const key = fs.readFileSync(keyFile, "utf8").trim();
    console.log(`🔑 Loaded existing ${label} development key`);
    return key;
}

/**
 * Ensure .dev-keys directory exists
 */
function ensureDevKeysDir(): void {
    if (!fs.existsSync(DEV_KEYS_DIR)) {
        fs.mkdirSync(DEV_KEYS_DIR, { recursive: true });
        console.log("📁 Created .dev-keys directory for development keys");
    }
}

/**
 * Get a private key with fallback chain:
 * 1. Environment variable (.env file)
 * 2. Auto-generated development key (.dev-keys directory)
 * 
 * This is the main export used by hardhat.config.ts
 */
export function getPrivateKey(envVarName: string, keyType: "owner" | "sepolia"): string {
    // Try environment variable first
    const envKey = process.env[envVarName];
    if (envKey && envKey.length === 66 && envKey.startsWith("0x")) {
        return envKey;
    }

    // Determine which key file to use
    const keyFile = keyType === "owner" ? OWNER_KEY_FILE : SEPOLIA_KEY_FILE;
    const label = keyType === "owner" ? "owner" : "Sepolia";

    // Ensure directory exists
    ensureDevKeysDir();

    // Load existing or generate new key
    if (fs.existsSync(keyFile)) {
        return loadKey(keyFile, label);
    } else {
        return generateAndSaveKey(keyFile, label);
    }
}

/**
 * Get both development keys (for CLI usage)
 */
export function getDevKeys(): { ownerKey: string; sepoliaKey: string } {
    return {
        ownerKey: getPrivateKey("OWNER_WALLET_PRIVATE_KEY", "owner"),
        sepoliaKey: getPrivateKey("SEPOLIA_PRIVATE_KEY", "sepolia"),
    };
}

/**
 * Display development key information (CLI function)
 */
export function displayKeyInfo() {
    console.log("🚀 Development Key Information\n");

    const { ownerKey, sepoliaKey } = getDevKeys();
    const ownerWallet = new Wallet(ownerKey);
    const sepoliaWallet = new Wallet(sepoliaKey);

    console.log("📍 Development Wallet Addresses:");
    console.log(`   Owner:   ${ownerWallet.address}`);
    console.log(`   Sepolia: ${sepoliaWallet.address}`);

    console.log("\n📝 To set these as Hardhat configuration variables, run:");
    console.log(
        `\n  echo "${ownerKey}" | npx hardhat vars set OWNER_WALLET_PRIVATE_KEY`
    );
    console.log(
        `  echo "${sepoliaKey}" | npx hardhat vars set SEPOLIA_PRIVATE_KEY`
    );
    console.log(
        "\n💡 Or use the keys directly from .dev-keys/ directory (auto-loaded)\n"
    );
}

// Only run CLI code when executed as main module (not when imported)
// Check if running via hardhat run by looking at the call stack
const isRunningAsScript = process.argv.some(arg => arg.includes('setup-dev-keys'));
if (isRunningAsScript) {
    displayKeyInfo();
}
