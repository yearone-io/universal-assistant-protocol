// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IExecutiveAssistant} from "../IExecutiveAssistant.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MockComplexExecutiveAssistant is IExecutiveAssistant, ERC165 {
    event Executed(address upAddress, uint256 deductedValue, bytes newData);

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IExecutiveAssistant).interfaceId || super.supportsInterface(interfaceId);
    }

    function execute(
        address upAddress,
        address /* notifier */,
        uint256 value,
        bytes32 /* typeId */,
        bytes memory data
    ) external override returns (uint256, address, uint256, bytes memory, bytes memory) {
        // Simulate deducting a small fee (e.g., 10% of value, but not exceeding value)
        uint256 deductedValue = value > 0 ? (value * 10) / 100 : 0; // 10% fee
        if (deductedValue > value) deductedValue = value; // Ensure we don't deduct more than sent

        // Modify currentData by appending a marker
        bytes memory newData = abi.encodePacked(data, bytes4(keccak256("Processed")));

        // Emit event for verification
        emit Executed(upAddress, deductedValue, newData);

        // Return: no operation, no target, reduced value, no execData, new value and data
        return (0, address(0), deductedValue, new bytes(0), abi.encode(value - deductedValue, newData));
    }
}