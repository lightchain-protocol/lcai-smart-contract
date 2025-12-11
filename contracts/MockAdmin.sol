// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockAdmin
 * @dev Simple contract to act as admin for testing purposes
 * Simulates a Gnosis Safe by allowing an owner to execute arbitrary calls
 */
contract MockAdmin {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    /**
     * @dev Execute a call to any target with any data
     * @param target The address to call
     * @param data The calldata to send
     */
    function execute(
        address target,
        bytes calldata data
    ) external payable returns (bytes memory) {
        require(msg.sender == owner, "MockAdmin: caller is not the owner");
        (bool success, bytes memory result) = target.call{value: msg.value}(
            data
        );
        require(success, "MockAdmin: execution failed");
        return result;
    }

    // Allow receiving ETH
    receive() external payable {}
}
