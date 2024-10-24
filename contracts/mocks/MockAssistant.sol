// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../IExecutiveAssistant.sol";

contract MockAssistant is IExecutiveAssistant {
    function getExecuteSelector() external pure returns (bytes4) {
        return this.execute.selector;
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
        return abi.encode(0, "0x");
    }
}
