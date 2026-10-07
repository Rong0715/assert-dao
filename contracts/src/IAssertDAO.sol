// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IAssertDAO
/// @author ASSERT Association
/// @notice Public interface of the ASSERT Association DAO: members allocate quadratic votes across the research
/// proposals of a funding round. Money never moves on-chain; the tally is the only output.
interface IAssertDAO {
    /// @notice Lifecycle of a round.
    /// @dev `Pending` before `start`, `Active` in `[start, end)`, `Closed` from `end` on. `Cancelled` is terminal.
    enum RoundState {
        Pending,
        Active,
        Closed,
        Cancelled
    }

    /// @notice A member of the association.
    /// @param account Wallet that casts the member's votes.
    /// @param handle Short public name shown next to the member's ballots.
    struct Member {
        address account;
        string handle;
    }

    /// @notice A research proposal competing in a round.
    /// @param title One-line summary.
    /// @param body Full text, markdown.
    /// @param votes Sum of the quadratic votes received so far.
    struct Proposal {
        string title;
        string body;
        uint256 votes;
    }

    /// @notice Summary of a round.
    /// @param title Name of the round.
    /// @param start Timestamp at which voting opens.
    /// @param end Timestamp at which voting closes.
    /// @param state State at the time of the call.
    /// @param proposalCount Number of proposals on the ballot.
    /// @param voterCount Number of members who have cast a ballot.
    struct RoundInfo {
        string title;
        uint64 start;
        uint64 end;
        RoundState state;
        uint256 proposalCount;
        uint256 voterCount;
    }

    /// @notice A ballot as cast by one member.
    /// @param voter The member.
    /// @param votes Votes per proposal, in proposal order.
    struct Ballot {
        address voter;
        uint8[] votes;
    }

    /// @notice Emitted when `account` becomes a member.
    /// @param account The new member.
    /// @param handle The member's public name.
    event MemberAdded(address indexed account, string handle);

    /// @notice Emitted when `account` stops being a member.
    /// @param account The removed member.
    event MemberRemoved(address indexed account);

    /// @notice Emitted when a round is created.
    /// @param roundId Identifier of the round.
    /// @param title Name of the round.
    /// @param start Timestamp at which voting opens.
    /// @param end Timestamp at which voting closes.
    event RoundCreated(uint256 indexed roundId, string title, uint64 start, uint64 end);

    /// @notice Emitted when a round is cancelled.
    /// @param roundId Identifier of the round.
    event RoundCancelled(uint256 indexed roundId);

    /// @notice Emitted when a proposal is put on the ballot of a round.
    /// @param roundId Identifier of the round.
    /// @param index Position of the proposal on the ballot.
    /// @param title One-line summary of the proposal.
    event ProposalAdded(uint256 indexed roundId, uint256 indexed index, string title);

    /// @notice Emitted when a member casts or replaces a ballot.
    /// @param roundId Identifier of the round.
    /// @param voter The member.
    /// @param votes Votes per proposal, in proposal order.
    event VoteCast(uint256 indexed roundId, address indexed voter, uint8[] votes);

    /// @notice The zero address cannot be a member.
    error ZeroAddress();

    /// @notice The handle is empty or longer than `MAX_HANDLE_LENGTH` bytes.
    error InvalidHandle();

    /// @notice The title is empty or longer than `MAX_TITLE_LENGTH` bytes.
    error InvalidTitle();

    /// @notice The proposal body is longer than `max` bytes.
    /// @param length Length of the rejected body.
    /// @param max Maximum accepted length.
    error BodyTooLong(uint256 length, uint256 max);

    /// @notice `account` is already a member.
    /// @param account The offending account.
    error AlreadyMember(address account);

    /// @notice `account` is not a member.
    /// @param account The offending account.
    error NotMember(address account);

    /// @notice The voting window must start in the future and end after it starts.
    /// @param start Rejected opening timestamp.
    /// @param end Rejected closing timestamp.
    error InvalidWindow(uint64 start, uint64 end);

    /// @notice No round has this identifier.
    /// @param roundId The unknown identifier.
    error UnknownRound(uint256 roundId);

    /// @notice The round is not in a state that allows the operation.
    /// @param roundId Identifier of the round.
    /// @param state Current state of the round.
    error WrongRoundState(uint256 roundId, RoundState state);

    /// @notice The ballot of the round is full.
    /// @param roundId Identifier of the round.
    error TooManyProposals(uint256 roundId);

    /// @notice The round has no proposal to vote on.
    /// @param roundId Identifier of the round.
    error NoProposals(uint256 roundId);

    /// @notice A ballot must hold exactly one entry per proposal.
    /// @param expected Number of proposals in the round.
    /// @param actual Number of entries in the ballot.
    error BallotLengthMismatch(uint256 expected, uint256 actual);

