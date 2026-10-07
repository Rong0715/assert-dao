// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {BaseTest} from "./Base.t.sol";

/// @notice Records what each operation costs in `snapshots/GasTest.json`, so that a change in cost shows up in the
/// diff of the change that caused it.
contract GasTest is BaseTest {
    uint256 internal constant PROPOSALS = 5;

    function _votes(uint8 each) internal pure returns (uint8[] memory votes) {
        votes = new uint8[](PROPOSALS);
        for (uint256 i = 0; i < PROPOSALS; ++i) {
            votes[i] = each;
        }
    }

    function test_Gas_AddMember() public {
        vm.prank(head);
        dao.addMember(stranger, "stranger");
        vm.snapshotGasLastCall("addMember");
    }

    function test_Gas_RemoveMember() public {
        vm.prank(head);
        dao.removeMember(bob);
        vm.snapshotGasLastCall("removeMember");
    }

    function test_Gas_CreateRound() public {
        uint64 start = uint64(block.timestamp) + LEAD;
        vm.prank(head);
        dao.createRound("2026 H2", start, start + DURATION);
        vm.snapshotGasLastCall("createRound");
    }

    function test_Gas_CancelRound() public {
        uint256 roundId = _createRound(PROPOSALS);
        vm.prank(head);
        dao.cancelRound(roundId);
        vm.snapshotGasLastCall("cancelRound");
    }

    function test_Gas_Propose() public {
        uint256 roundId = _createRound();
        string memory title = "Automated program repair for smart contracts";
        bytes memory body = new bytes(2048);
        for (uint256 i = 0; i < body.length; ++i) {
            body[i] = "a";
        }

        vm.prank(head);
        dao.propose(roundId, title, string(body));
        vm.snapshotGasLastCall("propose (2 kB body)");
    }

    function test_Gas_Vote() public {
        uint256 roundId = _openRound(PROPOSALS);
        uint8[] memory votes = _votes(4);

        vm.prank(alice);
        dao.vote(roundId, votes);
        vm.snapshotGasLastCall("vote (5 proposals, first ballot)");
    }

    function test_Gas_VoteAgain() public {
        uint256 roundId = _openRound(PROPOSALS);
        _vote(alice, roundId, _votes(4));
        uint8[] memory votes = _votes(3);

        vm.prank(alice);
        dao.vote(roundId, votes);
        vm.snapshotGasLastCall("vote (5 proposals, replaced ballot)");
    }
}
