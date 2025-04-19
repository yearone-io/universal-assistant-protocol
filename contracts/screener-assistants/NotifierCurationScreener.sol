// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";
import {ScreenerAssistantWithList} from "../screener-assistants/ScreenerAssistantWithList.sol";

/**
 * @title NotifierCurationScreener
 * @dev Screener Assistant that checks if the notifier is in a curated list stored as an LSP8IdentifiableDigitalAsset
 *      with an additional blocklist override and configurable return value, using mappings for efficiency.
 */
contract NotifierCurationScreener is ScreenerAssistantWithList {
    function evaluate(
        address screenerAddress,
        uint256 screenerOrder,
        address notifier,
        uint256 /* value */,
        bytes32 typeId,
        bytes memory /* lsp1Data */
    ) external view override returns (bool result) {
        // Fetch config
        address upAddress = msg.sender;
        IERC725Y upERC725Y = IERC725Y(upAddress);
        (,,bytes memory configData) = fetchConfiguration(upAddress, screenerAddress, typeId, screenerOrder);
        if (configData.length == 0) return false;

        // Decode core settings: curated list address and return value configuration
        (address curatedListAddress, bool returnValueWhenCurated) = abi.decode(configData, (address, bool));

        // Check list
        string memory blocklistName = fetchListName(upAddress, typeId, screenerOrder);
        bytes32 listKey = LSP2Utils.generateMappingKey(
            string.concat(blocklistName, "Map"),
            notifier
        );
        bytes memory blocklistListValue = upERC725Y.getData(listKey);
        bool isBlocked = blocklistListValue.length > 0;

        // If blocked, return opposite of configured value
        if (isBlocked) {
            return !returnValueWhenCurated;
        }

        // Check if notifier is in curated list
        bool isCurated = isAddressInCuratedList(curatedListAddress, notifier);
        return isCurated ? returnValueWhenCurated : !returnValueWhenCurated;
    }

    /**
     * @dev Checks if a given address is in the curated list.
     * @param curatedListAddress The address of the curated list contract (LSP8IdentifiableDigitalAsset).
     * @param targetAddress The address to check for membership in the curated list.
     * @return True if the address is in the curated list, false otherwise.
     */
    function isAddressInCuratedList(address curatedListAddress, address targetAddress) internal view returns (bool) {
        bytes32 tokenId = bytes32(uint256(uint160(targetAddress)));
        ILSP8IdentifiableDigitalAsset curatedList = ILSP8IdentifiableDigitalAsset(curatedListAddress);
        try curatedList.tokenOwnerOf(tokenId) {
            return true;
        } catch (bytes memory) {
            return false;
        }
    }
}