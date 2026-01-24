// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INodeOnboarding {
    enum NodeType {
        None,
        Validator,
        Worker
    }

    struct ValidatorInfo {
        bytes blsPublicKey;
        bytes blsProofOfPossession;
        bytes nodePublicKey; // secp256k1
        bytes32 attestationQuoteHash;
        bytes32 mrEnclave;
        uint256 tcbStatus;
        bool isAttested;
        uint256 attestedAt;
        uint256 effectiveTime;
        uint256 exitEpoch;
        uint256 performanceScore; // 0-10000 scaled
        uint256 slashCount;
        uint256 lastHeartbeat;
    }

    struct WorkerInfo {
        bytes nodePublicKey; // secp256k1
        bytes32 attestationQuoteHash;
        bytes32 mrEnclave;
        uint256 tcbStatus;
        bool isAttested;
        uint256 attestedAt;
        bool isVerified;
        bool modelsReady;
        bytes32 modelsRoot;
        string[] supportedModels;
        uint256 exitEpoch;
        uint256 lastHeartbeat;
    }

    event ValidatorJoined(
        address indexed nodeAddress,
        bytes blsPublicKey,
        bytes nodePublicKey,
        bytes32 attestationQuoteHash
    );
    event WorkerJoined(
        address indexed nodeAddress,
        bytes nodePublicKey,
        bytes32 attestationQuoteHash,
        bytes32 modelsRoot
    );
    event AttestationStatusUpdated(
        address indexed nodeAddress,
        bytes32 mrEnclave,
        uint256 tcbStatus,
        bool isAttested
    );
    event WorkerModelsUpdated(address indexed nodeAddress, bytes32 modelsRoot);
    event WorkerModelsReady(address indexed nodeAddress, bool isReady);
    event ExitInitiated(address indexed nodeAddress, uint256 finalEpoch);
    event ExitFinalized(address indexed nodeAddress);
    event Heartbeat(address indexed nodeAddress, uint256 timestamp);
    event PerformanceUpdated(address indexed nodeAddress, uint256 newScore);

    function registerValidator(
        bytes calldata blsPublicKey,
        bytes calldata blsProofOfPossession,
        bytes calldata nodePublicKey,
        bytes calldata attestationQuote
    ) external;
    function registerWorker(
        bytes calldata nodePublicKey,
        bytes calldata attestationQuote,
        string[] calldata models
    ) external;

    function verifyValidatorAttestation(address validator, bytes calldata attestationQuote) external;
    function verifyWorkerAttestation(address worker, bytes calldata attestationQuote) external;
    function setAttestationStatus(address node, bytes32 mrEnclave, uint256 tcbStatus, bool isAttested) external;
    function setWorkerModelsReady(address worker, bool isReady) external;
    function updateWorkerModels(string[] calldata models) external;
    
    function initiateExit() external;
    function finalizeExit() external;
    function heartbeat() external;
    
    // Interaction hooks
    function isSafeToWithdraw(address node) external view returns (bool);
    function getNodeType(address node) external view returns (NodeType);
    function minValidatorStake() external view returns (uint256);
    function minWorkerStake() external view returns (uint256);
    
    // Admin/Governance functions
    function verifyWorker(address worker, bool isValid) external;
    function updatePerformance(address validator, uint256 score) external;

    // Views
    function getValidator(address node) external view returns (ValidatorInfo memory);
    function getWorker(address node) external view returns (WorkerInfo memory);
    function isValidatorActive(address node) external view returns (bool);
    function isWorkerActive(address node) external view returns (bool);
}
