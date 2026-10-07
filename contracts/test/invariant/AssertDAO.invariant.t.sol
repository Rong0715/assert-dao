// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAssertDAO} from "../../src/IAssertDAO.sol";
import {BaseTest} from "../Base.t.sol";
import {StateDigest} from "../utils/StateDigest.sol";
import {Handler} from "./Handler.sol";

contract AssertDAOInvariantTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(dao, head);
        targetContract(address(handler));
    }

    /// @dev The tally of a proposal is exactly what the stored ballots add up to: no vote is lost, counted twice
    /// or left behind by a replaced ballot.
    function invariant_TallyIsTheSumOfTheBallots() public view {
        for (uint256 roundId = 1; roundId <= dao.roundCount(); ++roundId) {
            IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
            IAssertDAO.Ballot[] memory ballots = dao.getBallots(roundId);

            uint256[] memory sums = new uint256[](proposals.length);
            for (uint256 b = 0; b < ballots.length; ++b) {
                assertEq(ballots[b].votes.length, proposals.length, "ballot does not cover the proposals");
                for (uint256 i = 0; i < proposals.length; ++i) {
                    sums[i] += ballots[b].votes[i];
                }
            }
            for (uint256 i = 0; i < proposals.length; ++i) {
                assertEq(proposals[i].votes, sums[i], "tally differs from the ballots");
            }
        }
    }

    function invariant_EveryBallotFitsTheBudget() public view {
        for (uint256 roundId = 1; roundId <= dao.roundCount(); ++roundId) {
            IAssertDAO.Ballot[] memory ballots = dao.getBallots(roundId);
            for (uint256 b = 0; b < ballots.length; ++b) {
                assertLe(_cost(ballots[b].votes), dao.CREDITS(), "ballot over budget");
            }
        }
    }

    function invariant_EveryVoterIsListedOnce() public view {
        for (uint256 roundId = 1; roundId <= dao.roundCount(); ++roundId) {
            IAssertDAO.Ballot[] memory ballots = dao.getBallots(roundId);
            assertEq(dao.getRound(roundId).voterCount, ballots.length);
            assertLe(ballots.length, handler.actorCount(), "more ballots than accounts");
            for (uint256 a = 0; a < ballots.length; ++a) {
                for (uint256 b = a + 1; b < ballots.length; ++b) {
                    assertNotEq(ballots[a].voter, ballots[b].voter, "voter listed twice");
                }
            }
        }
    }

    function invariant_MemberListIsConsistent() public view {
        IAssertDAO.Member[] memory members = dao.getMembers();
        assertEq(members.length, dao.memberCount());
        for (uint256 a = 0; a < members.length; ++a) {
            assertTrue(dao.isMember(members[a].account));
            assertGt(bytes(members[a].handle).length, 0, "member without a handle");
            for (uint256 b = a + 1; b < members.length; ++b) {
                assertNotEq(members[a].account, members[b].account, "member listed twice");
            }
        }
    }

    function invariant_RoundsAreNeverLost() public view {
        assertEq(dao.roundCount(), handler.roundsCreated());
    }

    /// @dev The proposals of a round cannot change from the moment voting opens.
    function invariant_BallotPaperIsFrozenOnceVotingOpens() public view {
        for (uint256 roundId = 1; roundId <= dao.roundCount(); ++roundId) {
            bytes32 paper = handler.ballotPaper(roundId);
            if (paper != 0) assertEq(handler.paperOf(roundId), paper, "proposals changed after opening");
        }
    }

    /// @dev Nothing about a closed or cancelled round can change: the result is final.
    function invariant_SettledRoundsNeverChange() public view {
        for (uint256 roundId = 1; roundId <= dao.roundCount(); ++roundId) {
            bytes32 digest = handler.settled(roundId);
            if (digest != 0) assertEq(StateDigest.ofRound(dao, roundId), digest, "settled round changed");
        }
    }

    function invariant_HeadIsStable() public view {
        assertEq(dao.owner(), head);
    }
}
