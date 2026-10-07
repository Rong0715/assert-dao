// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../../src/AssertDAO.sol";

/// @notice Stand-in for a future version: it appends one state variable, adds one function and bumps the version.
/// @custom:oz-upgrades-from AssertDAO
contract AssertDAOV2 is AssertDAO {
    uint256 public quorum;

    function initializeV2(uint256 quorum_) external reinitializer(2) {
        quorum = quorum_;
    }

    function version() external pure override returns (string memory) {
        return "2.0.0";
    }
}
