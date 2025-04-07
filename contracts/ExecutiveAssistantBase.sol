// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";

// Import interfaces and contracts
import {IExecutiveAssistant} from "./IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

abstract contract ExecutiveAssistantBase is IExecutiveAssistant, ERC165 {
    uint256 public NO_OP = type(uint256).max;
    error ExecutiveConfigMismatch(
        address executiveAssistant,
        address configAddress,
        bytes32 typeId,
        uint256 executionOrder
    );
    error InvalidEncodedData();

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExecutiveAssistant).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function fetchConfiguration(
        address upAddress,
        bytes32 typeId,
        uint256 executionOrder
    ) external view returns (address, bytes memory) {
        bytes32 dataKey = LSP2Utils.generateMappingWithGroupingKey(
            bytes6(keccak256("UAPExecutiveConfig")),
            bytes4(typeId),
            uint256ToBytes20(executionOrder)
        );
        bytes memory execData = IERC725Y(upAddress).getData(dataKey);
        if (execData.length == 0) {
            return (address(0), "");
        }
        (address execAddress, bytes memory encodedConfig) = decodeExecDataValue(execData);
        if (execAddress != address(this)) {
            revert ExecutiveConfigMismatch(
                execAddress,
                address(this),
                typeId,
                executionOrder
            );
        }
        return (execAddress, encodedConfig);
    }
    
    function decodeExecDataValue(
        bytes memory execDataValue
    ) internal view virtual returns (address, bytes memory) {
        // data has the format of 0x + address + bytes
        // 0x + 20 bytes + N bytes
        if (execDataValue.length < 20) {
            revert InvalidEncodedData();
        }
        bytes memory encodedConfig = new bytes(execDataValue.length - 20);
        bytes memory encodedExecAddress = new bytes(20);
        for (uint256 i = 0; i < 20; i++) {
            encodedExecAddress[i] = execDataValue[i];
        }
        for (uint256 i = 0; i < encodedConfig.length; i++) {
            encodedConfig[i] = execDataValue[i + 20];
        }
        address execAddress = address(bytes20(encodedExecAddress));
        return (execAddress, encodedConfig);
    }

    function uint256ToBytes20(uint256 value) public pure returns (bytes20) {
        // Mask the uint256 to keep only the least significant 20 bytes (160 bits)
        uint256 maskedValue = value & (2**160 - 1);
        // Cast the masked value to bytes20
        return bytes20(uint160(maskedValue));
    }
}