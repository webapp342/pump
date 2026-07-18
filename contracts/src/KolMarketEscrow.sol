// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Holds ETH for sponsored KOL callout requests until release or refund.
contract KolMarketEscrow is Ownable, ReentrancyGuard {
    error ZeroAddress();
    error ZeroAmount();
    error AlreadyLocked();
    error UnknownRequest();
    error NotSponsor();
    error AlreadySettled();

    event KolEscrowLocked(
        bytes32 indexed requestId,
        address indexed sponsor,
        address indexed kol,
        uint256 amount
    );
    event KolEscrowReleased(bytes32 indexed requestId, address indexed kol, uint256 amount);
    event KolEscrowRefunded(bytes32 indexed requestId, address indexed sponsor, uint256 amount);

    struct Escrow {
        address sponsor;
        address kol;
        uint256 amount;
        bool released;
        bool refunded;
    }

    mapping(bytes32 => Escrow) public escrows;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function lock(bytes32 requestId, address kol) external payable nonReentrant {
        if (kol == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        Escrow storage e = escrows[requestId];
        if (e.amount != 0) revert AlreadyLocked();

        escrows[requestId] = Escrow({
            sponsor: msg.sender,
            kol: kol,
            amount: msg.value,
            released: false,
            refunded: false
        });

        emit KolEscrowLocked(requestId, msg.sender, kol, msg.value);
    }

    /// @dev Callable by owner (relayer) after KOL accepts off-chain.
    function release(bytes32 requestId) external onlyOwner nonReentrant {
        Escrow storage e = escrows[requestId];
        if (e.amount == 0) revert UnknownRequest();
        if (e.released || e.refunded) revert AlreadySettled();

        e.released = true;
        _sendNative(payable(e.kol), e.amount);
        emit KolEscrowReleased(requestId, e.kol, e.amount);
    }

    function refund(bytes32 requestId) external nonReentrant {
        Escrow storage e = escrows[requestId];
        if (e.amount == 0) revert UnknownRequest();
        if (e.released || e.refunded) revert AlreadySettled();
        if (msg.sender != e.sponsor && msg.sender != owner()) revert NotSponsor();

        e.refunded = true;
        _sendNative(payable(e.sponsor), e.amount);
        emit KolEscrowRefunded(requestId, e.sponsor, e.amount);
    }

    function _sendNative(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
    }
}
