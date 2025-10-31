// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LCAI Treasury
 * @notice Custodies DAO assets and executes transfers only when called by governance (timelock)
 */
contract Treasury {
    using SafeERC20 for IERC20;

    /// @notice The governance executor (TimelockController address)
    address public immutable governance;

    // Events
    event GovernanceTransfer(address indexed token, address indexed to, uint256 amount);
    event GovernanceEthTransfer(address indexed to, uint256 amount);

    // Errors
    error NotGovernance(address caller);
    error ZeroAddress();
    error ZeroAmount();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender);
        _;
    }

    constructor(address _governance) {
        if (_governance == address(0)) revert ZeroAddress();
        governance = _governance;
    }

    /**
     * @notice Execute ERC20 transfer from the Treasury
     * @dev Callable only by governance (timelock). Token must already be held by this contract
     * @param token ERC20 token address
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function executeTokenTransfer(address token, address to, uint256 amount) external onlyGovernance {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(to, amount);
        emit GovernanceTransfer(token, to, amount);
    }

    /**
     * @notice Execute native ETH transfer from the Treasury
     * @dev Callable only by governance (timelock). ETH must be pre-funded to this contract
     * @param to Recipient address
     * @param amount Amount of wei to transfer
     */
    function executeEthTransfer(address to, uint256 amount) external onlyGovernance {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit GovernanceEthTransfer(to, amount);
    }

    // Accept ETH funding
    receive() external payable {}
}


