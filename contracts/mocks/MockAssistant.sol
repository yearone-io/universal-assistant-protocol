// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../IExecutiveAssistant.sol";

contract MockAssistant is IExecutiveAssistant {
    bytes private returnData;

    function setExecuteReturnValues(bytes memory _data) public {
        returnData = _data;
    }

    function execute(
        address assistantAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    )
        external
        override
        returns (bytes memory)
    {
        return returnData;
    }
}
