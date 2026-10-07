// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Deploy} from "../script/Deploy.s.sol";
import {Deployments} from "../script/Deployments.sol";
import {Upgrade} from "../script/Upgrade.s.sol";
import {AssertDAO} from "../src/AssertDAO.sol";
import {IAssertDAO} from "../src/IAssertDAO.sol";
import {StateDigest} from "./utils/StateDigest.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {Test} from "forge-std/Test.sol";

contract DeployScriptTest is Test {
    Deploy internal script = new Deploy();

    function test_ReadConfig() public view {
        (address head, IAssertDAO.Member[] memory founders) = script.readConfig("test/fixtures/config.valid.json");

        assertEq(head, address(0xA1));
        assertEq(founders.length, 2);
        assertEq(founders[0].account, address(0xA1));
        assertEq(founders[0].handle, "head");
        assertEq(founders[1].account, address(0xB2));
        assertEq(founders[1].handle, "member");
    }

    function test_ReadConfig_NoMembers() public view {
        (address head, IAssertDAO.Member[] memory founders) = script.readConfig("test/fixtures/config.no-members.json");

        assertEq(head, address(0xA1));
        assertEq(founders.length, 0);
    }

    function test_RevertWhen_ReadConfig_HeadMissing() public {
        vm.expectRevert(Deploy.HeadNotConfigured.selector);
        script.readConfig("test/fixtures/config.no-head.json");
    }

    function test_RevertWhen_ReadConfig_MemberIncomplete() public {
        vm.expectRevert();
        script.readConfig("test/fixtures/config.malformed.json");
    }

    function test_ReadConfig_LocalChainIsConfigured() public view {
        (address head, IAssertDAO.Member[] memory founders) = script.readConfig("config/31337.json");

        assertEq(head, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
        assertEq(founders.length, 1);
        assertEq(founders[0].handle, "M4RT1N");
    }

    function test_RevertWhen_Deploy_FounderInvalid() public {
        IAssertDAO.Member[] memory founders = new IAssertDAO.Member[](1);
        founders[0] = IAssertDAO.Member({account: address(0), handle: "nobody"});

        vm.expectRevert(IAssertDAO.ZeroAddress.selector);
        script.deploy(address(0xA1), founders);
    }
}

// These tests exercise the scripts that read and write deployment records, so they touch the file system too.
// forge-lint: disable-start(unsafe-cheatcode)

/// @dev Each test writes its record under a chain identifier of its own: tests run in parallel, and none of them
/// may touch the record of a real deployment.
contract DeploymentsTest is Test {
    function test_WriteThenRead() public {
        vm.chainId(900_001);
        assertFalse(Deployments.exists(vm));

        vm.roll(42);
        Deployments.write(vm, address(0xD40), address(0x1111), "1.0.0");

        assertTrue(Deployments.exists(vm));
        assertEq(Deployments.path(vm), "deployments/900001.json");
        assertEq(Deployments.proxy(vm), address(0xD40));
        assertEq(Deployments.startBlock(vm), 42);
        string memory json = vm.readFile(Deployments.path(vm));
        assertEq(vm.parseJsonUint(json, ".chainId"), 900_001);
        assertEq(vm.parseJsonAddress(json, ".implementation"), address(0x1111));
        assertEq(vm.parseJsonString(json, ".version"), "1.0.0");

        vm.removeFile(Deployments.path(vm));
    }

    function test_Update_KeepsProxyAndStartBlock() public {
        vm.chainId(900_002);
        vm.roll(42);
        Deployments.write(vm, address(0xD40), address(0x1111), "1.0.0");

        vm.roll(99);
        Deployments.update(vm, address(0x2222), "1.1.0");

        string memory json = vm.readFile(Deployments.path(vm));
        assertEq(Deployments.proxy(vm), address(0xD40));
        assertEq(Deployments.startBlock(vm), 42);
        assertEq(vm.parseJsonAddress(json, ".implementation"), address(0x2222));
        assertEq(vm.parseJsonString(json, ".version"), "1.1.0");

        vm.removeFile(Deployments.path(vm));
    }
}

contract UpgradeScriptTest is Test {
    Upgrade internal script = new Upgrade();

    function _deploy(address head) internal returns (AssertDAO dao) {
        IAssertDAO.Member[] memory founders = new IAssertDAO.Member[](1);
        founders[0] = IAssertDAO.Member({account: address(0xB2), handle: "member"});
        (address proxy, address implementation) = new Deploy().deploy(head, founders);
        Deployments.write(vm, proxy, implementation, "1.0.0");
        dao = AssertDAO(proxy);
    }

    function _implementationOf(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967Utils.IMPLEMENTATION_SLOT))));
    }

    /// @dev Inside a test, a script broadcasts from forge's default sender.
    function test_Run_UpgradesWhenTheBroadcasterIsTheHead() public {
        vm.chainId(900_003);
        AssertDAO dao = _deploy(DEFAULT_SENDER);
        bytes32 before = StateDigest.ofDao(dao);

        (address implementation, bool upgraded) = script.run();

        assertTrue(upgraded);
        assertEq(_implementationOf(address(dao)), implementation);
        assertEq(StateDigest.ofDao(dao), before);
        assertEq(vm.parseJsonAddress(vm.readFile(Deployments.path(vm)), ".implementation"), implementation);

        vm.removeFile(Deployments.path(vm));
    }

    function test_Run_OnlyDeploysWhenTheBroadcasterIsNotTheHead() public {
        vm.chainId(900_004);
        AssertDAO dao = _deploy(address(0xA1));
        address current = _implementationOf(address(dao));

        (address implementation, bool upgraded) = script.run();

        assertFalse(upgraded);
        assertEq(_implementationOf(address(dao)), current);
        assertEq(vm.parseJsonAddress(vm.readFile(Deployments.path(vm)), ".implementation"), implementation);

        // The head finishes the job with the call the script printed.
        vm.prank(address(0xA1));
        dao.upgradeToAndCall(implementation, "");
        assertEq(_implementationOf(address(dao)), implementation);

        vm.removeFile(Deployments.path(vm));
    }
}

// forge-lint: disable-end(unsafe-cheatcode)
