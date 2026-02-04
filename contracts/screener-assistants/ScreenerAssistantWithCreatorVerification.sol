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
    bytes32 internal constant LSP4_CREATORS_ARRAY_KEY = 0x114bd03b3a46d48759680d81ebb2b414fda7d030a7105a851867accf1c2352e7;

    // LSP12 Issued Assets
    bytes32 internal constant LSP12_ISSUED_ASSETS_ARRAY_KEY = 0x7c8c3416d6cda87cd42c71ea1843df28ac4850354f988d55ee2eaa47b6dc05cd;
    // LSP12 Issued Assets Map prefix: LSP12IssuedAssetsMap:<address>
    bytes12 internal constant LSP12_ISSUED_ASSETS_MAP_KEY_PREFIX = 0x74ac2555c10b9349e78f0000;

    /**
     * @dev Fetches the list of creator addresses from an asset's LSP4Creators[] array
     * @param notifierAddress The address of the asset to query
     * @return creators Array of creator addresses, empty if none exist
     *
     * @notice This function is protected with try-catch blocks to handle assets that
     *         do not implement the IERC725Y interface. If getData() calls fail, the
     *         function returns an empty array instead of reverting, allowing screeners
     *         to gracefully handle non-compliant tokens.
     */
    function getCreatorsFromAsset(
        address notifierAddress
    ) internal view returns (address[] memory creators) {
        // Wrap the entire getData flow in try-catch to handle non-ERC725Y contracts
        try IERC725Y(notifierAddress).getData(LSP4_CREATORS_ARRAY_KEY)
            returns (bytes memory creatorsLengthRaw) {

            if (creatorsLengthRaw.length == 0) {
                return new address[](0);
            }

            uint256 creatorsLength = _decodeLSP2ArrayLength(creatorsLengthRaw);

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

                // Wrap each element fetch in try-catch as well
                try IERC725Y(notifierAddress).getData(creatorElementKey)
                    returns (bytes memory creatorAddressRaw) {

                    if (creatorAddressRaw.length == 32) {
                        // Standard ERC725Y encoding: address stored as 32 bytes
                        creators[i] = address(uint160(uint256(bytes32(creatorAddressRaw))));
                    } else if (creatorAddressRaw.length == 20) {
                        // Edge case: raw 20-byte address
                        creators[i] = address(bytes20(creatorAddressRaw));
                    }
                    // If length is invalid, creators[i] remains address(0)

                } catch {
                    // Element fetch failed, leave as address(0)
                    // This handles individual getData failures
                }
            }

            return creators;

        } catch {
            // Contract doesn't support getData() or reverted
            // Return empty array - treat as no creators
            // This prevents screener reverts when processing non-ERC725Y tokens
            return new address[](0);
        }
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

            // Verify mapping entry exists and has correct format:
            // LSP2 map value for LSP12IssuedAssetsMap is (bytes4,uint128) = 20 bytes
            // Some implementations may store (bytes4,uint256) = 36 bytes
            (bool ok, uint256 entryIndex) = _decodeLSP2MapIndex(mapValue);
            if (!ok) return false;

            // Get the current array length for bounds validation
            bytes memory arrayLengthRaw = IERC725Y(creatorAddress).getData(LSP12_ISSUED_ASSETS_ARRAY_KEY);

            if (arrayLengthRaw.length == 0) return false;

            uint256 arrayLength = _decodeLSP2ArrayLength(arrayLengthRaw);
            if (arrayLength == 0) return false;

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
                LSP12_ISSUED_ASSETS_MAP_KEY_PREFIX,
                bytes20(assetAddress)
            )
        );
    }

    /**
     * @dev Decode LSP2 array length.
     * LSP2 length is uint128 (16 bytes). Some legacy data may be uint256 (32 bytes).
     */
    function _decodeLSP2ArrayLength(bytes memory raw) internal pure returns (uint256) {
        if (raw.length == 0) return 0;
        uint256 value;
        assembly {
            value := mload(add(raw, 0x20))
        }
        if (raw.length == 16) {
            return value >> 128;
        }
        if (raw.length == 32) {
            return value;
        }
        return 0;
    }

    /**
     * @dev Decode LSP2 map value index.
     * Supports (bytes4,uint128) = 20 bytes and legacy (bytes4,uint256) = 36 bytes.
     */
    function _decodeLSP2MapIndex(
        bytes memory raw
    ) internal pure returns (bool ok, uint256 index) {
        if (raw.length == 20) {
            uint256 value;
            assembly {
                value := mload(add(raw, 0x24))
            }
            return (true, value >> 128);
        }
        if (raw.length == 36) {
            uint256 value;
            assembly {
                value := mload(add(raw, 0x24))
            }
            return (true, value);
        }
        return (false, 0);
    }
}
