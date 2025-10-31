// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LCAI Treasury
 * @notice Custodies DAO assets and executes transfers only when called by governance (timelock)
 *         Admin (multisig) manages config such as allow/block lists and pause state.
 */
contract Treasury is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The governance executor (TimelockController address)
    address public immutable governance;

    /// @notice Admin (intended to be a Gnosis Safe multisig) for configuration
    address public admin;

    // Recipient controls
    mapping(address => bool) public whitelistedAddresses;
    mapping(address => bool) public blacklistedAddresses;
    bool public isWhitelisted; // if true, only whitelisted recipients are allowed
    bool public isBlacklisted; // if true, blacklisted recipients are disallowed

    // Spend tracking per token (address(0) for ETH)
    mapping(address => uint256) public spent;

    // Events
    event GovernanceTransfer(address indexed token, address indexed to, uint256 amount);
    event GovernanceEthTransfer(address indexed to, uint256 amount);
    event AdminUpdated(address indexed previousAdmin, address indexed newAdmin);
    event WhitelistedAddressUpdated(address indexed recipient, bool allowed);
    event BlacklistedAddressUpdated(address indexed recipient, bool denied);
    event WhitelistStatusUpdated(bool previous, bool current);
    event BlacklistStatusUpdated(bool previous, bool current);
    event Deposit(address indexed sender, address indexed token, uint256 amount);

    // Errors
    error NotGovernance(address caller);
    error NotAdmin(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error AdminMustBeContract();
    error WhitelistedAddressNotAllowed();
    error BlacklistedAddressNotAllowed();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender);
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    constructor(address _governance, address _admin) {
        if (_governance == address(0) || _admin == address(0)) revert ZeroAddress();
        if (_admin.code.length == 0) revert AdminMustBeContract();
        governance = _governance;
        admin = _admin;
        emit AdminUpdated(address(0), _admin);
    }

    // ==================== Governance Transfers ====================

    /**
     * @notice Execute ERC20 transfer from the Treasury
     * @dev Callable only by governance (timelock). Enforces allow/block lists and pause state
     */
    function executeTokenTransfer(address token, address to, uint256 amount) external onlyGovernance whenNotPaused nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _enforceRecipientPolicy(to);
        IERC20(token).safeTransfer(to, amount);
        spent[token] += amount;
        emit GovernanceTransfer(token, to, amount);
    }

    /**
     * @notice Execute native ETH transfer from the Treasury
     * @dev Callable only by governance (timelock). Enforces allow/block lists and pause state
     */
    function executeEthTransfer(address to, uint256 amount) external onlyGovernance whenNotPaused nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _enforceRecipientPolicy(to);
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
        spent[address(0)] += amount;
        emit GovernanceEthTransfer(to, amount);
    }

    function _enforceRecipientPolicy(address to) internal view {
        if (isWhitelisted && !whitelistedAddresses[to]) revert WhitelistedAddressNotAllowed();
        if (isBlacklisted && blacklistedAddresses[to]) revert BlacklistedAddressNotAllowed();
    }

    // ==================== Admin Configuration ====================

    function updateAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        if (newAdmin.code.length == 0) revert AdminMustBeContract();
        address prev = admin;
        admin = newAdmin;
        emit AdminUpdated(prev, newAdmin);
    }

    function setWhitelistedAddress(address recipient, bool allowed) external onlyAdmin {
        whitelistedAddresses[recipient] = allowed;
        emit WhitelistedAddressUpdated(recipient, allowed);
    }

    function setBlacklistedAddress(address recipient, bool denied) external onlyAdmin {
        blacklistedAddresses[recipient] = denied;
        emit BlacklistedAddressUpdated(recipient, denied);
    }

    function setWhitelistEnabled(bool enabled) external onlyAdmin {
        bool prev = isWhitelisted;
        isWhitelisted = enabled;
        emit WhitelistStatusUpdated(prev, enabled);
    }

    function setBlacklistEnabled(bool enabled) external onlyAdmin {
        bool prev = isBlacklisted;
        isBlacklisted = enabled;
        emit BlacklistStatusUpdated(prev, enabled);
    }

    function pause() external onlyAdmin { _pause(); }
    function unpause() external onlyAdmin { _unpause(); }

    // ==================== Deposits ====================

    function depositETH() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposit(msg.sender, address(0), msg.value);
    }

    function depositToken(address token, uint256 amount) external {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, token, amount);
    }

    // Accept ETH funding
    receive() external payable {
        if (msg.value > 0) emit Deposit(msg.sender, address(0), msg.value);
    }
}


