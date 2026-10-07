// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../src/AssertDAO.sol";
import {BaseTest} from "./Base.t.sol";
import {AssertDAOV2} from "./mocks/AssertDAOV2.sol";
import {StateDigest} from "./utils/StateDigest.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC1967} from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract UpgradeTest is BaseTest {
    function _implementationOf(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967Utils.IMPLEMENTATION_SLOT))));
    }

    /// @dev A DAO with history: one closed round, one active round with ballots, one pending round.
    function _populate() internal {
        uint256 closed = _openRound(3);
        _vote(alice, closed, _ballot(6, 0, 8));
        _vote(bob, closed, _ballot(1, 2, 3));
        _close(closed);

        uint256 active = _openRound(3);
        _vote(carol, active, _ballot(0, 10, 0));

        _createRound(2);
    }

    function test_Proxy_PointsToTheImplementation() public view {
        assertEq(_implementationOf(address(dao)), implementation);
        assertEq(dao.proxiableUUID.selector, UUPSUpgradeable.proxiableUUID.selector);
        assertEq(AssertDAO(implementation).proxiableUUID(), ERC1967Utils.IMPLEMENTATION_SLOT);
    }

    function test_Upgrade_KeepsEveryPieceOfState() public {
        _populate();
        bytes32 before = StateDigest.ofDao(dao);
        address next = address(new AssertDAOV2());

        vm.expectEmit(address(dao));
        emit IERC1967.Upgraded(next);
        vm.prank(head);
        dao.upgradeToAndCall(next, "");

        assertEq(_implementationOf(address(dao)), next);
        assertEq(StateDigest.ofDao(dao), before);
    }

    function test_Upgrade_BringsNewBehaviour() public {
        _populate();
        address next = address(new AssertDAOV2());

        vm.prank(head);
        dao.upgradeToAndCall(next, abi.encodeCall(AssertDAOV2.initializeV2, (7)));

        assertEq(dao.version(), "2.0.0");
        assertEq(AssertDAOV2(address(dao)).quorum(), 7);
    }

    function test_Upgrade_VotingContinuesAcrossIt() public {
        uint256 roundId = _openRound(3);
        _vote(alice, roundId, _ballot(6, 0, 8));
        address next = address(new AssertDAOV2());

        vm.prank(head);
        dao.upgradeToAndCall(next, "");
        _vote(alice, roundId, _ballot(0, 9, 2));
        _vote(bob, roundId, _ballot(1, 1, 1));

        assertEq(dao.getProposals(roundId)[0].votes, 1);
        assertEq(dao.getProposals(roundId)[1].votes, 10);
        assertEq(dao.getProposals(roundId)[2].votes, 3);
        assertEq(dao.getRound(roundId).voterCount, 2);
    }

    function test_RevertWhen_Upgrade_NotHead() public {
        address next = address(new AssertDAOV2());

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        dao.upgradeToAndCall(next, "");
    }

    function test_RevertWhen_Upgrade_CalledOnTheImplementation() public {
        address next = address(new AssertDAOV2());

        vm.expectRevert(UUPSUpgradeable.UUPSUnauthorizedCallContext.selector);
        vm.prank(head);
        AssertDAO(implementation).upgradeToAndCall(next, "");
    }

    function test_RevertWhen_Upgrade_TargetIsNotAnImplementation() public {
        vm.expectRevert(abi.encodeWithSelector(ERC1967Utils.ERC1967InvalidImplementation.selector, address(this)));
        vm.prank(head);
        dao.upgradeToAndCall(address(this), "");
    }

    function test_RevertWhen_UpgradeInitializer_RunsTwice() public {
        address next = address(new AssertDAOV2());
        vm.prank(head);
        dao.upgradeToAndCall(next, abi.encodeCall(AssertDAOV2.initializeV2, (7)));

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        AssertDAOV2(address(dao)).initializeV2(9);
    }
}
