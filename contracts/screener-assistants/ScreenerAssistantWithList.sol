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

    /**
     * @dev Safely checks if an address is in a list with proper bounds validation.
     * This function prevents vulnerabilities where stale mapping entries could exist
     * beyond the current array length.
     *
     * @param upERC725Y The ERC725Y interface to the Universal Profile
     * @param listName The name of the list (without "Map" or "[]" suffix)
     * @param targetAddress The address to check for membership
     * @return true if the address is in the list AND its index is within bounds, false otherwise
     */
    function isAddressInList(
        IERC725Y upERC725Y,
        string memory listName,
        address targetAddress
    ) internal view returns (bool) {
        // Get the mapping entry for this address
        bytes32 listKey = LSP2Utils.generateMappingKey(
            string.concat(listName, "Map"),
            targetAddress
        );
        bytes memory listValue = upERC725Y.getData(listKey);

        // Verify mapping entry exists and has correct format (bytes4 + uint256 = 36 bytes)
        if (listValue.length < 36) return false;

        // Decode the index from the mapping value
        // Format: bytes4 interfaceId + uint256 index
        // Extract bytes 4-35 (the uint256 index portion)
        bytes memory indexBytes = new bytes(32);
        for (uint256 i = 0; i < 32; i++) {
            indexBytes[i] = listValue[i + 4];
        }
        uint256 entryIndex = abi.decode(indexBytes, (uint256));

        // Get the current list length
        bytes32 listLengthKey = LSP2Utils.generateArrayKey(string.concat(listName, "[]"));
        bytes memory listLengthRaw = upERC725Y.getData(listLengthKey);

        if (listLengthRaw.length == 0) return false;

        uint256 listLength = abi.decode(listLengthRaw, (uint256));

        // Only consider the entry valid if it's within the current list bounds
        return entryIndex < listLength;
    }
}