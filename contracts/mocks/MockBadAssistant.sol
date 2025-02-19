// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IExecutiveAssistant } from "../IExecutiveAssistant.sol";


contract MockBadAssistant is IExecutiveAssistant {
    error AlwaysFalseError();
    function execute(
        address /*assistantAddress */,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    )
        external
        override
        returns (uint256, address, uint256, bytes memory, bytes memory)
    {
        revert AlwaysFalseError();
    }
}
