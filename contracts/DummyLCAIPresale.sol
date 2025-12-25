// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title DummyLCAIPresale
 * @notice Mock presale contract for testing LCAIAirdrop functionality
 * @dev Implements ILCAIPresale interface with manual setter for buyer amounts
 */
contract DummyLCAIPresale is Ownable {
    address public saleToken;
    uint8 public saleTokenDec;

    mapping(address => uint256) private _buyersAmount;

    event BuyerAmountSet(address indexed buyer, uint256 amount);
    event BuyerAmountsBatchSet(address[] buyers, uint256[] amounts);

    constructor(address _saleToken) Ownable(msg.sender) {
        require(
            _saleToken != address(0),
            "DummyLCAIPresale: Invalid token address"
        );
        saleToken = _saleToken;
        saleTokenDec = IERC20Metadata(_saleToken).decimals();
    }

    /**
     * @notice Set buyer amount for a single address
     * @param buyer Address of the buyer
     * @param amount Amount purchased by the buyer
     */
    function setBuyerAmount(address buyer, uint256 amount) external onlyOwner {
        require(buyer != address(0), "DummyLCAIPresale: Invalid buyer address");
        _buyersAmount[buyer] = amount;
        emit BuyerAmountSet(buyer, amount);
    }

    /**
     * @notice Set buyer amounts for multiple addresses in batch
     * @param buyers Array of buyer addresses
     * @param amounts Array of amounts corresponding to each buyer
     */
    function setBuyerAmountsBatch(
        address[] calldata buyers,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            buyers.length == amounts.length,
            "DummyLCAIPresale: Arrays length mismatch"
        );
        require(buyers.length > 0, "DummyLCAIPresale: Empty arrays");

        for (uint256 i = 0; i < buyers.length; i++) {
            require(
                buyers[i] != address(0),
                "DummyLCAIPresale: Invalid buyer address"
            );
            _buyersAmount[buyers[i]] = amounts[i];
        }

        emit BuyerAmountsBatchSet(buyers, amounts);
    }

    /**
     * @notice Get the amount purchased by a buyer
     * @param buyer Address of the buyer
     * @return Amount purchased by the buyer
     */
    function buyersAmount(address buyer) external view returns (uint256) {
        return _buyersAmount[buyer];
    }
}
