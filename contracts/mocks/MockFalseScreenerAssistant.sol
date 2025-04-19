// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ScreenerAssistantBase } from "../screener-assistants/ScreenerAssistantBase.sol";

contract MockFalseScreenerAssistant is ScreenerAssistantBase {
    function evaluate(
        address /*screenerAddress*/,
        uint256 /*screenerOrder*/,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    ) external view returns (bool) {
        return false;
    }
}
