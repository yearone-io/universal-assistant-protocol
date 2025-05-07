// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
import {ScreenerAssistantBase} from "./ScreenerAssistantBase.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

abstract contract ScreenerAssistantWithList is ScreenerAssistantBase {
    function fetchListName(
        address upAddress,
        bytes32 typeId,
        uint256 executionOrder
    ) public view returns (string memory) {
        bytes32 screenerListNameKey = LSP2Utils.generateMappingWithGroupingKey(
            bytes6(keccak256("UAPAddressListName")),
            bytes4(typeId),
            super.uint256ToBytes20(executionOrder)
        );
        return string(IERC725Y(upAddress).getData(screenerListNameKey));
    }
}