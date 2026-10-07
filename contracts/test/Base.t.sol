// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Deploy} from "../script/Deploy.s.sol";
import {AssertDAO} from "../src/AssertDAO.sol";
import {IAssertDAO} from "../src/IAssertDAO.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Shared fixture: a DAO deployed through the production deployment script, with a head, three members
/// and helpers to move a round through its lifecycle.
abstract contract BaseTest is Test {
    uint64 internal constant LEAD = 1 days;
    uint64 internal constant DURATION = 14 days;

    AssertDAO internal dao;
    address internal implementation;

    address internal head = makeAddr("head");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        IAssertDAO.Member[] memory founders = new IAssertDAO.Member[](3);
        founders[0] = IAssertDAO.Member({account: alice, handle: "alice"});
        founders[1] = IAssertDAO.Member({account: bob, handle: "bob"});
        founders[2] = IAssertDAO.Member({account: carol, handle: "carol"});

        address proxy;
        (proxy, implementation) = new Deploy().deploy(head, founders);
        dao = AssertDAO(proxy);
    }

    /// @dev A pending round: voting opens in `LEAD` and lasts `DURATION`.
    function _createRound() internal returns (uint256 roundId) {
        uint64 start = uint64(block.timestamp) + LEAD;
        vm.prank(head);
        roundId = dao.createRound("2026 H2", start, start + DURATION);
    }

    /// @dev A pending round with `count` proposals on its ballot.
    function _createRound(uint256 count) internal returns (uint256 roundId) {
        roundId = _createRound();
        for (uint256 i = 0; i < count; ++i) {
            vm.prank(head);
            dao.propose(roundId, string.concat("Proposal ", vm.toString(i)), "Body");
        }
    }

    /// @dev An active round with `count` proposals on its ballot.
    function _openRound(uint256 count) internal returns (uint256 roundId) {
        roundId = _createRound(count);
        vm.warp(dao.getRound(roundId).start);
    }

    function _close(uint256 roundId) internal {
        vm.warp(dao.getRound(roundId).end);
    }

    function _vote(address voter, uint256 roundId, uint8[] memory votes) internal {
        vm.prank(voter);
        dao.vote(roundId, votes);
    }

    function _ballot(uint8 a, uint8 b, uint8 c) internal pure returns (uint8[] memory votes) {
        votes = new uint8[](3);
        votes[0] = a;
        votes[1] = b;
        votes[2] = c;
    }

    /// @dev forge-std compares `uint256[]` but not `uint8[]`.
    function assertEq(uint8[] memory actual, uint8[] memory expected) internal pure {
        assertEq(abi.encode(actual), abi.encode(expected));
    }

    function _cost(uint8[] memory votes) internal pure returns (uint256 cost) {
        for (uint256 i = 0; i < votes.length; ++i) {
            cost += uint256(votes[i]) * votes[i];
        }
    }
}
