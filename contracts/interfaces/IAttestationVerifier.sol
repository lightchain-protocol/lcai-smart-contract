// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface for on-chain TEE attestation verification.
interface IAttestationVerifier {
    /// @dev Verify a node attestation quote for the supplied node public key.
    /// @return isValid True when the quote and hardware binding are valid.
    /// @return mrEnclave Enclave measurement for policy checks.
    /// @return tcbStatus Trusted computing base status level.
    function verifyAttestation(
        bytes calldata attestationQuote,
        bytes calldata nodePublicKey
    ) external view returns (bool isValid, bytes32 mrEnclave, uint256 tcbStatus);
}
