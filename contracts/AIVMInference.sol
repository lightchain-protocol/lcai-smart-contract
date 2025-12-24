// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AIVMInference
 * @notice Minimal on-chain inference request + worker commit/reveal response flow.
 * @dev v2 scaffolding for "offchain execution + on-chain anchoring". Production deployments
 *      should add: bonding/staking, timeouts, disputes, and (optionally) PoI proof anchoring.
 */
contract AIVMInference {
    enum RequestStatus {
        None,
        Requested,
        Committed,
        Revealed,
        Cancelled
    }

    struct InferenceRequest {
        address requester;
        string model;
        bytes32 promptHash;
        uint256 createdAt;
        RequestStatus status;
        address worker;
        bytes32 commitment;
        uint256 committedAt;
        bytes32 responseHash;
        string response;
        uint256 revealedAt;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 => InferenceRequest) public requests;

    event InferenceRequested(
        uint256 indexed requestId,
        address indexed requester,
        string model,
        bytes32 promptHash,
        string prompt
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

    function requestInference(
        string calldata model,
        string calldata prompt
    ) external returns (uint256 requestId, bytes32 promptHash) {
        require(bytes(model).length > 0, "Model required");
        require(bytes(prompt).length > 0, "Prompt required");

        requestId = nextRequestId++;
        promptHash = keccak256(bytes(prompt));

        requests[requestId] = InferenceRequest({
            requester: msg.sender,
            model: model,
            promptHash: promptHash,
            createdAt: block.timestamp,
            status: RequestStatus.Requested,
            worker: address(0),
            commitment: bytes32(0),
            committedAt: 0,
            responseHash: bytes32(0),
            response: "",
            revealedAt: 0
        });

        emit InferenceRequested(
            requestId,
            msg.sender,
            model,
            promptHash,
            prompt
        );
    }

    /**
     * @notice Worker commits to a response hash without revealing the response content yet.
     * @dev commitment = keccak256(abi.encodePacked(requestId, msg.sender, secret, responseHash))
     */
    function commitInference(uint256 requestId, bytes32 commitment) external {
        InferenceRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Requested, "Not requestable");
        require(commitment != bytes32(0), "Commitment required");

        r.status = RequestStatus.Committed;
        r.worker = msg.sender;
        r.commitment = commitment;
        r.committedAt = block.timestamp;

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
    ) external {
        InferenceRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Committed, "Not committed");
        require(r.worker == msg.sender, "Not worker");
        require(bytes(response).length > 0, "Response required");

        bytes32 responseHash = keccak256(bytes(response));
        bytes32 expectedCommitment = keccak256(
            abi.encodePacked(requestId, msg.sender, secret, responseHash)
        );
        require(expectedCommitment == r.commitment, "Commitment mismatch");

        r.status = RequestStatus.Revealed;
        r.responseHash = responseHash;
        r.response = response;
        r.revealedAt = block.timestamp;

        emit InferenceRevealed(requestId, msg.sender, responseHash, response);
    }

    function cancelInference(uint256 requestId) external {
        InferenceRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Requested, "Not cancellable");
        require(r.requester == msg.sender, "Not requester");
        r.status = RequestStatus.Cancelled;
    }
}

