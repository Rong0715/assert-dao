// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../../src/AssertDAO.sol";
import {IAssertDAO} from "../../src/IAssertDAO.sol";
import {StateDigest} from "../utils/StateDigest.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Drives the DAO through random but well-formed sequences of everything its users can do, and remembers
/// what must not change afterwards.
contract Handler is Test {
    uint256 internal constant MAX_ROUNDS = 6;
    uint256 internal constant MAX_PROPOSALS = 5;

    AssertDAO public dao;
    address public head;
    address[] public actors;

    uint256 public roundsCreated;
    uint256 public proposalsAdded;
    uint256 public proposalsRejected;
    uint256 public ballotsAccepted;
    uint256 public ballotsReplaced;
    uint256 public ballotsRejected;

    /// @dev Fingerprint of a round, taken when it was first seen closed or cancelled.
    mapping(uint256 roundId => bytes32 digest) public settled;
    /// @dev Fingerprint of the proposals of a round, taken when it was first seen out of the pending state.
    mapping(uint256 roundId => bytes32 digest) public ballotPaper;

    /// @dev Takes the fingerprints after every action.
    modifier checkpoint() {
        _;
        for (uint256 roundId = 1; roundId <= roundsCreated; ++roundId) {
            IAssertDAO.RoundState state = dao.roundState(roundId);
            if (state != IAssertDAO.RoundState.Pending && ballotPaper[roundId] == 0) {
                ballotPaper[roundId] = paperOf(roundId);
            }
            if (state != IAssertDAO.RoundState.Pending && state != IAssertDAO.RoundState.Active) {
                if (settled[roundId] == 0) settled[roundId] = StateDigest.ofRound(dao, roundId);
            }
        }
    }

    constructor(AssertDAO dao_, address head_) {
        dao = dao_;
        head = head_;

        IAssertDAO.Member[] memory members = dao.getMembers();
        for (uint256 i = 0; i < members.length; ++i) {
            actors.push(members[i].account);
        }
        actors.push(makeAddr("dave"));
        actors.push(makeAddr("erin"));
        actors.push(makeAddr("frank"));
    }

    function addMember(uint256 actorSeed) external checkpoint {
        address actor = _actor(actorSeed);
        if (dao.isMember(actor)) return;

        vm.prank(head);
        dao.addMember(actor, "actor");
    }

    function removeMember(uint256 actorSeed) external checkpoint {
        address actor = _actor(actorSeed);
        if (!dao.isMember(actor)) return;

        vm.prank(head);
        dao.removeMember(actor);
    }

    function createRound(uint256 lead, uint256 duration, uint256 proposals) external checkpoint {
        if (roundsCreated == MAX_ROUNDS) return;
        uint64 start = uint64(block.timestamp + bound(lead, 1, 1 days));
        uint64 end = uint64(start + bound(duration, 1 hours, 3 days));

        vm.startPrank(head);
        uint256 roundId = dao.createRound("Round", start, end);
        proposals = bound(proposals, 1, MAX_PROPOSALS - 1);
        for (uint256 i = 0; i < proposals; ++i) {
            dao.propose(roundId, "Proposal", "Body");
        }
        vm.stopPrank();
        ++roundsCreated;
    }

    /// @dev The head tries to extend the ballot of any round: only pending rounds may accept.
    function propose(uint256 roundSeed) external checkpoint {
        if (roundsCreated == 0) return;
        uint256 roundId = bound(roundSeed, 1, roundsCreated);
        if (dao.getRound(roundId).proposalCount == MAX_PROPOSALS) return;

        vm.prank(head);
        try dao.propose(roundId, "Late proposal", "Body") {
            ++proposalsAdded;
        } catch {
            ++proposalsRejected;
        }
    }

    /// @dev Cancellation is rare, as in life: one call out of four acts.
    function cancelRound(uint256 roundSeed, uint256 dice) external checkpoint {
        if (roundsCreated == 0 || dice % 4 != 0) return;
        uint256 roundId = bound(roundSeed, 1, roundsCreated);
        IAssertDAO.RoundState state = dao.roundState(roundId);
        if (state != IAssertDAO.RoundState.Pending && state != IAssertDAO.RoundState.Active) return;

        vm.prank(head);
        dao.cancelRound(roundId);
    }

    /// @dev A member casts an affordable ballot in an active round: the accepted path.
    function vote(uint256 actorSeed, uint256 roundSeed, uint256 ballotSeed) external checkpoint {
        (uint256 roundId, bool found) = _activeRound(roundSeed);
        IAssertDAO.Member[] memory members = dao.getMembers();
        if (!found || members.length == 0) return;
        address voter = members[bound(actorSeed, 0, members.length - 1)].account;
        uint8[] memory votes = _affordable(roundId, ballotSeed);

        vm.prank(voter);
        dao.vote(roundId, votes);
        ++ballotsAccepted;
    }

    /// @dev A member who already voted, and is still a member, replaces its ballot.
    function voteAgain(uint256 voterSeed, uint256 roundSeed, uint256 ballotSeed) external checkpoint {
        (uint256 roundId, bool found) = _activeRound(roundSeed);
        if (!found) return;
        IAssertDAO.Ballot[] memory ballots = dao.getBallots(roundId);
        if (ballots.length == 0) return;
        address voter = ballots[bound(voterSeed, 0, ballots.length - 1)].voter;
        if (!dao.isMember(voter)) return;
        uint8[] memory votes = _affordable(roundId, ballotSeed);

        vm.prank(voter);
        dao.vote(roundId, votes);
        ++ballotsReplaced;
    }

    /// @dev Anyone votes anything anywhere: most of these ballots must be rejected, none may corrupt the state.
    function voteBlindly(uint256 actorSeed, uint256 roundSeed, uint256 ballotSeed) external checkpoint {
        if (roundsCreated == 0) return;
        uint256 roundId = bound(roundSeed, 1, roundsCreated);
        uint8[] memory votes = new uint8[](dao.getRound(roundId).proposalCount);
        for (uint256 i = 0; i < votes.length; ++i) {
            votes[i] = uint8(uint256(keccak256(abi.encode(ballotSeed, i))) % 12);
        }

        vm.prank(_actor(actorSeed));
        try dao.vote(roundId, votes) {
            ++ballotsAccepted;
        } catch {
            ++ballotsRejected;
        }
    }

    function warp(uint256 elapsed) external checkpoint {
        vm.warp(block.timestamp + bound(elapsed, 1, 12 hours));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function paperOf(uint256 roundId) public view returns (bytes32 digest) {
        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        digest = keccak256(abi.encode(proposals.length));
        for (uint256 i = 0; i < proposals.length; ++i) {
            digest = keccak256(abi.encode(digest, proposals[i].title, proposals[i].body));
        }
    }

    /// @dev One of the rounds open for voting with at least one proposal, if any.
    function _activeRound(uint256 seed) internal view returns (uint256 roundId, bool found) {
        uint256[] memory active = new uint256[](roundsCreated);
        uint256 count = 0;
        for (uint256 id = 1; id <= roundsCreated; ++id) {
            IAssertDAO.RoundInfo memory round = dao.getRound(id);
            if (round.state == IAssertDAO.RoundState.Active && round.proposalCount != 0) active[count++] = id;
        }
        if (count == 0) return (0, false);
        return (active[bound(seed, 0, count - 1)], true);
    }

    /// @dev Spends the budget greedily over the proposals, starting from a random one.
    function _affordable(uint256 roundId, uint256 seed) internal view returns (uint8[] memory votes) {
        votes = new uint8[](dao.getRound(roundId).proposalCount);
        uint256 remaining = dao.CREDITS();
        for (uint256 n = 0; n < votes.length; ++n) {
            uint256 i = addmod(seed, n, votes.length);
            votes[i] = uint8(bound(uint256(keccak256(abi.encode(seed, n))), 0, Math.sqrt(remaining)));
            remaining -= uint256(votes[i]) * votes[i];
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }
}
