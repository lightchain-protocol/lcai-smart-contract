// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EthRejecter
 * @notice Utility contract used in tests to reject any incoming ETH.
 */
contract EthRejecter {
    receive() external payable {
        revert("EthRejecter: reject");
    }
}
