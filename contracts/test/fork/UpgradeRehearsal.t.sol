// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Deployments} from "../../script/Deployments.sol";
import {AssertDAO} from "../../src/AssertDAO.sol";
import {IAssertDAO} from "../../src/IAssertDAO.sol";
import {StateDigest} from "../utils/StateDigest.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Rehearses the upgrade to the code of this checkout against a live deployment, on a fork of its chain.
/// @dev Runs when `REHEARSAL_RPC_URL` points to a chain that has a record in `deployments/`, and is skipped
/// otherwise. The delivery pipeline runs it before every upgrade.
contract UpgradeRehearsalTest is Test {
    AssertDAO internal dao;
    address internal head;

    function setUp() public {
        string memory rpc = vm.envOr("REHEARSAL_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;

        vm.createSelectFork(rpc);
        if (!Deployments.exists(vm)) return;

        dao = AssertDAO(Deployments.proxy(vm));
        head = dao.owner();
    }

    function test_Rehearsal_UpgradeKeepsTheLiveState() public {
        if (address(dao) == address(0)) vm.skip(true);
        bytes32 before = StateDigest.ofDao(dao);

        address implementation = _upgrade();

        assertEq(dao.version(), AssertDAO(implementation).version());
        assertEq(StateDigest.ofDao(dao), before, "the upgrade changed the state of the live DAO");
    }

    function test_Rehearsal_UpgradedDaoStillRunsARound() public {
        if (address(dao) == address(0)) vm.skip(true);
        _upgrade();

        address voter = makeAddr("rehearsal voter");
        uint64 start = uint64(block.timestamp) + 1 hours;
        vm.startPrank(head);
        dao.addMember(voter, "rehearsal");
        uint256 roundId = dao.createRound("Rehearsal", start, start + 1 days);
        dao.propose(roundId, "First", "");
        dao.propose(roundId, "Second", "");
        vm.stopPrank();

        vm.warp(start);
        uint8[] memory votes = new uint8[](2);
        votes[0] = 6;
        votes[1] = 8;
        vm.prank(voter);
        dao.vote(roundId, votes);

        IAssertDAO.Proposal[] memory proposals = dao.getProposals(roundId);
        assertEq(proposals[0].votes, 6);
        assertEq(proposals[1].votes, 8);
    }

    /// @dev What the head will do for real: deploy the code of this checkout and point the proxy to it.
    function _upgrade() internal returns (address implementation) {
        implementation = address(new AssertDAO());
        vm.prank(head);
        dao.upgradeToAndCall(implementation, "");
    }
}
