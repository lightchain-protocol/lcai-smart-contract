// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LCAIChatUtility
 * @notice Unified utility contract for LCAI chat sessions and rewards
 * @dev Controlled by LCAITimeLock (which is controlled by LCAIGovernor)
 * @dev This contract consolidates session management and reward tracking functionality
 * @dev Replaces the Diamond proxy pattern with a simpler, more maintainable architecture
 */
contract LCAIChatUtility is Ownable, ReentrancyGuard, Pausable {
    string public constant version = "1.0.0";
    event SpecVersionAnnounced(string version);
    
    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    /// @notice Maximum length for session IDs
    uint256 public constant MAX_SESSION_ID_LENGTH = 128;
    
    /// @notice Maximum length for IPFS hashes
    uint256 public constant MAX_IPFS_HASH_LENGTH = 64;
    
    /// @notice Basis points for percentage calculations (100% = 10000)
    uint256 public constant BASIS_POINTS = 10000;
    
    /// @notice Maximum validator bonus in basis points (150%)
    uint256 public constant MAX_VALIDATOR_BONUS_BPS = 15000;
    
    /// @notice Minimum validator bonus in basis points (100%)
    uint256 public constant MIN_VALIDATOR_BONUS_BPS = 10000;
    
    // ============================================================================
    // STRUCTS
    // ============================================================================
    
    /// @notice Session data structure
    struct Session {
        string sessionId;
        address user;
        uint256 timestamp;
        string ipfsHash;
        bool isValid;
    }
    
    /// @notice Reward statistics for users
    struct RewardUserStats {
        uint256 totalRewards;
        uint256 totalInteractions;
        uint256 lastRewardTimestamp;
        uint256 averageQuality;
        uint256 weeklyActivity;
    }
    
    /// @notice Transaction info for reward tracking
    struct TransactionInfo {
        bytes32 transactionHash;
        uint256 amount;
        address validator;
        bytes32 inferenceHash;
        uint256 timestamp;
        string msgId;
    }
    
    /// @notice User-reward pair for leaderboard
    struct UserReward {
        address user;
        uint256 rewards;
    }
    
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================
    
    // Session State
    /// @notice Mapping from session ID to session data
    mapping(string => Session) public sessions;
    
    /// @notice Mapping from user address to their session IDs
    mapping(address => string[]) public userSessions;
    
    /// @notice Total number of sessions stored
    uint256 public sessionCount;
    
    // Reward State
    /// @notice Mapping from user address to their reward statistics
    mapping(address => RewardUserStats) public rewardUserStats;
    
    /// @notice Mapping from user address to their transaction history
    mapping(address => TransactionInfo[]) public userTransactions;
    
    /// @notice Mapping from user address to their last claim epoch
    mapping(address => uint256) public lastClaimEpoch;
    
    /// @notice Mapping from epoch to total rewards distributed
    mapping(uint256 => uint256) public epochRewards;
    
    /// @notice Mapping to track used message IDs (prevent double rewards)
    mapping(string => bool) public msgIdExists;
    
    // User Tracking (for rankings)
    /// @notice Total number of users who have received rewards
    uint256 public totalUserCount;
    
    /// @notice Mapping from index to user address
    mapping(uint256 => address) public userIndexToAddress;
    
    /// @notice Mapping from user address to their index
    mapping(address => uint256) public userAddressToIndex;
    
    // Prepaid Message Credits (deprecated - migrating to subscriptions)
    /// @notice Prepaid message credits per user (number of messages available)
    mapping(address => uint256) private _prepaidMessageCredits;
    
    // Subscription System
    /// @notice Subscription plan tier details
    struct SubscriptionPlan {
        uint256 monthlyPriceUSD;   // Monthly price in USD (scaled by 100, e.g., 2500 = $25.00)
        uint256 yearlyPriceUSD;    // Yearly price in USD (scaled by 100, 20% discount from monthly*12)
        uint256 tokenLimit;        // Max tokens/chats per month (0 = unlimited)
        string modelAccess;        // Model tier: "base", "pro", "premium"
        bool isActive;
    }
    
    /// @notice User subscription data
    struct UserSubscription {
        uint256 expiryTimestamp;   // When subscription expires (0 = no subscription)
        uint256 planTier;          // Plan tier index (0=base, 1=pro, 2=premium)
        uint256 usageCount;        // Usage this period (for token limits)
        uint256 lastResetTimestamp; // Last usage counter reset
        bool isActive;
    }
    
    /// @notice Subscription plans by tier (0=base $25/mo, 1=pro, 2=premium)
    mapping(uint256 => SubscriptionPlan) public subscriptionPlans;
    
    /// @notice User subscriptions
    mapping(address => UserSubscription) public userSubscriptions;
    
    /// @notice Treasury address for subscription payments (LCAI goes here)
    address payable public treasuryAddress;
    
    /// @notice LCAI token contract for price oracle integration (fetch live price from DEX)
    address public lcaiTokenAddress;
    
    /// @notice DEX price oracle address (for USD → LCAI conversion)
    address public priceOracleAddress;
    
    // Access Control for Rewards
    /// @notice Authorized addresses that can issue rewards (e.g., backend service)
    mapping(address => bool) public authorizedRewardIssuers;
    
    // Configuration
    /// @notice Fee for chat interactions in native LCAI
    uint256 public chatFeeLCAI;
    
    /// @notice Base reward amount for chat interactions
    uint256 public baseReward;
    
    /// @notice Duration of an epoch in seconds
    uint256 public epochDuration;
    
    /// @notice Maximum reward per epoch
    uint256 public maxRewardPerEpoch;
    
    /// @notice Validator bonus multiplier in basis points
    uint256 public validatorBonusMultiplierBps;
    
    // ============================================================================
    // EVENTS
    // ============================================================================
    
    // Session Events
    event SessionStored(string indexed sessionId, address indexed user, string ipfsHash, uint256 timestamp);
    event SessionUpdated(string indexed sessionId, address indexed user, string ipfsHash, uint256 timestamp);
    event SessionDeleted(string indexed sessionId, address indexed user);
    
    // Reward Events
    event ChatRewardIssued(address indexed user, uint256 amount, string msgId, address validator, bytes32 transactionHash);
    event RewardParamsUpdated(uint256 baseReward, uint256 epochDuration, uint256 maxRewardPerEpoch);
    event ValidatorBonusUpdated(uint256 oldMultiplier, uint256 newMultiplier);
    event PayoutCalculated(uint256 baseReward, uint256 bonus, uint256 payout);
    
    // Configuration Events
    event ChatFeeUpdated(uint256 oldFee, uint256 newFee);
    
    // Prepaid Events (deprecated)
    event MessagesPrepaid(address indexed user, uint256 count, uint256 totalCredits);
    event PrepaidMessageConsumed(address indexed user, uint256 remainingCredits);
    
    // Subscription Events
    event SubscriptionPurchased(address indexed user, uint256 planTier, uint256 duration, uint256 expiryTimestamp, uint256 lcaiAmount);
    event SubscriptionPlanUpdated(uint256 tier, uint256 monthlyPriceUSD, uint256 yearlyPriceUSD, uint256 tokenLimit, string modelAccess);
    event TreasuryAddressUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event SubscriptionExpired(address indexed user, uint256 expiredAt);
    event UsageLimitReached(address indexed user, uint256 limit);
    
    // Authorization Events
    event RewardIssuerAuthorized(address indexed issuer);
    event RewardIssuerRevoked(address indexed issuer);
    
    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    
    /**
     * @notice Initialize the chat utility contract
     * @dev This contract itself acts as the reward vault (holds and distributes rewards)
     * @param _initialChatFee Initial chat fee in native LCAI
     * @param _baseReward Base reward amount for chat
     * @param _epochDuration Duration of an epoch in seconds
     * @param _maxRewardPerEpoch Maximum reward per epoch
     */
    constructor(
        uint256 _initialChatFee,
        uint256 _baseReward,
        uint256 _epochDuration,
        uint256 _maxRewardPerEpoch
    ) Ownable(msg.sender) {
        require(_baseReward > 0, "Base reward must be > 0");
        require(_epochDuration > 0, "Epoch duration must be > 0");
        require(_maxRewardPerEpoch > 0, "Max reward per epoch must be > 0");
        
        chatFeeLCAI = _initialChatFee;
        baseReward = _baseReward;
        epochDuration = _epochDuration;
        maxRewardPerEpoch = _maxRewardPerEpoch;
        validatorBonusMultiplierBps = MIN_VALIDATOR_BONUS_BPS; // 100% (no bonus by default)
        
        // Authorize deployer to issue rewards initially
        authorizedRewardIssuers[msg.sender] = true;
        emit RewardIssuerAuthorized(msg.sender);
        emit SpecVersionAnnounced(version);
    }
    
    // ============================================================================
    // SESSION MANAGEMENT FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Prepay a number of messages at once to avoid per-message signatures
     * @dev msg.value must equal count * chatFeeLCAI(); credits are tracked per user
     * @param count Number of messages to prepay
     */
    function prepayMessages(uint256 count) external payable whenNotPaused {
        require(count > 0, "Count must be > 0");
        require(chatFeeLCAI > 0, "Chat fee is zero");
        
        uint256 required = chatFeeLCAI * count;
        require(msg.value == required, "Incorrect payment amount");
        
        // Funds stay in this contract (it is the vault)
        // msg.value automatically added to contract balance
        
        _prepaidMessageCredits[msg.sender] += count;
        emit MessagesPrepaid(msg.sender, count, _prepaidMessageCredits[msg.sender]);
    }
    
    /**
     * @notice Return remaining prepaid message credits for a user
     * @param user User address
     * @return Number of prepaid messages remaining
     */
    function prepaidMessageCredits(address user) external view returns (uint256) {
        return _prepaidMessageCredits[user];
    }
    
    /**
     * @notice Store a new session (admin/backend only)
     * @param sessionId Unique session identifier
     * @param user User address
     * @param ipfsHash IPFS hash of session data
     */
    function storeSession(
        string calldata sessionId,
        address user,
        string calldata ipfsHash
    ) external payable whenNotPaused {
        require(bytes(sessionId).length > 0 && bytes(sessionId).length <= MAX_SESSION_ID_LENGTH, "Invalid session ID");
        require(user != address(0), "Invalid user address");
        require(bytes(ipfsHash).length > 0 && bytes(ipfsHash).length <= MAX_IPFS_HASH_LENGTH, "Invalid IPFS hash");
        require(bytes(sessions[sessionId].sessionId).length == 0, "Session already exists");
        
        // Collect fee for the designated user
        _collectFeeFor(user);
        
        sessions[sessionId] = Session({
            sessionId: sessionId,
            user: user,
            timestamp: block.timestamp,
            ipfsHash: ipfsHash,
            isValid: true
        });
        
        userSessions[user].push(sessionId);
        sessionCount++;
        
        emit SessionStored(sessionId, user, ipfsHash, block.timestamp);
    }
    
    /**
     * @notice Store a new session (user accessible)
     * @param sessionId Unique session identifier
     * @param ipfsHash IPFS hash of session data
     */
    function storeUserSession(
        string calldata sessionId,
        string calldata ipfsHash
    ) external payable whenNotPaused {
        address user = msg.sender;
        
        require(bytes(sessionId).length > 0 && bytes(sessionId).length <= MAX_SESSION_ID_LENGTH, "Invalid session ID");
        require(bytes(ipfsHash).length > 0 && bytes(ipfsHash).length <= MAX_IPFS_HASH_LENGTH, "Invalid IPFS hash");
        require(bytes(sessions[sessionId].sessionId).length == 0, "Session already exists");
        
        _collectFeeFor(user);
        
        sessions[sessionId] = Session({
            sessionId: sessionId,
            user: user,
            timestamp: block.timestamp,
            ipfsHash: ipfsHash,
            isValid: true
        });
        
        userSessions[user].push(sessionId);
        sessionCount++;
        
        emit SessionStored(sessionId, user, ipfsHash, block.timestamp);
    }
    
    /**
     * @notice Update an existing session (user accessible)
     * @param sessionId Session identifier
     * @param ipfsHash New IPFS hash
     */
    function updateSession(
        string calldata sessionId,
        string calldata ipfsHash
    ) external payable whenNotPaused {
        address user = msg.sender;
        
        require(bytes(sessionId).length > 0, "Invalid session ID");
        require(bytes(ipfsHash).length > 0 && bytes(ipfsHash).length <= MAX_IPFS_HASH_LENGTH, "Invalid IPFS hash");
        
        Session storage s = sessions[sessionId];
        require(bytes(s.sessionId).length > 0, "Session does not exist");
        require(s.user == user, "Not authorized");
        
        _collectFeeFor(user);
        
        s.ipfsHash = ipfsHash;
        s.timestamp = block.timestamp;
        
        emit SessionUpdated(sessionId, user, ipfsHash, block.timestamp);
    }
    
    /**
     * @notice Admin update of an existing session (owner only)
     * @param sessionId Session identifier
     * @param ipfsHash New IPFS hash
     */
    function adminUpdateSession(
        string calldata sessionId,
        string calldata ipfsHash
    ) external payable onlyOwner whenNotPaused {
        require(bytes(sessionId).length > 0, "Invalid session ID");
        require(bytes(ipfsHash).length > 0 && bytes(ipfsHash).length <= MAX_IPFS_HASH_LENGTH, "Invalid IPFS hash");
        
        Session storage s = sessions[sessionId];
        require(bytes(s.sessionId).length > 0, "Session does not exist");
        
        // Charge the designated user (consume their credit if available)
        _collectFeeFor(s.user);
        
        s.ipfsHash = ipfsHash;
        s.timestamp = block.timestamp;
        
        emit SessionUpdated(sessionId, s.user, ipfsHash, block.timestamp);
    }
    
    /**
     * @notice Get session information
     * @param sessionId Session identifier
     * @return sessionId_ Session ID
     * @return user User address
     * @return timestamp Creation timestamp
     * @return ipfsHash IPFS hash
     * @return isValid Whether session is valid
     */
    function getSession(string calldata sessionId) external view returns (
        string memory sessionId_,
        address user,
        uint256 timestamp,
        string memory ipfsHash,
        bool isValid
    ) {
        Session storage s = sessions[sessionId];
        require(bytes(s.sessionId).length > 0, "Session does not exist");
        return (s.sessionId, s.user, s.timestamp, s.ipfsHash, s.isValid);
    }
    
    /**
     * @notice Check if session exists
     * @param sessionId Session identifier
     * @return Whether session exists
     */
    function doesSessionExist(string calldata sessionId) external view returns (bool) {
        return bytes(sessions[sessionId].sessionId).length > 0;
    }
    
    /**
     * @notice Get user session count
     * @param user User address
     * @return Number of sessions for user
     */
    function getUserSessionCount(address user) external view returns (uint256) {
        return userSessions[user].length;
    }
    
    /**
     * @notice Get session by index for a user
     * @param user User address
     * @param index Session index
     * @return sessionId Session ID
     * @return timestamp Creation timestamp
     * @return ipfsHash IPFS hash
     * @return isValid Whether session is valid
     */
    function getSessionByIndex(address user, uint256 index) external view returns (
        string memory sessionId,
        uint256 timestamp,
        string memory ipfsHash,
        bool isValid
    ) {
        require(index < userSessions[user].length, "Index out of bounds");
        string memory id = userSessions[user][index];
        Session storage s = sessions[id];
        return (s.sessionId, s.timestamp, s.ipfsHash, s.isValid);
    }
    
    /**
     * @notice Get all sessions for a user
     * @param user User address
     * @return Array of session IDs
     */
    function getUserSessions(address user) external view returns (string[] memory) {
        return userSessions[user];
    }
    
    /**
     * @notice Get sessions for a user with pagination
     * @param user User address
     * @param offset Starting index
     * @param limit Maximum number of sessions to return
     * @return Array of session IDs
     */
    function getUserSessionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (string[] memory) {
        string[] storage list = userSessions[user];
        uint256 total = list.length;
        if (offset >= total) return new string[](0);
        
        uint256 end = offset + limit;
        if (end > total) end = total;
        
        string[] memory result = new string[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = list[i];
        }
        return result;
    }
    
    /**
     * @notice Delete a session (user can only delete their own sessions)
     * @param sessionId Session identifier
     */
    function deleteSession(string calldata sessionId) external whenNotPaused {
        Session storage s = sessions[sessionId];
        require(bytes(s.sessionId).length > 0, "Session does not exist");
        require(s.user == msg.sender, "Not authorized");
        
        s.isValid = false;
        emit SessionDeleted(sessionId, s.user);
    }
    
    /**
     * @notice Validate session range
     * @param user User address
     * @param startIndex Starting index
     * @param endIndex Ending index
     * @return Whether range is valid
     */
    function validateSessionRange(
        address user,
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (bool) {
        uint256 total = userSessions[user].length;
        return startIndex < total && endIndex <= total && startIndex < endIndex;
    }
    
    /**
     * @notice Get total session count
     * @return Total number of sessions
     */
    function getTotalSessionCount() external view returns (uint256) {
        return sessionCount;
    }
    
    /**
     * @notice Get session info (alias for getSession)
     * @param sessionId Session identifier
     * @return sessionId_ Session ID
     * @return user User address
     * @return timestamp Creation timestamp
     * @return ipfsHash IPFS hash
     * @return isValid Whether session is valid
     */
    function getSessionInfo(string calldata sessionId) external view returns (
        string memory sessionId_,
        address user,
        uint256 timestamp,
        string memory ipfsHash,
        bool isValid
    ) {
        Session storage s = sessions[sessionId];
        require(bytes(s.sessionId).length > 0, "Session does not exist");
        return (s.sessionId, s.user, s.timestamp, s.ipfsHash, s.isValid);
    }
    
    /**
     * @notice Check if user has sessions
     * @param user User address
     * @return Whether user has sessions
     */
    function hasUserSessions(address user) external view returns (bool) {
        return userSessions[user].length > 0;
    }
    
    /**
     * @notice Get latest session for a user
     * @param user User address
     * @return sessionId Session ID
     * @return timestamp Creation timestamp
     * @return ipfsHash IPFS hash
     * @return isValid Whether session is valid
     */
    function getLatestUserSession(address user) external view returns (
        string memory sessionId,
        uint256 timestamp,
        string memory ipfsHash,
        bool isValid
    ) {
        string[] storage list = userSessions[user];
        require(list.length > 0, "No sessions found");
        
        string memory latestId = list[list.length - 1];
        Session storage s = sessions[latestId];
        return (s.sessionId, s.timestamp, s.ipfsHash, s.isValid);
    }
    
    /**
     * @notice Get session count for a specific time range
     * @param user User address
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @return Number of sessions in range
     */
    function getSessionCountInRange(
        address user,
        uint256 startTime,
        uint256 endTime
    ) external view returns (uint256) {
        string[] storage list = userSessions[user];
        uint256 count = 0;
        
        for (uint256 i = 0; i < list.length; i++) {
            Session storage s = sessions[list[i]];
            if (s.timestamp >= startTime && s.timestamp <= endTime) {
                count++;
            }
        }
        return count;
    }
    
    // ============================================================================
    // REWARD SYSTEM FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Issue chat reward to user
     * @param userAddress User address to reward
     * @param msgId Unique message ID (prevents double rewards)
     * @param validator Validator address (if applicable)
     * @param inferenceHash Hash of inference result
     * @return transactionHash Hash of the reward transaction
     * @dev Only authorized reward issuers can call this function
     */
    function issueChatReward(
        address userAddress,
        string calldata msgId,
        address validator,
        bytes32 inferenceHash
    ) external whenNotPaused nonReentrant returns (bytes32 transactionHash) {
        require(authorizedRewardIssuers[msg.sender], "Not authorized to issue rewards");
        require(userAddress != address(0), "Invalid user address");
        require(bytes(msgId).length > 0, "Invalid message ID");
        require(!msgIdExists[msgId], "Message ID already used");
        
        // Mark message ID as used
        msgIdExists[msgId] = true;
        
        // Calculate current epoch
        uint256 currentEpoch = block.timestamp / epochDuration;
        
        // Check base amount against cap
        require(baseReward <= maxRewardPerEpoch, "Base reward exceeds max per epoch");
        
        // Calculate total rewards issued this epoch so far
        uint256 epochTotal = epochRewards[currentEpoch];
        
        // Calculate bonus with basis points for more precision
        uint256 bonus = 0;
        if (validator != address(0)) {
            bonus = (baseReward * validatorBonusMultiplierBps) / BASIS_POINTS - baseReward;
        }
        
        uint256 payout = baseReward + bonus;
        
        // Emit debug event
        emit PayoutCalculated(baseReward, bonus, payout);
        
        // Update epoch tracking for non-validator rewards
        if (validator == address(0)) {
            require(epochTotal + baseReward <= maxRewardPerEpoch, "Epoch reward cap exceeded");
            epochRewards[currentEpoch] = epochTotal + baseReward;
        }
        
        // Update user state
        lastClaimEpoch[userAddress] = currentEpoch;
        _updateRewardUserStats(userAddress, payout, true);
        
        // Track user for rankings (add to index if first reward)
        if (userAddress != address(0) && userAddressToIndex[userAddress] == 0) {
            // Double-check by ensuring they're not already at index 0
            if (userIndexToAddress[0] != userAddress) {
                userIndexToAddress[totalUserCount] = userAddress;
                userAddressToIndex[userAddress] = totalUserCount;
                totalUserCount++;
            }
        }
        
        // Transfer rewards directly from contract balance
        (bool success,) = payable(userAddress).call{value: payout}("");
        require(success, "Reward transfer failed");
        
        // Record transaction
        transactionHash = keccak256(abi.encodePacked(
            userAddress, payout, validator, inferenceHash, block.timestamp, msgId
        ));
        
        userTransactions[userAddress].push(TransactionInfo({
            transactionHash: transactionHash,
            amount: payout,
            validator: validator,
            inferenceHash: inferenceHash,
            timestamp: block.timestamp,
            msgId: msgId
        }));
        
        emit ChatRewardIssued(userAddress, payout, msgId, validator, transactionHash);
    }
    
    /**
     * @notice Get reward statistics for a user
     * @param user User address
     * @return totalRewards Total rewards earned
     * @return totalInteractions Total interactions
     * @return lastRewardTimestamp Last reward timestamp
     * @return averageQuality Average quality score
     * @return weeklyActivity Weekly activity score
     */
    function getRewardUserStats(address user) external view returns (
        uint256 totalRewards,
        uint256 totalInteractions,
        uint256 lastRewardTimestamp,
        uint256 averageQuality,
        uint256 weeklyActivity
    ) {
        RewardUserStats storage stats = rewardUserStats[user];
        return (
            stats.totalRewards,
            stats.totalInteractions,
            stats.lastRewardTimestamp,
            stats.averageQuality,
            stats.weeklyActivity
        );
    }
    
    /**
     * @notice Get user transaction count
     * @param user User address
     * @return Number of transactions
     */
    function getUserTransactionCount(address user) external view returns (uint256) {
        return userTransactions[user].length;
    }
    
    /**
     * @notice Get user transaction by index
     * @param user User address
     * @param index Transaction index
     * @return transactionHash Transaction hash
     * @return amount Reward amount
     * @return validator Validator address
     * @return inferenceHash Inference hash
     * @return timestamp Transaction timestamp
     * @return msgId Message ID
     */
    function getUserTransaction(address user, uint256 index) external view returns (
        bytes32 transactionHash,
        uint256 amount,
        address validator,
        bytes32 inferenceHash,
        uint256 timestamp,
        string memory msgId
    ) {
        require(index < userTransactions[user].length, "Index out of bounds");
        TransactionInfo storage txInfo = userTransactions[user][index];
        return (
            txInfo.transactionHash,
            txInfo.amount,
            txInfo.validator,
            txInfo.inferenceHash,
            txInfo.timestamp,
            txInfo.msgId
        );
    }
    
    /**
     * @notice Get all user transactions
     * @param user User address
     * @return Array of transaction info
     */
    function getAllUserTransactions(address user) external view returns (TransactionInfo[] memory) {
        return userTransactions[user];
    }
    
    /**
     * @notice Get epoch rewards
     * @param epoch Epoch number
     * @return Total rewards for epoch
     */
    function getEpochRewards(uint256 epoch) external view returns (uint256) {
        return epochRewards[epoch];
    }
    
    /**
     * @notice Get current epoch
     * @return Current epoch number
     */
    function getCurrentEpoch() external view returns (uint256) {
        return block.timestamp / epochDuration;
    }
    
    /**
     * @notice Check if message ID exists
     * @param msgId Message ID
     * @return Whether message ID has been used
     */
    function isMessageIdUsed(string calldata msgId) external view returns (bool) {
        return msgIdExists[msgId];
    }
    
    /**
     * @notice Get user's rank based on total rewards
     * @param user User address
     * @return Rank (1-based, 0 if not ranked)
     */
    function getUserRank(address user) external view returns (uint256) {
        RewardUserStats storage userStats = rewardUserStats[user];
        if (userStats.totalRewards == 0) return 0; // Not ranked if no rewards
        
        uint256 userRewards = userStats.totalRewards;
        uint256 rank = 1; // Start at rank 1
        
        // Count users with higher rewards
        for (uint256 i = 0; i < totalUserCount; i++) {
            address otherUser = userIndexToAddress[i];
            if (otherUser != user && otherUser != address(0)) {
                RewardUserStats storage otherStats = rewardUserStats[otherUser];
                if (otherStats.totalRewards > userRewards) {
                    rank++;
                }
            }
        }
        
        return rank;
    }
    
    /**
     * @notice Get leaderboard of top users by rewards
     * @param limit Maximum number of users to return
     * @return users Array of user addresses
     * @return rewards Array of reward amounts
     * @return ranks Array of ranks
     */
    function getLeaderboard(uint256 limit) external view returns (
        address[] memory users,
        uint256[] memory rewards,
        uint256[] memory ranks
    ) {
        require(limit > 0 && limit <= 100, "Invalid limit");
        
        // Create array of user-reward pairs
        UserReward[] memory userRewards = new UserReward[](totalUserCount);
        uint256 validUsers = 0;
        
        // Collect all users with rewards
        for (uint256 i = 0; i < totalUserCount; i++) {
            address user = userIndexToAddress[i];
            if (user != address(0)) {
                RewardUserStats storage stats = rewardUserStats[user];
                if (stats.totalRewards > 0) {
                    userRewards[validUsers] = UserReward(user, stats.totalRewards);
                    validUsers++;
                }
            }
        }
        
        // Sort by rewards (simple bubble sort for small arrays)
        for (uint256 i = 0; i < validUsers - 1; i++) {
            for (uint256 j = 0; j < validUsers - i - 1; j++) {
                if (userRewards[j].rewards < userRewards[j + 1].rewards) {
                    UserReward memory temp = userRewards[j];
                    userRewards[j] = userRewards[j + 1];
                    userRewards[j + 1] = temp;
                }
            }
        }
        
        // Prepare result arrays
        uint256 resultLength = validUsers < limit ? validUsers : limit;
        users = new address[](resultLength);
        rewards = new uint256[](resultLength);
        ranks = new uint256[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            users[i] = userRewards[i].user;
            rewards[i] = userRewards[i].rewards;
            ranks[i] = i + 1; // Rank starts at 1
        }
        
        return (users, rewards, ranks);
    }
    
    /**
     * @notice Get total number of ranked users (users with rewards > 0)
     * @return Number of ranked users
     */
    function getRankedUserCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < totalUserCount; i++) {
            address user = userIndexToAddress[i];
            if (user != address(0)) {
                RewardUserStats storage stats = rewardUserStats[user];
                if (stats.totalRewards > 0) {
                    count++;
                }
            }
        }
        return count;
    }
    
    /**
     * @notice Get total users count (compatibility with old contract)
     * @return Total number of users
     */
    function totalUsersCount() external view returns (uint256) {
        return totalUserCount;
    }
    
    // ============================================================================
    // DAO GOVERNANCE FUNCTIONS (onlyOwner = LCAITimeLock)
    // ============================================================================
    
    /**
     * @notice Update chat fee (DAO controlled)
     * @param newFee New fee amount
     */
    function updateChatFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = chatFeeLCAI;
        chatFeeLCAI = newFee;
        emit ChatFeeUpdated(oldFee, newFee);
    }
    
    /**
     * @notice Update reward parameters (DAO controlled)
     * @param newBaseReward New base reward amount
     * @param newEpochDuration New epoch duration
     * @param newMaxRewardPerEpoch New max reward per epoch
     */
    function updateRewardParams(
        uint256 newBaseReward,
        uint256 newEpochDuration,
        uint256 newMaxRewardPerEpoch
    ) external onlyOwner {
        require(newBaseReward > 0, "Base reward must be > 0");
        require(newEpochDuration > 0, "Epoch duration must be > 0");
        require(newMaxRewardPerEpoch > 0, "Max reward per epoch must be > 0");
        
        baseReward = newBaseReward;
        epochDuration = newEpochDuration;
        maxRewardPerEpoch = newMaxRewardPerEpoch;
        
        emit RewardParamsUpdated(newBaseReward, newEpochDuration, newMaxRewardPerEpoch);
    }
    
    /**
     * @notice Update validator bonus multiplier (DAO controlled)
     * @param newMultiplierBps New multiplier in basis points
     */
    function updateValidatorBonus(uint256 newMultiplierBps) external onlyOwner {
        require(
            newMultiplierBps >= MIN_VALIDATOR_BONUS_BPS && newMultiplierBps <= MAX_VALIDATOR_BONUS_BPS,
            "Invalid bonus multiplier"
        );
        
        uint256 oldMultiplier = validatorBonusMultiplierBps;
        validatorBonusMultiplierBps = newMultiplierBps;
        
        emit ValidatorBonusUpdated(oldMultiplier, newMultiplierBps);
    }
    
    /**
     * @notice Pause contract (DAO controlled)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause contract (DAO controlled)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Withdraw accumulated fees (DAO controlled)
     * @param amount Amount to withdraw
     */
    function withdrawFees(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(address(this).balance >= amount, "Insufficient balance");
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");
    }
    
    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Collect fee for a user (internal)
     * @param payer User who should pay the fee
     */
    function _collectFeeFor(address payer) internal {
        uint256 credits = _prepaidMessageCredits[payer];
        if (credits > 0) {
            // Use prepaid credit
            unchecked { _prepaidMessageCredits[payer] = credits - 1; }
            emit PrepaidMessageConsumed(payer, _prepaidMessageCredits[payer]);
        } else {
            // Collect native fee
            _collectNativeFee();
        }
    }
    
    /**
     * @notice Collect native fee (internal)
     * @dev Funds stay in this contract (it is the vault)
     */
    function _collectNativeFee() internal {
        uint256 fee = chatFeeLCAI;
        if (fee == 0) return;
        require(msg.value == fee, "Incorrect fee amount");
        
        // Funds stay in this contract (it is the vault)
        // msg.value automatically added to contract balance
    }
    
    /**
     * @notice Update reward user statistics (internal)
     * @param user User address
     * @param amount Reward amount
     * @param isChatReward Whether this is a chat reward
     */
    function _updateRewardUserStats(address user, uint256 amount, bool isChatReward) internal {
        RewardUserStats storage stats = rewardUserStats[user];
        
        stats.totalRewards += amount;
        stats.totalInteractions += 1;
        stats.lastRewardTimestamp = block.timestamp;
        
        // Update weekly activity (simplified - just increment)
        stats.weeklyActivity += 1;
        
        // Update average quality (simplified - assume 8.0 for chat rewards)
        if (isChatReward) {
            stats.averageQuality = (stats.averageQuality * (stats.totalInteractions - 1) + 800) / stats.totalInteractions;
        }
    }
    
    // ============================================================================
    // SUBSCRIPTION FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Subscribe to a plan tier (monthly or yearly)
     * @param planTier Plan tier (0=base $25/mo, 1=pro, 2=premium)
     * @param duration 0 = monthly (30 days), 1 = yearly (365 days, 20% discount)
     * @dev Payment is in LCAI tokens (msg.value); price determined by USD amount + live DEX price
     * @dev Future: integrate price oracle to fetch live LCAI/USD price from DEX
     */
    function subscribePlan(uint256 planTier, uint256 duration) external payable whenNotPaused nonReentrant {
        SubscriptionPlan storage plan = subscriptionPlans[planTier];
        require(plan.isActive, "Plan tier not active");
        require(duration == 0 || duration == 1, "Invalid duration (0=monthly, 1=yearly)");
        require(treasuryAddress != address(0), "Treasury address not set");
        
        // Get price in USD (scaled by 100)
        uint256 priceUSD = duration == 0 ? plan.monthlyPriceUSD : plan.yearlyPriceUSD;
        
        // TODO: Fetch live LCAI price from DEX oracle and convert USD → LCAI amount
        // For now, accept msg.value as LCAI amount (hardcoded conversion until oracle integrated)
        // Future: uint256 lcaiRequired = convertUSDtoLCAI(priceUSD);
        // Future: require(msg.value >= lcaiRequired, "Insufficient LCAI for subscription");
        
        require(msg.value > 0, "Payment required");
        
        uint256 durationSeconds = duration == 0 ? 30 days : 365 days;
        uint256 newExpiry = block.timestamp + durationSeconds;
        
        // Extend existing subscription or create new one
        UserSubscription storage sub = userSubscriptions[msg.sender];
        if (sub.expiryTimestamp > block.timestamp && sub.planTier == planTier) {
            // Extend from current expiry for same tier
            newExpiry = sub.expiryTimestamp + durationSeconds;
        }
        
        sub.expiryTimestamp = newExpiry;
        sub.planTier = planTier;
        sub.isActive = true;
        sub.usageCount = 0;
        sub.lastResetTimestamp = block.timestamp;
        
        // Route payment to treasury (LCAI tokens go directly to treasury)
        (bool success, ) = treasuryAddress.call{value: msg.value}("");
        require(success, "Treasury payment failed");
        
        emit SubscriptionPurchased(msg.sender, planTier, duration, newExpiry, msg.value);
    }
    
    /**
     * @notice Check if an address has an active subscription
     * @param user User address to check
     * @return True if subscription is active and not expired
     */
    function hasActiveSubscription(address user) external view returns (bool) {
        UserSubscription storage sub = userSubscriptions[user];
        return sub.isActive && sub.expiryTimestamp > block.timestamp;
    }
    
    /**
     * @notice Get subscription expiry timestamp for a user
     * @param user User address
     * @return Expiry timestamp (0 if no subscription)
     */
    function getSubscriptionExpiry(address user) external view returns (uint256) {
        return userSubscriptions[user].expiryTimestamp;
    }
    
    /**
     * @notice Update subscription plan tier (DAO/Owner only)
     * @param tier Plan tier (0=base, 1=pro, 2=premium)
     * @param monthlyPriceUSD Monthly price in USD (scaled by 100, e.g., 2500 = $25.00)
     * @param yearlyPriceUSD Yearly price in USD (scaled by 100, typically monthly*12*0.8 for 20% discount)
     * @param tokenLimit Max tokens/chats per month (0 = unlimited)
     * @param modelAccess Model tier: "base", "pro", "premium"
     */
    function updateSubscriptionPlan(
        uint256 tier,
        uint256 monthlyPriceUSD,
        uint256 yearlyPriceUSD,
        uint256 tokenLimit,
        string calldata modelAccess
    ) external onlyOwner {
        require(monthlyPriceUSD > 0, "Monthly price must be > 0");
        require(yearlyPriceUSD > 0, "Yearly price must be > 0");
        require(tier < 10, "Tier must be < 10");
        
        SubscriptionPlan storage plan = subscriptionPlans[tier];
        plan.monthlyPriceUSD = monthlyPriceUSD;
        plan.yearlyPriceUSD = yearlyPriceUSD;
        plan.tokenLimit = tokenLimit;
        plan.modelAccess = modelAccess;
        plan.isActive = true;
        
        emit SubscriptionPlanUpdated(tier, monthlyPriceUSD, yearlyPriceUSD, tokenLimit, modelAccess);
    }
    
    /**
     * @notice Set treasury address for subscription payments
     * @param _treasuryAddress New treasury address
     */
    function setTreasuryAddress(address payable _treasuryAddress) external onlyOwner {
        require(_treasuryAddress != address(0), "Invalid treasury address");
        address old = treasuryAddress;
        treasuryAddress = _treasuryAddress;
        emit TreasuryAddressUpdated(old, _treasuryAddress);
    }
    
    /**
     * @notice Set price oracle address for USD → LCAI conversion
     * @param _oracleAddress Price oracle contract address
     */
    function setPriceOracle(address _oracleAddress) external onlyOwner {
        require(_oracleAddress != address(0), "Invalid oracle address");
        address old = priceOracleAddress;
        priceOracleAddress = _oracleAddress;
        emit PriceOracleUpdated(old, _oracleAddress);
    }
    
    /**
     * @notice Get subscription plan details for a tier
     * @param tier Plan tier to query
     * @return monthlyPriceUSD Monthly price in USD (scaled by 100)
     * @return yearlyPriceUSD Yearly price in USD (scaled by 100)
     * @return tokenLimit Max tokens per month
     * @return modelAccess Model tier string
     * @return isActive Whether plan is active
     */
    function getSubscriptionPlan(uint256 tier) external view returns (
        uint256 monthlyPriceUSD,
        uint256 yearlyPriceUSD,
        uint256 tokenLimit,
        string memory modelAccess,
        bool isActive
    ) {
        SubscriptionPlan storage plan = subscriptionPlans[tier];
        return (
            plan.monthlyPriceUSD,
            plan.yearlyPriceUSD,
            plan.tokenLimit,
            plan.modelAccess,
            plan.isActive
        );
    }
    
    /**
     * @notice Check if user has reached usage limit for current subscription period
     * @param user User address to check
     * @return True if limit reached (only for plans with tokenLimit > 0)
     */
    function hasReachedUsageLimit(address user) external view returns (bool) {
        UserSubscription storage sub = userSubscriptions[user];
        if (!sub.isActive || sub.expiryTimestamp <= block.timestamp) {
            return true; // Expired or inactive = limit reached
        }
        
        SubscriptionPlan storage plan = subscriptionPlans[sub.planTier];
        if (plan.tokenLimit == 0) {
            return false; // Unlimited plan
        }
        
        // Reset usage counter if period elapsed (monthly reset)
        if (block.timestamp > sub.lastResetTimestamp + 30 days) {
            return false; // New period, not reached
        }
        
        return sub.usageCount >= plan.tokenLimit;
    }
    
    // ============================================================================
    // TREASURY MANAGEMENT FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Withdraw funds from the contract (DAO controlled)
     * @dev This contract acts as the reward vault, so funds can be withdrawn by the DAO
     * @param recipient Address to receive the funds
     * @param amount Amount to withdraw
     */
    function withdrawFunds(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(address(this).balance >= amount, "Insufficient balance");
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @notice Get the contract's balance
     * @return Current balance in wei
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    // ============================================================================
    // AUTHORIZATION MANAGEMENT
    // ============================================================================
    
    /**
     * @notice Authorize an address to issue rewards
     * @param issuer Address to authorize
     * @dev Only owner can authorize reward issuers
     */
    function authorizeRewardIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer address");
        require(!authorizedRewardIssuers[issuer], "Already authorized");
        
        authorizedRewardIssuers[issuer] = true;
        emit RewardIssuerAuthorized(issuer);
    }
    
    /**
     * @notice Revoke reward issuer authorization
     * @param issuer Address to revoke
     * @dev Only owner can revoke reward issuers
     */
    function revokeRewardIssuer(address issuer) external onlyOwner {
        require(authorizedRewardIssuers[issuer], "Not authorized");
        
        authorizedRewardIssuers[issuer] = false;
        emit RewardIssuerRevoked(issuer);
    }
    
    /**
     * @notice Check if an address is authorized to issue rewards
     * @param issuer Address to check
     * @return True if authorized
     */
    function isAuthorizedRewardIssuer(address issuer) external view returns (bool) {
        return authorizedRewardIssuers[issuer];
    }
    
    // ============================================================================
    // RECEIVE FUNCTION
    // ============================================================================
    
    /**
     * @notice Receive function to accept ETH/LCAI deposits
     * @dev This contract acts as the reward vault and needs to hold funds
     */
    receive() external payable {}
}

