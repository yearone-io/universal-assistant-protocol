// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";
import {ScreenerAssistantWithCreatorVerification} from "./ScreenerAssistantWithCreatorVerification.sol";

/**
 * @title NotifierCreatorCurationScreener
 * @author Universal Assistant Protocol
 * @notice Screener that verifies asset creators via LSP4/LSP12 and checks if verified creators are curated in an LSP8 list
 * @dev This screener performs multi-step verification:
 *      1. Checks if any creator is on the blocklist (early rejection)
 *      2. Fetches LSP4Creators[] from the notifier (asset)
 *      3. Verifies each creator has issued the asset by checking LSP12IssuedAssets[]
 *      4. Checks if at least one verified creator is curated in the LSP8 token list
 *
 *      Configuration format: abi.encode(address curatedListAddress, bool requireAllCreators, bool returnValueWhenCurated)
 *      - curatedListAddress: LSP8 token contract representing the curated list
 *      - requireAllCreators: If true, ALL creators must verify issuance; if false, at least ONE must verify
 *      - returnValueWhenCurated: Return value when at least one verified creator is curated
 *
 *      Optional blocklist: UAPAddressListName:<typeId>:<executionOrder> can specify a blocklist name
 */
contract NotifierCreatorCurationScreener is ScreenerAssistantWithCreatorVerification {
    error InvalidCreatorCurationConfig(bytes data);

    /**
     * @notice Evaluates whether the notifier passes the creator curation screening
     * @param profile The Universal Profile address
     * @param screenerAddress The address of this screener contract
     * @param screenerOrder The execution order of this screener
     * @param notifier The address that triggered the universal receiver (the asset)
     * @param typeId The type ID of the notification
     * @return true if screening passes, false otherwise
     */
    function evaluate(
        address profile,
        address screenerAddress,
        uint256 screenerOrder,
        address notifier,
        uint256 /* value */,
        bytes32 typeId,
        bytes memory /* lsp1Data */
    ) external view override returns (bool) {
        // Fetch configuration
        address upAddress = profile;
        IERC725Y upERC725Y = IERC725Y(upAddress);
        (,,bytes memory configData) = fetchConfiguration(upAddress, screenerAddress, typeId, screenerOrder);

        if (configData.length == 0) return false;

        // Decode configuration: (address curatedListAddress, bool requireAllCreators, bool returnValueWhenCurated)
        (address curatedListAddress, bool requireAllCreators, bool returnValueWhenCurated) =
            _decodeCreatorCurationConfig(configData);

        // First, check blocklist - if ANY creator is blocklisted, reject immediately
        string memory blocklistName = fetchListName(upAddress, typeId, screenerOrder);
        address[] memory allCreators = getCreatorsFromAsset(notifier);

        for (uint256 i = 0; i < allCreators.length; i++) {
            if (allCreators[i] == address(0)) continue;

            if (isAddressInList(upERC725Y, blocklistName, allCreators[i])) {
                // Creator is blocklisted, reject
                return !returnValueWhenCurated;
            }
        }

        // Get verified creators (those who have issued the asset)
        address[] memory verifiedCreators = getVerifiedCreators(notifier, requireAllCreators);

        // If no verified creators, return opposite of returnValueWhenCurated
        if (verifiedCreators.length == 0) {
            return !returnValueWhenCurated;
        }

        // Check if at least one verified creator is in the curated LSP8 list
        bool hasCreatorInCuratedList = false;

        for (uint256 i = 0; i < verifiedCreators.length; i++) {
            if (isAddressInCuratedList(curatedListAddress, verifiedCreators[i])) {
                hasCreatorInCuratedList = true;
                break;
            }
        }

        return hasCreatorInCuratedList ? returnValueWhenCurated : !returnValueWhenCurated;
    }

    /**
     * @dev Checks if a given address is in the curated LSP8 list
     * @param curatedListAddress The address of the curated list contract (LSP8IdentifiableDigitalAsset)
     * @param targetAddress The address to check for membership in the curated list
     * @return true if the address is in the curated list, false otherwise
     */
    function isAddressInCuratedList(
        address curatedListAddress,
        address targetAddress
    ) internal view returns (bool) {
        bytes32 tokenId = bytes32(uint256(uint160(targetAddress)));
        ILSP8IdentifiableDigitalAsset curatedList = ILSP8IdentifiableDigitalAsset(curatedListAddress);

        try curatedList.tokenOwnerOf(tokenId) {
            return true;
        } catch (bytes memory) {
            return false;
        }
    }

    /**
     * @dev Safely decodes creator curation configuration
     * @param data The encoded configuration data
     * @return curatedListAddress The LSP8 curated list address
     * @return requireAllCreators Whether all creators must verify issuance
     * @return returnValueWhenCurated The return value when a verified creator is curated
     */
    function _decodeCreatorCurationConfig(bytes memory data) private pure returns (
        address curatedListAddress,
        bool requireAllCreators,
        bool returnValueWhenCurated
    ) {
        if (data.length == 0) {
            revert InvalidCreatorCurationConfig(data);
        }

        // Decode the tuple
        (curatedListAddress, requireAllCreators, returnValueWhenCurated) =
            abi.decode(data, (address, bool, bool));
    }
}
