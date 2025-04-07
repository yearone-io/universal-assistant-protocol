// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ExecutiveAssistantBase} from "../ExecutiveAssistantBase.sol";
import {_TYPEID_LSP0_VALUE_RECEIVED} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";

contract TipAssistant is ExecutiveAssistantBase {
    error TipConfigNotSet();
    error InvalidTipRecipient();
    error InvalidTipPercentage();
    error InvalidTipType();
    event TipSent(
        address indexed upAddress,
        address indexed tipAddress,
        uint256 tipAmount
    );

    /**
     * @dev The main execution function of this Assistant, called via delegatecall by the UniversalReceiverDelegateUAP.
     *
     * @param upAddress The address of the Universal Profile.
     * @param value The amount of native tokens (e.g. LYX) sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the notification
     *
     * @return A bytes array containing any data you wish to return.
     */
    function execute(
        uint256 executionOrder,
        address upAddress,
        address ,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external override returns (uint256, address, uint256, bytes memory, bytes memory) {
        (, bytes memory encodedConfig) = this.fetchConfiguration(upAddress, typeId, executionOrder);
        if (encodedConfig.length == 0) {
            revert TipConfigNotSet();
        }
        (address tipAddress, uint256 tipPercentage) = abi.decode(
            encodedConfig,
            (address, uint256)
        );
        // Basic sanity checks
        if (tipAddress == address(0)) revert InvalidTipRecipient();
        if (typeId != _TYPEID_LSP0_VALUE_RECEIVED) revert InvalidTipType();
        if (tipPercentage == 0 || tipPercentage > 100) revert InvalidTipPercentage();
        uint256 tipAmount = value > 0 ? (value * tipPercentage) / 100 : 0;
        emit TipSent(upAddress, tipAddress, tipAmount);
        return (0, tipAddress, tipAmount, "", abi.encode(value - tipAmount, lsp1Data));
    }
}
