// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAssertDAO} from "./IAssertDAO.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title AssertDAO
/// @author ASSERT Association
/// @notice Quadratic voting for the members of the ASSERT Association on the research to fund next.
/// @dev Deployed behind an ERC-1967 proxy and upgraded through UUPS. The owner is the head of the association: it
/// curates the member list, opens rounds, writes their ballots and authorizes upgrades. Members only vote.
///
/// State variables of this contract are append-only across versions. Inherited OpenZeppelin state lives in
/// ERC-7201 namespaces and cannot collide with it.
contract AssertDAO is IAssertDAO, Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev `cancelled` shares a slot with the voting window. Ballots are only meaningful for accounts listed in
    /// `voters`, and a stored ballot always has one entry per proposal.
    struct Round {
        string title;
        uint64 start;
        uint64 end;
        bool cancelled;
        Proposal[] proposals;
        address[] voters;
        mapping(address voter => uint8[] votes) ballots;
    }

    /// @inheritdoc IAssertDAO
    uint256 public constant override CREDITS = 100;

    /// @inheritdoc IAssertDAO
    uint256 public constant override MAX_PROPOSALS = 32;

    /// @inheritdoc IAssertDAO
    uint256 public constant override MAX_HANDLE_LENGTH = 32;

    /// @inheritdoc IAssertDAO
    uint256 public constant override MAX_TITLE_LENGTH = 120;

    /// @inheritdoc IAssertDAO
    uint256 public constant override MAX_BODY_LENGTH = 8192;

    EnumerableSet.AddressSet private _members;
    mapping(address account => string handle) private _handles;
    uint256 private _roundCount;
    mapping(uint256 roundId => Round round) private _rounds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Sets the head and the founding members. Called once, through the proxy, at deployment.
    /// @param head Head of the association, owner of the contract.
    /// @param founders Initial members.
    function initialize(address head, Member[] calldata founders) external initializer {
        __Ownable_init(head);
        __Ownable2Step_init();

        uint256 count = founders.length;
        for (uint256 i = 0; i < count; ++i) {
            _addMember(founders[i].account, founders[i].handle);
        }
    }

    /// @inheritdoc IAssertDAO
    function addMember(address account, string calldata handle) external onlyOwner {
        _addMember(account, handle);
    }

    /// @inheritdoc IAssertDAO
    function removeMember(address account) external onlyOwner {
        if (!_members.remove(account)) revert NotMember(account);
        delete _handles[account];
        emit MemberRemoved(account);
    }

    /// @inheritdoc IAssertDAO
    function createRound(string calldata title, uint64 start, uint64 end) external onlyOwner returns (uint256 roundId) {
        _checkTitle(title);
        // Same tolerance as in `_stateOf`: a window is days long, a timestamp drifts by seconds.
        // slither-disable-next-line timestamp
        if (start <= block.timestamp || end <= start) revert InvalidWindow(start, end);

        roundId = ++_roundCount;
        Round storage round = _rounds[roundId];
        round.title = title;
        round.start = start;
        round.end = end;
        emit RoundCreated(roundId, title, start, end);
    }

    /// @inheritdoc IAssertDAO
    function cancelRound(uint256 roundId) external onlyOwner {
        Round storage round = _round(roundId);
        RoundState state = _stateOf(round);
        if (state != RoundState.Pending && state != RoundState.Active) revert WrongRoundState(roundId, state);

        round.cancelled = true;
        emit RoundCancelled(roundId);
    }

    /// @inheritdoc IAssertDAO
    function propose(uint256 roundId, string calldata title, string calldata body)
        external
        onlyOwner
        returns (uint256 index)
    {
        Round storage round = _round(roundId);
        RoundState state = _stateOf(round);
        if (state != RoundState.Pending) revert WrongRoundState(roundId, state);
        _checkTitle(title);
        if (bytes(body).length > MAX_BODY_LENGTH) revert BodyTooLong(bytes(body).length, MAX_BODY_LENGTH);

        index = round.proposals.length;
        if (index == MAX_PROPOSALS) revert TooManyProposals(roundId);
        round.proposals.push(Proposal({title: title, body: body, votes: 0}));
        emit ProposalAdded(roundId, index, title);
    }

    /// @inheritdoc IAssertDAO
    function vote(uint256 roundId, uint8[] calldata votes) external {
        if (!_members.contains(msg.sender)) revert NotMember(msg.sender);
        Round storage round = _round(roundId);
        RoundState state = _stateOf(round);
        if (state != RoundState.Active) revert WrongRoundState(roundId, state);

        Proposal[] storage proposals = round.proposals;
        uint256 count = proposals.length;
        if (count == 0) revert NoProposals(roundId);
        if (votes.length != count) revert BallotLengthMismatch(count, votes.length);

        // A stored ballot is never empty, so its length tells whether the member votes again.
        uint8[] storage ballot = round.ballots[msg.sender];
        bool revote = ballot.length != 0;

        uint256 spent = 0;
        for (uint256 i = 0; i < count; ++i) {
            uint256 cast = votes[i];
            spent += cast * cast;
            uint256 previous = revote ? ballot[i] : 0;
            if (cast != previous) proposals[i].votes = proposals[i].votes + cast - previous;
        }
        if (spent > CREDITS) revert CreditsExceeded(spent, CREDITS);

        round.ballots[msg.sender] = votes;
        if (!revote) round.voters.push(msg.sender);
        emit VoteCast(roundId, msg.sender, votes);
    }

    /// @inheritdoc IAssertDAO
    function isMember(address account) external view returns (bool) {
        return _members.contains(account);
    }

    /// @inheritdoc IAssertDAO
    function handleOf(address account) external view returns (string memory) {
        return _handles[account];
    }

    /// @inheritdoc IAssertDAO
    function memberCount() external view returns (uint256) {
        return _members.length();
    }

    /// @inheritdoc IAssertDAO
    function getMembers() external view returns (Member[] memory members) {
        uint256 count = _members.length();
        members = new Member[](count);
        for (uint256 i = 0; i < count; ++i) {
            address account = _members.at(i);
            members[i] = Member({account: account, handle: _handles[account]});
        }
    }

    /// @inheritdoc IAssertDAO
    function roundCount() external view returns (uint256) {
        return _roundCount;
    }

    /// @inheritdoc IAssertDAO
    function roundState(uint256 roundId) external view returns (RoundState) {
        return _stateOf(_round(roundId));
    }

    /// @inheritdoc IAssertDAO
    function getRound(uint256 roundId) external view returns (RoundInfo memory) {
        Round storage round = _round(roundId);
        return RoundInfo({
            title: round.title,
            start: round.start,
            end: round.end,
            state: _stateOf(round),
            proposalCount: round.proposals.length,
            voterCount: round.voters.length
        });
    }

    /// @inheritdoc IAssertDAO
    function getProposals(uint256 roundId) external view returns (Proposal[] memory) {
        return _round(roundId).proposals;
    }

    /// @inheritdoc IAssertDAO
    function getBallots(uint256 roundId) external view returns (Ballot[] memory ballots) {
        Round storage round = _round(roundId);
        uint256 count = round.voters.length;
        ballots = new Ballot[](count);
        for (uint256 i = 0; i < count; ++i) {
            address voter = round.voters[i];
            ballots[i] = Ballot({voter: voter, votes: round.ballots[voter]});
        }
    }

    /// @inheritdoc IAssertDAO
    function ballotOf(uint256 roundId, address voter) external view returns (uint8[] memory) {
        return _round(roundId).ballots[voter];
    }

    /// @inheritdoc IAssertDAO
    function version() external pure virtual returns (string memory) {
        return "1.0.0";
    }

    /// @notice Always reverts: administration and upgrades would be lost for good.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @dev Upgrades are authorized by the head alone: the modifier is the whole check.
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _addMember(address account, string memory handle) private {
        if (account == address(0)) revert ZeroAddress();
        uint256 length = bytes(handle).length;
        if (length == 0 || length > MAX_HANDLE_LENGTH) revert InvalidHandle();
        if (!_members.add(account)) revert AlreadyMember(account);

        _handles[account] = handle;
        emit MemberAdded(account, handle);
    }

    function _round(uint256 roundId) private view returns (Round storage round) {
        if (roundId == 0 || roundId > _roundCount) revert UnknownRound(roundId);
        round = _rounds[roundId];
    }

    function _stateOf(Round storage round) private view returns (RoundState) {
        if (round.cancelled) return RoundState.Cancelled;
        // Rounds last days, so the few seconds a block producer can shift a timestamp by are irrelevant.
        // slither-disable-next-line timestamp
        if (block.timestamp < round.start) return RoundState.Pending;
        // slither-disable-next-line timestamp
        if (block.timestamp < round.end) return RoundState.Active;
        return RoundState.Closed;
    }

    function _checkTitle(string calldata title) private pure {
        uint256 length = bytes(title).length;
        if (length == 0 || length > MAX_TITLE_LENGTH) revert InvalidTitle();
    }
}
