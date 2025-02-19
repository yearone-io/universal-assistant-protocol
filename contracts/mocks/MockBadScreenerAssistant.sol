// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IScreenerAssistant } from "../IScreenerAssistant.sol";

contract MockBadScreenerAssistant is IScreenerAssistant {
    error AlwaysFalseError();

    function evaluate(
        address /*filterAddress */,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    ) external override(IScreenerAssistant) returns (bool) {
        revert AlwaysFalseError();
    }
}
