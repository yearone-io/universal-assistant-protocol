// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
import {ScreenerAssistantWithList} from "./ScreenerAssistantWithList.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

/**
 * @title ScreenerAssistantWithCreatorVerification
 * @author Universal Assistant Protocol
 * @notice Abstract base contract for screeners that verify asset creators via LSP4/LSP12
 * @dev Extends ScreenerAssistantWithList to provide creator verification functionality.
 *      This contract implements the logic to:
 *      1. Fetch creators from an asset's LSP4Creators[] array
 *      2. Verify that each creator has issued the asset by checking LSP12IssuedAssets[]
 *      3. Return only verified creators for further screening
 */
abstract contract ScreenerAssistantWithCreatorVerification is ScreenerAssistantWithList {
    // LSP4 Digital Asset Metadata - Creators Array
    // Same key used for both LSP4Creators[] and LSP12IssuedAssets[]
    bytes32 internal constant LSP4_CREATORS_ARRAY_KEY = 0x114bd03b3a46d48759680d81ebb2b414fda7d030a7105a851867accf1c2352e7;

    // LSP4 Creators Map prefix: LSP4CreatorsMap:<address>
    bytes10 internal constant LSP4_CREATORS_MAP_KEY_PREFIX = 0x6de85eaf5d982b4e5da0;

    // LSP12 Issued Assets uses the same keys as LSP4 Creators
    // LSP12IssuedAssets[] - same as LSP4_CREATORS_ARRAY_KEY
    // LSP12IssuedAssetsMap:<address> - same as LSP4_CREATORS_MAP_KEY_PREFIX

    /**
     * @dev Fetches the list of creator addresses from an asset's LSP4Creators[] array
     * @param notifierAddress The address of the asset to query
     * @return creators Array of creator addresses, empty if none exist
     */
    function getCreatorsFromAsset(
        address notifierAddress
    ) internal view returns (address[] memory creators) {
        IERC725Y assetERC725Y = IERC725Y(notifierAddress);

        // Get array length
        bytes memory creatorsLengthRaw = assetERC725Y.getData(LSP4_CREATORS_ARRAY_KEY);

        if (creatorsLengthRaw.length == 0) {
            return new address[](0);
        }

        uint256 creatorsLength = abi.decode(creatorsLengthRaw, (uint256));

        if (creatorsLength == 0) {
            return new address[](0);
        }

        // Fetch all creator addresses
        creators = new address[](creatorsLength);

        for (uint256 i = 0; i < creatorsLength; i++) {
            // Generate array element key: first 16 bytes of array key + index
            bytes32 creatorElementKey = bytes32(
                bytes.concat(
                    bytes16(LSP4_CREATORS_ARRAY_KEY),
                    bytes16(uint128(i))
                )
            );

            bytes memory creatorAddressRaw = assetERC725Y.getData(creatorElementKey);

            if (creatorAddressRaw.length >= 20) {
                creators[i] = abi.decode(creatorAddressRaw, (address));
            }
            // If decode fails, creators[i] remains address(0)
        }

        return creators;
    }

    /**
     * @dev Checks if a creator has issued the notifier by verifying LSP12IssuedAssetsMap
     * @param creatorAddress The creator's Universal Profile address
     * @param notifierAddress The asset address to check for
     * @return true if the creator has verified issuance, false otherwise
     */
    function isNotifierIssuedByCreator(
        address creatorAddress,
        address notifierAddress
    ) internal view returns (bool) {
        // Try to query the creator's profile for LSP12IssuedAssetsMap
        try IERC725Y(creatorAddress).getData(
            _generateLSP12IssuedAssetsMapKey(notifierAddress)
        ) returns (bytes memory mapValue) {

            // Verify mapping entry exists and has correct format (bytes4 + uint256 = 36 bytes)
            if (mapValue.length < 36) return false;

            // Decode the index from the mapping value
            // Format: bytes4 interfaceId + uint256 index
            bytes memory indexBytes = new bytes(32);
            for (uint256 i = 0; i < 32; i++) {
                indexBytes[i] = mapValue[i + 4];
            }
            uint256 entryIndex = abi.decode(indexBytes, (uint256));

            // Get the current array length for bounds validation
            bytes memory arrayLengthRaw = IERC725Y(creatorAddress).getData(LSP4_CREATORS_ARRAY_KEY);

            if (arrayLengthRaw.length == 0) return false;

            uint256 arrayLength = abi.decode(arrayLengthRaw, (uint256));

            // Prevent stale mapping attack: only valid if index < array length
            return entryIndex < arrayLength;

        } catch {
            // If any external call fails, treat as not issued
            return false;
        }
    }

    /**
     * @dev Gets the list of verified creators for a notifier
     * @param notifierAddress The asset address to check
     * @param requireAllCreators If true, returns empty array if ANY creator hasn't verified issuance
     *                          If false, returns only the creators who have verified
     * @return verifiedCreators Array of creator addresses that have verified issuance
     */
    function getVerifiedCreators(
        address notifierAddress,
        bool requireAllCreators
    ) internal view returns (address[] memory verifiedCreators) {
        // Get all creators from the asset
        address[] memory creators = getCreatorsFromAsset(notifierAddress);

        if (creators.length == 0) {
            return new address[](0);
        }

        // Track which creators have verified
        bool[] memory isVerified = new bool[](creators.length);
        uint256 verifiedCount = 0;

        for (uint256 i = 0; i < creators.length; i++) {
            if (creators[i] == address(0)) {
                // Skip null addresses
                continue;
            }

            if (isNotifierIssuedByCreator(creators[i], notifierAddress)) {
                isVerified[i] = true;
                verifiedCount++;
            } else if (requireAllCreators) {
                // If we require all creators and one hasn't verified, return empty
                return new address[](0);
            }
        }

        // Build the verified creators array
        verifiedCreators = new address[](verifiedCount);
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < creators.length; i++) {
            if (isVerified[i]) {
                verifiedCreators[currentIndex] = creators[i];
                currentIndex++;
            }
        }

        return verifiedCreators;
    }

    /**
     * @dev Generates the LSP12IssuedAssetsMap key for a given asset address
     * @param assetAddress The address to generate the map key for
     * @return The bytes32 key for LSP12IssuedAssetsMap:<address>
     */
    function _generateLSP12IssuedAssetsMapKey(
        address assetAddress
    ) private pure returns (bytes32) {
        return bytes32(
            bytes.concat(
                LSP4_CREATORS_MAP_KEY_PREFIX,
                bytes2(0),
                bytes20(assetAddress)
            )
        );
    }
}
