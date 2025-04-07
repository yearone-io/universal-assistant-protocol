// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { ExecutiveAssistantBase } from "../ExecutiveAssistantBase.sol";


contract MockBadAssistant is ExecutiveAssistantBase {
    error AlwaysFalseError();

    function execute(
        uint256 /*executionOrder*/,
        address /*upAddress */,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    )
        external
        override
        pure
        returns (uint256, address, uint256, bytes memory, bytes memory)
    {
        revert AlwaysFalseError();
    }
}
