import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Ethereum mainnet defaults. Override per network with --parameters if needed.
const SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"; // Uniswap V3 SwapRouter02
const LCAI_WARP_ROUTE = "0x01f80bb8e78e79881E8Ec7832fB6C2c59f64e353"; // Hyperlane HypERC20Collateral (LCAI)
const LCAI_TOKEN = "0x9cA8530CA349c966Fe9ef903Df17a75B8A778927";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const POOL_FEE = 3000; // 0.3% LCAI/WETH pool: 0x0d047a370611437a1b8e6c2a95ea36f69fdda3be
const LIGHTCHAIN_DOMAIN = 9200;

export default buildModule("LcaiZapModule", (m) => {
  const zap = m.contract("LcaiZap", [
    m.getParameter("swapRouter", SWAP_ROUTER_02),
    m.getParameter("warpRoute", LCAI_WARP_ROUTE),
    m.getParameter("lcai", LCAI_TOKEN),
    m.getParameter("weth", WETH),
    m.getParameter("poolFee", POOL_FEE),
    m.getParameter("destinationDomain", LIGHTCHAIN_DOMAIN),
  ]);

  return { zap };
});
