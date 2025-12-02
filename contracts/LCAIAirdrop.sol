// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILCAIPresale {
    function buyersAmount(address buyer) external view returns (uint256);
    function saleToken() external view returns (address);
    function saleTokenDec() external view returns (uint8);
}

contract LCAIAirdrop is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    uint256 public constant REWARD_PERCENTAGE = 50; // 50% of the total tokens

    ILCAIPresale public lcaiPresale;
    address public token;
    address payable public treasury;

    uint256 public claimFee; // Fee in ETH required to claim
    uint256 public totalFeesCollected;

    uint256 public totalClaimedAmount;
    mapping(address => uint256) public claimedAmount;
    mapping(address => bool) public claimed;

    event Claimed(address indexed user, uint256 amount, uint256 feePaid);
    event PresaleUpdated(
        address indexed oldPresale,
        address indexed newPresale
    );
    event TokensDeposited(address indexed from, uint256 amount);
    event TokensWithdrawn(address indexed to, uint256 amount);
    event ClaimFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    modifier notClaimed() {
        require(!claimed[msg.sender], "LCAIAirdrop: Already claimed");
        _;
    }

    constructor(
        address _lcaiPresale,
        address payable _treasury
    ) Ownable(msg.sender) {
        require(
            _lcaiPresale != address(0),
            "LCAIAirdrop: Invalid presale address"
        );
        require(
            _treasury != address(0),
            "LCAIAirdrop: Invalid treasury address"
        );
        lcaiPresale = ILCAIPresale(_lcaiPresale);
        token = lcaiPresale.saleToken();
        require(token != address(0), "LCAIAirdrop: Invalid token address");
        treasury = _treasury;
    }

    function claim() external payable nonReentrant whenNotPaused notClaimed {
        require(msg.value == claimFee, "LCAIAirdrop: Insufficient claim fee");

        uint256 amount = lcaiPresale.buyersAmount(msg.sender);
        require(amount > 0, "LCAIAirdrop: No amount to claim");

        uint256 rewardAmount = (amount * REWARD_PERCENTAGE) / 100;
        require(
            IERC20(token).balanceOf(address(this)) >= rewardAmount,
            "LCAIAirdrop: Insufficient contract balance"
        );

        claimed[msg.sender] = true;
        claimedAmount[msg.sender] = rewardAmount;
        totalClaimedAmount += rewardAmount;
        totalFeesCollected += claimFee;

        // Transfer claim fee to treasury
        if (claimFee > 0) {
            (bool success, ) = treasury.call{value: claimFee}("");
            require(success, "LCAIAirdrop: Fee transfer to treasury failed");
        }

        IERC20(token).safeTransfer(msg.sender, rewardAmount);

        emit Claimed(msg.sender, rewardAmount, claimFee);
    }

    function deposit(uint256 amount) external onlyOwner {
        require(amount > 0, "LCAIAirdrop: Amount must be greater than 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit TokensDeposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "LCAIAirdrop: Amount must be greater than 0");
        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "LCAIAirdrop: Insufficient contract balance"
        );
        IERC20(token).safeTransfer(msg.sender, amount);
        emit TokensWithdrawn(msg.sender, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getClaimableAmount(address user) external view returns (uint256) {
        if (claimed[user]) {
            return 0;
        }
        uint256 amount = lcaiPresale.buyersAmount(user);
        return (amount * REWARD_PERCENTAGE) / 100;
    }

    function setClaimFee(uint256 _claimFee) external onlyOwner {
        uint256 oldFee = claimFee;
        claimFee = _claimFee;
        emit ClaimFeeUpdated(oldFee, _claimFee);
    }
}
