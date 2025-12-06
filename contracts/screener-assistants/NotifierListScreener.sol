// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

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

        // Check list with proper bounds validation
        string memory listName = fetchListName(upAddress, typeId, screenerOrder);
        bool isInList = isAddressInList(upERC725Y, listName, notifier);

        return isInList ? returnValueWhenInList : !returnValueWhenInList;
    }
}
