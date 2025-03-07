// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IScreenerAssistant } from  "../IScreenerAssistant.sol";

import "hardhat/console.sol";

contract MockFalseScreenerAssistant is IScreenerAssistant {
    function evaluate(
        bytes32 /*screener config key */,
        address /*notifier */,
        uint256 /*value */,
        bytes32 /*typeId */,
        bytes memory /*data */
    ) external view override(IScreenerAssistant) returns (bool) {
        console.log("MockFalseScreenerAssistant: evaluate() called");
        return false;
    }
}
