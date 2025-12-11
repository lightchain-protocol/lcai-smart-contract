// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAIVMTicketManager {
    function issueTicket(
        address wallet,
        string memory variantId,
        uint256 ttl
    ) external returns (bytes32);
}

/**
 * @title AIVMModelRegistry
 * @notice On-chain registry for AI model variants with validation and staking mechanics
 * @dev Implements the AIVM workflow: submission → validation → approval → finalization
 *
 * Workflow (from Raspberry Pi's flowchart):
 * 1. Trainer stakes tokens to submit variant
 * 2. Variant submitted with IPFS CID
 * 3. ValidationRequested event emitted
 * 4. AI validators stake to participate
 * 5. Off-chain Model Service aggregates scores (25 validators)
 * 6. Average score submitted on-chain
 * 7. If avgScore >= minScore → Approved, else → Rejected
 * 8. Challenge window (24-72 hours)
 * 9. Finalization (variant available for chat/inference)
 */
contract AIVMModelRegistry is ReentrancyGuard {
    // ============================================================================
    // ENUMS & STRUCTS
    // ============================================================================

    enum ModelStatus {
        Submitted, // Variant submitted, awaiting validation
        Validating, // Validators assigned, evaluation in progress
        Approved, // avgScore >= minScore, in challenge window
        Rejected, // avgScore < minScore or failed safety
        Finalized, // Challenge window passed, approved for use
        Deprecated // No longer recommended (policy change)
    }

    struct BaseModel {
        string modelId; // Unique identifier (e.g., "base-001")
        string baseModelCID; // IPFS CID for model weights
        string metadataHash; // IPFS hash for model card/metadata
        string policyVersion; // Policy version used for validation
        string benchmarkCID; // IPFS CID for benchmark definitions
        uint256 createdAt; // Timestamp
        bool isActive; // Whether this base model is active
    }

    struct ModelVariant {
        string variantId; // Unique identifier (e.g., "var-123")
        string variantCID; // IPFS CID for variant weights
        string metadataHash; // IPFS hash for variant metadata
        string parentModelId; // Reference to base model
        address trainer; // Address of trainer who submitted
        uint256 trainerStake; // Amount staked by trainer
        ModelStatus status; // Current status
        uint256 avgScore; // Average validation score (0-100, scaled by 100)
        string reportCID; // IPFS CID for validation report
        uint256 submittedAt; // Submission timestamp
        uint256 validatedAt; // Validation completion timestamp
        uint256 finalizedAt; // Finalization timestamp
        uint256 validatorCount; // Number of validators who evaluated
        bool challengeWindowOpen; // Whether challenge window is active
        uint256 challengeDeadline; // Challenge window end time
    }

    struct ValidatorStake {
        address validator;
        uint256 amount;
        uint256 stakedAt;
        bool hasSubmitted; // Whether validator submitted score
        bool isSlashed; // Whether stake was slashed for fraud
    }

    struct ValidationPolicy {
        uint256 minScore; // Minimum avg score for approval (scaled by 100, e.g., 8000 = 80%)
        uint256 minValidators; // Minimum validators required (e.g., 25)
        uint256 trainerStakeMin; // Minimum stake required from trainer
        uint256 validatorStakeMin; // Minimum stake required from each validator
        uint256 challengeWindowHours; // Challenge window duration (e.g., 48 hours)
    }

    struct AccessPolicyConfig {
        bool requireTicket; // Whether a download ticket is required
        uint256 minStakeRequired; // Additional stake/payment requirement prior to access
        address ticketManager; // Ticket manager contract responsible for issuing tickets
        uint256 ticketTTL; // Optional hint for ticket expiry (in seconds)
    }

    struct TicketReceipt {
        bytes32 ticketId;
        address requester;
        string variantId;
        uint256 expiresAt;
        uint256 requestedAt;
        address ticketManager;
    }

    struct ChallengeRecord {
        address challenger;
        uint256 stake;
        string evidenceCID;
        string reason;
        uint256 submittedAt;
        bool resolved;
        bool accepted;
    }

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    // Model storage
    mapping(string => BaseModel) public baseModels;
    mapping(string => ModelVariant) public variants;
    mapping(string => ValidatorStake[]) public variantValidators;

    // Indexes for enumeration
    string[] public baseModelIds;
    string[] public variantIds;
    mapping(address => string[]) public trainerVariants; // trainer → variant IDs

    // Validation policy
    ValidationPolicy public policy;
    address public aggregator;
    address private contractOwner;
    mapping(string => AccessPolicyConfig) private variantAccessPolicies;
    mapping(bytes32 => TicketReceipt) private ticketReceipts;
    mapping(address => bytes32[]) private accountTickets;
    mapping(string => bytes32[]) private variantTicketHistory;
    mapping(string => ChallengeRecord) private activeChallenges;

    // Staking balances
    mapping(address => uint256) public stakedBalances;
    mapping(address => uint256) public slashedAmounts;

    // Treasury for slashed stakes
    address private treasuryAddress;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event BaseModelRegistered(
        string indexed modelId,
        string baseModelCID,
        string metadataHash,
        string benchmarkCID
    );

    event ValidationRequested(
        string indexed variantId,
        string variantCID,
        address indexed trainer,
        uint256 trainerStake
    );

    event ValidatorStaked(
        string indexed variantId,
        address indexed validator,
        uint256 amount
    );

    event ValidationResult(
        string indexed variantId,
        uint256 avgScore,
        bool passed,
        uint256 validatorCount
    );

    event VariantApproved(
        string indexed variantId,
        uint256 avgScore,
        uint256 challengeDeadline
    );

    event VariantRejected(
        string indexed variantId,
        uint256 avgScore,
        string reason
    );

    event VariantFinalized(string indexed variantId, uint256 finalizedAt);

    event ChallengeOpened(
        string indexed variantId,
        address indexed challenger,
        uint256 challengeStake
    );

    event ChallengeSubmitted(
        string indexed variantId,
        address indexed challenger,
        string evidenceCID,
        string reason,
        uint256 stake
    );

    event ChallengeResolved(
        string indexed variantId,
        bool challengeValid,
        address indexed challenger
    );

    event ChallengeDismissed(
        string indexed variantId,
        address indexed challenger,
        string reason
    );

    event ValidatorSlashed(
        address indexed validator,
        string indexed variantId,
        uint256 amount,
        string reason
    );

    event ValidatorsSlashed(
        string indexed variantId,
        address[] validators,
        uint256 totalAmount,
        string reason
    );

    event StakeWithdrawn(address indexed user, uint256 amount);

    event PolicyUpdated(
        uint256 minScore,
        uint256 minValidators,
        uint256 trainerStakeMin,
        uint256 validatorStakeMin,
        uint256 challengeWindowHours
    );

    event AggregatedResultSubmitted(
        string indexed variantId,
        uint256 avgScore,
        uint256 validatorCount,
        string reportCID
    );

    event AccessPolicyUpdated(
        string indexed variantId,
        bool requireTicket,
        uint256 minStakeRequired,
        address ticketManager,
        uint256 ticketTTL
    );

    event ScoreSubmitted(
        string indexed variantId,
        uint256 score,
        string reportCID,
        address indexed submitter,
        uint256 validatorCount
    );

    event DecryptionTicketRequested(
        string indexed variantId,
        address indexed requester,
        bytes32 indexed ticketId,
        uint256 expiresAt,
        address ticketManager
    );

    modifier onlyOwner() {
        require(msg.sender == contractOwner, "Caller is not the owner");
        _;
    }

    function owner() public view returns (address) {
        return contractOwner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        contractOwner = newOwner;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address _treasury) {
        contractOwner = msg.sender;
        treasuryAddress = _treasury;
        aggregator = msg.sender;

        // Default validation policy
        policy = ValidationPolicy({
            minScore: 8000, // 80% minimum score
            minValidators: 25, // 25 validators required
            trainerStakeMin: 100 ether, // 100 LCAI to submit variant
            validatorStakeMin: 50 ether, // 50 LCAI to validate
            challengeWindowHours: 48 // 48 hour challenge window
        });
    }

    // ============================================================================
    // BASE MODEL MANAGEMENT
    // ============================================================================

    /**
     * @notice Register a new base model (owner only)
     * @param modelId Unique model identifier
     * @param baseModelCID IPFS CID for model weights
     * @param metadataHash IPFS hash for model card
     * @param policyVersion Policy version string
     * @param benchmarkCID IPFS CID for benchmark definitions
     */
    function registerBaseModel(
        string calldata modelId,
        string calldata baseModelCID,
        string calldata metadataHash,
        string calldata policyVersion,
        string calldata benchmarkCID
    ) external onlyOwner {
        require(bytes(modelId).length > 0, "Model ID cannot be empty");
        require(
            bytes(baseModels[modelId].modelId).length == 0,
            "Model ID already exists"
        );
        require(
            bytes(baseModelCID).length > 0,
            "Base model CID cannot be empty"
        );

        baseModels[modelId] = BaseModel({
            modelId: modelId,
            baseModelCID: baseModelCID,
            metadataHash: metadataHash,
            policyVersion: policyVersion,
            benchmarkCID: benchmarkCID,
            createdAt: block.timestamp,
            isActive: true
        });

        baseModelIds.push(modelId);

        emit BaseModelRegistered(
            modelId,
            baseModelCID,
            metadataHash,
            benchmarkCID
        );
    }

    /**
     * @notice Get base model details
     */
    function getBaseModel(
        string calldata modelId
    ) external view returns (BaseModel memory) {
        require(
            bytes(baseModels[modelId].modelId).length > 0,
            "Base model not found"
        );
        return baseModels[modelId];
    }

    /**
     * @notice Get all base model IDs
     */
    function getBaseModelIds() external view returns (string[] memory) {
        return baseModelIds;
    }

    // ============================================================================
    // VARIANT SUBMISSION (with Staking)
    // ============================================================================

    /**
     * @notice Submit a trained variant for validation
     * @param variantId Unique variant identifier
     * @param variantCID IPFS CID for variant weights
     * @param metadataHash IPFS hash for variant metadata
     * @param parentModelId Reference to base model
     */
    function registerVariant(
        string calldata variantId,
        string calldata variantCID,
        string calldata metadataHash,
        string calldata parentModelId
    ) external payable nonReentrant {
        require(bytes(variantId).length > 0, "Variant ID cannot be empty");
        require(
            bytes(variants[variantId].variantId).length == 0,
            "Variant ID already exists"
        );
        require(bytes(variantCID).length > 0, "Variant CID cannot be empty");
        require(
            bytes(baseModels[parentModelId].modelId).length > 0,
            "Parent model not found"
        );
        require(msg.value >= policy.trainerStakeMin, "Insufficient stake");

        // Store trainer's stake
        stakedBalances[msg.sender] += msg.value;

        // Create variant struct
        ModelVariant storage variant = variants[variantId];
        variant.variantId = variantId;
        variant.variantCID = variantCID;
        variant.metadataHash = metadataHash;
        variant.parentModelId = parentModelId;
        variant.trainer = msg.sender;
        variant.trainerStake = msg.value;
        variant.status = ModelStatus.Submitted;
        variant.submittedAt = block.timestamp;

        variantIds.push(variantId);
        trainerVariants[msg.sender].push(variantId);

        emit ValidationRequested(variantId, variantCID, msg.sender, msg.value);
    }

    // ============================================================================
    // VALIDATOR STAKING
    // ============================================================================

    /**
     * @notice Stake tokens to participate in validation
     * @param variantId Variant to validate
     */
    function stakeForValidation(
        string calldata variantId
    ) external payable nonReentrant {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        require(
            variants[variantId].status == ModelStatus.Submitted ||
                variants[variantId].status == ModelStatus.Validating,
            "Variant not accepting validators"
        );
        require(
            msg.value >= policy.validatorStakeMin,
            "Insufficient validator stake"
        );

        // Check if validator already staked
        ValidatorStake[] storage stakes = variantValidators[variantId];
        for (uint i = 0; i < stakes.length; i++) {
            require(
                stakes[i].validator != msg.sender,
                "Already staked for this variant"
            );
        }

        // Store validator's stake
        stakedBalances[msg.sender] += msg.value;

        stakes.push(
            ValidatorStake({
                validator: msg.sender,
                amount: msg.value,
                stakedAt: block.timestamp,
                hasSubmitted: false,
                isSlashed: false
            })
        );

        // Update variant status to Validating if first validator
        if (variants[variantId].status == ModelStatus.Submitted) {
            variants[variantId].status = ModelStatus.Validating;
        }

        emit ValidatorStaked(variantId, msg.sender, msg.value);
    }

    // ============================================================================
    // VALIDATION RESULT SUBMISSION (Off-chain Model Service calls this)
    // ============================================================================

    /**
     * @notice Convenience helper for the aggregator to submit scores without passing validator counts.
     * @param variantId Variant being validated
     * @param score Average score from validators (0-10000, scaled by 100)
     * @param reportCID IPFS CID for validation report
     */
    function submitScore(
        string calldata variantId,
        uint256 score,
        string calldata reportCID
    ) external {
        uint256 validatorCount = variantValidators[variantId].length;
        _handleAggregatedResult(variantId, score, reportCID, validatorCount);
    }

    /**
     * @notice Submit aggregated validation result
     * @param variantId Variant being validated
     * @param avgScore Average score from validators (0-10000, scaled by 100)
     * @param reportCID IPFS CID for validation report
     * @param validatorCount Number of validators who participated
     * @dev Only callable by configured aggregator address
     */
    function submitAggregatedResult(
        string calldata variantId,
        uint256 avgScore,
        string calldata reportCID,
        uint256 validatorCount
    ) public {
        _handleAggregatedResult(variantId, avgScore, reportCID, validatorCount);
    }

    function submitValidationResult(
        string calldata variantId,
        uint256 avgScore,
        string calldata reportCID,
        uint256 validatorCount
    ) external {
        submitAggregatedResult(variantId, avgScore, reportCID, validatorCount);
    }

    function _handleAggregatedResult(
        string calldata variantId,
        uint256 avgScore,
        string calldata reportCID,
        uint256 validatorCount
    ) internal {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        require(
            variants[variantId].status == ModelStatus.Validating,
            "Variant not validating"
        );
        require(
            validatorCount >= policy.minValidators,
            "Insufficient validators"
        );
        require(avgScore <= 10000, "Score out of range");
        require(msg.sender == aggregator, "Caller not aggregator");

        ModelVariant storage variant = variants[variantId];
        variant.avgScore = avgScore;
        variant.reportCID = reportCID;
        variant.validatedAt = block.timestamp;
        variant.validatorCount = validatorCount;

        bool passed = avgScore >= policy.minScore;
        emit AggregatedResultSubmitted(
            variantId,
            avgScore,
            validatorCount,
            reportCID
        );
        emit ScoreSubmitted(
            variantId,
            avgScore,
            reportCID,
            msg.sender,
            validatorCount
        );
        emit ValidationResult(variantId, avgScore, passed, validatorCount);

        if (passed) {
            variant.status = ModelStatus.Approved;
            variant.challengeWindowOpen = true;
            variant.challengeDeadline =
                block.timestamp + (policy.challengeWindowHours * 1 hours);

            emit VariantApproved(
                variantId,
                avgScore,
                variant.challengeDeadline
            );
        } else {
            variant.status = ModelStatus.Rejected;
            _slashStake(
                variant.trainer,
                variant.trainerStake,
                "Low quality variant",
                variantId
            );
            emit VariantRejected(variantId, avgScore, "Score below minimum");
        }
    }

    // ============================================================================
    // FINALIZATION (after challenge window)
    // ============================================================================

    /**
     * @notice Finalize an approved variant after challenge window expires
     * @param variantId Variant to finalize
     */
    function finalizeVariant(string calldata variantId) external {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        ModelVariant storage variant = variants[variantId];

        require(variant.status == ModelStatus.Approved, "Variant not approved");
        require(variant.challengeWindowOpen, "Challenge window not open");
        require(
            block.timestamp >= variant.challengeDeadline,
            "Challenge window not expired"
        );

        variant.status = ModelStatus.Finalized;
        variant.challengeWindowOpen = false;
        variant.finalizedAt = block.timestamp;

        // Refund trainer stake (successful submission)
        _refundStake(variant.trainer, variant.trainerStake);

        // Refund validator stakes (honest validation)
        ValidatorStake[] storage stakes = variantValidators[variantId];
        for (uint i = 0; i < stakes.length; i++) {
            if (!stakes[i].isSlashed) {
                _refundStake(stakes[i].validator, stakes[i].amount);
            }
        }

        emit VariantFinalized(variantId, block.timestamp);
    }

    // ============================================================================
    // CHALLENGE SYSTEM
    // ============================================================================

    /**
     * @notice Open a challenge against an approved variant
     * @param variantId Variant to challenge
     * @param reason Challenge reason
     */
    function challengeVariant(
        string calldata variantId,
        string calldata evidenceCID,
        string calldata reason
    ) external payable nonReentrant {
        require(bytes(evidenceCID).length > 0, "Evidence required");
        require(bytes(reason).length > 0, "Reason required");
        _startChallenge(variantId, reason, evidenceCID, msg.value, msg.sender);
    }

    function openChallenge(
        string calldata variantId,
        string calldata reason
    ) external payable nonReentrant {
        require(bytes(reason).length > 0, "Challenge reason required");
        _startChallenge(variantId, reason, string(""), msg.value, msg.sender);
    }

    function _startChallenge(
        string calldata variantId,
        string memory reason,
        string memory evidenceCID,
        uint256 stake,
        address challenger
    ) internal {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        ModelVariant storage variant = variants[variantId];

        require(variant.status == ModelStatus.Approved, "Variant not approved");
        require(variant.challengeWindowOpen, "Challenge window closed");
        require(
            block.timestamp < variant.challengeDeadline,
            "Challenge window expired"
        );
        require(
            stake >= policy.trainerStakeMin,
            "Insufficient challenge stake"
        );

        ChallengeRecord storage existing = activeChallenges[variantId];
        require(
            existing.challenger == address(0) || existing.resolved,
            "Challenge already active"
        );

        stakedBalances[challenger] += stake;

        activeChallenges[variantId] = ChallengeRecord({
            challenger: challenger,
            stake: stake,
            evidenceCID: evidenceCID,
            reason: reason,
            submittedAt: block.timestamp,
            resolved: false,
            accepted: false
        });

        emit ChallengeOpened(variantId, challenger, stake);
        emit ChallengeSubmitted(
            variantId,
            challenger,
            evidenceCID,
            reason,
            stake
        );
    }

    function slashValidators(
        string calldata variantId,
        address[] calldata validators,
        string calldata reason,
        bool rejectVariant,
        bool rewardChallenger
    ) external onlyOwner {
        require(validators.length > 0, "Validators required");
        require(bytes(reason).length > 0, "Reason required");

        ChallengeRecord storage challenge = activeChallenges[variantId];
        require(challenge.challenger != address(0), "No active challenge");
        require(!challenge.resolved, "Challenge already resolved");

        ValidatorStake[] storage stakes = variantValidators[variantId];
        uint256 totalSlashed;

        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            bool matched = false;

            for (uint256 j = 0; j < stakes.length; j++) {
                if (stakes[j].validator == validator) {
                    require(!stakes[j].isSlashed, "Validator already slashed");
                    uint256 amount = stakes[j].amount;
                    stakes[j].isSlashed = true;
                    _slashStake(validator, amount, reason, variantId);
                    totalSlashed += amount;
                    matched = true;
                    break;
                }
            }

            require(matched, "Validator stake missing");
        }

        ModelVariant storage variant = variants[variantId];
        require(bytes(variant.variantId).length > 0, "Variant not found");
        variant.challengeWindowOpen = false;

        if (rejectVariant) {
            variant.status = ModelStatus.Rejected;
            _slashStake(
                variant.trainer,
                variant.trainerStake,
                "Trainer slashed",
                variantId
            );
        }

        challenge.resolved = true;
        challenge.accepted = true;

        if (rewardChallenger) {
            _rewardChallenger(variantId);
        } else {
            _refundChallengeStake(variantId);
        }

        emit ValidatorsSlashed(variantId, validators, totalSlashed, reason);
        emit ChallengeResolved(variantId, true, challenge.challenger);
    }

    function _rewardChallenger(string memory variantId) internal {
        ChallengeRecord storage challenge = activeChallenges[variantId];
        uint256 stake = challenge.stake;
        if (stake == 0) {
            return;
        }

        address challenger = challenge.challenger;
        if (stakedBalances[challenger] >= stake) {
            stakedBalances[challenger] -= stake;
        } else {
            stake = 0;
        }

        if (stake > 0) {
            uint256 doubleStake = stake * 2;
            uint256 payout = address(this).balance >= doubleStake
                ? doubleStake
                : stake;
            (bool success, ) = payable(challenger).call{value: payout}("");
            require(success, "Challenge reward failed");
        }

        challenge.stake = 0;
    }

    function _refundChallengeStake(string memory variantId) internal {
        ChallengeRecord storage challenge = activeChallenges[variantId];
        uint256 stake = challenge.stake;
        if (stake == 0) {
            return;
        }

        address challenger = challenge.challenger;
        if (stakedBalances[challenger] >= stake) {
            stakedBalances[challenger] -= stake;
            (bool success, ) = payable(challenger).call{value: stake}("");
            require(success, "Challenge refund failed");
        }

        challenge.stake = 0;
    }

    /**
     * @notice Resolve a challenge (owner/Model Service calls after re-validation)
     * @param variantId Variant being challenged
     * @param challenger Address of challenger
     * @param challengeValid Whether the challenge was valid
     */
    function resolveChallenge(
        string calldata variantId,
        address challenger,
        bool challengeValid
    ) external onlyOwner {
        _processChallengeOutcome(variantId, challenger, challengeValid);
    }

    function recordChallengeOutcome(
        string calldata variantId,
        address challenger,
        bool challengeValid
    ) external onlyOwner {
        _processChallengeOutcome(variantId, challenger, challengeValid);
    }

    function _processChallengeOutcome(
        string calldata variantId,
        address challenger,
        bool challengeValid
    ) internal {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        ModelVariant storage variant = variants[variantId];

        if (challengeValid) {
            variant.status = ModelStatus.Rejected;
            variant.challengeWindowOpen = false;

            uint256 challengerStake = stakedBalances[challenger];
            if (challengerStake > 0) {
                stakedBalances[challenger] = 0;
                (bool success, ) = payable(challenger).call{
                    value: challengerStake * 2
                }("");
                require(success, "Challenger reward failed");
            }

            ValidatorStake[] storage stakes = variantValidators[variantId];
            for (uint i = 0; i < stakes.length; i++) {
                _slashStake(
                    stakes[i].validator,
                    stakes[i].amount,
                    "Fraudulent validation",
                    variantId
                );
                stakes[i].isSlashed = true;
            }

            _slashStake(
                variant.trainer,
                variant.trainerStake,
                "Fraudulent variant",
                variantId
            );
        } else {
            uint256 challengerStake = stakedBalances[challenger];
            if (challengerStake > 0) {
                _slashStake(
                    challenger,
                    challengerStake,
                    "Invalid challenge",
                    variantId
                );
            }

            variant.challengeWindowOpen = false;
        }

        emit ChallengeResolved(variantId, challengeValid, challenger);

        ChallengeRecord storage record = activeChallenges[variantId];
        if (record.challenger != address(0) && !record.resolved) {
            record.resolved = true;
            record.accepted = challengeValid;
            if (challengeValid) {
                _rewardChallenger(variantId);
            } else {
                _refundChallengeStake(variantId);
                emit ChallengeDismissed(
                    variantId,
                    record.challenger,
                    "Challenge invalid"
                );
            }
        }
    }

    // ============================================================================
    // STAKING HELPERS
    // ============================================================================

    function _slashStake(
        address user,
        uint256 amount,
        string memory reason,
        string memory variantId
    ) internal {
        if (stakedBalances[user] >= amount) {
            stakedBalances[user] -= amount;
            slashedAmounts[user] += amount;

            // Send slashed amount to treasury
            (bool success, ) = payable(treasuryAddress).call{value: amount}("");
            require(success, "Treasury transfer failed");

            emit ValidatorSlashed(user, variantId, amount, reason);
        }
    }

    function _refundStake(address user, uint256 amount) internal {
        if (stakedBalances[user] >= amount) {
            stakedBalances[user] -= amount;
            (bool success, ) = payable(user).call{value: amount}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Withdraw available stake after validation complete
     */
    function withdrawStake() external nonReentrant {
        uint256 available = stakedBalances[msg.sender];
        require(available > 0, "No stake to withdraw");

        stakedBalances[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: available}("");
        require(success, "Withdrawal failed");

        emit StakeWithdrawn(msg.sender, available);
    }

    // ============================================================================
    // QUERY FUNCTIONS
    // ============================================================================

    /**
     * @notice Get variant details
     */
    function getVariant(
        string calldata variantId
    ) external view returns (ModelVariant memory) {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        return variants[variantId];
    }

    /**
     * @notice Get all variants by trainer
     */
    function getTrainerVariants(
        address trainer
    ) external view returns (string[] memory) {
        return trainerVariants[trainer];
    }

    /**
     * @notice Get all validator stakes for a variant
     */
    function getVariantValidators(
        string calldata variantId
    ) external view returns (ValidatorStake[] memory) {
        return variantValidators[variantId];
    }

    /**
     * @notice Get all variant IDs
     */
    function getAllVariants() external view returns (string[] memory) {
        return variantIds;
    }

    /**
     * @notice Check if variant is finalized and available for use
     */
    function isVariantAvailable(
        string calldata variantId
    ) external view returns (bool) {
        return variants[variantId].status == ModelStatus.Finalized;
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Update validation policy (owner only)
     */
    function updatePolicy(
        uint256 minScore,
        uint256 minValidators,
        uint256 trainerStakeMin,
        uint256 validatorStakeMin,
        uint256 challengeWindowHours
    ) external onlyOwner {
        require(minScore <= 10000, "Score out of range");
        require(minValidators > 0, "Min validators must be > 0");

        policy = ValidationPolicy({
            minScore: minScore,
            minValidators: minValidators,
            trainerStakeMin: trainerStakeMin,
            validatorStakeMin: validatorStakeMin,
            challengeWindowHours: challengeWindowHours
        });

        emit PolicyUpdated(
            minScore,
            minValidators,
            trainerStakeMin,
            validatorStakeMin,
            challengeWindowHours
        );
    }

    function setAggregator(address _aggregator) external onlyOwner {
        require(_aggregator != address(0), "Invalid aggregator");
        aggregator = _aggregator;
    }

    function setAccessPolicy(
        string calldata variantId,
        bool requireTicket,
        uint256 minStakeRequired,
        address ticketManager,
        uint256 ticketTTL
    ) external onlyOwner {
        require(bytes(variantId).length > 0, "Variant ID required");
        AccessPolicyConfig storage config = variantAccessPolicies[variantId];
        config.requireTicket = requireTicket;
        config.minStakeRequired = minStakeRequired;
        config.ticketManager = ticketManager;
        config.ticketTTL = ticketTTL;

        emit AccessPolicyUpdated(
            variantId,
            requireTicket,
            minStakeRequired,
            ticketManager,
            ticketTTL
        );
    }

    function getAccessPolicy(
        string calldata variantId
    ) external view returns (AccessPolicyConfig memory) {
        return variantAccessPolicies[variantId];
    }

    function getTicketReceipt(
        bytes32 ticketId
    ) external view returns (TicketReceipt memory) {
        require(
            ticketReceipts[ticketId].ticketId != bytes32(0),
            "Ticket not found"
        );
        return ticketReceipts[ticketId];
    }

    function getAccountTicketIds(
        address requester
    ) external view returns (bytes32[] memory) {
        return accountTickets[requester];
    }

    function getVariantTicketIds(
        string calldata variantId
    ) external view returns (bytes32[] memory) {
        return variantTicketHistory[variantId];
    }

    function getChallengeReceipt(
        string calldata variantId
    ) external view returns (ChallengeRecord memory) {
        return activeChallenges[variantId];
    }

    function requestDecryptionTicket(
        string calldata variantId
    ) external nonReentrant returns (bytes32) {
        ModelVariant storage variant = variants[variantId];
        require(bytes(variant.variantId).length > 0, "Variant not found");
        require(
            variant.status == ModelStatus.Approved ||
                variant.status == ModelStatus.Finalized,
            "Variant not accessible"
        );

        AccessPolicyConfig memory config = variantAccessPolicies[variantId];
        require(config.requireTicket, "Ticket not required");
        require(config.ticketManager != address(0), "Ticket manager missing");

        if (config.minStakeRequired > 0) {
            require(
                stakedBalances[msg.sender] >= config.minStakeRequired,
                "Stake threshold not met"
            );
        }

        uint256 ttl = config.ticketTTL;
        bytes32 ticketId = IAIVMTicketManager(config.ticketManager).issueTicket(
            msg.sender,
            variantId,
            ttl
        );
        uint256 expiresAt = ttl == 0 ? 0 : block.timestamp + ttl;

        TicketReceipt storage receipt = ticketReceipts[ticketId];
        receipt.ticketId = ticketId;
        receipt.requester = msg.sender;
        receipt.variantId = variantId;
        receipt.expiresAt = expiresAt;
        receipt.requestedAt = block.timestamp;
        receipt.ticketManager = config.ticketManager;

        accountTickets[msg.sender].push(ticketId);
        variantTicketHistory[variantId].push(ticketId);

        emit DecryptionTicketRequested(
            variantId,
            msg.sender,
            ticketId,
            expiresAt,
            config.ticketManager
        );
        return ticketId;
    }

    /**
     * @notice Update treasury address (owner only)
     */
    function treasury() external view returns (address payable) {
        return payable(treasuryAddress);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        treasuryAddress = _treasury;
    }

    /**
     * @notice Deprecate a variant (owner only)
     */
    function deprecateVariant(string calldata variantId) external onlyOwner {
        require(
            bytes(variants[variantId].variantId).length > 0,
            "Variant not found"
        );
        variants[variantId].status = ModelStatus.Deprecated;
    }

    /**
     * @notice Emergency withdraw (owner only, for stuck funds)
     */
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}(
            ""
        );
        require(success, "Emergency withdrawal failed");
    }

    // ============================================================================
    // RECEIVE FUNCTION
    // ============================================================================

    receive() external payable {
        // Accept direct ETH/LCAI deposits for staking
    }
}
