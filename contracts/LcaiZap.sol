// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Uniswap V3 SwapRouter02. Accepts native ETH as tokenIn when tokenIn == WETH9 and msg.value is set.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @dev Hyperlane HypERC20Collateral warp route.
interface IHypERC20Collateral {
    function quoteGasPayment(uint32 destinationDomain) external view returns (uint256);

    function transferRemote(uint32 destination, bytes32 recipient, uint256 amount)
        external
        payable
        returns (bytes32 messageId);
}

/// @title LcaiZap
/// @notice One-transaction ETH -> LCAI (ERC-20, Ethereum) -> LCAI (native, Lightchain).
///         Swaps on Uniswap V3, then bridges through the Hyperlane LCAI warp route.
///         Holds no funds between calls.
contract LcaiZap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable SWAP_ROUTER;
    IHypERC20Collateral public immutable WARP_ROUTE;
    IERC20 public immutable LCAI;
    address public immutable WETH;
    uint24 public immutable POOL_FEE;
    uint32 public immutable DESTINATION_DOMAIN;

    event Zapped(
        address indexed sender,
        address indexed recipient,
        uint256 ethSwapped,
        uint256 gasPayment,
        uint256 lcaiBridged,
        bytes32 messageId
    );

    error Expired();
    error ZeroRecipient();
    error InsufficientValue(uint256 provided, uint256 gasPayment);
    error RefundFailed();

    constructor(
        ISwapRouter02 swapRouter,
        IHypERC20Collateral warpRoute,
        IERC20 lcai,
        address weth,
        uint24 poolFee,
        uint32 destinationDomain
    ) {
        SWAP_ROUTER = swapRouter;
        WARP_ROUTE = warpRoute;
        LCAI = lcai;
        WETH = weth;
        POOL_FEE = poolFee;
        DESTINATION_DOMAIN = destinationDomain;
    }

    /// @notice Current Hyperlane interchain gas payment for a transfer to Lightchain, in wei.
    function gasPayment() public view returns (uint256) {
        return WARP_ROUTE.quoteGasPayment(DESTINATION_DOMAIN);
    }

    /// @notice Swap `msg.value - gasPayment()` of ETH for LCAI and bridge it to `recipient` on Lightchain.
    /// @param minLcaiOut Slippage floor for the swap, in LCAI wei.
    /// @param recipient  Address on Lightchain that receives native LCAI.
    /// @param deadline   Unix timestamp after which the call reverts.
    function zapToLightchain(uint256 minLcaiOut, address recipient, uint256 deadline)
        external
        payable
        nonReentrant
        returns (bytes32 messageId, uint256 lcaiAmount)
    {
        if (block.timestamp > deadline) revert Expired();
        if (recipient == address(0)) revert ZeroRecipient();

        uint256 igp = gasPayment();
        if (msg.value <= igp) revert InsufficientValue(msg.value, igp);
        uint256 swapAmount = msg.value - igp;

        lcaiAmount = SWAP_ROUTER.exactInputSingle{value: swapAmount}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: address(LCAI),
                fee: POOL_FEE,
                recipient: address(this),
                amountIn: swapAmount,
                amountOutMinimum: minLcaiOut,
                sqrtPriceLimitX96: 0
            })
        );

        LCAI.forceApprove(address(WARP_ROUTE), lcaiAmount);
        messageId = WARP_ROUTE.transferRemote{value: igp}(
            DESTINATION_DOMAIN, bytes32(uint256(uint160(recipient))), lcaiAmount
        );

        // The warp route may refund excess gas payment to this contract; pass it back to the caller.
        uint256 dust = address(this).balance;
        if (dust > 0) {
            (bool ok,) = msg.sender.call{value: dust}("");
            if (!ok) revert RefundFailed();
        }

        emit Zapped(msg.sender, recipient, swapAmount, igp, lcaiAmount, messageId);
    }

    /// @dev Needed for gas-payment refunds from the warp route.
    receive() external payable {}
}
