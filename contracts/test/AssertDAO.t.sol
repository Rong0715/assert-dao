// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../src/AssertDAO.sol";
import {IAssertDAO} from "../src/IAssertDAO.sol";
import {BaseTest} from "./Base.t.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract InitializeTest is BaseTest {
    function test_Initialize_SetsHeadAndFounders() public view {
        assertEq(dao.owner(), head);
        assertEq(dao.memberCount(), 3);
        assertTrue(dao.isMember(alice));
        assertTrue(dao.isMember(bob));
        assertTrue(dao.isMember(carol));
        assertEq(dao.handleOf(alice), "alice");
        assertEq(dao.roundCount(), 0);
    }

    function test_Initialize_HeadIsNotAMemberUnlessListed() public view {
        assertFalse(dao.isMember(head));
    }

    function test_Initialize_EmitsMemberAdded() public {
        IAssertDAO.Member[] memory founders = new IAssertDAO.Member[](1);
        founders[0] = IAssertDAO.Member({account: alice, handle: "alice"});
        address logic = address(new AssertDAO());

        vm.expectEmit();
        emit IAssertDAO.MemberAdded(alice, "alice");
        new ERC1967Proxy(logic, abi.encodeCall(AssertDAO.initialize, (head, founders)));
    }

    function test_Constants() public view {
        assertEq(dao.version(), "1.0.0");
        assertEq(dao.CREDITS(), 100);
        assertEq(dao.MAX_PROPOSALS(), 32);
        assertEq(dao.MAX_HANDLE_LENGTH(), 32);
        assertEq(dao.MAX_TITLE_LENGTH(), 120);
        assertEq(dao.MAX_BODY_LENGTH(), 8192);
    }

    function test_RevertWhen_InitializedTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        dao.initialize(stranger, new IAssertDAO.Member[](0));
    }

    function test_RevertWhen_ImplementationInitialized() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        AssertDAO(implementation).initialize(stranger, new IAssertDAO.Member[](0));
    }

    function test_RevertWhen_HeadIsZero() public {
        address logic = address(new AssertDAO());
        bytes memory init = abi.encodeCall(AssertDAO.initialize, (address(0), new IAssertDAO.Member[](0)));

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableInvalidOwner.selector, address(0)));
        new ERC1967Proxy(logic, init);
    }

    function test_RevertWhen_FounderListedTwice() public {
        IAssertDAO.Member[] memory founders = new IAssertDAO.Member[](2);
        founders[0] = IAssertDAO.Member({account: alice, handle: "alice"});
        founders[1] = IAssertDAO.Member({account: alice, handle: "alice again"});
        address logic = address(new AssertDAO());
        bytes memory init = abi.encodeCall(AssertDAO.initialize, (head, founders));

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.AlreadyMember.selector, alice));
        new ERC1967Proxy(logic, init);
    }
}

