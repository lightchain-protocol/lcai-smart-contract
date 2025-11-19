// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract LCAITreasury is ReentrancyGuard, Pausable, Ownable {
    address public admin;

    uint256 public spent;

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

    function transfer(
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
        spent += _amount;
    }

    function getBalance() external view returns (uint256) {
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
