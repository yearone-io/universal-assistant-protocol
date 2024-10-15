// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import { IScreenerAssistant } from "./IScreenerAssistant.sol";
import { IERC725Y } from '@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol';
import { ILSP8IdentifiableDigitalAsset } from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";

// Utils
import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';

contract CuratedListFilter is IScreenerAssistant, ERC165 {
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
     * @dev The evaluate function called by URDuap via delegatecall.
     * @param filterAddress The address of the Filter contract.
     * @param notifier The address that triggered the URD on the UP.
     * @return result A boolean indicating whether the condition evaluated to true or false.
     */
    function evaluate(
        address filterAddress,
        address notifier,
        uint256 ,
        bytes32 ,
        bytes memory
    ) public view override returns (bool result) {
        // Since we're called via delegatecall, msg.sender is the UP's address.
        address upAddress = msg.sender;

        // Read settings from the UP's ERC725Y data store.
        IERC725Y upERC725Y = IERC725Y(upAddress);

        // Generate the key for filter instructions: "UAPFilterInstructions:<filterAddress>"
        bytes32 filterInstructionsKey = generateFilterInstructionsKey(filterAddress);

        bytes memory settingsData = upERC725Y.getData(filterInstructionsKey);

        // Decode the settingsData to get the curatedListAddress.
        // Assume settingsData is encoded as: abi.encode(address curatedListAddress)
        address curatedListAddress = abi.decode(settingsData, (address));

        // Check if the notifier is in the curated list
        result = isAddressInCuratedList(curatedListAddress, notifier);

        return result;
    }

    /**
     * @dev Helper function to generate the filter instructions key.
     * @param filterAddress The address of the filter.
     * @return The bytes32 key.
     */
    function generateFilterInstructionsKey(address filterAddress) internal pure returns (bytes32) {
        // The key is: keccak256("UAPFilterInstructions") + first 20 bytes of filterAddress
        return bytes32(abi.encodePacked(bytes10(keccak256("UAPFilterInstructions")), bytes20(filterAddress)));
    }

    /**
     * @dev Checks if a given address is in the curated list.
     * @param curatedListAddress The address of the curated list contract.
     * @param targetAddress The address to check for membership in the curated list.
     * @return True if the address is in the curated list, false otherwise.
     */
    function isAddressInCuratedList(address curatedListAddress, address targetAddress) internal view returns (bool) {
        // Pad the target address with zeros to create the token ID
        bytes32 tokenId = bytes32(uint256(uint160(targetAddress)));
        
        // Instantiate the curated list contract instance
        ILSP8IdentifiableDigitalAsset curatedList = ILSP8IdentifiableDigitalAsset(curatedListAddress);
        
        // Check if the token exists (i.e., is minted)
        try curatedList.tokenOwnerOf(tokenId) returns (address owner) {
            // If the token exists, return true
            return true;
        } catch {
            // If the token does not exist, return false
            return false;
        }
    }
}
