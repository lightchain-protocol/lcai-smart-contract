// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INodeStaking} from "./interfaces/INodeStaking.sol";
import {INodeOnboarding} from "./interfaces/INodeOnboarding.sol";

/**
 * @title NodeStaking
 * @notice Manages deposits, withdrawals, and slashing for the Lightchain AI network.
 *         Ensures funds can only be withdrawn if the NodeOnboarding registry approves it.
 */
contract NodeStaking is INodeStaking, Ownable, ReentrancyGuard {
    
    mapping(address => uint256) private _balances;
    
    INodeOnboarding public nodeOnboarding;
    
    // Roles allowed to slash (e.g., Consensus, DisputeResolution)
    mapping(address => bool) public slasherRoles;

    modifier onlySlasher() {
        require(slasherRoles[msg.sender] || msg.sender == owner(), "Not authorized slasher");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setNodeOnboarding(address _nodeOnboarding) external onlyOwner {
        require(_nodeOnboarding != address(0), "Invalid address");
        nodeOnboarding = INodeOnboarding(_nodeOnboarding);
    }

    function setSlasher(address slasher, bool isActive) external onlyOwner {
        slasherRoles[slasher] = isActive;
    }

    /**
     * @notice Deposit native tokens (ETH) into the staking contract.
     */
    function deposit() external payable override nonReentrant {
        require(msg.value > 0, "Zero deposit");
        _balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw funds. Requires the node to be in a safe state (unbonded).
     */
    function withdraw(uint256 amount) external override nonReentrant {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        
        // If nodeOnboarding is set, we must check if withdrawal is safe
        if (address(nodeOnboarding) != address(0)) {
            // Check if user is attempting to go below min stake while active
            INodeOnboarding.NodeType nType = nodeOnboarding.getNodeType(msg.sender);
            
            if (nType == INodeOnboarding.NodeType.Validator) {
                uint256 min = nodeOnboarding.minValidatorStake();
                 if (_balances[msg.sender] - amount < min) {
                      require(nodeOnboarding.isSafeToWithdraw(msg.sender), "Must exit to withdraw below min stake");
                 }
            } else if (nType == INodeOnboarding.NodeType.Worker) {
                 uint256 min = nodeOnboarding.minWorkerStake();
                 if (_balances[msg.sender] - amount < min) {
                      require(nodeOnboarding.isSafeToWithdraw(msg.sender), "Must exit to withdraw below min stake");
                 }
            }
        }

        _balances[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Slash a node's stake.
     * @param account The node address to slash.
     * @param amount The amount to slash.
     * @param beneficiary Where to send the slashed funds (e.g. Treasury, Reporter).
     * @param reason Description for the slashing event.
     */
    function slash(address account, uint256 amount, address beneficiary, string calldata reason) external override onlySlasher nonReentrant {
        require(_balances[account] >= amount, "Insufficient stake to slash");
        _balances[account] -= amount;
        
        address recipient = beneficiary == address(0) ? owner() : beneficiary;
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Slash transfer failed");
        
        emit Slashed(account, amount, recipient, reason);
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }
}
