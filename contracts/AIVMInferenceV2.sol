// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface ILCAIValidatorRegistry {
    function validators(
        address validator
    )
        external
        view
        returns (
            address validatorAddress,
            bytes memory publicKey,
            uint256 stake,
            bool isActive,
            uint256 performanceScore,
            uint256 slashCount,
            uint256 lastHeartbeat,
            uint256 joinedAt
        );
}

/**
 * @title AIVMInferenceV2
 * @notice Production-oriented on-chain inference request anchoring with:
 *         - prompt privacy (prompt bytes never on-chain; only promptHash + promptId)
 *         - requester anti-spam fee + max pending requests
 *         - worker bond (slashing on timeout)
 *         - PoI → EVM bridge via EIP-712 validator attestations (quorum threshold)
 *
 * Flow:
 * 1) requester calls requestInferenceV2() with promptHash + promptId (prompt stored offchain)
 * 2) worker commits on-chain (commitInference) and performs PoI commit/reveal offchain
 * 3) worker reveals response on-chain (revealInference)
 * 4) PoI validators submit EIP-712 attestations for (taskId,resultHash,transcriptHash,slot)
 * 5) once quorum reached and responseHash matches, request finalizes and pays worker
 */
contract AIVMInferenceV2 is Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    enum RequestStatus {
        None,
        Requested,
        Committed,
        Revealed,
        Finalized,
        Cancelled,
        TimedOut,
        Disputed
    }

    struct InferenceRequest {
        address requester;
        string model;
        bytes32 modelDigest;
        bytes32 detConfigHash;
        bytes32 promptHash;
        bytes32 promptId;
        bytes32 taskId;
        uint256 fee;
        uint64 createdAt;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 finalizeDeadline;
        RequestStatus status;
        address worker;
        bytes32 commitment;
        uint64 committedAt;
        bytes32 responseHash;
        string response;
        uint64 revealedAt;
        uint64 finalizedAt;
    }

    struct Challenge {
        address challenger;
        uint256 bond;
        uint64 openedAt;
        bool resolved;
        bool upheld;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 => InferenceRequest) public requests;
    mapping(bytes32 => uint256) public requestIdByTaskId;

    // Requester anti-spam controls
    uint256 public minRequestFeeWei;
    uint256 public maxPendingPerRequester; // 0 disables
    mapping(address => uint256) public pendingByRequester;

    // Worker bond
    uint256 public minWorkerBondWei;
    mapping(address => uint256) public workerBond;
    mapping(address => uint256) public workerBondLocked;
    mapping(uint256 => uint256) public requestBondLocked;

    // Protocol fee (bps) taken from requester fee on finalization
    address public treasury;
    uint256 public protocolFeeBps; // 0..10000

    // Timeouts
    uint256 public commitTimeoutSecs;
    uint256 public revealTimeoutSecs;
    uint256 public finalizeTimeoutSecs;

    // PoI→EVM attestations (quorum of active validators from LCAIValidatorRegistry)
    ILCAIValidatorRegistry public validatorRegistry;
    uint64 public poiQuorum;
    bytes32 public constant POI_ATTESTATION_TYPEHASH =
        keccak256(
            "PoIAttestation(bytes32 taskId,bytes32 resultHash,bytes32 transcriptHash,uint64 slot)"
        );
    mapping(bytes32 => bytes32) public poiResultHashByTask;
    mapping(bytes32 => bytes32) public poiTranscriptHashByTask;
    mapping(bytes32 => uint64) public poiSlotByTask;
    mapping(bytes32 => uint64) public poiAttestationCount;
    mapping(bytes32 => mapping(address => bool)) public poiAttested;

    // Disputes
    uint256 public minChallengeBondWei;
    address public resolver;
    mapping(uint256 => Challenge) public challenges;

    event InferenceRequestedV2(
        uint256 indexed requestId,
        address indexed requester,
        bytes32 indexed taskId,
        string model,
        bytes32 promptHash,
        bytes32 promptId,
        bytes32 modelDigest,
        bytes32 detConfigHash
    );

    event InferenceCommitted(
        uint256 indexed requestId,
        address indexed worker,
        bytes32 commitment
    );

    event InferenceRevealed(
        uint256 indexed requestId,
        address indexed worker,
        bytes32 responseHash,
        string response
    );

    event PoIAttested(
        bytes32 indexed taskId,
        address indexed validator,
        uint64 count,
        bytes32 resultHash,
        bytes32 transcriptHash,
        uint64 slot
    );

    event InferenceFinalized(
        uint256 indexed requestId,
        bytes32 indexed taskId,
        address indexed worker,
        bytes32 resultHash,
        uint256 workerPaidWei,
        uint256 protocolFeeWei
    );

    event WorkerBondDeposited(address indexed worker, uint256 amountWei);
    event WorkerBondWithdrawn(address indexed worker, uint256 amountWei);
    event WorkerSlashed(
        uint256 indexed requestId,
        address indexed worker,
        uint256 slashedWei,
        address indexed beneficiary
    );

    event ChallengeOpened(
        uint256 indexed requestId,
        address indexed challenger,
        uint256 bondWei
    );
    event ChallengeResolved(
        uint256 indexed requestId,
        bool upheld,
        address indexed winner
    );

    error InvalidParams();
    error NotRequester();
    error NotWorker();
    error NotResolver();
    error WrongStatus();
    error DeadlinePassed();
    error DeadlineNotReached();
    error InsufficientFee();
    error TooManyPending();
    error InsufficientBond();
    error AlreadyFinalized();
    error InvalidSignature();
    error NotActiveValidator();
    error ConflictingPoIResult();
    error Disputed();

    constructor(
        address _validatorRegistry
    ) Ownable(msg.sender) EIP712("LCAI-PoI-Attestation", "1") {
        if (_validatorRegistry == address(0)) revert InvalidParams();
        validatorRegistry = ILCAIValidatorRegistry(_validatorRegistry);
        treasury = msg.sender;
        resolver = msg.sender;

        // Sensible defaults for local testnets; tune via setters.
        minRequestFeeWei = 0;
        maxPendingPerRequester = 0;
        minWorkerBondWei = 0;
        protocolFeeBps = 0;

        commitTimeoutSecs = 10 minutes;
        revealTimeoutSecs = 20 minutes;
        finalizeTimeoutSecs = 60 minutes;
        poiQuorum = 1;

        minChallengeBondWei = 0;
    }

    // --------------------------- Admin tuning ---------------------------

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidParams();
        treasury = _treasury;
    }

    function setResolver(address _resolver) external onlyOwner {
        if (_resolver == address(0)) revert InvalidParams();
        resolver = _resolver;
    }

    function setSpamControls(
        uint256 _minRequestFeeWei,
        uint256 _maxPendingPerRequester
    ) external onlyOwner {
        minRequestFeeWei = _minRequestFeeWei;
        maxPendingPerRequester = _maxPendingPerRequester;
    }

    function setWorkerBondParams(uint256 _minWorkerBondWei) external onlyOwner {
        minWorkerBondWei = _minWorkerBondWei;
    }

    function setProtocolFee(uint256 _protocolFeeBps) external onlyOwner {
        if (_protocolFeeBps > 10_000) revert InvalidParams();
        protocolFeeBps = _protocolFeeBps;
    }

    function setTimeouts(
        uint256 _commitTimeoutSecs,
        uint256 _revealTimeoutSecs,
        uint256 _finalizeTimeoutSecs
    ) external onlyOwner {
        if (
            _commitTimeoutSecs == 0 ||
            _revealTimeoutSecs == 0 ||
            _finalizeTimeoutSecs == 0
        ) revert InvalidParams();
        commitTimeoutSecs = _commitTimeoutSecs;
        revealTimeoutSecs = _revealTimeoutSecs;
        finalizeTimeoutSecs = _finalizeTimeoutSecs;
    }

    function setPoIQuorum(uint64 _poiQuorum) external onlyOwner {
        if (_poiQuorum == 0) revert InvalidParams();
        poiQuorum = _poiQuorum;
    }

    function setValidatorRegistry(address _validatorRegistry) external onlyOwner {
        if (_validatorRegistry == address(0)) revert InvalidParams();
        validatorRegistry = ILCAIValidatorRegistry(_validatorRegistry);
    }

    function setChallengeBond(uint256 _minChallengeBondWei) external onlyOwner {
        minChallengeBondWei = _minChallengeBondWei;
    }

    // --------------------------- Helpers ---------------------------

    function taskIdFor(uint256 requestId) public view returns (bytes32) {
        return keccak256(abi.encodePacked(block.chainid, address(this), requestId));
    }

    function _isActiveValidator(address v) internal view returns (bool) {
        (, , , bool isActive, , , , ) = validatorRegistry.validators(v);
        return isActive;
    }

    // --------------------------- Request lifecycle ---------------------------

    function requestInferenceV2(
        string calldata model,
        bytes32 promptHash,
        bytes32 promptId,
        bytes32 modelDigest,
        bytes32 detConfigHash
    ) external payable returns (uint256 requestId, bytes32 taskId) {
        if (bytes(model).length == 0) revert InvalidParams();
        if (promptHash == bytes32(0) || promptId == bytes32(0)) revert InvalidParams();
        if (modelDigest == bytes32(0) || detConfigHash == bytes32(0)) revert InvalidParams();
        if (msg.value < minRequestFeeWei) revert InsufficientFee();

        if (maxPendingPerRequester != 0) {
            if (pendingByRequester[msg.sender] >= maxPendingPerRequester) {
                revert TooManyPending();
            }
        }

        requestId = nextRequestId++;
        taskId = taskIdFor(requestId);

        uint64 nowTs = uint64(block.timestamp);
        uint64 commitDeadline = uint64(block.timestamp + commitTimeoutSecs);
        uint64 revealDeadline = uint64(block.timestamp + commitTimeoutSecs + revealTimeoutSecs);
        uint64 finalizeDeadline = uint64(
            block.timestamp + commitTimeoutSecs + revealTimeoutSecs + finalizeTimeoutSecs
        );

        requests[requestId] = InferenceRequest({
            requester: msg.sender,
            model: model,
            modelDigest: modelDigest,
            detConfigHash: detConfigHash,
            promptHash: promptHash,
            promptId: promptId,
            taskId: taskId,
            fee: msg.value,
            createdAt: nowTs,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            finalizeDeadline: finalizeDeadline,
            status: RequestStatus.Requested,
            worker: address(0),
            commitment: bytes32(0),
            committedAt: 0,
            responseHash: bytes32(0),
            response: "",
            revealedAt: 0,
            finalizedAt: 0
        });
        requestIdByTaskId[taskId] = requestId;
        pendingByRequester[msg.sender] += 1;

        emit InferenceRequestedV2(
            requestId,
            msg.sender,
            taskId,
            model,
            promptHash,
            promptId,
            modelDigest,
            detConfigHash
        );
    }

    /**
     * @notice Worker deposits ETH bond used as collateral for slashing on timeouts.
     */
    function depositWorkerBond() external payable {
        if (msg.value == 0) revert InvalidParams();
        workerBond[msg.sender] += msg.value;
        emit WorkerBondDeposited(msg.sender, msg.value);
    }

    function withdrawWorkerBond(uint256 amountWei) external nonReentrant {
        if (amountWei == 0) revert InvalidParams();
        uint256 bonded = workerBond[msg.sender];
        uint256 locked = workerBondLocked[msg.sender];
        if (bonded < locked + amountWei) revert InsufficientBond();
        workerBond[msg.sender] = bonded - amountWei;
        (bool ok, ) = msg.sender.call{value: amountWei}("");
        require(ok, "withdraw failed");
        emit WorkerBondWithdrawn(msg.sender, amountWei);
    }

    /**
     * @notice Worker commits to a response hash without revealing the response content yet.
     * @dev commitment = keccak256(abi.encodePacked(requestId, msg.sender, secret, responseHash))
     */
    function commitInference(uint256 requestId, bytes32 commitment) external {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Requested) revert WrongStatus();
        if (block.timestamp > r.commitDeadline) revert DeadlinePassed();
        if (commitment == bytes32(0)) revert InvalidParams();

        uint256 need = minWorkerBondWei;
        if (need != 0) {
            uint256 bonded = workerBond[msg.sender];
            uint256 locked = workerBondLocked[msg.sender];
            if (bonded < locked + need) revert InsufficientBond();
            workerBondLocked[msg.sender] = locked + need;
            requestBondLocked[requestId] = need;
        }

        r.status = RequestStatus.Committed;
        r.worker = msg.sender;
        r.commitment = commitment;
        r.committedAt = uint64(block.timestamp);

        emit InferenceCommitted(requestId, msg.sender, commitment);
    }

    /**
     * @notice Worker reveals the response content and secret; contract verifies the commitment.
     * @dev commitment = keccak256(abi.encodePacked(requestId, msg.sender, secret, keccak256(response)))
     */
    function revealInference(
        uint256 requestId,
        bytes32 secret,
        string calldata response
    ) external nonReentrant {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Committed) revert WrongStatus();
        if (r.worker != msg.sender) revert NotWorker();
        if (block.timestamp > r.revealDeadline) revert DeadlinePassed();
        if (bytes(response).length == 0) revert InvalidParams();
        if (challenges[requestId].challenger != address(0) && !challenges[requestId].resolved) revert Disputed();

        bytes32 responseHash = keccak256(bytes(response));
        bytes32 expectedCommitment = keccak256(
            abi.encodePacked(requestId, msg.sender, secret, responseHash)
        );
        require(expectedCommitment == r.commitment, "commitment mismatch");

        r.status = RequestStatus.Revealed;
        r.responseHash = responseHash;
        r.response = response;
        r.revealedAt = uint64(block.timestamp);

        emit InferenceRevealed(requestId, msg.sender, responseHash, response);

        _tryFinalize(r.taskId, requestId);
    }

    /**
     * @notice Requester cancels if no worker committed in time; fee is refunded.
     */
    function cancelExpired(uint256 requestId) external nonReentrant {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Requested) revert WrongStatus();
        if (r.requester != msg.sender) revert NotRequester();
        if (block.timestamp <= r.commitDeadline) revert DeadlineNotReached();

        r.status = RequestStatus.Cancelled;
        pendingByRequester[r.requester] -= 1;

        uint256 refund = r.fee;
        r.fee = 0;
        (bool ok, ) = r.requester.call{value: refund}("");
        require(ok, "refund failed");
    }

    /**
     * @notice Anyone can slash a worker that committed but failed to reveal by deadline.
     *         Refunds fee to requester and transfers slashed bond to requester.
     */
    function timeoutReveal(uint256 requestId) external nonReentrant {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Committed) revert WrongStatus();
        if (block.timestamp <= r.revealDeadline) revert DeadlineNotReached();

        r.status = RequestStatus.TimedOut;
        pendingByRequester[r.requester] -= 1;

        uint256 refund = r.fee;
        r.fee = 0;
        if (refund != 0) {
            (bool okRefund, ) = r.requester.call{value: refund}("");
            require(okRefund, "refund failed");
        }

        uint256 slashed = requestBondLocked[requestId];
        if (slashed != 0) {
            requestBondLocked[requestId] = 0;
            workerBondLocked[r.worker] -= slashed;
            workerBond[r.worker] -= slashed;
            (bool okSlash, ) = r.requester.call{value: slashed}("");
            require(okSlash, "slash transfer failed");
            emit WorkerSlashed(requestId, r.worker, slashed, r.requester);
        }
    }

    // --------------------------- Disputes ---------------------------

    /**
     * @notice Open a dispute (optimistic oracle pattern). Resolution is off-chain via `resolver`.
     * @dev This is not an ML verifier; it exists to add bonding + slashing hooks for production ops/DAO.
     */
    function challenge(uint256 requestId) external payable {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Revealed) revert WrongStatus();
        if (r.finalizedAt != 0) revert AlreadyFinalized();
        if (msg.value < minChallengeBondWei) revert InvalidParams();

        Challenge storage c = challenges[requestId];
        require(c.challenger == address(0), "challenge exists");

        challenges[requestId] = Challenge({
            challenger: msg.sender,
            bond: msg.value,
            openedAt: uint64(block.timestamp),
            resolved: false,
            upheld: false
        });
        r.status = RequestStatus.Disputed;

        emit ChallengeOpened(requestId, msg.sender, msg.value);
    }

    function resolveChallenge(uint256 requestId, bool upholdWorker) external nonReentrant {
        if (msg.sender != resolver) revert NotResolver();

        InferenceRequest storage r = requests[requestId];
        Challenge storage c = challenges[requestId];
        require(c.challenger != address(0), "no challenge");
        require(!c.resolved, "already resolved");

        c.resolved = true;
        c.upheld = upholdWorker;

        // Winner takes challenger bond
        address winner = upholdWorker ? r.worker : c.challenger;
        uint256 bond = c.bond;
        c.bond = 0;
        if (bond != 0) {
            (bool okBond, ) = winner.call{value: bond}("");
            require(okBond, "bond transfer failed");
        }

        if (!upholdWorker) {
            // Slash worker bond (if any) to requester and cancel request.
            uint256 slashed = requestBondLocked[requestId];
            if (slashed != 0) {
                requestBondLocked[requestId] = 0;
                workerBondLocked[r.worker] -= slashed;
                workerBond[r.worker] -= slashed;
                (bool okSlash, ) = r.requester.call{value: slashed}("");
                require(okSlash, "slash transfer failed");
                emit WorkerSlashed(requestId, r.worker, slashed, r.requester);
            }

            // Refund requester fee
            uint256 refund = r.fee;
            r.fee = 0;
            if (refund != 0) {
                (bool okRefund, ) = r.requester.call{value: refund}("");
                require(okRefund, "refund failed");
            }

            r.status = RequestStatus.Cancelled;
            pendingByRequester[r.requester] -= 1;
        } else {
            // Allow finalization again.
            r.status = RequestStatus.Revealed;
            _tryFinalize(r.taskId, requestId);
        }

        emit ChallengeResolved(requestId, upholdWorker, winner);
    }

    // --------------------------- PoI attestations ---------------------------

    function submitPoIAttestation(
        bytes32 taskId,
        bytes32 resultHash,
        bytes32 transcriptHash,
        uint64 slot,
        bytes calldata signature
    ) external nonReentrant {
        if (taskId == bytes32(0) || resultHash == bytes32(0)) revert InvalidParams();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    POI_ATTESTATION_TYPEHASH,
                    taskId,
                    resultHash,
                    transcriptHash,
                    slot
                )
            )
        );
        address signer = digest.recover(signature);
        if (!_isActiveValidator(signer)) revert NotActiveValidator();

        // Idempotent for this (taskId, signer).
        if (poiAttested[taskId][signer]) {
            return;
        }

        bytes32 existingResult = poiResultHashByTask[taskId];
        if (existingResult == bytes32(0)) {
            poiResultHashByTask[taskId] = resultHash;
        } else if (existingResult != resultHash) {
            revert ConflictingPoIResult();
        }

        bytes32 existingTranscript = poiTranscriptHashByTask[taskId];
        if (existingTranscript == bytes32(0) && transcriptHash != bytes32(0)) {
            poiTranscriptHashByTask[taskId] = transcriptHash;
        } else if (transcriptHash != bytes32(0) && existingTranscript != transcriptHash) {
            revert ConflictingPoIResult();
        } else if (existingTranscript != bytes32(0) && transcriptHash == bytes32(0)) {
            revert ConflictingPoIResult();
        }

        uint64 existingSlot = poiSlotByTask[taskId];
        if (existingSlot == 0 && slot != 0) {
            poiSlotByTask[taskId] = slot;
        } else if (slot != 0 && existingSlot != slot) {
            revert ConflictingPoIResult();
        } else if (existingSlot != 0 && slot == 0) {
            revert ConflictingPoIResult();
        }

        poiAttested[taskId][signer] = true;
        uint64 n = poiAttestationCount[taskId] + 1;
        poiAttestationCount[taskId] = n;

        emit PoIAttested(taskId, signer, n, resultHash, transcriptHash, slot);

        uint256 requestId = requestIdByTaskId[taskId];
        if (requestId != 0) {
            _tryFinalize(taskId, requestId);
        }
    }

    function _tryFinalize(bytes32 taskId, uint256 requestId) internal {
        InferenceRequest storage r = requests[requestId];
        if (r.status != RequestStatus.Revealed) {
            return;
        }
        if (r.finalizedAt != 0) {
            return;
        }
        if (challenges[requestId].challenger != address(0) && !challenges[requestId].resolved) {
            return;
        }
        if (block.timestamp > r.finalizeDeadline) {
            return;
        }

        bytes32 poiHash = poiResultHashByTask[taskId];
        if (poiHash == bytes32(0) || poiHash != r.responseHash) {
            return;
        }
        if (poiAttestationCount[taskId] < poiQuorum) {
            return;
        }

        r.status = RequestStatus.Finalized;
        r.finalizedAt = uint64(block.timestamp);
        pendingByRequester[r.requester] -= 1;

        // Unlock worker bond for this request (if locked).
        uint256 locked = requestBondLocked[requestId];
        if (locked != 0) {
            requestBondLocked[requestId] = 0;
            workerBondLocked[r.worker] -= locked;
        }

        uint256 fee = r.fee;
        r.fee = 0;

        uint256 protocolFee = (fee * protocolFeeBps) / 10_000;
        uint256 workerPaid = fee - protocolFee;

        if (protocolFee != 0) {
            (bool okFee, ) = treasury.call{value: protocolFee}("");
            require(okFee, "protocol fee transfer failed");
        }
        if (workerPaid != 0) {
            (bool okWorker, ) = r.worker.call{value: workerPaid}("");
            require(okWorker, "worker payout failed");
        }

        emit InferenceFinalized(
            requestId,
            taskId,
            r.worker,
            r.responseHash,
            workerPaid,
            protocolFee
        );
    }

    /**
     * @notice If PoI attestations never arrive, requester can reclaim funds after finalizeDeadline.
     * @dev Leaves any worker bond locked until a dispute/challenge is resolved, or until operator slashes.
     */
    function reclaimAfterFinalizeTimeout(uint256 requestId) external nonReentrant {
        InferenceRequest storage r = requests[requestId];
        if (r.requester != msg.sender) revert NotRequester();
        if (r.finalizedAt != 0) revert AlreadyFinalized();
        if (block.timestamp <= r.finalizeDeadline) revert DeadlineNotReached();

        // Only reclaim if not disputed (disputes need resolver).
        if (challenges[requestId].challenger != address(0) && !challenges[requestId].resolved) revert Disputed();

        // Allowed statuses: Revealed or Committed (worker revealed late not allowed) or Requested.
        if (
            r.status != RequestStatus.Revealed &&
            r.status != RequestStatus.Committed &&
            r.status != RequestStatus.Requested
        ) revert WrongStatus();

        r.status = RequestStatus.Cancelled;
        pendingByRequester[r.requester] -= 1;

        uint256 refund = r.fee;
        r.fee = 0;
        if (refund != 0) {
            (bool okRefund, ) = r.requester.call{value: refund}("");
            require(okRefund, "refund failed");
        }
    }

    receive() external payable {}
}
