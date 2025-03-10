// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IScreenerAssistant} from "../IScreenerAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MockConfigurableScreenerAssistant is IScreenerAssistant, ERC165 {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IScreenerAssistant).interfaceId || super.supportsInterface(interfaceId);
    }

    function evaluate(
        bytes32 screenerConfigKey,
        address notifier,
        uint256 /* value */,
        bytes32 /* typeId */,
        bytes memory /* data */
    ) external view override returns (bool) {
        // Fetch configuration (assume encoded as bool: true/false)
        bytes memory config = IERC725Y(msg.sender).getData(screenerConfigKey);
        if (config.length == 0) return false;

        bool shouldReturn = abi.decode(config, (bool));
        return shouldReturn && notifier != address(0); // Additional check for non-zero notifier
    }
}