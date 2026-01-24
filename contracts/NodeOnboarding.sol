// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAttestationVerifier} from "./interfaces/IAttestationVerifier.sol";
import {INodeOnboarding} from "./interfaces/INodeOnboarding.sol";
import {INodeStaking} from "./interfaces/INodeStaking.sol";

/**
 * @title NodeOnboarding
 * @notice Manages registration and lifecycle of Validators and Workers.
 *         Refers to NodeStaking for balance checks and tracks TEE attestation metadata.
 */
contract NodeOnboarding is INodeOnboarding, Ownable, ReentrancyGuard {
    INodeStaking public nodeStaking;
    IAttestationVerifier public attestationVerifier;

    // Configuration
    uint256 public override minValidatorStake;
    uint256 public override minWorkerStake;
    uint256 public unbondingPeriod; // e.g., in seconds
    uint256 public minTcbStatus;
    uint256 public heartbeatTimeout; // 0 = disabled
    bool public enforceEnclaveAllowlist;

    // Mappings
    mapping(address => ValidatorInfo) public validators;
    mapping(address => WorkerInfo) public workers;
    mapping(address => NodeType) public nodeTypes;
    mapping(address => bool) public reporters;
    mapping(bytes32 => bool) public allowedMrEnclaves;

    modifier onlyReporter() {
        require(reporters[msg.sender] || msg.sender == owner(), "Not authorized reporter");
        _;
    }

    constructor(
        address _nodeStaking,
        uint256 _minValidatorStake,
        uint256 _minWorkerStake,
        uint256 _unbondingPeriod
    ) Ownable(msg.sender) {
        require(_nodeStaking != address(0), "Invalid staking");
        nodeStaking = INodeStaking(_nodeStaking);
        minValidatorStake = _minValidatorStake;
        minWorkerStake = _minWorkerStake;
        unbondingPeriod = _unbondingPeriod;
    }

    function setRequirements(
        uint256 _minValidatorStake,
        uint256 _minWorkerStake,
        uint256 _unbondingPeriod
    ) external onlyOwner {
        minValidatorStake = _minValidatorStake;
        minWorkerStake = _minWorkerStake;
        unbondingPeriod = _unbondingPeriod;
    }

    function setReporter(address reporter, bool isActive) external onlyOwner {
        reporters[reporter] = isActive;
    }

    function setAttestationVerifier(address verifier) external onlyOwner {
        attestationVerifier = IAttestationVerifier(verifier);
    }

    function setMinTcbStatus(uint256 minStatus) external onlyOwner {
        minTcbStatus = minStatus;
    }

    function setHeartbeatTimeout(uint256 timeoutSeconds) external onlyOwner {
        heartbeatTimeout = timeoutSeconds;
    }

    function setEnforceEnclaveAllowlist(bool enforce) external onlyOwner {
        enforceEnclaveAllowlist = enforce;
    }

    function setMrEnclaveAllowed(bytes32 mrEnclave, bool allowed) external onlyOwner {
        allowedMrEnclaves[mrEnclave] = allowed;
    }

    // ==========================================
    // Validator Logic
    // ==========================================

    function registerValidator(
        bytes calldata blsPublicKey,
        bytes calldata blsProofOfPossession,
        bytes calldata nodePublicKey,
        bytes calldata attestationQuote
    ) external override nonReentrant {
        require(nodeTypes[msg.sender] == NodeType.None, "Already registered");
        require(nodeStaking.balanceOf(msg.sender) >= minValidatorStake, "Insufficient stake");
        _validateBlsKey(blsPublicKey, blsProofOfPossession);
        _validateNodePublicKey(nodePublicKey);
        _validateAttestationQuote(attestationQuote);

        bytes32 quoteHash = keccak256(attestationQuote);
        (bytes32 mrEnclave, uint256 tcbStatus, bool attested) = _maybeVerifyAttestation(
            attestationQuote,
            nodePublicKey
        );

        validators[msg.sender] = ValidatorInfo({
            blsPublicKey: blsPublicKey,
            blsProofOfPossession: blsProofOfPossession,
            nodePublicKey: nodePublicKey,
            attestationQuoteHash: quoteHash,
            mrEnclave: mrEnclave,
            tcbStatus: tcbStatus,
            isAttested: attested,
            attestedAt: attested ? block.timestamp : 0,
            effectiveTime: block.timestamp,
            exitEpoch: 0,
            performanceScore: 10000,
            slashCount: 0,
            lastHeartbeat: block.timestamp
        });
        nodeTypes[msg.sender] = NodeType.Validator;

        emit ValidatorJoined(msg.sender, blsPublicKey, nodePublicKey, quoteHash);
        emit AttestationStatusUpdated(msg.sender, mrEnclave, tcbStatus, attested);
    }

    function updatePerformance(address validator, uint256 score) external override onlyReporter {
        require(nodeTypes[validator] == NodeType.Validator, "Not a validator");
        require(score <= 10000, "Invalid score");
        validators[validator].performanceScore = score;
        emit PerformanceUpdated(validator, score);
    }

    function verifyValidatorAttestation(
        address validator,
        bytes calldata attestationQuote
    ) external override onlyReporter {
        require(nodeTypes[validator] == NodeType.Validator, "Not a validator");
        require(keccak256(attestationQuote) == validators[validator].attestationQuoteHash, "Quote mismatch");

        (bytes32 mrEnclave, uint256 tcbStatus) = _verifyAttestation(
            attestationQuote,
            validators[validator].nodePublicKey
        );
        _setAttestationStatus(validator, mrEnclave, tcbStatus, true);
    }

    // ==========================================
    // Worker Logic
    // ==========================================

    function registerWorker(
        bytes calldata nodePublicKey,
        bytes calldata attestationQuote,
        string[] calldata models
    ) external override nonReentrant {
        require(nodeTypes[msg.sender] == NodeType.None, "Already registered");
        require(nodeStaking.balanceOf(msg.sender) >= minWorkerStake, "Insufficient stake");
        _validateNodePublicKey(nodePublicKey);
        _validateAttestationQuote(attestationQuote);
        require(models.length != 0, "No models");

        bytes32 quoteHash = keccak256(attestationQuote);
        bytes32 modelsRoot = _computeModelsRoot(models);
        (bytes32 mrEnclave, uint256 tcbStatus, bool attested) = _maybeVerifyAttestation(
            attestationQuote,
            nodePublicKey
        );

        workers[msg.sender] = WorkerInfo({
            nodePublicKey: nodePublicKey,
            attestationQuoteHash: quoteHash,
            mrEnclave: mrEnclave,
            tcbStatus: tcbStatus,
            isAttested: attested,
            attestedAt: attested ? block.timestamp : 0,
            isVerified: false,
            modelsReady: false,
            modelsRoot: modelsRoot,
            supportedModels: models,
            exitEpoch: 0,
            lastHeartbeat: block.timestamp
        });
        nodeTypes[msg.sender] = NodeType.Worker;

        emit WorkerJoined(msg.sender, nodePublicKey, quoteHash, modelsRoot);
        emit AttestationStatusUpdated(msg.sender, mrEnclave, tcbStatus, attested);
    }

    function verifyWorkerAttestation(
        address worker,
        bytes calldata attestationQuote
    ) external override onlyReporter {
        require(nodeTypes[worker] == NodeType.Worker, "Not a worker");
        require(keccak256(attestationQuote) == workers[worker].attestationQuoteHash, "Quote mismatch");

        (bytes32 mrEnclave, uint256 tcbStatus) = _verifyAttestation(
            attestationQuote,
            workers[worker].nodePublicKey
        );
        _setAttestationStatus(worker, mrEnclave, tcbStatus, true);
    }

    function verifyWorker(address worker, bool isValid) external override onlyReporter {
        require(nodeTypes[worker] == NodeType.Worker, "Not a worker");
        workers[worker].isVerified = isValid;
    }

    function setWorkerModelsReady(address worker, bool isReady) external override onlyReporter {
        require(nodeTypes[worker] == NodeType.Worker, "Not a worker");
        workers[worker].modelsReady = isReady;
        emit WorkerModelsReady(worker, isReady);
    }

    function updateWorkerModels(string[] calldata models) external override {
        require(nodeTypes[msg.sender] == NodeType.Worker, "Not a worker");
        require(models.length != 0, "No models");

        WorkerInfo storage info = workers[msg.sender];
        info.supportedModels = models;
        info.modelsRoot = _computeModelsRoot(models);
        info.modelsReady = false;

        emit WorkerModelsUpdated(msg.sender, info.modelsRoot);
    }

    // ==========================================
    // Lifecycle
    // ==========================================

    function heartbeat() external override {
        NodeType nType = nodeTypes[msg.sender];
        require(nType != NodeType.None, "Not registered");

        if (nType == NodeType.Validator) {
            validators[msg.sender].lastHeartbeat = block.timestamp;
        } else {
            workers[msg.sender].lastHeartbeat = block.timestamp;
        }

        emit Heartbeat(msg.sender, block.timestamp);
    }

    function initiateExit() external override nonReentrant {
        NodeType nType = nodeTypes[msg.sender];
        require(nType != NodeType.None, "Not registered");

        uint256 exitTime = block.timestamp + unbondingPeriod;

        if (nType == NodeType.Validator) {
            require(validators[msg.sender].exitEpoch == 0, "Already escaping");
            validators[msg.sender].exitEpoch = exitTime;
        } else if (nType == NodeType.Worker) {
            require(workers[msg.sender].exitEpoch == 0, "Already escaping");
            workers[msg.sender].exitEpoch = exitTime;
        }

        emit ExitInitiated(msg.sender, exitTime);
    }

    function finalizeExit() external override nonReentrant {
        NodeType nType = nodeTypes[msg.sender];
        require(nType != NodeType.None, "Not registered");
        require(_isSafeToWithdraw(msg.sender), "Exit not finalized");

        if (nType == NodeType.Validator) {
            delete validators[msg.sender];
        } else if (nType == NodeType.Worker) {
            delete workers[msg.sender];
        }

        nodeTypes[msg.sender] = NodeType.None;

        emit ExitFinalized(msg.sender);
    }

    function isSafeToWithdraw(address node) external view override returns (bool) {
        return _isSafeToWithdraw(node);
    }

    function getNodeType(address node) external view override returns (NodeType) {
        return nodeTypes[node];
    }

    // ==========================================
    // Attestation Admin
    // ==========================================

    function setAttestationStatus(
        address node,
        bytes32 mrEnclave,
        uint256 tcbStatus,
        bool isAttested
    ) external override onlyOwner {
        require(nodeTypes[node] != NodeType.None, "Not registered");

        if (isAttested) {
            _checkAttestationPolicy(mrEnclave, tcbStatus);
        } else {
            mrEnclave = bytes32(0);
            tcbStatus = 0;
        }

        _setAttestationStatus(node, mrEnclave, tcbStatus, isAttested);
    }

    // ==========================================
    // Views
    // ==========================================

    function getValidator(address node) external view override returns (ValidatorInfo memory) {
        return validators[node];
    }

    function getWorker(address node) external view override returns (WorkerInfo memory) {
        return workers[node];
    }

    function isValidatorActive(address node) external view override returns (bool) {
        if (nodeTypes[node] != NodeType.Validator) return false;
        ValidatorInfo storage info = validators[node];

        if (!info.isAttested) return false;
        if (info.exitEpoch != 0) return false;
        if (!_hasSufficientStake(node, minValidatorStake)) return false;
        if (!_isHeartbeatFresh(info.lastHeartbeat)) return false;

        return true;
    }

    function isWorkerActive(address node) external view override returns (bool) {
        if (nodeTypes[node] != NodeType.Worker) return false;
        WorkerInfo storage info = workers[node];

        if (!info.isAttested) return false;
        if (!info.isVerified) return false;
        if (!info.modelsReady) return false;
        if (info.exitEpoch != 0) return false;
        if (!_hasSufficientStake(node, minWorkerStake)) return false;
        if (!_isHeartbeatFresh(info.lastHeartbeat)) return false;

        return true;
    }

    // ==========================================
    // Internal Helpers
    // ==========================================

    function _hasSufficientStake(address node, uint256 minStake) internal view returns (bool) {
        return nodeStaking.balanceOf(node) >= minStake;
    }

    function _isHeartbeatFresh(uint256 lastHeartbeat) internal view returns (bool) {
        if (heartbeatTimeout == 0) return true;
        return block.timestamp <= lastHeartbeat + heartbeatTimeout;
    }

    function _isSafeToWithdraw(address node) internal view returns (bool) {
        NodeType nType = nodeTypes[node];
        if (nType == NodeType.None) return true;

        uint256 exitEpoch;
        if (nType == NodeType.Validator) {
            exitEpoch = validators[node].exitEpoch;
        } else {
            exitEpoch = workers[node].exitEpoch;
        }

        if (exitEpoch == 0) return false;
        if (block.timestamp < exitEpoch) return false;

        return true;
    }

    function _validateBlsKey(bytes calldata blsPublicKey, bytes calldata blsProofOfPossession) internal pure {
        require(blsPublicKey.length == 48, "Invalid BLS key");
        require(blsProofOfPossession.length == 96, "Invalid BLS proof");
    }

    function _validateNodePublicKey(bytes calldata nodePublicKey) internal pure {
        require(nodePublicKey.length == 33 || nodePublicKey.length == 65, "Invalid node public key");
    }

    function _validateAttestationQuote(bytes calldata attestationQuote) internal pure {
        require(attestationQuote.length != 0, "Invalid attestation");
    }

    function _computeModelsRoot(string[] calldata models) internal pure returns (bytes32) {
        return keccak256(abi.encode(models));
    }

    function _checkAttestationPolicy(bytes32 mrEnclave, uint256 tcbStatus) internal view {
        if (enforceEnclaveAllowlist) {
            require(allowedMrEnclaves[mrEnclave], "MR_ENCLAVE not allowed");
        }
        if (minTcbStatus != 0) {
            require(tcbStatus >= minTcbStatus, "TCB status too low");
        }
    }

    function _verifyAttestation(
        bytes memory attestationQuote,
        bytes memory nodePublicKey
    ) internal view returns (bytes32 mrEnclave, uint256 tcbStatus) {
        require(address(attestationVerifier) != address(0), "Verifier not set");
        (bool ok, bytes32 enclave, uint256 tcb) = attestationVerifier.verifyAttestation(
            attestationQuote,
            nodePublicKey
        );
        require(ok, "Attestation invalid");
        _checkAttestationPolicy(enclave, tcb);
        return (enclave, tcb);
    }

    function _maybeVerifyAttestation(
        bytes memory attestationQuote,
        bytes memory nodePublicKey
    ) internal view returns (bytes32 mrEnclave, uint256 tcbStatus, bool attested) {
        if (address(attestationVerifier) == address(0)) {
            return (bytes32(0), 0, false);
        }

        (bytes32 enclave, uint256 tcb) = _verifyAttestation(attestationQuote, nodePublicKey);
        return (enclave, tcb, true);
    }

    function _setAttestationStatus(
        address node,
        bytes32 mrEnclave,
        uint256 tcbStatus,
        bool isAttested
    ) internal {
        if (nodeTypes[node] == NodeType.Validator) {
            ValidatorInfo storage info = validators[node];
            info.mrEnclave = mrEnclave;
            info.tcbStatus = tcbStatus;
            info.isAttested = isAttested;
            info.attestedAt = isAttested ? block.timestamp : 0;
        } else if (nodeTypes[node] == NodeType.Worker) {
            WorkerInfo storage info = workers[node];
            info.mrEnclave = mrEnclave;
            info.tcbStatus = tcbStatus;
            info.isAttested = isAttested;
            info.attestedAt = isAttested ? block.timestamp : 0;
        }

        emit AttestationStatusUpdated(node, mrEnclave, tcbStatus, isAttested);
    }
}
