// path: lcai-dao/scripts/interaction/set-presale-buyers.ts
import { network } from "hardhat";
import fs from "fs";

/**
 * Set Buyer Amounts in DummyLCAIPresale Contract
 *
 * This script allows you to set buyer amounts for testing the airdrop functionality.
 *
 * Environment Variables:
 * - PRESALE_ADDRESS: Address of the DummyLCAIPresale contract (required)
 * - BUYER_ADDRESSES: Comma-separated list of buyer addresses
 * - BUYER_AMOUNTS: Comma-separated list of amounts (in whole tokens)
 *
 * Example:
 * PRESALE_ADDRESS=0x123...
 * BUYER_ADDRESSES=0xabc...,0xdef...,0xghi...
 * BUYER_AMOUNTS=1000,2000,3000
 */

async function main() {
  console.log("🎯 Setting Buyer Amounts in DummyLCAIPresale");
  console.log("==============================================\n");

  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const balance = ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  );
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${balance} ETH\n`);

  const networkConfig = (network as any).config;
  const networkName = networkConfig?.name || (network as any).name;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`📡 Network: ${networkName} (chainId: ${chainId})\n`);

  // Get presale address
  const presaleAddress = process.env.PRESALE_ADDRESS?.trim();
  if (!presaleAddress) {
    // Try to load from deployment file
    const deploymentFile = "deployments/airdrop-deployment.json";
    if (fs.existsSync(deploymentFile)) {
      const deploymentData = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      const loadedPresaleAddress = deploymentData.contracts?.DummyLCAIPresale?.address;
      if (loadedPresaleAddress) {
        console.log(`📋 Loaded presale address from deployment file: ${loadedPresaleAddress}\n`);
        return setBuyerAmounts(loadedPresaleAddress);
      }
    }
    throw new Error("PRESALE_ADDRESS not provided and no deployment file found");
  }

  return setBuyerAmounts(presaleAddress);

  async function setBuyerAmounts(presaleAddr: string) {
    // Get presale contract
    const presale = await ethers.getContractAt("DummyLCAIPresale", presaleAddr);
    console.log(`📍 Presale Contract: ${presaleAddr}\n`);

    // Verify we're the owner
    const owner = await presale.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(
        `Not the owner of presale contract. Owner: ${owner}, Deployer: ${deployer.address}`
      );
    }

    // Get buyer data from environment variables
    const buyerAddressesStr = process.env.BUYER_ADDRESSES?.trim();
    const buyerAmountsStr = process.env.BUYER_AMOUNTS?.trim();

    if (!buyerAddressesStr || !buyerAmountsStr) {
      console.log("⚠️  No buyer addresses or amounts provided.");
      console.log("\nUsage:");
      console.log("  PRESALE_ADDRESS=0x... \\");
      console.log("  BUYER_ADDRESSES=0xabc...,0xdef... \\");
      console.log("  BUYER_AMOUNTS=1000,2000 \\");
      console.log("  npx hardhat run scripts/interaction/set-presale-buyers.ts --network sepolia");
      console.log("");
      return;
    }

    // Parse buyer addresses and amounts
    const buyerAddresses = buyerAddressesStr.split(",").map((addr) => addr.trim());
    const buyerAmounts = buyerAmountsStr
      .split(",")
      .map((amt) => ethers.parseEther(amt.trim()));

    if (buyerAddresses.length !== buyerAmounts.length) {
      throw new Error(
        `Mismatch: ${buyerAddresses.length} addresses but ${buyerAmounts.length} amounts`
      );
    }

    console.log(`Setting ${buyerAddresses.length} buyer amount(s)...\n`);

    if (buyerAddresses.length === 1) {
      // Single buyer
      console.log(`   Address: ${buyerAddresses[0]}`);
      console.log(`   Amount: ${ethers.formatEther(buyerAmounts[0])} tokens`);

      const tx = await presale.setBuyerAmount(buyerAddresses[0], buyerAmounts[0]);
      await tx.wait();

      console.log(`   ✅ Transaction: ${tx.hash}\n`);
    } else {
      // Batch operation
      console.log("   Buyers:");
      buyerAddresses.forEach((addr, i) => {
        console.log(
          `   ${i + 1}. ${addr}: ${ethers.formatEther(buyerAmounts[i])} tokens`
        );
      });
      console.log("");

      const tx = await presale.setBuyerAmountsBatch(buyerAddresses, buyerAmounts);
      await tx.wait();

      console.log(`   ✅ Transaction: ${tx.hash}\n`);
    }

    // Verify the amounts were set
    console.log("✅ Verifying buyer amounts...\n");
    for (let i = 0; i < buyerAddresses.length; i++) {
      const amount = await presale.buyersAmount(buyerAddresses[i]);
      console.log(
        `   ${buyerAddresses[i]}: ${ethers.formatEther(amount)} tokens`
      );
    }

    console.log("\n✅ Buyer amounts set successfully!");
    console.log("");

    return {
      presaleAddress: presaleAddr,
      buyers: buyerAddresses,
      amounts: buyerAmounts.map((amt) => ethers.formatEther(amt)),
    };
  }
}

// Execute script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

export default main;