contract MembersTest is BaseTest {
    address internal dave = makeAddr("dave");

    function test_AddMember() public {
        vm.expectEmit(address(dao));
        emit IAssertDAO.MemberAdded(dave, "dave");
        vm.prank(head);
        dao.addMember(dave, "dave");

        assertTrue(dao.isMember(dave));
        assertEq(dao.handleOf(dave), "dave");
        assertEq(dao.memberCount(), 4);
    }

    function test_AddMember_AcceptsLongestHandle() public {
        string memory handle = "12345678901234567890123456789012";
        assertEq(bytes(handle).length, dao.MAX_HANDLE_LENGTH());

        vm.prank(head);
        dao.addMember(dave, handle);
        assertEq(dao.handleOf(dave), handle);
    }

    function test_RevertWhen_AddMember_NotHead() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.addMember(dave, "dave");
    }

    function test_RevertWhen_AddMember_ZeroAddress() public {
        vm.expectRevert(IAssertDAO.ZeroAddress.selector);
        vm.prank(head);
        dao.addMember(address(0), "nobody");
    }

    function test_RevertWhen_AddMember_EmptyHandle() public {
        vm.expectRevert(IAssertDAO.InvalidHandle.selector);
        vm.prank(head);
        dao.addMember(dave, "");
    }

    function test_RevertWhen_AddMember_HandleTooLong() public {
        vm.expectRevert(IAssertDAO.InvalidHandle.selector);
        vm.prank(head);
        dao.addMember(dave, "123456789012345678901234567890123");
    }

    function test_RevertWhen_AddMember_AlreadyMember() public {
        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.AlreadyMember.selector, alice));
        vm.prank(head);
        dao.addMember(alice, "alice");
    }

    function test_RemoveMember() public {
        vm.expectEmit(address(dao));
        emit IAssertDAO.MemberRemoved(bob);
        vm.prank(head);
        dao.removeMember(bob);

        assertFalse(dao.isMember(bob));
        assertEq(dao.handleOf(bob), "");
        assertEq(dao.memberCount(), 2);
    }

    function test_RemoveMember_CanJoinAgainUnderANewHandle() public {
        vm.startPrank(head);
        dao.removeMember(bob);
        dao.addMember(bob, "robert");
        vm.stopPrank();

        assertTrue(dao.isMember(bob));
        assertEq(dao.handleOf(bob), "robert");
    }

    function test_RevertWhen_RemoveMember_NotHead() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.removeMember(bob);
    }

    function test_RevertWhen_RemoveMember_NotMember() public {
        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NotMember.selector, stranger));
        vm.prank(head);
        dao.removeMember(stranger);
    }

    function test_GetMembers() public view {
        IAssertDAO.Member[] memory members = dao.getMembers();

        assertEq(members.length, 3);
        assertEq(members[0].account, alice);
        assertEq(members[0].handle, "alice");
        assertEq(members[1].account, bob);
        assertEq(members[2].account, carol);
        assertEq(members[2].handle, "carol");
    }
}

