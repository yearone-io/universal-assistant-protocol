// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ScreenerAssistantBase } from "../screener-assistants/ScreenerAssistantBase.sol";

contract MockConfigurableScreenerAssistant is ScreenerAssistantBase {
    function evaluate(
        address profile,
        address screenerAddress,
        uint256 screenerOrder,
        address notifier,
        uint256 /* value */,
        bytes32 typeId,
        bytes memory /* data */
    ) external view returns (bool) {
        address upAddress = profile;
        // Fetch configuration (assume encoded as bool: true/false)
        (,,bytes memory configData) = fetchConfiguration(upAddress, screenerAddress, typeId, screenerOrder);
        if (configData.length == 0) return false;

        bool shouldReturn = abi.decode(configData, (bool));
        return shouldReturn && notifier != address(0); // Additional check for non-zero notifier
    }
}