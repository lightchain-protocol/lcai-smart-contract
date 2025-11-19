// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Wrapper} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title WrappedToken
 * @dev ERC20 wrapper token with voting and permit capabilities
 * @notice This token wraps a base ERC20 token and adds governance features
 *
 * Features:
 * - ERC20Wrapper: Allows users to deposit base tokens and receive wrapped tokens 1:1
 * - ERC20Votes: Adds delegation and voting power tracking for governance
 * - ERC20Permit: Enables gasless approvals via signatures
 *
 * Users can:
 * 1. Deposit base tokens to mint wrapped tokens (depositFor/mint)
 * 2. Withdraw base tokens by burning wrapped tokens (withdrawTo/burn)
 * 3. Delegate voting power to participate in governance
 * 4. Use permit for gasless token approvals
 */
contract WrappedToken is ERC20, ERC20Permit, ERC20Votes, ERC20Wrapper {
    /**
     * @dev Constructor initializes the wrapper with the underlying token
     * @param underlyingToken The address of the base ERC20 token to wrap
     * @param name The name of the wrapped token
     * @param symbol The symbol of the wrapped token
     */
    constructor(
        IERC20 underlyingToken,
        string memory name,
        string memory symbol
    )
        ERC20(name, symbol)
        ERC20Permit(name)
        ERC20Wrapper(underlyingToken)
    {}

    /**
     * @dev Overrides required by Solidity for multiple inheritance
     * @notice This ensures proper token transfer behavior with vote tracking
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    /**
     * @dev Override to resolve conflict between ERC20Permit and Nonces
     * @notice Returns the current nonce for an owner's permit signatures
     */
    function nonces(
        address owner
    ) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    /**
     * @dev Override decimals to match the underlying token
     * @notice Ensures wrapped token has same decimal precision as base token
     */
    function decimals()
        public
        view
        virtual
        override(ERC20, ERC20Wrapper)
        returns (uint8)
    {
        return super.decimals();
    }
}
