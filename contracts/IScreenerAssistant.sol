// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IScreenerAssistant
 * @dev Interface that all Filter contracts must implement within the UAP framework.
 */
interface IScreenerAssistant {
    /**
     * @notice The evaluate function called by URDuap via delegatecall.
     * @dev This function is invoked by the URDuap when a Filter needs to evaluate a condition.
     *      The Filter should read its own instructions from the UP's ERC725Y data store under the key
     *      "UAPFilterInstructions:<filterAddress>".
     *      Since this function is called via delegatecall, the Filter's code runs in the context of URDuap,
     *      and `msg.sender` will be the UP's address.
     * @param filterAddress The address of the Filter contract.
     * @param notifier The address that triggered the Universal Receiver Delegate on the UP.
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     * @return result A boolean indicating whether the condition evaluated to true or false.
     */
    function evaluate(
        address filterAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) external returns (bool result);
}
