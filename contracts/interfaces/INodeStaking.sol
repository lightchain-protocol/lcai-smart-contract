// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INodeStaking {
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Slashed(address indexed account, uint256 amount, address indexed beneficiary, string reason);

    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function slash(address account, uint256 amount, address beneficiary, string calldata reason) external;
    function balanceOf(address account) external view returns (uint256);
}
