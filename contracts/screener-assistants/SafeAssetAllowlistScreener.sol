// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Interfaces
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IScreenerAssistant} from "../IScreenerAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";


/**
 * @title SafeAssetAllowlistScreener
 * @dev Screener Assistant that checks if the notifier is in an allowed addresses mapping stored under screenerConfigKey
 *      with configurable return value.
 */
contract SafeAssetAllowlistScreener is IScreenerAssistant, ERC165 {
    /**
     * @dev Check which interfaces this contract supports.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
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
     * @dev Generates the list mapping key for a specific address.
     */
    function generateListMappingKey(
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
     * @dev Evaluates if the notifier is in the allowed addresses mapping stored under the provided screenerConfigKey.
     * @param screenerConfigKey The pre-generated key for fetching the screener's configuration.
     * @param notifier The address to check against the allowed list.
     * @return result True if notifier is in the allowed list, false otherwise, modified by returnValueWhenAllowed.
     */
    function evaluate(
        bytes32 screenerConfigKey,
        address notifier,
        uint256 /* value */,
        bytes32 /* typeId */,
        bytes memory /* data */
    ) external view override returns (bool) {
        IERC725Y upERC725Y = IERC725Y(msg.sender);

        // Read return value configuration
        bytes memory configData = upERC725Y.getData(screenerConfigKey);
        if (configData.length == 0) return false;
        bool returnValueWhenAllowed = abi.decode(configData, (bool));

        // Parse executive and screener addresses
        (bytes10 executiveBytes, bytes10 screenerBytes) = parseScreenerConfigKey(screenerConfigKey);

        // Check allowlist
        bytes32 allowlistKey = generateListMappingKey(executiveBytes, screenerBytes, notifier);
        bytes memory allowlistValue = upERC725Y.getData(allowlistKey);
        bool isAllowed = allowlistValue.length > 0 && abi.decode(allowlistValue, (bool));

        return isAllowed ? returnValueWhenAllowed : !returnValueWhenAllowed;
    }
}