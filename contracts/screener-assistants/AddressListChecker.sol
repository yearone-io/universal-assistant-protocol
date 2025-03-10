// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Interfaces
import {IScreenerAssistant} from "../IScreenerAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title AddressListChecker
 * @dev Screener Assistant that checks if the notifier is in an allowed addresses list stored under a screenerConfigKey.
 */
contract AddressListChecker is IScreenerAssistant, ERC165 {
    error InvalidEncodedData();
    /**
     * @dev Check which interfaces this contract supports.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IScreenerAssistant).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Evaluates if the notifier is in the allowed addresses list stored under the provided screenerConfigKey.
     * @param screenerConfigKey The pre-generated key for fetching the screener's configuration.
     * @param notifier The address to check against the allowed list.
     * @return result True if notifier is in the allowed list, false otherwise.
     */
    function evaluate(
        bytes32 screenerConfigKey,
        address notifier,
        uint256 /* value */,
        bytes32 /* typeId */,
        bytes memory /* data */
    ) external view override returns (bool) {
        // Fetch the configuration data from the UP using the provided key
        bytes memory configData = IERC725Y(msg.sender).getData(screenerConfigKey);
        if (configData.length == 0) return false; // No configuration, deny by default

        // Decode the allowed addresses list
        address[] memory allowedAddresses = customDecodeAddresses(configData);
        for (uint256 i = 0; i < allowedAddresses.length; i++) {
            if (allowedAddresses[i] == notifier) return true; // Notifier found in the list
        }
        return false; // Notifier not found
    }

    /**
     * @dev Decodes a bytes array into an array of addresses, matching the core contract's format.
     * @param encoded The encoded bytes array containing the number of addresses followed by their 20-byte values.
     * @return An array of addresses.
     */
    function customDecodeAddresses(bytes memory encoded) internal pure returns (address[] memory) {
        if (encoded.length < 2) revert InvalidEncodedData();
        uint16 numAddresses;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            numAddresses := shr(240, mload(add(encoded, 32)))
        }
        address[] memory addresses = new address[](numAddresses);
        for (uint256 i = 0; i < numAddresses; i++) {
            address addr;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                addr := shr(96, mload(add(encoded, add(34, mul(i, 20)))))
            }
            addresses[i] = addr;
        }
        return addresses;
    }
}