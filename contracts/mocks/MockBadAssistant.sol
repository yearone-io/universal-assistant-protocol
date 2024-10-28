// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../IExecutiveAssistant.sol";
import {console} from "hardhat/console.sol";

contract MockBadAssistant is IExecutiveAssistant {
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
        require(false);
    }
}
