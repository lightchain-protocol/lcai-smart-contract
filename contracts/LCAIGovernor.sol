// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {
    GovernorCountingSimple
} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {
    GovernorVotes
} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {
    GovernorVotesQuorumFraction
} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {
    GovernorSettings
} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {
    GovernorTimelockControl
} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {
    TimelockController
} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract LCAIGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorSettings,
    GovernorTimelockControl,
    Pausable
{
    // Admin address (multisig wallet for emergency actions)
    address public admin;
    uint256 public constant MIN_QUORUM_NUMERATOR = 3;
    uint256 public constant MAX_QUORUM_NUMERATOR = 15;

    // Events
    event AdminUpdated(address indexed previousAdmin, address indexed newAdmin);
    event EmergencyCancellation(
        uint256 indexed proposalId,
        address indexed admin
    );

    // Custom errors
    error UnauthorizedAdmin(address caller);
    error InvalidAdminAddress(address provided);
    error AdminMustBeContract(address provided);
    error InvalidQuorumFraction(uint256 provided, uint256 min, uint256 max);
    error InvalidValueSum(uint256 provided, uint256 expected);

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert UnauthorizedAdmin(msg.sender);
        }
        _;
    }

    constructor(
        IVotes _token,
        TimelockController _timelock,
        address _admin
    )
        Governor("LCAIGovernor")
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(3)
        GovernorSettings(7200, 100800, 140000 * 10 ** 18)
        GovernorTimelockControl(_timelock)
    {
        if (_admin == address(0)) {
            revert InvalidAdminAddress(_admin);
        }
        // Check that admin is a contract (for Gnosis Safe multisig)
        if (_admin.code.length == 0) {
            revert AdminMustBeContract(_admin);
        }
        admin = _admin;
        emit AdminUpdated(address(0), _admin);
    }

    /**
     * @dev Override proposalThreshold to resolve inheritance conflict
     */
    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    // ==================== Circuit Breaker Overrides ====================

    /**
     * @dev Updates the quorum numerator
     * @notice Can only be called by the governance contract
     * @param newQuorumNumerator The new quorum numerator (must be between MIN_QUORUM_NUMERATOR and MAX_QUORUM_NUMERATOR)
     */
    function updateQuorumNumerator(
        uint256 newQuorumNumerator
    ) external override onlyGovernance {
        if (
            newQuorumNumerator < MIN_QUORUM_NUMERATOR ||
            newQuorumNumerator > MAX_QUORUM_NUMERATOR
        ) {
            revert InvalidQuorumFraction(
                newQuorumNumerator,
                MIN_QUORUM_NUMERATOR,
                MAX_QUORUM_NUMERATOR
            );
        }
        _updateQuorumNumerator(newQuorumNumerator);
    }

    /**
     * @dev Override propose to add whenNotPaused check
     */
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override whenNotPaused returns (uint256) {
        return super.propose(targets, values, calldatas, description);
    }

    /**
     * @dev Override queue to add whenNotPaused check
     */
    function queue(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public override whenNotPaused returns (uint256) {
        return super.queue(targets, values, calldatas, descriptionHash);
    }

    /**
     * @dev Override execute to add whenNotPaused check and validate msg.value
     * @notice Prevents accidental overpayment by ensuring msg.value matches sum of values array
     */
    function execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable override whenNotPaused returns (uint256) {
        // Calculate expected total value
        uint256 expectedValue = 0;
        for (uint256 i = 0; i < values.length; i++) {
            expectedValue += values[i];
        }

        // Ensure msg.value matches expected value to prevent accidental overpayment
        if (msg.value != expectedValue) {
            revert InvalidValueSum(msg.value, expectedValue);
        }

        return super.execute(targets, values, calldatas, descriptionHash);
    }

    function state(
        uint256 proposalId
    )
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(
        uint256 proposalId
    )
        public
        view
        virtual
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return
            super._queueOperations(
                proposalId,
                targets,
                values,
                calldatas,
                descriptionHash
            );
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(
            proposalId,
            targets,
            values,
            calldatas,
            descriptionHash
        );
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    // ==================== Admin Functions ====================

    /**
     * @dev Updates the admin address
     * @notice Can only be called by the current admin (intended to be Gnosis Safe multisig)
     * @param newAdmin The new admin address (must be a contract)
     */
    function updateAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) {
            revert InvalidAdminAddress(newAdmin);
        }
        if (newAdmin == admin) return;
        // Check that new admin is a contract (for Gnosis Safe multisig)
        if (newAdmin.code.length == 0) {
            revert AdminMustBeContract(newAdmin);
        }
        address previousAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(previousAdmin, newAdmin);
    }

    /**
     * @dev Pauses the governor, preventing propose, queue, and execute
     * @notice Can only be called by the admin
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @dev Unpauses the governor, restoring propose, queue, and execute
     * @notice Can only be called by the admin
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @dev Emergency cancel function that can cancel proposals in any state
     * @notice Can only be called by the admin
     * @param targets Array of target addresses
     * @param values Array of values to send
     * @param calldatas Array of calldata
     * @param descriptionHash Hash of the proposal description
     * @return proposalId The ID of the cancelled proposal
     */
    function emergencyCancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) external onlyAdmin returns (uint256) {
        uint256 proposalId = hashProposal(
            targets,
            values,
            calldatas,
            descriptionHash
        );
        ProposalState currentState = state(proposalId);

        // Emergency cancel can cancel proposals in any state except Executed or Canceled
        if (
            currentState == ProposalState.Executed ||
            currentState == ProposalState.Canceled
        ) {
            revert GovernorUnexpectedProposalState(
                proposalId,
                currentState,
                bytes32(
                    (1 << uint8(ProposalState.Pending)) |
                        (1 << uint8(ProposalState.Active)) |
                        (1 << uint8(ProposalState.Succeeded)) |
                        (1 << uint8(ProposalState.Queued))
                )
            );
        }

        // Cancel in governor (GovernorTimelockControl._cancel handles timelock cancellation)
        uint256 cancelledProposalId = _cancel(
            targets,
            values,
            calldatas,
            descriptionHash
        );

        emit EmergencyCancellation(cancelledProposalId, msg.sender);

        return cancelledProposalId;
    }
}
