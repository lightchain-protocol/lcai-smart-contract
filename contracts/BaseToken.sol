// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title BaseToken
 * @dev Simple ERC20 token without voting or permit capabilities
 * @notice This is the base utility token that can be wrapped for governance
 */
contract BaseToken is ERC20 {
    /**
     * @dev Constructor that mints initial supply to deployer
     * @param name The name of the token
     * @param symbol The symbol of the token
     */
    constructor(
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        _mint(msg.sender, 1_000_000_000 * 1e18);
    }
}
