// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ScreenerAssistantBase } from "../screener-assistants/ScreenerAssistantBase.sol";


contract MockTrueScreenerAssistant is ScreenerAssistantBase {
    function evaluate(
        address /*screener address */,
        uint256 /*screener order */,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    ) external view returns (bool) {
        return true;
    }
}
