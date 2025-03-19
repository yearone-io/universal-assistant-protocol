// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import {IScreenerAssistant} from "../IScreenerAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title SafeAssetCurationScreener
 * @dev Screener Assistant that checks if the notifier is in a curated list stored as an LSP8IdentifiableDigitalAsset
 *      with an additional blocklist override and configurable return value, using mappings for efficiency.
 */
contract SafeAssetCurationScreener is IScreenerAssistant, ERC165 {
    event BlocklistEntryUpdated(address indexed executive, address indexed screener, address indexed item, bool isBlocked);

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
     * @dev Extracts executive and screener addresses from screenerConfigKey as bytes10.
     * @param screenerConfigKey The configuration key to parse.
     * @return executiveBytes The executive address as bytes10.
     * @return screenerBytes The screener address as bytes10.
     */
    function parseScreenerConfigKey(bytes32 screenerConfigKey) internal pure returns (bytes10 executiveBytes, bytes10 screenerBytes) {
        bytes memory keyBytes = abi.encode(screenerConfigKey);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            executiveBytes := mload(add(keyBytes, 44)) // Bytes 12-22 (offset 32 + 12)
            screenerBytes := mload(add(keyBytes, 54))  // Bytes 22-32 (offset 32 + 22)
        }
        return (executiveBytes, screenerBytes);
    }

    /**
     * @dev Generates the blocklist mapping key for a specific address.
     * @param executiveBytes The executive address as bytes10.
     * @param screenerBytes The screener address as bytes10.
     * @param itemAddress The address to check in the blocklist.
     * @return The bytes32 key for the blocklist entry.
     */
    function generateBlocklistMappingKey(
        bytes10 executiveBytes,
        bytes10 screenerBytes,
        address itemAddress
    ) internal pure returns (bytes32) {
        bytes32 firstWordHash = keccak256(bytes("UAPList"));
        bytes memory temporaryBytes = bytes.concat(
            bytes6(firstWordHash),
            bytes4(executiveBytes),
            bytes2(0),  // Padding to align with 32 bytes
            bytes10(screenerBytes),
            bytes10(bytes20(itemAddress))
        );
        return bytes32(temporaryBytes);
    }

    /**
     * @dev Sets or removes an address in the blocklist.
     * @param executiveAddress The executive address associated with this screener.
     * @param itemAddress The address to add or remove from the blocklist.
     * @param isBlocked True to add, false to remove.
     */
    function setBlocklistEntry(address executiveAddress, address itemAddress, bool isBlocked) public {
        IERC725Y upERC725Y = IERC725Y(msg.sender);
        bytes10 executiveBytes = bytes10(bytes20(executiveAddress));
        bytes10 screenerBytes = bytes10(bytes20(address(this)));
        bytes32 key = generateBlocklistMappingKey(executiveBytes, screenerBytes, itemAddress);
        upERC725Y.setData(key, isBlocked ? abi.encode(true) : abi.encodePacked());
        emit BlocklistEntryUpdated(executiveAddress, address(this), itemAddress, isBlocked);
    }

    /**
     * @dev Evaluates if the notifier is in the curated list stored under the provided screenerConfigKey,
     *      considering the blocklist override and return value configuration.
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
        address upAddress = msg.sender;
        IERC725Y upERC725Y = IERC725Y(upAddress);

        // Read core settings from the UP's ERC725Y data store
        bytes memory settingsData = upERC725Y.getData(screenerConfigKey);
        if (settingsData.length == 0) return false; // No configuration, deny by default

        // Decode core settings: curated list address and return value configuration
        (address curatedListAddress, bool returnValueWhenCurated) = abi.decode(settingsData, (address, bool));

        // Parse executive and screener addresses from screenerConfigKey
        (bytes10 executiveBytes, bytes10 screenerBytes) = parseScreenerConfigKey(screenerConfigKey);

        // Check blocklist using mapping
        bytes32 blocklistKey = generateBlocklistMappingKey(executiveBytes, screenerBytes, notifier);
        bytes memory blocklistValue = upERC725Y.getData(blocklistKey);
        bool isBlocked = blocklistValue.length > 0 && abi.decode(blocklistValue, (bool));

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