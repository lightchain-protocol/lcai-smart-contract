// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LCAIValidatorRegistry
 * @dev Manages the set of active validators for the PoI consensus.
 */
contract LCAIValidatorRegistry {
    struct Validator {
        address validatorAddress;
        bytes publicKey; // BLS public key
        uint256 stake; // Staked amount
        bool isActive; // Active status
        uint256 performanceScore;
        uint256 slashCount;
        uint256 lastHeartbeat;
        uint256 joinedAt;
    }

    mapping(address => Validator) public validators;
    address[] public validatorList;

    // Events
    event ValidatorRegistered(
        address indexed validator,
        bytes publicKey,
        uint256 stake
    );
    event ValidatorActivated(address indexed validator);
    event ValidatorDeactivated(address indexed validator);
    event StakeUpdated(address indexed validator, uint256 newStake);

    // Access control would normally be here (e.g., onlyOwner), but keeping simple for this task

    /**
     * @dev Registers a new validator.
     * @param publicKey The BLS public key of the validator.
     */
    function registerValidator(bytes calldata publicKey) external payable {
        require(
            validators[msg.sender].validatorAddress == address(0),
            "Validator already registered"
        );
        require(msg.value > 0, "Stake required"); // Minimal check, real logic would check min stake

        Validator memory newValidator = Validator({
            validatorAddress: msg.sender,
            publicKey: publicKey,
            stake: msg.value,
            isActive: true, // Auto-activate for simplicity in this version
            performanceScore: 100,
            slashCount: 0,
            lastHeartbeat: block.timestamp,
            joinedAt: block.timestamp
        });

        validators[msg.sender] = newValidator;
        validatorList.push(msg.sender);

        emit ValidatorRegistered(msg.sender, publicKey, msg.value);
        emit ValidatorActivated(msg.sender);
    }

    /**
     * @dev Activates a validator.
     * @param validator The address of the validator to activate.
     */
    function activateValidator(address validator) external {
        // In a real system, this might be restricted
        require(
            validators[validator].validatorAddress != address(0),
            "Validator not found"
        );
        validators[validator].isActive = true;
        emit ValidatorActivated(validator);
    }

    /**
     * @dev Deactivates a validator.
     * @param validator The address of the validator to deactivate.
     */
    function deactivateValidator(address validator) external {
        // In a real system, this might be restricted
        require(
            validators[validator].validatorAddress != address(0),
            "Validator not found"
        );
        validators[validator].isActive = false;
        emit ValidatorDeactivated(validator);
    }

    /**
     * @dev Updates the stake of a validator.
     * @param validator The address of the validator.
     * @param newStake The new stake amount.
     */
    function updateStake(address validator, uint256 newStake) external {
        // In a real system, this might be restricted or handle transfers
        require(
            validators[validator].validatorAddress != address(0),
            "Validator not found"
        );
        validators[validator].stake = newStake;
        emit StakeUpdated(validator, newStake);
    }

    /**
     * @dev Returns validator details.
     * @param validator The address of the validator.
     */
    function getValidator(
        address validator
    ) external view returns (Validator memory) {
        return validators[validator];
    }

    /**
     * @dev Returns the list of all active validators.
     * Warning: This can be gas expensive if the list is huge, but fine for < 1000 validators or off-chain calls.
     */
    function getActiveValidators() external view returns (address[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < validatorList.length; i++) {
            if (validators[validatorList[i]].isActive) {
                activeCount++;
            }
        }

        address[] memory activeValidators = new address[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < validatorList.length; i++) {
            if (validators[validatorList[i]].isActive) {
                activeValidators[index] = validatorList[i];
                index++;
            }
        }
        return activeValidators;
    }

    /**
     * @dev Returns the total number of validators.
     */
    function getValidatorCount() external view returns (uint256) {
        return validatorList.length;
    }
}
