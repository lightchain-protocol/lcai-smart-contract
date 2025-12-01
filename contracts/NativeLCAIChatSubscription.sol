// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NativeLCAIChatSubscription
 * @notice Subscription management for LCAI Chat with tiered plans
 * @dev Supports monthly and yearly subscriptions across 3 tiers
 */
contract NativeLCAIChatSubscription is ReentrancyGuard, Pausable, Ownable {
    // ============================================================================
    // CONSTANTS & STATE VARIABLES
    // ============================================================================

    /// @notice Contract version
    string public constant version = "1.0.0";

    event SpecVersionAnnounced(string version);

    /// @notice Admin address for managing subscriptions and pricing
    address public admin;

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

    /// @notice Mapping to track if a user has ever subscribed
    mapping(address => bool) private hasEverSubscribed;

    /// @notice Total number of unique lifetime subscribers
    uint256 public totalSubscribers;

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

    event AdminUpdated(address indexed previousAdmin, address indexed newAdmin);

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
    error HaveActiveSubscription();
    error Unauthorized();

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * @notice Initialize the subscription contract
     * @param _treasury Treasury address to receive subscription payments
     * @param _timelock Timelock address (will be the owner)
     * @param _admin Admin address for managing subscriptions
     */
    constructor(
        address payable _treasury,
        address _timelock,
        address _admin
    ) Ownable(_timelock) {
        if (
            _treasury == address(0) ||
            _timelock == address(0) ||
            _admin == address(0)
        ) revert InvalidAddress();

        treasury = _treasury;
        admin = _admin;

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
        emit SpecVersionAnnounced(version);
    }

    // ============================================================================
    // SUBSCRIPTION FUNCTIONS
    // ============================================================================

    /**
     * @notice Subscribe to a plan
     * @param tier Subscription tier (0 = tier1, 1 = tier2, 2 = tier3)
     * @param duration Duration type (0 = monthly/30 days, 1 = yearly/365 days)
     * @dev Can only subscribe if no active subscription exists
     */
    function subscribe(
        uint256 tier,
        uint256 duration
    ) external payable whenNotPaused nonReentrant {
        if (tier > MAX_TIER) revert InvalidTier();
        if (duration > DURATION_YEARLY) revert InvalidDuration();
        if (treasury == address(0)) revert TreasuryNotSet();

        Subscription storage sub = subscriptions[msg.sender];

        // Check if user has an active subscription
        if (sub.expiryTimestamp > block.timestamp) {
            revert HaveActiveSubscription();
        }

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

        // Increment subscriber count only for first-time subscribers
        if (!hasEverSubscribed[msg.sender]) {
            totalSubscribers++;
            hasEverSubscribed[msg.sender] = true;
        }

        uint256 expiryTimestamp = block.timestamp + durationSeconds;

        // Update subscription
        sub.tier = tier;
        sub.expiryTimestamp = expiryTimestamp;

        // Send payment to treasury
        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit SubscriptionPurchased(
            msg.sender,
            tier,
            duration,
            price,
            expiryTimestamp
        );
    }

    /**
     * @notice Check if a user has an active subscription
     * @param user User address
     * @return True if user has active subscription
     */
    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription storage sub = subscriptions[user];
        return sub.expiryTimestamp > block.timestamp;
    }

    /**
     * @notice Get subscription details for a user
     * @param user User address
     * @return tier Subscription tier
     * @return expiryTimestamp Expiry timestamp
     * @return isExpired Whether subscription has expired
     */
    function getSubscription(
        address user
    )
        external
        view
        returns (uint256 tier, uint256 expiryTimestamp, bool isExpired)
    {
        Subscription storage sub = subscriptions[user];
        bool expired = sub.expiryTimestamp <= block.timestamp;
        return (sub.tier, sub.expiryTimestamp, expired);
    }

    /**
     * @notice Get remaining time on subscription
     * @param user User address
     * @return Remaining time in seconds (0 if expired)
     */
    function getRemainingTime(address user) external view returns (uint256) {
        Subscription storage sub = subscriptions[user];
        if (sub.expiryTimestamp <= block.timestamp) {
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
    ) external onlyAdmin {
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
    function updateTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Update admin address
     * @param _admin New admin address
     */
    function updateAdmin(address _admin) external onlyAdmin {
        if (_admin == address(0)) revert InvalidAddress();
        address previousAdmin = admin;
        admin = _admin;
        emit AdminUpdated(previousAdmin, _admin);
    }

    /**
     * @notice Pause the contract
     * @dev Only admins can pause
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only admins can unpause
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get plan details for a specific tier
     * @param tier Tier to query
     * @return PlanPrice structure containing monthlyPrice, yearlyPrice, and isActive
     */
    function getPlan(uint256 tier) external view returns (PlanPrice memory) {
        if (tier > MAX_TIER) revert InvalidTier();
        return planPrices[tier];
    }

    /**
     * @notice Get all plan details
     * @return Array of PlanPrice structures
     */
    function getAllPlans() external view returns (PlanPrice[] memory) {
        PlanPrice[] memory plans = new PlanPrice[](3);

        for (uint256 i = 0; i <= MAX_TIER; i++) {
            plans[i] = planPrices[i];
        }

        return plans;
    }

    /**
     * @notice Check if an address is an admin
     * @param account Address to check
     * @return True if account has admin role
     */
    function isAdmin(address account) external view returns (bool) {
        return account == admin;
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
