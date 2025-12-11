// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BenchmarkRegistry
 * @notice Registry that records encrypted benchmark datasets used by validators.
 * @dev Provides read helpers for domain/task assignment so validators can discover benchmarks on-chain.
 */
contract BenchmarkRegistry is Ownable {
    struct Benchmark {
        string benchmarkId;
        string domain;
        string taskType;
        string benchmarkCID;
        string metadataCID;
        string manifestHash;
        string wrappedDEK;
        string version;
        address curator;
        uint256 registeredAt;
        bool encrypted;
        bool active;
    }

    // benchmarkId => Benchmark
    mapping(string => Benchmark) private benchmarks;
    // domain => benchmark ids
    mapping(string => string[]) private benchmarksByDomain;
    // taskType => benchmark ids
    mapping(string => string[]) private benchmarksByTask;
    // keccak256(domain, taskType) => benchmarkId
    mapping(bytes32 => string) private defaultAssignments;

    string[] private benchmarkIds;

    event BenchmarkRegistered(
        string indexed benchmarkId,
        string domain,
        string taskType,
        string benchmarkCID,
        bool encrypted
    );

    event BenchmarkAssignmentUpdated(
        string indexed benchmarkId,
        string domain,
        string taskType
    );

    event BenchmarkStatusUpdated(string indexed benchmarkId, bool active);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new benchmark dataset.
     * @param benchmarkId Unique identifier for the benchmark (e.g. "finance-qa-v1")
     * @param domain Domain that this benchmark covers (finance, medical, etc.)
     * @param taskType Task type (qa, classification, generation, etc.)
     * @param benchmarkCID IPFS CID of encrypted benchmark archive
     * @param metadataCID IPFS CID for benchmark metadata JSON
     * @param manifestHash SHA-256 hash of the manifest.json inside the archive
     * @param wrappedDEK Base64 wrapped DEK that validators unwrap with tickets (can be empty when unencrypted)
     * @param version Semantic version string (e.g. "1.0.0")
     * @param encrypted True when benchmarkCID references encrypted payload
     */
    function registerBenchmark(
        string calldata benchmarkId,
        string calldata domain,
        string calldata taskType,
        string calldata benchmarkCID,
        string calldata metadataCID,
        string calldata manifestHash,
        string calldata wrappedDEK,
        string calldata version,
        bool encrypted
    ) external onlyOwner {
        require(bytes(benchmarkId).length > 0, "Benchmark ID required");
        require(bytes(domain).length > 0, "Domain required");
        require(bytes(taskType).length > 0, "Task required");
        require(bytes(benchmarkCID).length > 0, "Benchmark CID required");
        require(bytes(metadataCID).length > 0, "Metadata CID required");
        require(bytes(manifestHash).length > 0, "Manifest hash required");
        require(
            bytes(benchmarks[benchmarkId].benchmarkId).length == 0,
            "Benchmark exists"
        );

        if (encrypted) {
            require(bytes(wrappedDEK).length > 0, "Wrapped DEK required");
        }

        Benchmark storage record = benchmarks[benchmarkId];
        record.benchmarkId = benchmarkId;
        record.domain = domain;
        record.taskType = taskType;
        record.benchmarkCID = benchmarkCID;
        record.metadataCID = metadataCID;
        record.manifestHash = manifestHash;
        record.wrappedDEK = wrappedDEK;
        record.version = version;
        record.curator = msg.sender;
        record.registeredAt = block.timestamp;
        record.encrypted = encrypted;
        record.active = true;

        benchmarkIds.push(benchmarkId);
        benchmarksByDomain[domain].push(benchmarkId);
        benchmarksByTask[taskType].push(benchmarkId);

        bytes32 assignmentKey = _assignmentKey(domain, taskType);
        if (bytes(defaultAssignments[assignmentKey]).length == 0) {
            defaultAssignments[assignmentKey] = benchmarkId;
            emit BenchmarkAssignmentUpdated(benchmarkId, domain, taskType);
        }

        emit BenchmarkRegistered(
            benchmarkId,
            domain,
            taskType,
            benchmarkCID,
            encrypted
        );
    }

    /**
     * @notice Override default benchmark assignment for a domain/task combination.
     */
    function setBenchmarkForDomainTask(
        string calldata domain,
        string calldata taskType,
        string calldata benchmarkId
    ) external onlyOwner {
        require(bytes(domain).length > 0, "Domain required");
        require(bytes(taskType).length > 0, "Task required");
        require(
            bytes(benchmarks[benchmarkId].benchmarkId).length > 0,
            "Benchmark missing"
        );
        require(benchmarks[benchmarkId].active, "Benchmark inactive");

        bytes32 assignmentKey = _assignmentKey(domain, taskType);
        defaultAssignments[assignmentKey] = benchmarkId;
        emit BenchmarkAssignmentUpdated(benchmarkId, domain, taskType);
    }

    /**
     * @notice Toggle benchmark active state.
     */
    function setBenchmarkActive(
        string calldata benchmarkId,
        bool active
    ) external onlyOwner {
        require(
            bytes(benchmarks[benchmarkId].benchmarkId).length > 0,
            "Benchmark missing"
        );
        benchmarks[benchmarkId].active = active;
        emit BenchmarkStatusUpdated(benchmarkId, active);
    }

    /**
     * @notice Fetch benchmark struct by identifier.
     */
    function getBenchmark(
        string calldata benchmarkId
    ) external view returns (Benchmark memory) {
        require(
            bytes(benchmarks[benchmarkId].benchmarkId).length > 0,
            "Benchmark missing"
        );
        return benchmarks[benchmarkId];
    }

    /**
     * @notice List benchmarks assigned to a domain.
     */
    function listBenchmarksByDomain(
        string calldata domain
    ) external view returns (string[] memory) {
        return _copyStringArray(benchmarksByDomain[domain]);
    }

    /**
     * @notice List benchmarks assigned to the provided task type.
     */
    function listBenchmarksByTask(
        string calldata taskType
    ) external view returns (string[] memory) {
        return _copyStringArray(benchmarksByTask[taskType]);
    }

    /**
     * @notice Return all benchmark identifiers.
     */
    function listBenchmarks() external view returns (string[] memory) {
        return _copyStringArray(benchmarkIds);
    }

    /**
     * @notice Returns the assigned benchmark for a domain/task pair.
     * @dev Reverts when no benchmark is assigned or the assigned benchmark is inactive.
     */
    function getBenchmarkForVariant(
        string calldata domain,
        string calldata taskType
    ) external view returns (string memory) {
        require(bytes(domain).length > 0, "Domain required");
        require(bytes(taskType).length > 0, "Task required");
        string memory benchmarkId = defaultAssignments[
            _assignmentKey(domain, taskType)
        ];
        require(bytes(benchmarkId).length > 0, "No benchmark assigned");
        require(benchmarks[benchmarkId].active, "Assigned benchmark inactive");
        return benchmarkId;
    }

    /**
     * @notice Helper to copy storage-backed string arrays to memory.
     */
    function _copyStringArray(
        string[] storage source
    ) private view returns (string[] memory) {
        string[] memory result = new string[](source.length);
        for (uint256 i = 0; i < source.length; i++) {
            result[i] = source[i];
        }
        return result;
    }

    function _assignmentKey(
        string calldata domain,
        string calldata taskType
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(domain, "::", taskType));
    }
}
