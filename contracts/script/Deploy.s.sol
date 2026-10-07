// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../src/AssertDAO.sol";
import {IAssertDAO} from "../src/IAssertDAO.sol";
import {Deployments} from "./Deployments.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script} from "forge-std/Script.sol";

/// @title Deploy
/// @author ASSERT Association
/// @notice Deploys the implementation and its proxy, initialized from `config/<chainId>.json`, then records the
/// addresses in `deployments/<chainId>.json`.
/// @dev The same code path serves the test suite, the local chain, staging and production: only the config differs.
contract Deploy is Script {
    /// @dev Shape of an entry of the `members` array of a config file.
    string private constant _MEMBER_TYPE = "Member(address account,string handle)";

    /// @notice The config file names no head.
    error HeadNotConfigured();

    /// @notice The deployed proxy does not report the configured state.
    error PostDeployCheckFailed();

    /// @notice Entry point of `forge script`.
    /// @return proxy Address of the DAO.
    /// @return implementation Address of the logic contract behind it.
    function run() external returns (address proxy, address implementation) {
        (address head, IAssertDAO.Member[] memory founders) =
            readConfig(string.concat("config/", vm.toString(block.chainid), ".json"));

        vm.startBroadcast();
        (proxy, implementation) = deploy(head, founders);
        vm.stopBroadcast();

        Deployments.write(vm, proxy, implementation, AssertDAO(proxy).version());
    }

    /// @notice Deploys and initializes the DAO, then checks that it reports what was asked for.
    /// @param head Head of the association.
    /// @param founders Initial members.
    /// @return proxy Address of the DAO.
    /// @return implementation Address of the logic contract behind it.
    function deploy(address head, IAssertDAO.Member[] memory founders)
        public
        returns (address proxy, address implementation)
    {
        implementation = address(new AssertDAO());
        proxy = address(new ERC1967Proxy(implementation, abi.encodeCall(AssertDAO.initialize, (head, founders))));

        AssertDAO dao = AssertDAO(proxy);
        if (dao.owner() != head || dao.memberCount() != founders.length) revert PostDeployCheckFailed();
    }

    /// @notice Reads the head and the founding members from a config file.
    /// @param path Path of the file, relative to the project root.
    /// @return head Head of the association.
    /// @return founders Initial members.
    function readConfig(string memory path) public view returns (address head, IAssertDAO.Member[] memory founders) {
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(path);

        head = vm.parseJsonAddress(json, ".head");
        if (head == address(0)) revert HeadNotConfigured();

        founders = abi.decode(vm.parseJsonTypeArray(json, ".members", _MEMBER_TYPE), (IAssertDAO.Member[]));
    }
}
