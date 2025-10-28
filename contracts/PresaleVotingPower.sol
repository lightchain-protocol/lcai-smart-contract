// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PresaleVotingPower
 * @dev Implementation of IVotes interface with manual voting power assignment and disabled delegation
 * @notice This contract allows an admin to manually set voting power for addresses
 * Delegation functionality is completely disabled for security/control purposes
 */
contract PresaleVotingPower is IVotes, Ownable {
    // Mapping to store voting power for each address
    mapping(address => uint256) private _votingPower;

    // Total supply of all voting power assigned
    uint256 public totalSupply;

    // Mapping to store the total voting power assigned to each address
    uint256 private _totalVotingPower;

    /**
     * @dev Event emitted when voting power is updated for an account
     * @param account The address whose voting power was updated
     * @param newAmount The new voting power amount
     * @param oldAmount The previous voting power amount
     */
    event VotingPowerUpdated(
        address indexed account,
        uint256 newAmount,
        uint256 oldAmount
    );

    /**
     * @dev Constructor sets the deployer as the initial owner
     */
    constructor(uint256 _totalSupply) Ownable(msg.sender) {
        totalSupply = _totalSupply;
    }

    /**
     * @dev Allows the owner to manually set voting power for an account
     * @param account The address to set voting power for
     * @param amount The amount of voting power to assign
     */
    function setVotingPower(
        address account,
        uint256 amount
    ) external onlyOwner {
        require(
            account != address(0),
            "PresaleVotingPower: cannot set voting power for zero address"
        );

        uint256 oldAmount = _votingPower[account];
        _votingPower[account] = amount;

        _totalVotingPower += amount - oldAmount;

        require(
            _totalVotingPower <= totalSupply,
            "PresaleVotingPower: total voting power exceeds total supply"
        );

        emit VotingPowerUpdated(account, amount, oldAmount);
    }

    /**
     * @dev Allows the owner to manually set voting power for multiple accounts in a single transaction
     * @param accounts Array of addresses to set voting power for
     * @param amounts Array of voting power amounts to assign (must match accounts length)
     */
    function setVotingPowerBatch(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            accounts.length == amounts.length,
            "PresaleVotingPower: accounts and amounts arrays must have the same length"
        );
        require(
            accounts.length > 0,
            "PresaleVotingPower: arrays cannot be empty"
        );

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 amount = amounts[i];

            require(
                account != address(0),
                "PresaleVotingPower: cannot set voting power for zero address"
            );

            uint256 oldAmount = _votingPower[account];
            _votingPower[account] = amount;

            _totalVotingPower += amount - oldAmount;

            require(
                _totalVotingPower <= totalSupply,
                "PresaleVotingPower: total voting power exceeds total supply"
            );

            emit VotingPowerUpdated(account, amount, oldAmount);
        }
    }

    /**
     * @dev Returns the current voting power of an account
     * @param account The address to query
     * @return The current voting power of the account
     */
    function getVotes(
        address account
    ) external view override returns (uint256) {
        return _votingPower[account];
    }

    /**
     * @dev Returns the voting power of an account at a specific timepoint
     * @param account The address to query
     * @return The voting power of the account
     */
    function getPastVotes(
        address account,
        uint256
    ) external view override returns (uint256) {
        // For simplicity, we don't implement historical checkpointing
        // This could be enhanced with checkpoint functionality if needed
        return _votingPower[account];
    }

    /**
     * @dev Returns the total supply of voting power at a specific timepoint
     * @notice For simplicity, this returns the current total supply
     * @return The total supply of voting power
     */
    function getPastTotalSupply(
        uint256
    ) external view override returns (uint256) {
        // For simplicity, we don't implement historical checkpointing
        return totalSupply;
    }

    /**
     * @dev Delegation is disabled - this function always reverts
     */
    function delegate(address) external pure override {
        revert("Delegation disabled");
    }

    /**
     * @dev Delegation by signature is disabled - this function always reverts
     */
    function delegateBySig(
        address,
        uint256,
        uint256,
        uint8,
        bytes32,
        bytes32
    ) external pure override {
        revert("Delegation disabled");
    }

    /**
     * @dev Returns the delegate of an account - always returns address(0) since delegation is disabled
     * @return Always returns address(0)
     */
    function delegates(address) external pure override returns (address) {
        return address(0);
    }

    /**
     * @dev Returns the voting power of an account (convenience function)
     * @param account The address to query
     * @return The voting power of the account
     */
    function balanceOf(address account) external view returns (uint256) {
        return _votingPower[account];
    }
}
