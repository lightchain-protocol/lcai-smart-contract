// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AIVMTicketManager
 * @notice Lightweight ticket manager that issues short-lived access tickets for validators/trainers.
 *         Designed to align with LC-206/LC-207 week-5 roadmap requirements while keeping logic simple.
 */
contract AIVMTicketManager is Ownable, ReentrancyGuard {
    struct Ticket {
        address issuedTo;
        string variantId;
        uint256 expiresAt;
        bool revoked;
    }

    mapping(bytes32 => Ticket) private tickets;

    event TicketIssued(
        bytes32 indexed ticketId,
        address indexed wallet,
        string variantId,
        uint256 expiresAt
    );
    event TicketRevoked(bytes32 indexed ticketId);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Issue a new ticket for a wallet/variant pair.
     * @param wallet Wallet receiving the ticket
     * @param variantId Variant for which access is being granted
     * @param ttl Ticket validity in seconds (0 => no expiry hint)
     */
    function issueTicket(
        address wallet,
        string calldata variantId,
        uint256 ttl
    ) external onlyOwner returns (bytes32) {
        require(wallet != address(0), "Invalid wallet");
        require(bytes(variantId).length > 0, "Variant required");

        bytes32 ticketId = keccak256(
            abi.encode(wallet, variantId, block.timestamp, block.number)
        );
        uint256 expiresAt = ttl == 0 ? 0 : block.timestamp + ttl;

        tickets[ticketId] = Ticket({
            issuedTo: wallet,
            variantId: variantId,
            expiresAt: expiresAt,
            revoked: false
        });

        emit TicketIssued(ticketId, wallet, variantId, expiresAt);
        return ticketId;
    }

    /**
     * @notice Validate a ticket for a specific wallet and variant.
     */
    function validateTicket(
        bytes32 ticketId,
        address wallet,
        string calldata variantId
    ) external view returns (bool) {
        Ticket memory ticket = tickets[ticketId];
        if (ticket.revoked) {
            return false;
        }
        if (ticket.issuedTo != wallet) {
            return false;
        }
        if (keccak256(bytes(ticket.variantId)) != keccak256(bytes(variantId))) {
            return false;
        }
        if (ticket.expiresAt != 0 && block.timestamp > ticket.expiresAt) {
            return false;
        }
        return true;
    }

    /**
     * @notice Revoke an active ticket.
     */
    function revokeTicket(bytes32 ticketId) external onlyOwner {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.issuedTo != address(0), "Ticket not found");
        require(!ticket.revoked, "Already revoked");
        ticket.revoked = true;
        emit TicketRevoked(ticketId);
    }

    /**
     * @notice Get ticket details (for off-chain auditing).
     */
    function getTicket(bytes32 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }
}
