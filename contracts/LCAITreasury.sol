//SPDX-License-Identifier: MIT
/*
  _     _       _     _       _           _            _    ___ 
 | |   (_) __ _| |__ | |_ ___| |__   __ _(_)_ __      / \  |_ _|
 | |   | |/ _` | '_ \| __/ __| '_ \ / _` | | '_ \    / _ \  | | 
 | |___| | (_| | | | | || (__| | | | (_| | | | | |  / ___ \ | | 
 |_____|_|\__, |_| |_|\__\___|_| |_|\__,_|_|_| |_| /_/   \_\___|
          |___/                                                 
*/

pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LCAITreasury is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    string public constant version = "1.0.0";
    event SpecVersionAnnounced(string version);

    address public admin;

    mapping(address => uint256) public spent;
    mapping(address => bool) public whitelistedAddresses;
    mapping(address => bool) public blacklistedAddresses;

    bool public isWhitelistEnabled = false;
    bool public isBlacklistEnabled = false;

    event WhitelistedAddressUpdated(
        address indexed _address,
        bool indexed _isWhitelisted
    );
    event BlacklistedAddressUpdated(
        address indexed _address,
        bool indexed _isBlacklisted
    );
    event WhitelistedStatusUpdated(
        bool indexed previousStatus,
        bool indexed newStatus
    );
    event BlacklistedStatusUpdated(
        bool indexed previousStatus,
        bool indexed newStatus
    );

    event AdminUpdated(address indexed previousAdmin, address indexed newAdmin);
    event ETHTransferred(address indexed recipient, uint256 amount);
    event ERC20Transferred(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event Deposit(
        address indexed sender,
        address indexed token,
        uint256 amount
    );

    error InsufficientBalance();
    error TransferFailed();
    error Unauthorized();
    error AdminMustBeContract();
    error WhitelistedAddressNotAllowed();
    error BlacklistedAddressNotAllowed();
    error CannotRenounceWhilePaused();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address _timelock, address _admin) Ownable(_timelock) {
        _updateAdmin(_admin);
        emit SpecVersionAnnounced(version);
    }

    function transferETH(
        address _recipient,
        uint256 _amount
    ) external nonReentrant whenNotPaused onlyOwner {
        if (isWhitelistEnabled && !whitelistedAddresses[_recipient])
            revert WhitelistedAddressNotAllowed();
        if (isBlacklistEnabled && blacklistedAddresses[_recipient])
            revert BlacklistedAddressNotAllowed();

        if (address(this).balance < _amount) revert InsufficientBalance();
        (bool success, ) = _recipient.call{value: _amount}("");
        if (!success) revert TransferFailed();
        spent[address(0)] += _amount;

        emit ETHTransferred(_recipient, _amount);
    }

    // token usually gonna be WLCAI, USDT or USDC
    function transferERC20(
        address _token,
        address _recipient,
        uint256 _amount
    ) external nonReentrant whenNotPaused onlyOwner {
        if (isWhitelistEnabled && !whitelistedAddresses[_recipient])
            revert WhitelistedAddressNotAllowed();
        if (isBlacklistEnabled && blacklistedAddresses[_recipient])
            revert BlacklistedAddressNotAllowed();

        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        if (balance < _amount) revert InsufficientBalance();

        token.safeTransfer(_recipient, _amount);
        spent[address(_token)] += _amount;

        emit ERC20Transferred(_token, _recipient, _amount);
    }

    function deposit(address _token, uint256 _amount) external {
        require(_token != address(0), "LCAITreasury: Invalid token address");
        IERC20 token = IERC20(_token);
        token.safeTransferFrom(msg.sender, address(this), _amount);
        emit Deposit(msg.sender, _token, _amount);
    }

    function getBalance(address _token) external view returns (uint256) {
        if (_token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(_token).balanceOf(address(this));
        }
    }

    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ==================== Admin Functions ====================
    /**
     * @notice Update the admin address
     * @param _admin New admin address (must be a contract, ideally a multisig)
     * @dev Enforces that admin is a contract address. For maximum security,
     *      use a vetted multisig implementation like Gnosis Safe.
     */
    function updateAdmin(address _admin) external onlyAdmin {
        _updateAdmin(_admin);
    }

    function _updateAdmin(address _admin) internal {
        if (_admin.code.length == 0) revert AdminMustBeContract();
        if (_admin == admin) return;
        address previousAdmin = admin;
        admin = _admin;
        emit AdminUpdated(previousAdmin, _admin);
    }

    function setWhitelistedAddress(
        address _address,
        bool _isWhitelisted
    ) external onlyAdmin {
        if (whitelistedAddresses[_address] == _isWhitelisted) return;
        whitelistedAddresses[_address] = _isWhitelisted;
        emit WhitelistedAddressUpdated(_address, _isWhitelisted);
    }

    function setBlacklistedAddress(
        address _address,
        bool _isBlacklisted
    ) external onlyAdmin {
        if (blacklistedAddresses[_address] == _isBlacklisted) return;
        blacklistedAddresses[_address] = _isBlacklisted;
        emit BlacklistedAddressUpdated(_address, _isBlacklisted);
    }

    function updateWhitelistStatus(bool status) external onlyAdmin {
        if (isWhitelistEnabled == status) return;
        bool previousStatus = isWhitelistEnabled;
        isWhitelistEnabled = status;
        emit WhitelistedStatusUpdated(previousStatus, status);
    }

    function updateBlacklistStatus(bool status) external onlyAdmin {
        if (isBlacklistEnabled == status) return;
        bool previousStatus = isBlacklistEnabled;
        isBlacklistEnabled = status;
        emit BlacklistedStatusUpdated(previousStatus, status);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @notice Override renounceOwnership to prevent renunciation while paused
     * @dev Prevents permanent freeze of contract functionality by ensuring
     *      the contract is unpaused before ownership can be renounced
     */
    function renounceOwnership() public override onlyOwner {
        if (paused()) revert CannotRenounceWhilePaused();
        super.renounceOwnership();
    }

    receive() external payable {
        emit Deposit(msg.sender, address(0), msg.value);
    }
}
