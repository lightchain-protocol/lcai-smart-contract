/**
 * Bridge native testnet LCAI (chain 8200) -> test LCAI ERC-20 on Sepolia via the Hyperlane warp route.
 * Used to seed the Sepolia Uniswap pool for the LcaiZap testnet deployment.
 *
 *   AMOUNT=1.5 npx hardhat run scripts/testnet/bridge-lcai-to-sepolia.ts --network lcaiTestnet
 */
import { network } from "hardhat";
import { parseEther, formatEther, zeroPadValue } from "ethers";

const NATIVE_ROUTER = "0x5Ff6b59Bf2eB5fD64176650011b0d74E8A55300b"; // lcaitestnet HypNative
const SEPOLIA_DOMAIN = 11155111;

const { ethers } = await network.connect();
const [signer] = await ethers.getSigners();
const amount = parseEther(process.env.AMOUNT ?? "1.5");

const router = new ethers.Contract(
  NATIVE_ROUTER,
  [
    "function quoteGasPayment(uint32) view returns (uint256)",
    "function transferRemote(uint32,bytes32,uint256) payable returns (bytes32)",
  ],
  signer,
);

const bal = await ethers.provider.getBalance(signer.address);
const gas = await router.quoteGasPayment(SEPOLIA_DOMAIN);
console.log(`signer ${signer.address} balance ${formatEther(bal)} LCAI, igp ${formatEther(gas)}`);
if (bal < amount + gas + parseEther("0.05")) throw new Error("not enough native LCAI to bridge and pay gas");

const tx = await router.transferRemote(SEPOLIA_DOMAIN, zeroPadValue(signer.address, 32), amount, {
  value: amount + gas,
});
console.log("transferRemote tx:", tx.hash);
const rc = await tx.wait();
console.log(`mined in block ${rc?.blockNumber}. Track: https://explorer.hyperlane.xyz/?search=${tx.hash}`);
