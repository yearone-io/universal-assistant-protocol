// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { ExecutiveAssistantBase } from "../ExecutiveAssistantBase.sol";

contract MockAssistant is ExecutiveAssistantBase {
    function execute(
        uint256 /*executionOrder*/, 
        address upAddress/*up address*/,
        address /*notifier*/,
        uint256 value,
        bytes32 /*typeId */,
        bytes memory /*data */
    )
        external
        override
        pure
        returns (uint256, address, uint256, bytes memory, bytes memory)
    {
        return (0, upAddress, value, "", "");
    }
}