contract RoundsTest is BaseTest {
    function test_CreateRound() public {
        uint64 start = uint64(block.timestamp) + LEAD;
        uint64 end = start + DURATION;

        vm.expectEmit(address(dao));
        emit IAssertDAO.RoundCreated(1, "2026 H2", start, end);
        vm.prank(head);
        uint256 roundId = dao.createRound("2026 H2", start, end);

        assertEq(roundId, 1);
        assertEq(dao.roundCount(), 1);
        IAssertDAO.RoundInfo memory round = dao.getRound(roundId);
        assertEq(round.title, "2026 H2");
        assertEq(round.start, start);
        assertEq(round.end, end);
        assertEq(uint8(round.state), uint8(IAssertDAO.RoundState.Pending));
        assertEq(round.proposalCount, 0);
        assertEq(round.voterCount, 0);
    }

    function test_CreateRound_IdentifiersCountFromOne() public {
        assertEq(_createRound(), 1);
        assertEq(_createRound(), 2);
        assertEq(_createRound(), 3);
        assertEq(dao.roundCount(), 3);
    }

    function test_CreateRound_AcceptsLongestTitle() public {
        uint64 start = uint64(block.timestamp) + LEAD;
        string memory title = string(new bytes(dao.MAX_TITLE_LENGTH()));

        vm.prank(head);
        uint256 roundId = dao.createRound(title, start, start + DURATION);

        assertEq(bytes(dao.getRound(roundId).title).length, dao.MAX_TITLE_LENGTH());
    }

    function test_RoundState_FollowsTheVotingWindow() public {
        uint256 roundId = _createRound();
        IAssertDAO.RoundInfo memory round = dao.getRound(roundId);

        vm.warp(round.start - 1);
        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Pending));
        vm.warp(round.start);
        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Active));
        vm.warp(round.end - 1);
        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Active));
        vm.warp(round.end);
        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Closed));
    }

    function test_RevertWhen_CreateRound_NotHead() public {
        uint64 start = uint64(block.timestamp) + LEAD;

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.createRound("2026 H2", start, start + DURATION);
    }

    function test_RevertWhen_CreateRound_EmptyTitle() public {
        uint64 start = uint64(block.timestamp) + LEAD;

        vm.expectRevert(IAssertDAO.InvalidTitle.selector);
        vm.prank(head);
        dao.createRound("", start, start + DURATION);
    }

    function test_RevertWhen_CreateRound_TitleTooLong() public {
        uint64 start = uint64(block.timestamp) + LEAD;
        string memory title = string(new bytes(dao.MAX_TITLE_LENGTH() + 1));

        vm.expectRevert(IAssertDAO.InvalidTitle.selector);
        vm.prank(head);
        dao.createRound(title, start, start + DURATION);
    }

    function test_RevertWhen_CreateRound_StartsNow() public {
        uint64 start = uint64(block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.InvalidWindow.selector, start, start + DURATION));
        vm.prank(head);
        dao.createRound("2026 H2", start, start + DURATION);
    }

    function test_RevertWhen_CreateRound_EndsWhenItStarts() public {
        uint64 start = uint64(block.timestamp) + LEAD;

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.InvalidWindow.selector, start, start));
        vm.prank(head);
        dao.createRound("2026 H2", start, start);
    }

    function test_CancelRound_WhilePending() public {
        uint256 roundId = _createRound();

        vm.expectEmit(address(dao));
        emit IAssertDAO.RoundCancelled(roundId);
        vm.prank(head);
        dao.cancelRound(roundId);

        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Cancelled));
    }

    function test_CancelRound_WhileActive_StaysCancelledForever() public {
        uint256 roundId = _openRound(3);

        vm.prank(head);
        dao.cancelRound(roundId);
        _close(roundId);

        assertEq(uint8(dao.roundState(roundId)), uint8(IAssertDAO.RoundState.Cancelled));
    }

    function test_RevertWhen_CancelRound_NotHead() public {
        uint256 roundId = _createRound();

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.cancelRound(roundId);
    }

    function test_RevertWhen_CancelRound_Closed() public {
        uint256 roundId = _openRound(3);
        _close(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Closed)
        );
        vm.prank(head);
        dao.cancelRound(roundId);
    }

    function test_RevertWhen_CancelRound_AlreadyCancelled() public {
        uint256 roundId = _createRound();
        vm.startPrank(head);
        dao.cancelRound(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Cancelled)
        );
        dao.cancelRound(roundId);
    }

    function test_RevertWhen_RoundUnknown() public {
        _createRound();
        uint256[2] memory unknown = [uint256(0), 2];

        for (uint256 i = 0; i < unknown.length; ++i) {
            bytes memory err = abi.encodeWithSelector(IAssertDAO.UnknownRound.selector, unknown[i]);

            vm.expectRevert(err);
            dao.getRound(unknown[i]);
            vm.expectRevert(err);
            dao.roundState(unknown[i]);
            vm.expectRevert(err);
            dao.getProposals(unknown[i]);
            vm.expectRevert(err);
            dao.getBallots(unknown[i]);
            vm.expectRevert(err);
            dao.ballotOf(unknown[i], alice);
            vm.expectRevert(err);
            vm.prank(head);
            dao.cancelRound(unknown[i]);
            vm.expectRevert(err);
            vm.prank(head);
            dao.propose(unknown[i], "Title", "Body");
            vm.expectRevert(err);
            vm.prank(alice);
            dao.vote(unknown[i], new uint8[](0));
        }
    }
}

