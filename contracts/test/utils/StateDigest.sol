// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssertDAO} from "../../src/AssertDAO.sol";

/// @notice Fingerprint of everything a DAO exposes: head, members, rounds, proposals and ballots.
library StateDigest {
    function ofDao(AssertDAO dao) internal view returns (bytes32) {
        uint256 rounds = dao.roundCount();
        bytes32 digest = keccak256(abi.encode(dao.owner(), dao.pendingOwner(), dao.getMembers(), rounds));
        for (uint256 roundId = 1; roundId <= rounds; ++roundId) {
            digest = keccak256(abi.encode(digest, ofRound(dao, roundId)));
        }
        return digest;
    }

    function ofRound(AssertDAO dao, uint256 roundId) internal view returns (bytes32) {
        return keccak256(abi.encode(dao.getRound(roundId), dao.getProposals(roundId), dao.getBallots(roundId)));
    }
}
