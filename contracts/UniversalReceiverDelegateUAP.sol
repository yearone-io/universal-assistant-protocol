// URDuap.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// libraries
import { LSP2Utils } from '@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol';
// interfaces
import { LSP1UniversalReceiverDelegateUP } from '@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/LSP1UniversalReceiverDelegateUP/LSP1UniversalReceiverDelegateUP.sol';
import { IERC725Y } from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
// util modules
import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
// constants
import { _INTERFACEID_LSP0 } from '@lukso/lsp-smart-contracts/contracts/LSP0ERC725Account/LSP0Constants.sol';

// todo: 
// import "./IAssistant.sol"; + interfaceIds 
// import "./IFilterModule.sol"; + interfaceIds 

/**
 * @title URDuap
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    //IFilterModule public filterModule;
    event TypeIdConfigFound(bytes32 typeId);
    event TypeIdConfigNonempty();
    event AssistantInvoked(address assistantAddress);

    /*
     * @dev Initializes the URDuap with the ERC725Y data store and Filter Module addresses.
     * @param _filterModuleAddress The address of the Filter Module contract.
     */
    constructor(/*address _filterModuleAddress*/) {
        // todo:
        // filterModule = IFilterModule(_filterModuleAddress);
        // check if filterModurleAddress is a FilterModule; throw error if not
        /*
        if (
        !ERC165Checker.supportsERC165InterfaceUnchecked(
            _filterModuleAddress,
            type(IFilterModule).interfaceId
        )
        ) {
            // filter module does not support IFilterModule
            return "UniversalReceiverDelegateUAP: filter module does not support IFilterModule";
        }
        */
    }

    /**
     * @dev Handles incoming transactions by evaluating Filters and invoking Assistants.
     * @param notifier The address that triggered the URD on the Universal Profile.
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     * @return A bytes array containing any returned data from the Assistant(s).
     */
    function universalReceiverDelegate(
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    )
        public
        virtual
        override(LSP1UniversalReceiverDelegateUP)
        returns (bytes memory)
    {
        // CHECK that the caller is a LSP0 (UniversalProfile) by checking its interface support
        if (
        !ERC165Checker.supportsERC165InterfaceUnchecked(
            msg.sender,
            _INTERFACEID_LSP0
        )
        ) {
            return 'UniversalReceiverDelegateUAP: caller is not a LSP0';
        }
        /**
        Schema for UAPTypeConfig:
        {
            "name": "UAPTypeConfig:<bytes32>",
            "key": "0x<your_key_here>",
            "keyType": "Mapping",
            "valueType": "address[]",
            "valueContent": "Address"
        }
        */
        bytes32 typeConfigKey = LSP2Utils.generateMappingKey(bytes10(keccak256(bytes("UAPTypeConfig"))), bytes20(typeId));
        bytes memory typeConfig = IERC725Y(msg.sender).getData(typeConfigKey);
        if (typeConfig.length == 0) {
            // no configurations found, default to LSP1UniversalReceiverDelegateUP behavior
            super.universalReceiverDelegate(notifier, value, typeId, data);
            return "UniversalReceiverDelegateUAP: no configurations found for tx type; invoking default behavior";
        }
        emit TypeIdConfigFound(typeId);
        address[] memory orderedAssistantAddresses = abi.decode(typeConfig, (address[]));
        if (orderedAssistantAddresses.length == 0) {
            // no assistants found, default to LSP1UniversalReceiverDelegateUP behavior
            super.universalReceiverDelegate(notifier, value, typeId, data);
            return "UniversalReceiverDelegateUAP: no assistants found for tx type; invoking default behavior";
        }
        emit TypeIdConfigNonempty();
        /**
        Schema for UAPAssistantFilters:
        {
            "name": "UAPAssistantFilters:<address>",
            "key": "0x<your_key_here>",
            "keyType": "Mapping",
            "valueType": "(address, bool, bytes)[]",
            "valueContent": "(Address, Boolean, Bytes)"
        }
        */
        // loop through all assistants and decide whether to invoke based on filters
        for (uint256 i = 0; i < orderedAssistantAddresses.length; i++) {
            address assistantAddress = orderedAssistantAddresses[i];
            bytes32 assistantFiltersKey = LSP2Utils.generateMappingKey(bytes10(keccak256(bytes("UAPAssistantFilters"))), bytes20(assistantAddress));
            bytes memory assistantFilters = IERC725Y(msg.sender).getData(assistantFiltersKey);
            if (assistantFilters.length == 0) {
                super.universalReceiverDelegate(notifier, value, typeId, data);
                return "UniversalReceiverDelegateUAP: no assistants set; invoking default behavior";
            }
            // todo: this should be filter module???
            /*
            bool invokeAssistant = true;
            for (uint256 j = 0; j < assistantFilters.length; j++) {
                (address filterLogicAddress, bool matchTarget, bytes memory instructions) = abi.decode(assistantFilters[j], (address, bool, bytes));
                // check if filterModuleAddress is set
                if (filterLogicAddress == address(0)) {
                    continue;
                }
                invokeAssistant = IFilter(filterLogicAddress).evaluate(notifier, value, typeId, data, instructions) == matchTarget;
                if (!invokeAssistant) {
                    break;
                }
            }
            if (invokeAssistant) {
                // Invoke Assistant's universalReceiverDelegate
                bytes memory returnData = IAssistant(assistantAddress).execute(
                    notifier,
                    value,
                    typeId,
                    data
                );
                (value, data) = abi.decode(
                    returnData,
                    (uint256, bytes)
                );
                emit AssistantInvoked(assistantAddress);
                // Handle returnData if necessary
            }
            */
        }
    }
}