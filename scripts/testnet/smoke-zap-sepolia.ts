/**
 * End-to-end smoke test of a deployed LcaiZap on Sepolia: quote, zap a tiny amount of ETH,
 * confirm the warp route received LCAI. Watch the Hyperlane explorer link for delivery to 8200.
 *
 *   ZAP=0x... ETH_IN=0.0005 npx hardhat run scripts/testnet/smoke-zap-sepolia.ts --network sepolia
 */
import { network } from "hardhat";
import { parseEther, formatEther } from "ethers";

const QUOTER_V2 = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const LCAI = "0xCAb9A0d25d7F673E6cc05B35cd28D3e888d5D4A3";
const FEE = 3000;

const { ethers } = await network.connect();
const [signer] = await ethers.getSigners();
const zapAddr = process.env.ZAP;
if (!zapAddr) throw new Error("set ZAP=<LcaiZap address>");
const ethIn = parseEther(process.env.ETH_IN ?? "0.0005");

const zap = await ethers.getContractAt("LcaiZap", zapAddr, signer);
const quoter = new ethers.Contract(
  QUOTER_V2,
  ["function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)"],
  signer,
);

const igp: bigint = await zap.gasPayment();
const swapIn = ethIn - igp;
const [lcaiOut] = await quoter.quoteExactInputSingle.staticCall([WETH, LCAI, swapIn, FEE, 0n]);
const minOut = (lcaiOut * 99n) / 100n;
console.log(`igp ${formatEther(igp)} ETH, swap ${formatEther(swapIn)} ETH -> ~${formatEther(lcaiOut)} LCAI (min ${formatEther(minOut)})`);

const deadline = Math.floor(Date.now() / 1000) + 600;
const tx = await zap.zapToLightchain(minOut, signer.address, deadline, { value: ethIn });
console.log("zap tx:", tx.hash);
const rc = await tx.wait();
const ev = rc!.logs.map((l) => { try { return zap.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Zapped");
console.log(`mined block ${rc!.blockNumber}; bridged ${formatEther(ev!.args.lcaiBridged)} LCAI, messageId ${ev!.args.messageId}`);
console.log(`track: https://explorer.hyperlane.xyz/?search=${tx.hash}`);
console.log(`zap contract balance after: ${formatEther(await ethers.provider.getBalance(zapAddr))} ETH`);
