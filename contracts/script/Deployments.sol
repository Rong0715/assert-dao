// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";

/// @title Deployments
/// @author ASSERT Association
/// @notice Reads and writes `deployments/<chainId>.json`, the record of what runs where.
library Deployments {
    /// @notice Records a fresh deployment.
    /// @param vm Forge cheatcodes.
    /// @param proxy_ Address of the DAO.
    /// @param implementation Address of the logic contract behind it.
    /// @param version Version reported by the implementation.
    function write(Vm vm, address proxy_, address implementation, string memory version) internal {
        _write(vm, proxy_, implementation, version, block.number);
    }

    /// @notice Records a new implementation for the DAO of the current chain.
    /// @param vm Forge cheatcodes.
    /// @param implementation Address of the new logic contract.
    /// @param version Version reported by the new implementation.
    function update(Vm vm, address implementation, string memory version) internal {
        _write(vm, proxy(vm), implementation, version, startBlock(vm));
    }

    /// @notice Path of the record of the current chain.
    /// @param vm Forge cheatcodes.
    /// @return The path, relative to the project root.
    function path(Vm vm) internal view returns (string memory) {
        return string.concat("deployments/", vm.toString(block.chainid), ".json");
    }

    /// @notice Whether the current chain has a record.
    /// @param vm Forge cheatcodes.
    /// @return True if the DAO was deployed on this chain.
    function exists(Vm vm) internal view returns (bool) {
        return vm.isFile(path(vm));
    }

    /// @notice Address of the DAO on the current chain.
    /// @param vm Forge cheatcodes.
    /// @return The proxy address.
    function proxy(Vm vm) internal view returns (address) {
        // forge-lint: disable-next-line(unsafe-cheatcode)
        return vm.parseJsonAddress(vm.readFile(path(vm)), ".proxy");
    }

    /// @notice Block from which the DAO exists on the current chain.
    /// @param vm Forge cheatcodes.
    /// @return The block number.
    function startBlock(Vm vm) internal view returns (uint256) {
        // forge-lint: disable-next-line(unsafe-cheatcode)
        return vm.parseJsonUint(vm.readFile(path(vm)), ".startBlock");
    }

    function _write(Vm vm, address proxy_, address implementation, string memory version, uint256 startBlock_) private {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "proxy", proxy_);
        vm.serializeAddress(key, "implementation", implementation);
        vm.serializeString(key, "version", version);
        string memory json = vm.serializeUint(key, "startBlock", startBlock_);
        vm.writeJson(json, path(vm));
    }
}
