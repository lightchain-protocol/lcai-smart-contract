// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAttestationVerifier} from "../interfaces/IAttestationVerifier.sol";

contract MockAttestationVerifier is IAttestationVerifier {
    struct Result {
        bool isValid;
        bytes32 mrEnclave;
        uint256 tcbStatus;
        bool exists;
    }

    mapping(bytes32 => Result) private results;
    Result private defaultResult;
    bool private useDefault;

    function setResult(
        bytes calldata attestationQuote,
        bytes32 mrEnclave,
        uint256 tcbStatus,
        bool isValid
    ) external {
        results[keccak256(attestationQuote)] = Result({
            isValid: isValid,
            mrEnclave: mrEnclave,
            tcbStatus: tcbStatus,
            exists: true
        });
    }

    function setDefaultResult(bytes32 mrEnclave, uint256 tcbStatus, bool isValid) external {
        defaultResult = Result({
            isValid: isValid,
            mrEnclave: mrEnclave,
            tcbStatus: tcbStatus,
            exists: true
        });
        useDefault = true;
    }

    function clearDefaultResult() external {
        useDefault = false;
        defaultResult = Result({isValid: false, mrEnclave: bytes32(0), tcbStatus: 0, exists: false});
    }

    function verifyAttestation(
        bytes calldata attestationQuote,
        bytes calldata
    ) external view override returns (bool isValid, bytes32 mrEnclave, uint256 tcbStatus) {
        Result memory result = results[keccak256(attestationQuote)];
        if (result.exists) {
            return (result.isValid, result.mrEnclave, result.tcbStatus);
        }
        if (useDefault) {
            return (defaultResult.isValid, defaultResult.mrEnclave, defaultResult.tcbStatus);
        }
        return (false, bytes32(0), 0);
    }
}
