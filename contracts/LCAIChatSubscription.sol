// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LCAIChatSubscription
 * @notice Subscription management for LCAI Chat with tiered plans
 * @dev Supports monthly and yearly subscriptions across 3 tiers
 */
contract LCAIChatSubscription is AccessControl, ReentrancyGuard, Pausable {
    // ============================================================================
    // CONSTANTS & ROLES
    // ============================================================================

    /// @notice Admin role for managing subscriptions and pricing
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Duration constants
    uint256 public constant MONTHLY_DURATION = 30 days;
    uint256 public constant YEARLY_DURATION = 365 days;

    /// @notice Tier indices
    uint256 public constant TIER_1 = 0;
    uint256 public constant TIER_2 = 1;
    uint256 public constant TIER_3 = 2;
    uint256 public constant MAX_TIER = 2;

    /// @notice Duration types
    uint256 public constant DURATION_MONTHLY = 0;
    uint256 public constant DURATION_YEARLY = 1;

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /// @notice Subscription plan pricing structure
    struct PlanPrice {
        uint256 monthlyPrice; // Price in LCAI (wei) for 30 days
        uint256 yearlyPrice; // Price in LCAI (wei) for 365 days
        bool isActive; // Whether this tier is currently available
    }

    /// @notice User subscription data
    struct Subscription {
        uint256 tier; // 0 = tier1, 1 = tier2, 2 = tier3
        uint256 expiryTimestamp; // When subscription expires
        bool isActive; // Whether subscription is currently active
    }

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice Treasury address where all subscription payments are sent
    address payable public treasury;

    /// @notice Mapping from tier to plan pricing
    mapping(uint256 => PlanPrice) public planPrices;

    /// @notice Mapping from user address to their subscription
    mapping(address => Subscription) public subscriptions;

    /// @notice Total number of active subscribers
    uint256 public totalActiveSubscribers;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event SubscriptionPurchased(
        address indexed user,
        uint256 tier,
        uint256 duration,
        uint256 price,
        uint256 expiryTimestamp
    );

    event SubscriptionRenewed(
        address indexed user,
        uint256 tier,
        uint256 duration,
        uint256 price,
        uint256 newExpiryTimestamp
    );

    event SubscriptionExpired(
        address indexed user,
        uint256 tier,
        uint256 expiredAt
    );

    event PlanPriceUpdated(
        uint256 indexed tier,
        uint256 monthlyPrice,
        uint256 yearlyPrice,
        bool isActive
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error InvalidTier();
    error InvalidDuration();
    error PlanNotActive();
    error IncorrectPayment();
    error TreasuryNotSet();
    error TransferFailed();
    error InvalidAddress();
    error InvalidPrice();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * @notice Initialize the subscription contract
     * @param _treasury Treasury address to receive subscription payments
     * @param _defaultAdmin Default admin address
     */
    constructor(address payable _treasury, address _defaultAdmin) {
        if (_treasury == address(0) || _defaultAdmin == address(0))
            revert InvalidAddress();

        treasury = _treasury;

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(ADMIN_ROLE, _defaultAdmin);

        // Initialize default pricing (can be updated by admin)
        // Default prices (example values in wei - adjust as needed)
        planPrices[TIER_1] = PlanPrice({
            monthlyPrice: 2 ether, // 2 LCAI per month
            yearlyPrice: 20 ether, // 20 LCAI per year
            isActive: true
        });

        planPrices[TIER_2] = PlanPrice({
            monthlyPrice: 5 ether, // 5 LCAI per month
            yearlyPrice: 50 ether, // 50 LCAI per year
            isActive: true
        });

        planPrices[TIER_3] = PlanPrice({
            monthlyPrice: 10 ether, // 10 LCAI per month
            yearlyPrice: 100 ether, // 100 LCAI per year
            isActive: true
        });

        emit TreasuryUpdated(address(0), _treasury);
    }

    // ============================================================================
    // SUBSCRIPTION FUNCTIONS
    // ============================================================================

    /**
     * @notice Subscribe to a plan
     * @param tier Subscription tier (0 = tier1, 1 = tier2, 2 = tier3)
     * @param duration Duration type (0 = monthly/30 days, 1 = yearly/365 days)
     */
    function subscribe(
        uint256 tier,
        uint256 duration
    ) external payable whenNotPaused nonReentrant {
        if (tier > MAX_TIER) revert InvalidTier();
        if (duration > DURATION_YEARLY) revert InvalidDuration();
        if (treasury == address(0)) revert TreasuryNotSet();

        PlanPrice storage plan = planPrices[tier];
        if (!plan.isActive) revert PlanNotActive();

        // Get the price based on duration
        uint256 price = duration == DURATION_MONTHLY
            ? plan.monthlyPrice
            : plan.yearlyPrice;
        if (msg.value != price) revert IncorrectPayment();

        // Calculate subscription duration and expiry
        uint256 durationSeconds = duration == DURATION_MONTHLY
            ? MONTHLY_DURATION
            : YEARLY_DURATION;
        uint256 newExpiry;

        Subscription storage sub = subscriptions[msg.sender];

        // If user has an active subscription of the same tier, extend it
        // Otherwise, start fresh from now
        if (
            sub.isActive &&
            sub.expiryTimestamp > block.timestamp &&
            sub.tier == tier
        ) {
            newExpiry = sub.expiryTimestamp + durationSeconds;
            emit SubscriptionRenewed(
                msg.sender,
                tier,
                duration,
                price,
                newExpiry
            );
        } else {
            // New subscription or switching tiers
            if (!sub.isActive || sub.expiryTimestamp <= block.timestamp) {
                totalActiveSubscribers++;
            }
            newExpiry = block.timestamp + durationSeconds;
            emit SubscriptionPurchased(
                msg.sender,
                tier,
                duration,
                price,
                newExpiry
            );
        }

        // Update subscription
        sub.tier = tier;
        sub.expiryTimestamp = newExpiry;
        sub.isActive = true;

        // Send payment to treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Check if a user has an active subscription
     * @param user User address
     * @return True if user has active subscription
     */
    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription storage sub = subscriptions[user];
        return sub.isActive && sub.expiryTimestamp > block.timestamp;
    }

    /**
     * @notice Get subscription details for a user
     * @param user User address
     * @return tier Subscription tier
     * @return expiryTimestamp Expiry timestamp
     * @return isActive Whether subscription is active
     * @return isExpired Whether subscription has expired
     */
    function getSubscription(
        address user
    )
        external
        view
        returns (
            uint256 tier,
            uint256 expiryTimestamp,
            bool isActive,
            bool isExpired
        )
    {
        Subscription storage sub = subscriptions[user];
        bool expired = sub.expiryTimestamp <= block.timestamp;
        return (
            sub.tier,
            sub.expiryTimestamp,
            sub.isActive && !expired,
            expired
        );
    }

    /**
     * @notice Get remaining time on subscription
     * @param user User address
     * @return Remaining time in seconds (0 if expired)
     */
    function getRemainingTime(address user) external view returns (uint256) {
        Subscription storage sub = subscriptions[user];
        if (!sub.isActive || sub.expiryTimestamp <= block.timestamp) {
            return 0;
        }
        return sub.expiryTimestamp - block.timestamp;
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Update plan pricing
     * @param tier Tier to update
     * @param monthlyPrice New monthly price in LCAI (wei)
     * @param yearlyPrice New yearly price in LCAI (wei)
     * @param isActive Whether tier should be active
     */
    function updatePlanPrice(
        uint256 tier,
        uint256 monthlyPrice,
        uint256 yearlyPrice,
        bool isActive
    ) external onlyRole(ADMIN_ROLE) {
        if (tier > MAX_TIER) revert InvalidTier();
        if (monthlyPrice == 0 || yearlyPrice == 0) revert InvalidPrice();

        planPrices[tier] = PlanPrice({
            monthlyPrice: monthlyPrice,
            yearlyPrice: yearlyPrice,
            isActive: isActive
        });

        emit PlanPriceUpdated(tier, monthlyPrice, yearlyPrice, isActive);
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(
        address payable newTreasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Add a new admin
     * @param newAdmin Address to grant admin role
     */
    function addAdmin(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin == address(0)) revert InvalidAddress();
        grantRole(ADMIN_ROLE, newAdmin);
        emit AdminAdded(newAdmin);
    }

    /**
     * @notice Remove an admin
     * @param admin Address to revoke admin role
     */
    function removeAdmin(address admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(ADMIN_ROLE, admin);
        emit AdminRemoved(admin);
    }

    /**
     * @notice Pause the contract
     * @dev Only admins can pause
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only admins can unpause
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get plan details for a specific tier
     * @param tier Tier to query
     * @return monthlyPrice Monthly price in LCAI
     * @return yearlyPrice Yearly price in LCAI
     * @return isActive Whether tier is active
     */
    function getPlan(
        uint256 tier
    )
        external
        view
        returns (uint256 monthlyPrice, uint256 yearlyPrice, bool isActive)
    {
        if (tier > MAX_TIER) revert InvalidTier();
        PlanPrice storage plan = planPrices[tier];
        return (plan.monthlyPrice, plan.yearlyPrice, plan.isActive);
    }

    /**
     * @notice Get all plan details
     * @return tiers Array of tier indices [0, 1, 2]
     * @return monthlyPrices Array of monthly prices for each tier
     * @return yearlyPrices Array of yearly prices for each tier
     * @return activeStatus Array of active status for each tier
     */
    function getAllPlans()
        external
        view
        returns (
            uint256[] memory tiers,
            uint256[] memory monthlyPrices,
            uint256[] memory yearlyPrices,
            bool[] memory activeStatus
        )
    {
        tiers = new uint256[](3);
        monthlyPrices = new uint256[](3);
        yearlyPrices = new uint256[](3);
        activeStatus = new bool[](3);

        for (uint256 i = 0; i <= MAX_TIER; i++) {
            tiers[i] = i;
            monthlyPrices[i] = planPrices[i].monthlyPrice;
            yearlyPrices[i] = planPrices[i].yearlyPrice;
            activeStatus[i] = planPrices[i].isActive;
        }

        return (tiers, monthlyPrices, yearlyPrices, activeStatus);
    }

    /**
     * @notice Check if an address is an admin
     * @param account Address to check
     * @return True if account has admin role
     */
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /**
     * @notice Get total active subscribers count
     * @return Total number of active subscribers
     */
    function getTotalActiveSubscribers() external view returns (uint256) {
        return totalActiveSubscribers;
    }

    // ============================================================================
    // RECEIVE FUNCTION (blocked - only accept through subscribe)
    // ============================================================================

    /**
     * @notice Reject direct ETH transfers
     * @dev Users must use subscribe() function
     */
    receive() external payable {
        revert("Use subscribe() function");
    }
}
