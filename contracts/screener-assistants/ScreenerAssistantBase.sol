// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {IScreenerAssistant} from "./IScreenerAssistant.sol";

abstract contract ScreenerAssistantBase is IScreenerAssistant, ERC165 {
    error ScreenerConfigMismatch(
        address configExecAssistant,
        address configScreenerAssistant,
        address screenerAddress,
        bytes32 typeId,
        uint256 executionOrder
    );
    error InvalidEncodedData();
    error InvalidEncodedCurationConfigData(bytes data);

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IScreenerAssistant).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function fetchConfiguration(
        address upAddress,
        address screenerAddress,
        bytes32 typeId,
        uint256 executionOrder
    ) public view override returns (address, address, bytes memory) {
        bytes32 screenerConfigKey = LSP2Utils.generateMappingWithGroupingKey(
            bytes6(keccak256("UAPScreenerConfig")),
            bytes4(typeId),
            uint256ToBytes20(executionOrder)
        );
        bytes memory screenerData = IERC725Y(upAddress).getData(screenerConfigKey);
        if (screenerData.length == 0) {
            return (address(0), address(0), "");
        }
        (address execAddress, address configScreenerAddress, bytes memory encodedConfig) = decodeScreenerDataValue(screenerData);
        if (configScreenerAddress != screenerAddress) {
            revert ScreenerConfigMismatch(
                execAddress,
                configScreenerAddress,
                screenerAddress,
                typeId,
                executionOrder
            );
        }
        return (execAddress, screenerAddress, encodedConfig);
    }
    
    function decodeScreenerDataValue(
        bytes memory screenerDataValue
    ) internal view virtual returns (address, address, bytes memory) {
        if (screenerDataValue.length < 40) {
            revert InvalidEncodedData();
        }
        bytes memory encodedConfig = new bytes(screenerDataValue.length - 40);
        bytes memory encodedExecAddress = new bytes(20);
        bytes memory encodedScreenerAddress = new bytes(20);
        for (uint256 i = 0; i < 20; i++) {
            encodedExecAddress[i] = screenerDataValue[i];
        }
        for (uint256 i = 0; i < 20; i++) {
            encodedScreenerAddress[i] = screenerDataValue[i + 20];
        }
        for (uint256 i = 0; i < encodedConfig.length; i++) {
            encodedConfig[i] = screenerDataValue[i + 40];
        }
        address execAddress = address(bytes20(encodedExecAddress));
        address screenerAddress = address(bytes20(encodedScreenerAddress));
        return (execAddress, screenerAddress, encodedConfig);
    }

    function uint256ToBytes20(uint256 value) public pure returns (bytes20) {
        uint256 maskedValue = value & (2**160 - 1);
        return bytes20(uint160(maskedValue));
    }

    /**
     * @dev Safely decodes a boolean value with validation
     * @param data The encoded data to decode
     * @return The decoded boolean value
     */
    function _safeDecodeBoolean(bytes memory data) internal pure returns (bool) {
        if (data.length == 0) {
            return false;
        }
        
        // Decode the boolean - abi.decode will revert if data is malformed
        bool decodedBool = abi.decode(data, (bool));
        return decodedBool;
    }

    /**
     * @dev Safely decodes curation configuration (address, bool) tuple
     * @param data The encoded data to decode
     * @return curatedListAddress The curated list address
     * @return returnValueWhenCurated The return value when curated
     */
    function _safeDecodeCurationConfig(bytes memory data) internal pure returns (
        address curatedListAddress,
        bool returnValueWhenCurated
    ) {
        if (data.length == 0) {
            revert InvalidEncodedCurationConfigData(data);
        }
        
        // Decode the tuple - abi.decode will revert if data is malformed
        (curatedListAddress, returnValueWhenCurated) = abi.decode(data, (address, bool));
    }
}