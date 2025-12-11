// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MultiSender is Ownable {
    using SafeERC20 for IERC20;

    uint256 public arrayLimit;

    event Multisended(uint256 total, address tokenAddress);
    event ArrayLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event TokensWithdrawn(address token, address to, uint256 amount);
    event EthWithdrawn(address to, uint256 amount);

    error TransferFailed(address recipient, uint256 amount);
    error ZeroAddress();
    error InsufficientEthSent(uint256 required, uint256 sent);
    error ExcessEthSent(uint256 required, uint256 sent);

    modifier checkArrayLimit(uint256 _arrayLength) {
        require(_arrayLength <= arrayLimit, "You passed the array limit");
        _;
    }

    modifier checkArrayLength(uint256 _a1Length, uint256 _a2Length) {
        require(_a1Length == _a2Length, "Array length must match");
        _;
    }

    constructor(uint256 _arrayLimit) Ownable(msg.sender) {
        arrayLimit = _arrayLimit;
    }

    function setArrayLimit(uint256 _newLimit) external onlyOwner {
        uint256 oldLimit = arrayLimit;
        arrayLimit = _newLimit;
        emit ArrayLimitUpdated(oldLimit, _newLimit);
    }

    function multisendToken(
        address _tokenAddress,
        address[] memory _contributors,
        uint256[] memory _balances
    )
        external
        payable
        checkArrayLimit(_contributors.length)
        checkArrayLength(_contributors.length, _balances.length)
    {
        if (_tokenAddress == address(0)) {
            _multisendEther(_contributors, _balances);
        } else {
            uint256 total = 0;
            uint256 length = _contributors.length;

            for (uint256 i; i < length; ) {
                address recipient = _contributors[i];
                if (recipient == address(0)) revert ZeroAddress();

                IERC20(_tokenAddress).safeTransferFrom(
                    msg.sender,
                    recipient,
                    _balances[i]
                );

                unchecked {
                    total += _balances[i];
                    ++i;
                }
            }

            emit Multisended(total, _tokenAddress);
        }
    }

    function _multisendEther(
        address[] memory _contributors,
        uint256[] memory _balances
    ) private {
        // Calculate required total
        uint256 requiredTotal = 0;
        uint256 length = _contributors.length;

        for (uint256 i; i < length; ) {
            unchecked {
                requiredTotal += _balances[i];
                ++i;
            }
        }

        // Validate exact ETH amount sent
        if (msg.value < requiredTotal) {
            revert InsufficientEthSent(requiredTotal, msg.value);
        }
        if (msg.value > requiredTotal) {
            revert ExcessEthSent(requiredTotal, msg.value);
        }

        // Send ETH to recipients
        for (uint256 i; i < length; ) {
            address recipient = _contributors[i];
            if (recipient == address(0)) revert ZeroAddress();

            (bool success, ) = payable(recipient).call{value: _balances[i]}("");
            if (!success) {
                revert TransferFailed(recipient, _balances[i]);
            }

            unchecked {
                ++i;
            }
        }

        emit Multisended(requiredTotal, address(0));
    }

    function withdraw(address token, uint256 amt) public onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amt);
        emit TokensWithdrawn(token, msg.sender, amt);
    }

    function withdrawAll(address token) external onlyOwner {
        uint256 amt = IERC20(token).balanceOf(address(this));
        withdraw(token, amt);
    }

    function withdrawETH(uint256 amt) public onlyOwner {
        (bool success, ) = payable(msg.sender).call{value: amt}("");
        if (!success) {
            revert TransferFailed(msg.sender, amt);
        }
        emit EthWithdrawn(msg.sender, amt);
    }

    function withdrawAllETH() external onlyOwner {
        withdrawETH(address(this).balance);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