contract ProposalsTest is BaseTest {
    function test_Propose() public {
        uint256 roundId = _createRound();

        vm.expectEmit(address(dao));
        emit IAssertDAO.ProposalAdded(roundId, 0, "Program repair");
        vm.prank(head);
        uint256 first = dao.propose(roundId, "Program repair", "# Why\n\nBecause.");
        vm.prank(head);
        uint256 second = dao.propose(roundId, "Chaos engineering", "");

        assertEq(first, 0);
        assertEq(second, 1);
        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals.length, 2);
        assertEq(proposals[0].title, "Program repair");
        assertEq(proposals[0].body, "# Why\n\nBecause.");
        assertEq(proposals[0].votes, 0);
        assertEq(proposals[1].title, "Chaos engineering");
        assertEq(proposals[1].body, "");
        assertEq(dao.getRound(roundId).proposalCount, 2);
    }

    function test_Propose_AcceptsLongestTitle() public {
        uint256 roundId = _createRound();
        string memory title = string(new bytes(dao.MAX_TITLE_LENGTH()));

        vm.prank(head);
        dao.propose(roundId, title, "Body");

        assertEq(bytes(dao.getProposals(roundId)[0].title).length, dao.MAX_TITLE_LENGTH());
    }

    function test_Propose_AcceptsLongestBody() public {
        uint256 roundId = _createRound();
        string memory body = string(new bytes(dao.MAX_BODY_LENGTH()));

        vm.prank(head);
        dao.propose(roundId, "Title", body);

        assertEq(bytes(dao.getProposals(roundId)[0].body).length, dao.MAX_BODY_LENGTH());
    }

    function test_RevertWhen_Propose_NotHead() public {
        uint256 roundId = _createRound();

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.propose(roundId, "Title", "Body");
    }

    function test_RevertWhen_Propose_RoundActive() public {
        uint256 roundId = _openRound(1);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Active)
        );
        vm.prank(head);
        dao.propose(roundId, "Title", "Body");
    }

    function test_RevertWhen_Propose_RoundClosed() public {
        uint256 roundId = _openRound(1);
        _close(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Closed)
        );
        vm.prank(head);
        dao.propose(roundId, "Title", "Body");
    }

    function test_RevertWhen_Propose_RoundCancelled() public {
        uint256 roundId = _createRound();
        vm.startPrank(head);
        dao.cancelRound(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Cancelled)
        );
        dao.propose(roundId, "Title", "Body");
    }

    function test_RevertWhen_Propose_EmptyTitle() public {
        uint256 roundId = _createRound();

        vm.expectRevert(IAssertDAO.InvalidTitle.selector);
        vm.prank(head);
        dao.propose(roundId, "", "Body");
    }

    function test_RevertWhen_Propose_TitleTooLong() public {
        uint256 roundId = _createRound();
        string memory title = string(new bytes(dao.MAX_TITLE_LENGTH() + 1));

        vm.expectRevert(IAssertDAO.InvalidTitle.selector);
        vm.prank(head);
        dao.propose(roundId, title, "Body");
    }

    function test_RevertWhen_Propose_BodyTooLong() public {
        uint256 roundId = _createRound();
        uint256 max = dao.MAX_BODY_LENGTH();
        string memory body = string(new bytes(max + 1));

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.BodyTooLong.selector, max + 1, max));
        vm.prank(head);
        dao.propose(roundId, "Title", body);
    }

    function test_RevertWhen_Propose_BallotFull() public {
        uint256 roundId = _createRound(dao.MAX_PROPOSALS());

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.TooManyProposals.selector, roundId));
        vm.prank(head);
        dao.propose(roundId, "One too many", "Body");
    }
}

