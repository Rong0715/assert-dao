// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../src/AssertDAO.sol";
import {Deployments} from "./Deployments.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @title Upgrade
/// @author ASSERT Association
/// @notice Deploys a new implementation for the DAO of the current chain and records it in
/// `deployments/<chainId>.json`.
/// @dev When the broadcaster is the head, the proxy is upgraded in the same run. Otherwise the script stops after
/// deploying the implementation and prints the call the head has to make: the record then runs ahead of the chain
/// until the head acts, which the monitor reports.
contract Upgrade is Script {
    /// @notice The proxy does not run the new implementation after the upgrade.
    error PostUpgradeCheckFailed();

    /// @notice Entry point of `forge script`.
    /// @return implementation Address of the new logic contract.
    /// @return upgraded Whether the proxy now points to it.
    function run() external returns (address implementation, bool upgraded) {
        AssertDAO dao = AssertDAO(Deployments.proxy(vm));

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        (implementation, upgraded) = upgrade(dao, broadcaster);
        vm.stopBroadcast();

        Deployments.update(vm, implementation, AssertDAO(implementation).version());

        if (!upgraded) {
            console2.log("Upgrade pending. The head must send this call to the proxy:");
            console2.log("  proxy:", address(dao));
            console2.log("  head: ", dao.owner());
            console2.log("  data: ", vm.toString(abi.encodeCall(dao.upgradeToAndCall, (implementation, ""))));
        }
    }

    /// @notice Deploys the implementation and, if `broadcaster` is the head, points the proxy to it.
    /// @param dao The DAO to upgrade.
    /// @param broadcaster Account that sends the transactions.
    /// @return implementation Address of the new logic contract.
    /// @return upgraded Whether the proxy now points to it.
    function upgrade(AssertDAO dao, address broadcaster) public returns (address implementation, bool upgraded) {
        implementation = address(new AssertDAO());
        upgraded = broadcaster == dao.owner();
        if (!upgraded) return (implementation, false);

        dao.upgradeToAndCall(implementation, "");
        if (keccak256(bytes(dao.version())) != keccak256(bytes(AssertDAO(implementation).version()))) {
            revert PostUpgradeCheckFailed();
        }
    }
}
