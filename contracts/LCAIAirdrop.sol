// SPDX-License-Identifier: MIT
/*
  _     _       _     _       _           _            _    ___ 
 | |   (_) __ _| |__ | |_ ___| |__   __ _(_)_ __      / \  |_ _|
 | |   | |/ _` | '_ \| __/ __| '_ \ / _` | | '_ \    / _ \  | | 
 | |___| | (_| | | | | || (__| | | | (_| | | | | |  / ___ \ | | 
 |_____|_|\__, |_| |_|\__\___|_| |_|\__,_|_|_| |_| /_/   \_\___|
          |___/                                                 
*/

pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILCAIPresale {
    function buyersAmount(address buyer) external view returns (uint256);
    function saleToken() external view returns (address);
    function saleTokenDec() external view returns (uint8);
}

contract LCAIAirdrop is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant REWARD_PERCENTAGE = 50; // 50% of the total tokens
    uint256 public constant SECONDS_PER_MONTH = 30 days;

    ILCAIPresale public lcaiPresale;
    address public token;

    uint256 public totalClaimedAmount;
    mapping(address => uint256) public claimedAmount;
    mapping(address => bool) public claimed;

    struct ClaimConfig {
        uint256 startTime;
        uint256 endTime;
    }

    ClaimConfig public claimConfig;
    bool public claimEnabled; // Can only be enabled once

    // Vesting configuration
    struct VestingConfig {
        uint256 durationMonths; // Total vesting period in months
        uint256 rewardPercentage; // Reward percentage from total purchases
        uint256 startTime; // When vesting option becomes available
        uint256 endTime; // When vesting option expires
    }

    VestingConfig public vestingConfig;
    bool public vestingEnabled; // Can only be enabled once

    // User vesting state
    struct UserVesting {
        bool optedForVesting; // Whether user chose vesting option
        uint256 totalVestingAmount; // Total amount to be vested
        uint256 claimedVestingAmount; // Amount already claimed from vesting
        uint256 vestingStartTime; // When vesting started
    }

    mapping(address => UserVesting) public userVesting;

    event ClaimOpened(uint256 startTime, uint256 endTime);
    event Claimed(address indexed user, uint256 amount);
    event VestingClaimed(address indexed user, uint256 amount);
    event VestingConfigured(
        uint256 durationMonths,
        uint256 rewardPercentage,
        uint256 startTime,
        uint256 endTime
    );
    event VestedTokensClaimed(
        address indexed user,
        uint256 amount,
        uint256 totalClaimed
    );
    event TokensDeposited(address indexed from, uint256 amount);
    event TokensWithdrawn(address indexed to, uint256 amount);
    event TokensRecovered(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    modifier notClaimed() {
        require(!claimed[msg.sender], "LCAIAirdrop: Already claimed");
        _;
    }

    constructor(address _lcaiPresale) Ownable(msg.sender) {
        require(
            _lcaiPresale != address(0),
            "LCAIAirdrop: Invalid presale address"
        );
        lcaiPresale = ILCAIPresale(_lcaiPresale);
        token = lcaiPresale.saleToken();
        require(token != address(0), "LCAIAirdrop: Invalid token address");
    }

    function openVesting(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _durationMonths,
        uint256 _rewardPercentage
    ) external onlyOwner {
        require(!vestingEnabled, "LCAIAirdrop: Vesting already configured");
        require(_durationMonths > 0, "LCAIAirdrop: Invalid vesting duration");
        require(
            _rewardPercentage <= 100,
            "LCAIAirdrop: Reward percentage cannot exceed 100%"
        );
        require(
            _endTime > _startTime,
            "LCAIAirdrop: End time must be after start time"
        );

        vestingConfig = VestingConfig({
            durationMonths: _durationMonths,
            rewardPercentage: _rewardPercentage,
            startTime: _startTime,
            endTime: _endTime
        });

        vestingEnabled = true;

        emit VestingConfigured(
            _durationMonths,
            _rewardPercentage,
            _startTime,
            _endTime
        );
    }

    function openClaim(
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        require(!claimEnabled, "LCAIAirdrop: Claim already configured");
        claimConfig = ClaimConfig({startTime: _startTime, endTime: _endTime});
        claimEnabled = true;
        emit ClaimOpened(_startTime, _endTime);
    }

    function claim() external nonReentrant whenNotPaused notClaimed {
        require(claimEnabled, "LCAIAirdrop: Claim not configured");
        require(
            block.timestamp >= claimConfig.startTime,
            "LCAIAirdrop: Claim period has not started"
        );
        require(
            block.timestamp <= claimConfig.endTime,
            "LCAIAirdrop: Claim period has ended"
        );

        uint256 purchaseAmount = lcaiPresale.buyersAmount(msg.sender);
        require(purchaseAmount > 0, "LCAIAirdrop: No amount to claim");

        // Direct claim (50% immediate)
        uint256 rewardAmount = (purchaseAmount * REWARD_PERCENTAGE) / 100;

        require(
            IERC20(token).balanceOf(address(this)) >= rewardAmount,
            "LCAIAirdrop: Insufficient contract balance"
        );

        claimed[msg.sender] = true;
        claimedAmount[msg.sender] = rewardAmount;
        totalClaimedAmount += rewardAmount;

        IERC20(token).safeTransfer(msg.sender, rewardAmount);

        emit Claimed(msg.sender, rewardAmount);
    }

    function claimWithVesting() external nonReentrant whenNotPaused notClaimed {
        require(vestingEnabled, "LCAIAirdrop: Vesting not configured");
        require(
            block.timestamp >= vestingConfig.startTime,
            "LCAIAirdrop: Vesting period has not started"
        );
        require(
            block.timestamp <= vestingConfig.endTime,
            "LCAIAirdrop: Vesting period has ended"
        );

        uint256 purchaseAmount = lcaiPresale.buyersAmount(msg.sender);
        require(purchaseAmount > 0, "LCAIAirdrop: No amount to claim");

        // Calculate vesting reward
        uint256 rewardAmount = (purchaseAmount *
            vestingConfig.rewardPercentage) / 100;

        // Initialize user vesting state
        userVesting[msg.sender] = UserVesting({
            optedForVesting: true,
            totalVestingAmount: rewardAmount,
            claimedVestingAmount: 0,
            vestingStartTime: block.timestamp
        });

        claimed[msg.sender] = true;
        claimedAmount[msg.sender] = 0; // Nothing claimed yet, will claim via claimVested

        emit VestingClaimed(msg.sender, rewardAmount);
    }

    function claimVested() external nonReentrant whenNotPaused {
        UserVesting storage vesting = userVesting[msg.sender];
        require(
            vesting.optedForVesting,
            "LCAIAirdrop: User did not opt for vesting"
        );

        uint256 vestedAmount = getVestedAmount(msg.sender);
        require(vestedAmount > 0, "LCAIAirdrop: No vested amount available");

        require(
            IERC20(token).balanceOf(address(this)) >= vestedAmount,
            "LCAIAirdrop: Insufficient contract balance"
        );

        vesting.claimedVestingAmount += vestedAmount;
        claimedAmount[msg.sender] += vestedAmount;
        totalClaimedAmount += vestedAmount;

        IERC20(token).safeTransfer(msg.sender, vestedAmount);

        emit VestedTokensClaimed(
            msg.sender,
            vestedAmount,
            vesting.claimedVestingAmount
        );
    }

    /// @notice Calculates vested tokens using CLIFF-BASED MONTHLY unlocks with immediate first month
    /// @dev First month unlocks immediately, then tokens unlock at the end of each 30-day period
    /// @dev Example: 12-month vesting unlocks 8.33% immediately, then 8.33% every 30 days
    /// @param user The address to check
    /// @return The amount of tokens available to claim
    function getVestedAmount(address user) public view returns (uint256) {
        UserVesting memory vesting = userVesting[user];

        if (!vesting.optedForVesting) return 0;

        VestingConfig memory config = vestingConfig;

        uint256 elapsedTime = block.timestamp - vesting.vestingStartTime;

        // Calculate number of complete months passed (cliff-based monthly vesting)
        // Each month unlocks after SECONDS_PER_MONTH has passed
        uint256 completedMonths = elapsedTime / SECONDS_PER_MONTH;

        // Add 1 for the immediate first month reward
        uint256 totalMonthsUnlocked = completedMonths + 1;

        // Cap at total duration
        if (totalMonthsUnlocked > config.durationMonths) {
            totalMonthsUnlocked = config.durationMonths;
        }

        // Calculate vested amount based on total unlocked months
        // Each month releases an equal portion of the total
        uint256 totalVested = (vesting.totalVestingAmount *
            totalMonthsUnlocked) / config.durationMonths;

        return totalVested - vesting.claimedVestingAmount;
    }

    function getVestingInfo(
        address user
    )
        external
        view
        returns (
            bool optedForVesting,
            uint256 totalVestingAmount,
            uint256 claimedVestingAmount,
            uint256 availableAmount,
            uint256 vestingStartTime,
            uint256 vestingEndTime
        )
    {
        UserVesting memory vesting = userVesting[user];
        optedForVesting = vesting.optedForVesting;
        totalVestingAmount = vesting.totalVestingAmount;
        claimedVestingAmount = vesting.claimedVestingAmount;
        availableAmount = getVestedAmount(user);
        vestingStartTime = vesting.vestingStartTime;
        vestingEndTime = vesting.optedForVesting
            ? vesting.vestingStartTime +
                (vestingConfig.durationMonths * SECONDS_PER_MONTH)
            : 0;
    }

    function getClaimableAmount(address user) external view returns (uint256) {
        if (claimed[user]) {
            return 0;
        }
        uint256 purchaseAmount = lcaiPresale.buyersAmount(user);
        return (purchaseAmount * REWARD_PERCENTAGE) / 100;
    }

    function getVestingAmount(address user) external view returns (uint256) {
        if (claimed[user]) {
            return 0;
        }
        if (!vestingEnabled) {
            return 0;
        }
        uint256 purchaseAmount = lcaiPresale.buyersAmount(user);
        return (purchaseAmount * vestingConfig.rewardPercentage) / 100;
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

    function emergencyTokenRecovery(
        address _token,
        uint256 _amount
    ) external onlyOwner {
        require(_token != token, "LCAIAirdrop: Cannot recover airdrop token");
        IERC20(_token).safeTransfer(msg.sender, _amount);
        emit TokensRecovered(msg.sender, _token, _amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
