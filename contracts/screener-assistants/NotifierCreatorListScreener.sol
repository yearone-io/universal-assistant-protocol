// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ScreenerAssistantWithCreatorVerification} from "./ScreenerAssistantWithCreatorVerification.sol";

/**
 * @title NotifierCreatorListScreener
 * @author Universal Assistant Protocol
 * @notice Screener that verifies asset creators via LSP4/LSP12 and checks if verified creators are in an address list
 * @dev This screener performs multi-step verification:
 *      1. Fetches LSP4Creators[] from the notifier (asset)
 *      2. Verifies each creator has issued the asset by checking LSP12IssuedAssets[]
 *      3. Checks if at least one verified creator is in the configured address list
 *
 *      Configuration format: abi.encode(bool requireAllCreators, bool returnValueWhenInList)
 *      - requireAllCreators: If true, ALL creators must verify issuance; if false, at least ONE must verify
 *      - returnValueWhenInList: Return value when at least one verified creator is in the list
 */
contract NotifierCreatorListScreener is ScreenerAssistantWithCreatorVerification {
    error InvalidCreatorListConfig(bytes data);

    /**
     * @notice Evaluates whether the notifier passes the creator list screening
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

        // Decode configuration: (bool requireAllCreators, bool returnValueWhenInList)
        (bool requireAllCreators, bool returnValueWhenInList) = _decodeCreatorListConfig(configData);

        // Get verified creators from the notifier
        address[] memory verifiedCreators = getVerifiedCreators(notifier, requireAllCreators);

        // If no verified creators, return opposite of returnValueWhenInList
        if (verifiedCreators.length == 0) {
            return !returnValueWhenInList;
        }

        // Check if at least one verified creator is in the address list
        string memory listName = fetchListName(upAddress, typeId, screenerOrder);
        bool hasCreatorInList = false;

        for (uint256 i = 0; i < verifiedCreators.length; i++) {
            if (isAddressInList(upERC725Y, listName, verifiedCreators[i])) {
                hasCreatorInList = true;
                break;
            }
        }

        return hasCreatorInList ? returnValueWhenInList : !returnValueWhenInList;
    }

    /**
     * @dev Safely decodes creator list configuration
     * @param data The encoded configuration data
     * @return requireAllCreators Whether all creators must verify issuance
     * @return returnValueWhenInList The return value when a verified creator is in the list
     */
    function _decodeCreatorListConfig(bytes memory data) private pure returns (
        bool requireAllCreators,
        bool returnValueWhenInList
    ) {
        if (data.length == 0) {
            revert InvalidCreatorListConfig(data);
        }

        // Decode the tuple
        (requireAllCreators, returnValueWhenInList) = abi.decode(data, (bool, bool));
    }
}
