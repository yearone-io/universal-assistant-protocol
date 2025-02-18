// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { IExecutiveAssistant } from "../IExecutiveAssistant.sol";

contract MockAssistant is IExecutiveAssistant {
    function execute(
        address upAddress/*up address*/,
        address /*notifier*/,
        uint256 value,
        bytes32 /*typeId */,
        bytes memory /*data */
    )
        external
        override
        pure
        returns (bytes memory)
    {
        return abi.encode(0, upAddress, value, "");
    }
}