    /// @notice The ballot costs more voice credits than a member owns.
    /// @param spent Cost of the ballot, the sum of the squared votes.
    /// @param budget Credits available to each member in each round.
    error CreditsExceeded(uint256 spent, uint256 budget);

    /// @notice The association cannot be left without a head.
    error RenounceDisabled();

    /// @notice Adds a member. Only the head.
    /// @param account Wallet of the member.
    /// @param handle Public name of the member, 1 to `MAX_HANDLE_LENGTH` bytes.
    function addMember(address account, string calldata handle) external;

    /// @notice Removes a member. Only the head.
    /// @dev Ballots the member already cast stay counted.
    /// @param account Wallet of the member.
    function removeMember(address account) external;

    /// @notice Creates a round whose ballot can be filled until voting opens. Only the head.
    /// @param title Name of the round, 1 to `MAX_TITLE_LENGTH` bytes.
    /// @param start Timestamp at which voting opens, strictly in the future.
    /// @param end Timestamp at which voting closes, strictly after `start`.
    /// @return roundId Identifier of the new round.
    function createRound(string calldata title, uint64 start, uint64 end) external returns (uint256 roundId);

    /// @notice Cancels a round that has not closed yet. Only the head.
    /// @param roundId Identifier of the round.
    function cancelRound(uint256 roundId) external;

    /// @notice Puts a proposal on the ballot of a pending round. Only the head.
    /// @param roundId Identifier of the round.
    /// @param title One-line summary, 1 to `MAX_TITLE_LENGTH` bytes.
    /// @param body Full text, at most `MAX_BODY_LENGTH` bytes.
    /// @return index Position of the proposal on the ballot.
    function propose(uint256 roundId, string calldata title, string calldata body) external returns (uint256 index);

    /// @notice Casts the caller's ballot in an active round, replacing any ballot cast before. Only members.
    /// @dev Quadratic voting: `votes[i]` votes on proposal `i` cost `votes[i]²` credits, and the whole ballot must
    /// cost at most `CREDITS`.
    /// @param roundId Identifier of the round.
    /// @param votes Votes per proposal, in proposal order.
    function vote(uint256 roundId, uint8[] calldata votes) external;

    // Getters of constants keep the name of the constant.
    // slither-disable-start naming-convention

    /// @notice Voice credits each member can spend in each round.
    /// @return The budget.
    function CREDITS() external view returns (uint256);

    /// @notice Maximum number of proposals in a round.
    /// @return The limit.
    function MAX_PROPOSALS() external view returns (uint256);

    /// @notice Maximum length of a member handle, in bytes.
    /// @return The limit.
    function MAX_HANDLE_LENGTH() external view returns (uint256);

    /// @notice Maximum length of a round or proposal title, in bytes.
    /// @return The limit.
    function MAX_TITLE_LENGTH() external view returns (uint256);

    /// @notice Maximum length of a proposal body, in bytes.
    /// @return The limit.
    function MAX_BODY_LENGTH() external view returns (uint256);

    // slither-disable-end naming-convention

    /// @notice Whether `account` is a member.
    /// @param account The account to look up.
    /// @return True if `account` is a member.
    function isMember(address account) external view returns (bool);

    /// @notice Public name of a member.
    /// @param account The account to look up.
    /// @return The handle, empty if `account` is not a member.
    function handleOf(address account) external view returns (string memory);

    /// @notice Number of members.
    /// @return The count.
    function memberCount() external view returns (uint256);

    /// @notice All members, in no particular order.
    /// @return The members.
    function getMembers() external view returns (Member[] memory);

    /// @notice Number of rounds created so far. Round identifiers run from 1 to this number.
    /// @return The count.
    function roundCount() external view returns (uint256);

    /// @notice Current state of a round.
    /// @param roundId Identifier of the round.
    /// @return The state.
    function roundState(uint256 roundId) external view returns (RoundState);

    /// @notice Summary of a round.
    /// @param roundId Identifier of the round.
    /// @return The summary.
    function getRound(uint256 roundId) external view returns (RoundInfo memory);

    /// @notice Proposals of a round with their running tallies, in ballot order.
    /// @param roundId Identifier of the round.
    /// @return The proposals.
    function getProposals(uint256 roundId) external view returns (Proposal[] memory);

    /// @notice Every ballot cast in a round, in the order members first voted.
    /// @param roundId Identifier of the round.
    /// @return The ballots.
    function getBallots(uint256 roundId) external view returns (Ballot[] memory);

    /// @notice Ballot of one voter in a round.
    /// @param roundId Identifier of the round.
    /// @param voter The voter to look up.
    /// @return Votes per proposal, empty if `voter` has not voted.
    function ballotOf(uint256 roundId, address voter) external view returns (uint8[] memory);

    /// @notice Semantic version of the implementation.
    /// @return The version, such as `1.0.0`.
    function version() external pure returns (string memory);
}
