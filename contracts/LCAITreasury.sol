//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LCAITreasury is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    address public admin;
    address public timelock;

    mapping(address => uint256) public spent;
    mapping(address => bool) public whitelistedAddresses;
    mapping(address => bool) public blacklistedAddresses;

    bool public isWhitelisted = false;
    bool public isBlacklisted = false;

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
    error AdminMustBeMultisig();
    error WhitelistedAddressNotAllowed();
    error BlacklistedAddressNotAllowed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address _timelock, address _admin) Ownable(_timelock) {
        _updateAdmin(_admin);
    }

    function transferETH(
        address _recipient,
        uint256 _amount
    ) external nonReentrant whenNotPaused onlyOwner {
        if (isWhitelisted && !whitelistedAddresses[_recipient])
            revert WhitelistedAddressNotAllowed();
        if (isBlacklisted && blacklistedAddresses[_recipient])
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
        if (isWhitelisted && !whitelistedAddresses[_recipient])
            revert WhitelistedAddressNotAllowed();
        if (isBlacklisted && blacklistedAddresses[_recipient])
            revert BlacklistedAddressNotAllowed();

        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        if (balance < _amount) revert InsufficientBalance();

        token.safeTransfer(_recipient, _amount);
        spent[address(_token)] += _amount;

        emit ERC20Transferred(_token, _recipient, _amount);
    }

    function deposit(address _token) external payable {
        if (_token != address(0)) {
            IERC20 token = IERC20(_token);
            token.safeTransferFrom(msg.sender, address(this), msg.value);
        }
        emit Deposit(msg.sender, _token, msg.value);
    }

    function depositETH() external payable {
        emit Deposit(msg.sender, address(0), msg.value);
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
    function updateAdmin(address _admin) external onlyAdmin {
        _updateAdmin(_admin);
    }

    function _updateAdmin(address _admin) internal {
        address previousAdmin = admin;
        admin = _admin;
        if (_admin.code.length == 0) revert AdminMustBeMultisig();
        emit AdminUpdated(previousAdmin, _admin);
    }

    function setWhitelistedAddress(
        address _address,
        bool _isWhitelisted
    ) external onlyAdmin {
        whitelistedAddresses[_address] = _isWhitelisted;
        emit WhitelistedAddressUpdated(_address, _isWhitelisted);
    }

    function setBlacklistedAddress(
        address _address,
        bool _isBlacklisted
    ) external onlyAdmin {
        blacklistedAddresses[_address] = _isBlacklisted;
        emit BlacklistedAddressUpdated(_address, _isBlacklisted);
    }

    function updateWhitelistedStatus(bool _isWhitelisted) external onlyAdmin {
        bool previousStatus = isWhitelisted;
        isWhitelisted = _isWhitelisted;
        emit WhitelistedStatusUpdated(previousStatus, _isWhitelisted);
    }

    function updateBlacklistedStatus(bool _isBlacklisted) external onlyAdmin {
        bool previousStatus = isBlacklisted;
        isBlacklisted = _isBlacklisted;
        emit BlacklistedStatusUpdated(previousStatus, _isBlacklisted);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    receive() external payable {}
}
