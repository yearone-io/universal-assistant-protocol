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
import "./IExecutiveAssistant.sol";
// import "./IScreenerAssistantModule.sol"; + interfaceIds 

/**
 * @title URDuap
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    //IScreenerAssistantModule public filterModule;
    event TypeIdConfigFound(bytes32 typeId);
    event TypeIdConfigNonempty();
    event AssistantFound(address assistantAddress);
    event AssistantInvoked(address assistantAddress);

    /*
     * @dev Initializes the URDuap with the ERC725Y data store and Filter Module addresses.
     * @param _filterModuleAddress The address of the Filter Module contract.
     */
    constructor(/*address _filterModuleAddress*/) {
        // todo:
        // filterModule = IScreenerAssistantModule(_filterModuleAddress);
        // check if filterModurleAddress is a FilterModule; throw error if not
        /*
        if (
        !ERC165Checker.supportsERC165InterfaceUnchecked(
            _filterModuleAddress,
            type(IScreenerAssistantModule).interfaceId
        )
        ) {
            // filter module does not support IScreenerAssistantModule
            return "UniversalReceiverDelegateUAP: filter module does not support IScreenerAssistantModule";
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
        address[] memory orderedAssistantAddresses = customDecodeAddresses(typeConfig);
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
            "valueType": "(bytes32, bool, address)[CompactBytesArray]",
            "valueContent": "(Bytes, Boolean, Address)"
            // instructions, matchTarget, filterLogicAddress
        }
        */
        /**
        Schema for UAPAssistantInstructions to be used when executing an Assistant:
        {
            "name": "UAPAssistantInstructions:<address>",
            "key": "0x<your_key_here>",
            "keyType": "Mapping",
            "valueType": "bytes",
            "valueContent": "Bytes"
        }
        */
        // loop through all assistants and decide whether to invoke based on filters
        for (uint256 i = 0; i < orderedAssistantAddresses.length; i++) {
            address assistantAddress = orderedAssistantAddresses[i];
            emit AssistantFound(assistantAddress);
            bytes32 assistantFiltersKey = LSP2Utils.generateMappingKey(bytes10(keccak256(bytes("UAPAssistantFilters"))), bytes20(assistantAddress));
            bytes memory assistantFilters = IERC725Y(msg.sender).getData(assistantFiltersKey);
            if (assistantFilters.length == 0) {
                super.universalReceiverDelegate(notifier, value, typeId, data);
                //return "UniversalReceiverDelegateUAP: no assistants set; invoking default behavior";
            }
            // todo: this should be filter module???
            
            bool invokeAssistant = true;
            /*
            for (uint256 j = 0; j < assistantFilters.length; j++) {
                (address filterLogicAddress, bool matchTarget, bytes memory instructions) = abi.decode(assistantFilters[j], (address, bool, bytes));
                // check if filterModuleAddress is set
                if (filterLogicAddress == address(0)) {
                    continue;
                }
                invokeAssistant = IScreenerAssistant(filterLogicAddress).evaluate(notifier, value, typeId, data, instructions) == matchTarget;
                if (!invokeAssistant) {
                    break;
                }
            }
            */
            if (invokeAssistant) {
                // Prepare the data for delegatecall
                bytes memory executeCalldata = abi.encodeWithSelector(
                    IExecutiveAssistant.execute.selector,
                    assistantAddress, // Pass the assistant's address
                    notifier,
                    value,
                    typeId,
                    data
                );

                // Use delegatecall to execute the Assistant's code in the context of URDuap
                (bool success, bytes memory returnData) = assistantAddress.delegatecall(executeCalldata);

                if (!success) {
                    // Handle failure (e.g., revert with the error message)
                    if (returnData.length > 0) {
                        // The called contract reverted with a message
                        assembly {
                            let returndata_size := mload(returnData)
                            revert(add(32, returnData), returndata_size)
                        }
                    } else {
                        revert("URDuap: delegatecall to Assistant failed");
                    }
                }

                // Decode the returned value and data
                (value, data) = abi.decode(returnData, (uint256, bytes));
                emit AssistantInvoked(assistantAddress);
                // Handle returnData if necessary
            }
        }
        super.universalReceiverDelegate(notifier, value, typeId, data);
    }

    function customDecodeAddresses(bytes memory encoded) public pure returns (address[] memory) {
        require(encoded.length >= 2, "Invalid encoded data");

        // Extract the number of addresses (first 2 bytes)
        uint16 numAddresses;
        assembly {
            numAddresses := shr(240, mload(add(encoded, 2))) // load first 2 bytes (16 bits)
        }

        // Initialize the address array
        address[] memory addresses = new address[](numAddresses);

        // Extract each 20-byte address
        uint offset = 2; // First 2 bytes for length
        for (uint i = 0; i < numAddresses; i++) {
            require(encoded.length >= offset + 20, "Invalid encoded data");
            address addr;
            assembly {
                addr := shr(96, mload(add(encoded, add(offset, 20)))) // load 20 bytes for address
            }
            addresses[i] = addr;
            offset += 20;
        }

        return addresses;
    }
}