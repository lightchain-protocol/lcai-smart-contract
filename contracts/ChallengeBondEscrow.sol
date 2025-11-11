// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ChallengeBondEscrow
/// @notice Minimal escrow for fraud-challenge bonds in the PoI dispute flow.
/// @dev Owner is expected to be LCAITimeLock; resolver role is granted to a
///      DAO-controlled executor or a dedicated service that settles disputes.
contract ChallengeBondEscrow is Ownable, ReentrancyGuard, Pausable, AccessControl {
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    struct Bond {
        address challenger;
        uint256 amount;
        uint64 postedAt;
        uint64 expiresAt;
        bool refunded;
        bool slashed;
    }

    // challengeId => Bond
    mapping(bytes32 => Bond) private bonds;

    // Config
    uint256 public minBond; // minimum required bond (wei)
    uint256 public challengeWindowSecs; // window length recorded on post
    address public treasury; // beneficiary for slashed bonds (e.g., LCAITreasury)

    event BondPosted(bytes32 indexed challengeId, address indexed challenger, uint256 amount, uint256 postedAt, uint256 expiresAt);
    event BondRefunded(bytes32 indexed challengeId, address indexed to, uint256 amount);
    event BondSlashed(bytes32 indexed challengeId, address indexed beneficiary, uint256 amount);

    error InvalidAmount();
    error BondExists();
    error BondNotFound();
    error AlreadySettled();
    error TransferFailed();
    error ZeroAddress();

    /// @param _timelock Timelock that becomes the contract owner
    /// @param _resolver Initial resolver (can be address(0) and set later)
    /// @param _treasury Treasury beneficiary for slashed funds
    /// @param _minBond Minimum bond amount in wei (e.g., 100 ether for 100 LCAI)
    /// @param _challengeWindowSecs Window length to record for each bond
    constructor(
        address _timelock,
        address _resolver,
        address _treasury,
        uint256 _minBond,
        uint256 _challengeWindowSecs
    ) Ownable(_timelock) {
        if (_timelock == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        minBond = _minBond;
        challengeWindowSecs = _challengeWindowSecs;
        treasury = _treasury;

        // AccessControl: make timelock the admin
        _grantRole(DEFAULT_ADMIN_ROLE, _timelock);
        if (_resolver != address(0)) {
            _grantRole(RESOLVER_ROLE, _resolver);
        }
    }

    /// @notice Post a bond for a given challenge ID.
    /// @dev Requires msg.value >= minBond and no prior bond posted for this ID.
    function postBond(bytes32 challengeId) external payable whenNotPaused nonReentrant {
        if (msg.value < minBond) revert InvalidAmount();
        Bond storage b = bonds[challengeId];
        if (b.amount != 0) revert BondExists();

        uint64 nowTs = uint64(block.timestamp);
        uint64 exp = uint64(block.timestamp + challengeWindowSecs);

        bonds[challengeId] = Bond({
            challenger: msg.sender,
            amount: msg.value,
            postedAt: nowTs,
            expiresAt: exp,
            refunded: false,
            slashed: false
        });

        emit BondPosted(challengeId, msg.sender, msg.value, nowTs, exp);
    }

    /// @notice Refund a bond to a recipient. Only callable by RESOLVER_ROLE.
    function refundBond(bytes32 challengeId, address to) external whenNotPaused nonReentrant onlyRole(RESOLVER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        Bond storage b = bonds[challengeId];
        if (b.refunded || b.slashed) revert AlreadySettled();
        if (b.amount == 0) revert BondNotFound();

        uint256 amt = b.amount;
        b.refunded = true;
        b.amount = 0; // prevent double-spend

        (bool ok, ) = to.call{value: amt}("");
        if (!ok) revert TransferFailed();

        emit BondRefunded(challengeId, to, amt);
    }

    /// @notice Slash a bond by `amount` and send funds to a beneficiary (or default treasury).
    /// @dev Only callable by RESOLVER_ROLE. Supports partial slashing; remaining amount stays locked.
    function slashBond(bytes32 challengeId, address beneficiary, uint256 amount) external whenNotPaused nonReentrant onlyRole(RESOLVER_ROLE) {
        Bond storage b = bonds[challengeId];
        if (b.refunded) revert AlreadySettled();
        if (b.amount == 0) revert BondNotFound();
        if (amount == 0 || amount > b.amount) revert InvalidAmount();

        address dest = beneficiary == address(0) ? treasury : beneficiary;

        b.amount -= amount;
        b.slashed = true;

        (bool ok, ) = dest.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit BondSlashed(challengeId, dest, amount);
    }

    // ----------------- Admin functions (timelock owner) -----------------

    function setMinBond(uint256 _minBond) external onlyOwner {
        minBond = _minBond;
    }

    function setChallengeWindow(uint256 _secs) external onlyOwner {
        challengeWindowSecs = _secs;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    /// @notice Set or unset a resolver address.
    function setResolver(address _resolver, bool enabled) external onlyOwner {
        if (_resolver == address(0)) revert ZeroAddress();
        if (enabled) {
            _grantRole(RESOLVER_ROLE, _resolver);
        } else {
            _revokeRole(RESOLVER_ROLE, _resolver);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ----------------- Views -----------------

    function getBond(bytes32 challengeId) external view returns (Bond memory) {
        return bonds[challengeId];
    }

    receive() external payable {}
}
