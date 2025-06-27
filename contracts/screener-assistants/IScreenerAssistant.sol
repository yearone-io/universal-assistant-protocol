// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IScreenerAssistant
 * @dev Interface that all Screener Assistant contracts must implement within the UAP framework.
 */
interface IScreenerAssistant {
    /**
     * @notice The evaluate function called by URDuap via staticcall.
     * @dev This function is invoked by the URDuap when a Screener needs to evaluate a condition.
     *      The Screener should read its own instructions from the UP's ERC725Y data store under the key
     *      "UAPScreenerConfig:<executiveAddress>:<screenerAddress>:<TypeId>".
     *      Since this function is called via staticcall, the Screener's code runs in its own context,
     *      and the Universal Profile address is passed as the first parameter.
     *      This ensures screeners cannot modify UP storage and are purely evaluative.
     * @param profile The Universal Profile address whose ERC725Y store should be inspected.
     * @param screenerAddress The address of this screener contract.
     * @param screenerOrder The order of the screener in the list.
     * @param notifier The address that triggered the Universal Receiver Delegate on the UP.
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the transaction.
     * @return result A boolean indicating whether the condition evaluated to true or false.
     */
    function evaluate(
        address profile,
        address screenerAddress,
        uint256 screenerOrder,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external view returns (bool result);

    function fetchConfiguration(
        address upAddress,
        address screenerAddress,
        bytes32 typeId,
        uint256 executionOrder
    ) external view returns (address executiveAddress, address configScreenerAddress, bytes memory encodedConfig);
}
