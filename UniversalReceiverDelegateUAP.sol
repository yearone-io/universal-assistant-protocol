// URDuap.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IAssistant.sol";
import "./IFilterModule.sol";

/**
 * @title URDuap
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract URDuap {
    IFilterModule public filterModule;
    IERC725Y public erc725Y;

    event AssistantInvoked(bytes32 assistantId, address assistantAddress, bytes actionData);

    /**
     * @dev Initializes the URDuap with the ERC725Y data store and Filter Module addresses.
     * @param _erc725YAddress The address of the ERC725Y data store.
     * @param _filterModuleAddress The address of the Filter Module contract.
     */
    constructor(address _erc725YAddress, address _filterModuleAddress) {
        erc725Y = IERC725Y(_erc725YAddress);
        filterModule = IFilterModule(_filterModuleAddress);
    }

    /**
     * @dev Handles incoming transactions by evaluating Filters and invoking Assistants.
     * @param caller The address initiating the transaction.
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     * @return A bytes array containing any returned data from the Assistants.
     */
    function universalReceiverDelegate(
        address caller,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) external returns (bytes memory) {
        // Retrieve all Filter IDs associated with the user and typeId
        bytes32 filterListKey = keccak256(
            abi.encodePacked("filterList", typeId, caller)
        );
        bytes memory filterIdsEncoded = erc725Y.getData(filterListKey);
        bytes32[] memory filterIds = filterIdsEncoded.length > 0
            ? abi.decode(filterIdsEncoded, (bytes32[]))
            : new bytes32;

        for (uint256 i = 0; i < filterIds.length; i++) {
            bytes32 filterId = filterIds[i];

            // Retrieve Filter metadata from ERC725Y
            bytes32 filterMetadataKey = keccak256(
                abi.encodePacked("filterMetadata", filterId)
            );
            bytes memory filterMetadata = erc725Y.getData(filterMetadataKey);
            if (filterMetadata.length == 0) continue; // Skip if no metadata

            // Evaluate Filter using Filter Module
            bool eligible = filterModule.evaluate(
                abi.encode(caller, value, typeId, data),
                filterMetadata
            );
            if (eligible) {
                // Retrieve associated Assistant ID
                bytes32 assistantIdKey = keccak256(
                    abi.encodePacked("assistantForFilter", filterId)
                );
                bytes memory assistantIdEncoded = erc725Y.getData(
                    assistantIdKey
                );
                if (assistantIdEncoded.length == 0) continue; // Skip if no Assistant associated
                bytes32 assistantId = abi.decode(assistantIdEncoded, (bytes32));

                // Retrieve Assistant address
                bytes32 assistantAddressKey = keccak256(
                    abi.encodePacked("assistantAddress", assistantId)
                );
                bytes memory assistantAddressEncoded = erc725Y.getData(
                    assistantAddressKey
                );
                if (assistantAddressEncoded.length == 0) continue; // Skip if no Assistant address
                address assistantAddress = abi.decode(
                    assistantAddressEncoded,
                    (address)
                );

                IAssistant assistant = IAssistant(assistantAddress);
                // Check if Assistant is enabled by invoking universalReceiverDelegate and expecting isEnabled
                // Alternatively, store isEnabled status in ERC725Y or another mapping
                // For simplicity, assuming Assistants manage their own enabled status

                // Prepare actionData as needed (this depends on the Assistant's requirements)
                bytes memory actionData = abi.encode(caller, value, typeId, data);

                // Invoke Assistant's universalReceiverDelegate
                bytes memory returnData = assistant.universalReceiverDelegate(
                    caller,
                    value,
                    typeId,
                    data
                );
                emit AssistantInvoked(assistantId, assistantAddress, actionData);

                // Handle returnData if necessary
            }
        }

        // Default handling if necessary (e.g., accept the transaction normally)
        return "";
    }
}

/**
 * @title IERC725Y
 * @dev Interface for ERC725Y data store.
 */
interface IERC725Y {
    function getData(bytes32 key) external view returns (bytes memory);
    function setData(bytes32 key, bytes memory value) external;
}
