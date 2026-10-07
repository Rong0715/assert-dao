// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAssertDAO} from "../src/IAssertDAO.sol";
import {BaseTest} from "./Base.t.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract AssertDAOFuzzTest is BaseTest {
    uint256 internal constant PROPOSALS = 5;

    /// @dev Spends the budget greedily, so that every generated ballot is affordable.
    function _affordable(uint8[PROPOSALS] memory raw) internal view returns (uint8[] memory votes) {
        votes = new uint8[](PROPOSALS);
        uint256 remaining = dao.CREDITS();
        for (uint256 i = 0; i < PROPOSALS; ++i) {
            votes[i] = uint8(bound(raw[i], 0, Math.sqrt(remaining)));
            remaining -= uint256(votes[i]) * votes[i];
        }
    }

    function testFuzz_Vote_AcceptsABallotIfAndOnlyIfItFitsTheBudget(uint8[PROPOSALS] memory raw) public {
        uint256 roundId = _openRound(PROPOSALS);
        uint8[] memory votes = new uint8[](PROPOSALS);
        for (uint256 i = 0; i < PROPOSALS; ++i) {
            // Up to 12 votes per proposal: single entries and whole ballots land on both sides of the limit.
            votes[i] = uint8(bound(raw[i], 0, 12));
        }
        uint256 cost = _cost(votes);

        if (cost > dao.CREDITS()) {
            vm.expectRevert(abi.encodeWithSelector(IAssertDAO.CreditsExceeded.selector, cost, dao.CREDITS()));
            _vote(alice, roundId, votes);
            assertEq(dao.getRound(roundId).voterCount, 0);
        } else {
            _vote(alice, roundId, votes);
            assertEq(dao.ballotOf(roundId, alice), votes);
        }
    }

    function testFuzz_Vote_TallyCountsOnlyTheLatestBallotOfEachMember(
        uint8[PROPOSALS] memory first,
        uint8[PROPOSALS] memory other,
        uint8[PROPOSALS] memory second
    ) public {
        uint256 roundId = _openRound(PROPOSALS);
        uint8[] memory replaced = _affordable(first);
        uint8[] memory bobs = _affordable(other);
        uint8[] memory alices = _affordable(second);

        _vote(alice, roundId, replaced);
        _vote(bob, roundId, bobs);
        _vote(alice, roundId, alices);

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        for (uint256 i = 0; i < PROPOSALS; ++i) {
            assertEq(proposals[i].votes, uint256(bobs[i]) + alices[i]);
        }
        assertEq(dao.getRound(roundId).voterCount, 2);
    }

    function testFuzz_Vote_RejectsBallotsOfTheWrongLength(uint8 length) public {
        uint256 roundId = _openRound(PROPOSALS);
        vm.assume(length != PROPOSALS);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.BallotLengthMismatch.selector, PROPOSALS, length));
        _vote(alice, roundId, new uint8[](length));
    }

    function testFuzz_Vote_OnlyMembers(address caller) public {
        uint256 roundId = _openRound(PROPOSALS);
        vm.assume(!dao.isMember(caller));

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NotMember.selector, caller));
        _vote(caller, roundId, new uint8[](PROPOSALS));
    }

    function testFuzz_CreateRound_AcceptsOnlyFutureNonEmptyWindows(uint64 start, uint64 end) public {
        bool valid = start > block.timestamp && end > start;

        if (!valid) vm.expectRevert(abi.encodeWithSelector(IAssertDAO.InvalidWindow.selector, start, end));
        vm.prank(head);
        dao.createRound("Round", start, end);

        assertEq(dao.roundCount(), valid ? 1 : 0);
    }

    function testFuzz_RoundState_DependsOnlyOnTheClock(uint64 lead, uint64 duration, uint64 at) public {
        uint64 start = uint64(block.timestamp + bound(lead, 1, 365 days));
        uint64 end = uint64(start + bound(duration, 1, 365 days));
        vm.prank(head);
        uint256 roundId = dao.createRound("Round", start, end);

        vm.warp(bound(at, block.timestamp, end + 365 days));

        IAssertDAO.RoundState expected = block.timestamp < start
            ? IAssertDAO.RoundState.Pending
            : block.timestamp < end ? IAssertDAO.RoundState.Active : IAssertDAO.RoundState.Closed;
        assertEq(uint8(dao.roundState(roundId)), uint8(expected));
    }

    function testFuzz_AddMember_AcceptsHandlesOfOneToThirtyTwoBytes(address account, string calldata handle) public {
        vm.assume(account != address(0) && !dao.isMember(account));
        uint256 length = bytes(handle).length;
        bool valid = length > 0 && length <= dao.MAX_HANDLE_LENGTH();

        if (!valid) vm.expectRevert(IAssertDAO.InvalidHandle.selector);
        vm.prank(head);
        dao.addMember(account, handle);

        assertEq(dao.isMember(account), valid);
        if (valid) assertEq(dao.handleOf(account), handle);
    }

    function testFuzz_Administration_OnlyHead(address caller) public {
        vm.assume(caller != head);
        uint256 roundId = _createRound();
        uint64 start = uint64(block.timestamp) + LEAD;
        bytes memory unauthorized =
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, caller);

        vm.startPrank(caller);
        vm.expectRevert(unauthorized);
        dao.addMember(stranger, "stranger");
        vm.expectRevert(unauthorized);
        dao.removeMember(alice);
        vm.expectRevert(unauthorized);
        dao.createRound("Round", start, start + DURATION);
        vm.expectRevert(unauthorized);
        dao.cancelRound(roundId);
        vm.expectRevert(unauthorized);
        dao.propose(roundId, "Title", "Body");
        vm.expectRevert(unauthorized);
        dao.transferOwnership(caller);
        vm.expectRevert(unauthorized);
        dao.upgradeToAndCall(implementation, "");
        vm.stopPrank();
    }
}
