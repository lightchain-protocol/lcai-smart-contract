// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WLCAI
 * @dev A contract that wraps ETH into ERC20Votes tokens for governance participation.
 * Users can deposit ETH to mint tokens and withdraw ETH by burning tokens.
 * The contract maintains a 1:1 ratio between ETH deposits and token supply.
 *
 * Features:
 * - Deposit ETH to mint governance tokens
 * - Withdraw ETH by burning tokens
 * - Full ERC20Votes compatibility with delegation and snapshots
 * - Permit functionality for gasless approvals
 * - Reentrancy protection for all state-changing functions
 */
contract WLCAI is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    // Events
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);

    // Errors
    error InsufficientBalance();
    error TransferFailed();
    error ZeroAmount();

    constructor()
        ERC20("Wrapped LCAI Votes", "WLCAIV")
        ERC20Permit("Wrapped LCAI Votes")
    {}

    /**
     * @dev Deposit ETH and mint equivalent WLCAIV tokens
     * Emits a Deposit event
     */
    function deposit() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH by burning WLCAIV tokens
     * @param amount Amount of tokens to burn and ETH to withdraw
     * Emits a Withdrawal event
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        _burn(msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @dev Withdraw all ETH by burning all user's tokens
     * Convenience function for complete withdrawal
     */
    function withdrawAll() external nonReentrant {
        uint256 balance = balanceOf(msg.sender);
        if (balance == 0) revert ZeroAmount();

        _burn(msg.sender, balance);

        (bool success, ) = payable(msg.sender).call{value: balance}("");
        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, balance);
    }

    /**
     * @dev Get the total ETH backing the tokens (should equal totalSupply)
     * @return The contract's ETH balance
     */
    function totalETH() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Get the ETH value of a user's token balance
     * @param account The account to check
     * @return The ETH value equivalent to the account's token balance
     */
    function ethBalanceOf(address account) external view returns (uint256) {
        return balanceOf(account);
    }

    // Required overrides for multiple inheritance

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    function nonces(
        address owner
    ) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    // Fallback function to accept ETH deposits
    receive() external payable {
        if (msg.value > 0) {
            _mint(msg.sender, msg.value);
            emit Deposit(msg.sender, msg.value);
        }
    }
}
