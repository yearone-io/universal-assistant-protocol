// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import {IScreenerAssistant} from "../IScreenerAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";
import {LSP8Enumerable} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/extensions/LSP8Enumerable.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title CurationChecker
 * @dev Screener Assistant that checks if the notifier is in a curated list stored as an LSP8IdentifiableDigitalAsset.
 */
contract CurationChecker is IScreenerAssistant, ERC165 {
    /**
     * @dev Check which interfaces this contract supports.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return interfaceId == type(IScreenerAssistant).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Evaluates if the notifier is in the curated list stored under the provided screenerConfigKey.
     * @param screenerConfigKey The pre-generated key for fetching the screener's configuration.
     * @param notifier The address that triggered the URD on the UP.
     * @return result A boolean indicating whether the condition evaluated to true or false.
     */
    function evaluate(
        bytes32 screenerConfigKey,
        address notifier,
        uint256 /* value */,
        bytes32 /* typeId */,
        bytes memory /* data */
    ) external view override returns (bool result) {
        // Since we're called via delegatecall, msg.sender is the UP's address
        address upAddress = msg.sender;

        // Read settings from the UP's ERC725Y data store using the provided key
        IERC725Y upERC725Y = IERC725Y(upAddress);
        bytes memory settingsData = upERC725Y.getData(screenerConfigKey);

        // Decode the settingsData to get the curatedListAddress
        // Assume settingsData is encoded as: abi.encode(address curatedListAddress)
        if (settingsData.length == 0) return false; // No configuration, deny by default
        address curatedListAddress = abi.decode(settingsData, (address));

        // Check if the notifier is in the curated list
        result = isAddressInCuratedList(curatedListAddress, notifier);

        return result;
    }


    function isAddressInCuratedList(address curatedListAddress, address targetAddress) public view returns (bool) {
        // Pad the target address with zeros to create the token ID
        bytes32 tokenId = bytes32(uint256(uint160(targetAddress)));
        
        // Instantiate the curated list contract instance
        ILSP8IdentifiableDigitalAsset curatedList = ILSP8IdentifiableDigitalAsset(curatedListAddress);
        
        // Check if the token exists
        try curatedList.tokenOwnerOf(tokenId) {
            return true;
        } catch (bytes memory) {
            return false;
        }
    }
}