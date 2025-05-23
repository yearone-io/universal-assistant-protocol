// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IExecutiveAssistant
 * @dev Interface that all Assistant contracts must implement within the UAP framework.
 */
interface IExecutiveAssistant {
    /**
     * @notice The execute function called by URDuap via delegatecall.
     * @dev This function is invoked by the URDuap when an Assistant needs to process a transaction.
     *      The Assistant should read settings from the UP's ERC725Y data store under the key
     *      "UAPAssistantInstructions:<assistantAddress>".
     *      Since this function is called via delegatecall, the Assistant's code runs in the context of URDuap,
     *      and `msg.sender` will be the UP's address.
     * @param executionOrder The order of the exeutive in the execution sequence
     * @param upAddress The address of the Universal Profile.
     * @param notifier The address that triggered the Universal Receiver Delegate on the UP (e.g., token contract).
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the notification
     * @return A bytes array containing the updated value and call data: (operationType, notifier, value, execData, newDataAfterExec).
     */
    function execute(
        uint256 executionOrder,
        address upAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external returns (uint256, address, uint256, bytes memory, bytes memory);

    function fetchConfiguration(
        address upAddress,
        bytes32 typeId,
        uint256 executionOrder
    ) external view returns (address executiveAddress, bytes memory encodedConfig);
}