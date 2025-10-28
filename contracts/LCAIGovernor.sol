// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract LCAIGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    // Admin address (multisig wallet for emergency actions)
    address public admin;

    // Events
    event AdminUpdated(address indexed previousAdmin, address indexed newAdmin);
    event EmergencyCancellation(
        uint256 indexed proposalId,
        address indexed admin
    );

    // Custom errors
    error UnauthorizedAdmin(address caller);

    constructor(
        IVotes _token,
        TimelockController _timelock,
        address _admin
    )
        Governor("LCAIGovernor")
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)
        GovernorTimelockControl(_timelock)
    {
        admin = _admin;
        emit AdminUpdated(address(0), _admin);
    }

    function votingDelay() public pure override returns (uint256) {
        return 300; // 1 hour // 7200; // 1 day
    }

    function votingPeriod() public pure override returns (uint256) {
        return 14400; // 2 days // 50400; // 1 week
    }

    function proposalThreshold() public pure override returns (uint256) {
        return 0; // 0 tokens required to propose
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
     * @notice Can only be called by the admin
     * @param newAdmin The new admin address
     */
    function updateAdmin(address newAdmin) external {
        if (msg.sender != admin) {
            revert UnauthorizedAdmin(msg.sender);
        }
        address previousAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(previousAdmin, newAdmin);
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
    ) external returns (uint256) {
        if (msg.sender != admin) {
            revert UnauthorizedAdmin(msg.sender);
        }

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
