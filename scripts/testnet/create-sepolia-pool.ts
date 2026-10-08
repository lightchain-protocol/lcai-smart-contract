/**
 * Create + seed a Uniswap V3 LCAI/WETH 0.3% pool on Sepolia so LcaiZap has something to swap against.
 * Full-range position. Amounts are deliberately tiny: this is a demo pool, not a market.
 *
 *   LCAI_AMOUNT=1.5 ETH_AMOUNT=0.004 npx hardhat run scripts/testnet/create-sepolia-pool.ts --network sepolia
 */
import { network } from "hardhat";
import { parseEther, formatEther, MaxUint256 } from "ethers";

const LCAI = "0xCAb9A0d25d7F673E6cc05B35cd28D3e888d5D4A3"; // Sepolia test LCAI (warp route collateral)
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
const FEE = 3000;
const TICK_SPACING = 60;
// Widest ticks usable at this spacing: TickMath bounds are ±887272, rounded in to a multiple of 60.
const MIN_TICK = Math.ceil(-887272 / TICK_SPACING) * TICK_SPACING; // -887220
const MAX_TICK = Math.floor(887272 / TICK_SPACING) * TICK_SPACING; // 887220

const { ethers } = await network.connect();
const [signer] = await ethers.getSigners();
const lcaiAmount = parseEther(process.env.LCAI_AMOUNT ?? "1.5");
const ethAmount = parseEther(process.env.ETH_AMOUNT ?? "0.004");

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function deposit() payable",
];
const lcai = new ethers.Contract(LCAI, erc20Abi, signer);
const weth = new ethers.Contract(WETH, erc20Abi, signer);
const factory = new ethers.Contract(FACTORY, ["function getPool(address,address,uint24) view returns (address)"], signer);
const npm = new ethers.Contract(
  POSITION_MANAGER,
  [
    "function createAndInitializePoolIfNecessary(address,address,uint24,uint160) payable returns (address)",
    "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)",
  ],
  signer,
);

const lcaiBal: bigint = await lcai.balanceOf(signer.address);
console.log(`signer ${signer.address}: ${formatEther(lcaiBal)} tLCAI, ${formatEther(await ethers.provider.getBalance(signer.address))} ETH`);
if (lcaiBal < lcaiAmount) throw new Error(`need ${formatEther(lcaiAmount)} tLCAI on Sepolia; bridge first`);

// token0 < token1 by address
const [token0, token1, amount0, amount1] =
  LCAI.toLowerCase() < WETH.toLowerCase() ? [LCAI, WETH, lcaiAmount, ethAmount] : [WETH, LCAI, ethAmount, lcaiAmount];

// sqrtPriceX96 = sqrt(amount1/amount0) * 2^96, computed in integers
function sqrtBig(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}
const Q96 = 2n ** 96n;
const sqrtPriceX96 = sqrtBig((amount1 * Q96 * Q96) / amount0);

let pool: string = await factory.getPool(token0, token1, FEE);
if (pool === ethers.ZeroAddress) {
  console.log("creating pool...");
  const tx = await npm.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96);
  await tx.wait();
  pool = await factory.getPool(token0, token1, FEE);
}
console.log("pool:", pool);

// Wrap ETH, approve both tokens
if ((await weth.balanceOf(signer.address)) < ethAmount) {
  console.log("wrapping ETH...");
  await (await weth.deposit({ value: ethAmount })).wait();
}
for (const [name, t] of [["LCAI", lcai], ["WETH", weth]] as const) {
  if ((await t.allowance(signer.address, POSITION_MANAGER)) < MaxUint256 / 2n) {
    console.log(`approving ${name}...`);
    await (await t.approve(POSITION_MANAGER, MaxUint256)).wait();
  }
}

console.log(`minting full-range position: ${formatEther(amount0)} token0 / ${formatEther(amount1)} token1`);
const deadline = Math.floor(Date.now() / 1000) + 1200;
const tx = await npm.mint([token0, token1, FEE, MIN_TICK, MAX_TICK, amount0, amount1, 0n, 0n, signer.address, deadline]);
const rc = await tx.wait();
console.log(`position minted in block ${rc?.blockNumber}, tx ${tx.hash}`);
