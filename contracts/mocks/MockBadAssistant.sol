// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { ExecutiveAssistantBase } from "../executive-assistants/ExecutiveAssistantBase.sol";


contract MockBadAssistant is ExecutiveAssistantBase {
    error AlwaysFalseError();
    
    uint256 private badOperationType = type(uint256).max; // Default to NO_OP
    bool private shouldUseRevert = true;

    function setBadOperationType(uint256 _operationType) external {
        badOperationType = _operationType;
        shouldUseRevert = false;
    }

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
        view
        returns (uint256, address, uint256, bytes memory, bytes memory)
    {
        if (shouldUseRevert) {
            revert AlwaysFalseError();
        } else {
            // Return a bad operation type for testing operation type validation
            return (
                badOperationType, 
                address(0), 
                0, 
                bytes(""), 
                bytes("")
            );
        }
    }
}