contract VoteTest is BaseTest {
    function test_Vote() public {
        uint256 roundId = _openRound(3);
        uint8[] memory votes = _ballot(6, 0, 8);

        vm.expectEmit(address(dao));
        emit IAssertDAO.VoteCast(roundId, alice, votes);
        _vote(alice, roundId, votes);

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals[0].votes, 6);
        assertEq(proposals[1].votes, 0);
        assertEq(proposals[2].votes, 8);
        assertEq(dao.ballotOf(roundId, alice), votes);
        assertEq(dao.getRound(roundId).voterCount, 1);
    }

    function test_Vote_TallySumsBallots() public {
        uint256 roundId = _openRound(3);

        _vote(alice, roundId, _ballot(6, 0, 8));
        _vote(bob, roundId, _ballot(1, 2, 3));
        _vote(carol, roundId, _ballot(0, 10, 0));

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals[0].votes, 7);
        assertEq(proposals[1].votes, 12);
        assertEq(proposals[2].votes, 11);
        assertEq(dao.getRound(roundId).voterCount, 3);
    }

    function test_Vote_AgainReplacesTheBallot() public {
        uint256 roundId = _openRound(3);
        _vote(alice, roundId, _ballot(6, 0, 8));
        _vote(bob, roundId, _ballot(1, 2, 3));

        _vote(alice, roundId, _ballot(0, 9, 2));

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals[0].votes, 1);
        assertEq(proposals[1].votes, 11);
        assertEq(proposals[2].votes, 5);
        assertEq(dao.ballotOf(roundId, alice), _ballot(0, 9, 2));
        assertEq(dao.getRound(roundId).voterCount, 2);
    }

    function test_Vote_BlankBallotWithdrawsVotes() public {
        uint256 roundId = _openRound(3);
        _vote(alice, roundId, _ballot(6, 0, 8));

        _vote(alice, roundId, _ballot(0, 0, 0));

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals[0].votes, 0);
        assertEq(proposals[2].votes, 0);
        assertEq(dao.getRound(roundId).voterCount, 1);
    }

    function test_Vote_SpendsExactlyTheBudget() public {
        uint256 roundId = _openRound(3);

        _vote(alice, roundId, _ballot(10, 0, 0));
        _vote(bob, roundId, _ballot(6, 8, 0));

        assertEq(_cost(dao.ballotOf(roundId, alice)), dao.CREDITS());
        assertEq(_cost(dao.ballotOf(roundId, bob)), dao.CREDITS());
    }

    function test_Vote_UntilTheLastSecond() public {
        uint256 roundId = _openRound(3);
        vm.warp(dao.getRound(roundId).end - 1);

        _vote(alice, roundId, _ballot(1, 1, 1));

        assertEq(dao.getRound(roundId).voterCount, 1);
    }

    function test_Vote_RoundsAreIndependent() public {
        uint256 first = _createRound(3);
        uint256 second = _createRound(3);
        vm.warp(dao.getRound(first).start);

        _vote(alice, first, _ballot(10, 0, 0));
        _vote(alice, second, _ballot(0, 0, 10));

        assertEq(dao.getProposals(first)[0].votes, 10);
        assertEq(dao.getProposals(first)[2].votes, 0);
        assertEq(dao.getProposals(second)[0].votes, 0);
        assertEq(dao.getProposals(second)[2].votes, 10);
    }

    function test_Vote_BallotOfRemovedMemberStaysCounted() public {
        uint256 roundId = _openRound(3);
        _vote(bob, roundId, _ballot(1, 2, 3));

        vm.prank(head);
        dao.removeMember(bob);

        assertEq(dao.getProposals(roundId)[2].votes, 3);
        assertEq(dao.ballotOf(roundId, bob), _ballot(1, 2, 3));
    }

    function test_GetBallots_ListsVotersInOrderOfFirstVote() public {
        uint256 roundId = _openRound(3);
        _vote(bob, roundId, _ballot(1, 2, 3));
        _vote(alice, roundId, _ballot(6, 0, 8));
        _vote(bob, roundId, _ballot(3, 2, 1));

        IAssertDAO.Ballot[] memory ballots = dao.getBallots(roundId);

        assertEq(ballots.length, 2);
        assertEq(ballots[0].voter, bob);
        assertEq(ballots[0].votes, _ballot(3, 2, 1));
        assertEq(ballots[1].voter, alice);
        assertEq(ballots[1].votes, _ballot(6, 0, 8));
    }

    function test_BallotOf_EmptyBeforeVoting() public {
        uint256 roundId = _openRound(3);

        assertEq(dao.ballotOf(roundId, alice).length, 0);
        assertEq(dao.getBallots(roundId).length, 0);
    }

    function test_RevertWhen_Vote_OverBudget() public {
        uint256 roundId = _openRound(3);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.CreditsExceeded.selector, 101, 100));
        _vote(alice, roundId, _ballot(10, 1, 0));
    }

    function test_RevertWhen_Vote_OverBudget_LeavesTheTallyUntouched() public {
        uint256 roundId = _openRound(3);
        _vote(alice, roundId, _ballot(6, 0, 8));

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.CreditsExceeded.selector, 255 * 255, 100));
        _vote(alice, roundId, _ballot(255, 0, 0));

        assertEq(dao.getProposals(roundId)[0].votes, 6);
        assertEq(dao.ballotOf(roundId, alice), _ballot(6, 0, 8));
    }

    function test_RevertWhen_Vote_NotMember() public {
        uint256 roundId = _openRound(3);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NotMember.selector, stranger));
        _vote(stranger, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_HeadIsNotAMember() public {
        uint256 roundId = _openRound(3);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NotMember.selector, head));
        _vote(head, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_MemberRemoved() public {
        uint256 roundId = _openRound(3);
        vm.prank(head);
        dao.removeMember(bob);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NotMember.selector, bob));
        _vote(bob, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_RoundPending() public {
        uint256 roundId = _createRound(3);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Pending)
        );
        _vote(alice, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_RoundClosed() public {
        uint256 roundId = _openRound(3);
        _close(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Closed)
        );
        _vote(alice, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_RoundCancelled() public {
        uint256 roundId = _openRound(3);
        vm.prank(head);
        dao.cancelRound(roundId);

        vm.expectRevert(
            abi.encodeWithSelector(IAssertDAO.WrongRoundState.selector, roundId, IAssertDAO.RoundState.Cancelled)
        );
        _vote(alice, roundId, _ballot(1, 1, 1));
    }

    function test_RevertWhen_Vote_NoProposals() public {
        uint256 roundId = _openRound(0);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.NoProposals.selector, roundId));
        _vote(alice, roundId, new uint8[](0));
    }

    function test_RevertWhen_Vote_BallotTooShort() public {
        uint256 roundId = _openRound(3);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.BallotLengthMismatch.selector, 3, 2));
        _vote(alice, roundId, new uint8[](2));
    }

    function test_RevertWhen_Vote_BallotTooLong() public {
        uint256 roundId = _openRound(3);

        vm.expectRevert(abi.encodeWithSelector(IAssertDAO.BallotLengthMismatch.selector, 3, 4));
        _vote(alice, roundId, new uint8[](4));
    }
}

contract HeadTest is BaseTest {
    function test_TransferOwnership_TakesTwoSteps() public {
        vm.prank(head);
        dao.transferOwnership(alice);

        assertEq(dao.owner(), head);
        assertEq(dao.pendingOwner(), alice);

        vm.prank(alice);
        dao.acceptOwnership();

        assertEq(dao.owner(), alice);
        assertEq(dao.pendingOwner(), address(0));
    }

    function test_TransferOwnership_FormerHeadLosesItsRights() public {
        vm.prank(head);
        dao.transferOwnership(alice);
        vm.prank(alice);
        dao.acceptOwnership();

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, head));
        vm.prank(head);
        dao.addMember(stranger, "stranger");
    }

    function test_RevertWhen_AcceptOwnership_NotPendingHead() public {
        vm.prank(head);
        dao.transferOwnership(alice);

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, bob));
        vm.prank(bob);
        dao.acceptOwnership();
    }

    function test_RevertWhen_RenounceOwnership() public {
        vm.expectRevert(IAssertDAO.RenounceDisabled.selector);
        vm.prank(head);
        dao.renounceOwnership();

        assertEq(dao.owner(), head);
    }
}
