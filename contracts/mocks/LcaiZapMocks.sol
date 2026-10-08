// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02, IHypERC20Collateral} from "../LcaiZap.sol";

/// @dev Test-only token with public mint.
contract MockLcai is ERC20 {
    constructor() ERC20("Mock LCAI", "LCAI") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Test-only swap router: pays out `rate` LCAI per 1 ETH, enforces amountOutMinimum like Uniswap.
contract MockSwapRouter is ISwapRouter02 {
    MockLcai public immutable LCAI;
    uint256 public rate; // LCAI wei per 1 ETH

    error TooLittleReceived();

    constructor(MockLcai lcai, uint256 rate_) {
        LCAI = lcai;
        rate = rate_;
    }

    function setRate(uint256 rate_) external {
        rate = rate_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        require(msg.value == params.amountIn, "value != amountIn");
        amountOut = (params.amountIn * rate) / 1 ether;
        if (amountOut < params.amountOutMinimum) revert TooLittleReceived();
        LCAI.mint(params.recipient, amountOut);
    }
}

/// @dev Test-only warp route: pulls the tokens, records the call, optionally refunds excess value.
contract MockWarpRoute is IHypERC20Collateral {
    IERC20 public immutable TOKEN;
    uint256 public gasQuote;
    uint256 public refundAmount; // paid back to msg.sender from this contract's own balance

    uint32 public lastDestination;
    bytes32 public lastRecipient;
    uint256 public lastAmount;
    uint256 public lastValue;

    constructor(IERC20 token, uint256 gasQuote_) {
        TOKEN = token;
        gasQuote = gasQuote_;
    }

    function setGasQuote(uint256 q) external {
        gasQuote = q;
    }

    function setRefundAmount(uint256 v) external {
        refundAmount = v;
    }

    receive() external payable {}

    function quoteGasPayment(uint32) external view override returns (uint256) {
        return gasQuote;
    }

    function transferRemote(uint32 destination, bytes32 recipient, uint256 amount)
        external
        payable
        override
        returns (bytes32 messageId)
    {
        require(msg.value >= gasQuote, "insufficient gas payment");
        TOKEN.transferFrom(msg.sender, address(this), amount);
        lastDestination = destination;
        lastRecipient = recipient;
        lastAmount = amount;
        lastValue = msg.value;
        if (refundAmount > 0) {
            (bool ok,) = msg.sender.call{value: refundAmount}("");
            require(ok, "refund failed");
        }
        messageId = keccak256(abi.encode(destination, recipient, amount, block.number));
    }
}
