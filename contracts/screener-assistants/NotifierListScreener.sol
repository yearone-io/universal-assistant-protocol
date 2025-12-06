// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ScreenerAssistantWithList} from "../screener-assistants/ScreenerAssistantWithList.sol";

/**
 * @title NotifierListScreener
 * @dev Screener Assistant that checks if the notifier is in a list of addresses
 */
contract NotifierListScreener is ScreenerAssistantWithList {
    function evaluate(
        address profile,
        address screenerAddress,
        uint256 screenerOrder,
        address notifier,
        uint256 /* value */,
        bytes32 typeId,
        bytes memory /* lsp1Data */
    ) external view override returns (bool) {
        // Fetch config
        address upAddress = profile;
        IERC725Y upERC725Y = IERC725Y(upAddress);
        (,,bytes memory configData) = fetchConfiguration(upAddress, screenerAddress, typeId, screenerOrder);
        if (configData.length == 0) return false;
        bool returnValueWhenInList = _safeDecodeBoolean(configData);

        // Check list
        string memory listName = fetchListName(upAddress, typeId, screenerOrder);
        bytes32 listKey = LSP2Utils.generateMappingKey(
            string.concat(listName, "Map"),
            notifier
        );
        bytes memory notifierListValue = upERC725Y.getData(listKey);

        // Verify mapping entry exists and is within list bounds
        bool isInList = false;
        if (notifierListValue.length >= 36) {
            // Decode the index from the mapping value
            // Format: bytes4 interfaceId + uint256 index = 36 bytes total
            // Extract bytes 4-35 (the uint256 index portion)
            bytes memory indexBytes = new bytes(32);
            for (uint256 i = 0; i < 32; i++) {
                indexBytes[i] = notifierListValue[i + 4];
            }
            uint256 entryIndex = abi.decode(indexBytes, (uint256));

            // Get the current list length
            bytes32 listLengthKey = LSP2Utils.generateArrayKey(string.concat(listName, "[]"));
            bytes memory listLengthRaw = upERC725Y.getData(listLengthKey);

            if (listLengthRaw.length > 0) {
                uint256 listLength = abi.decode(listLengthRaw, (uint256));
                // Only consider the entry valid if it's within the current list bounds
                isInList = entryIndex < listLength;
            }
        }

        return isInList ? returnValueWhenInList : !returnValueWhenInList;
    }
}
