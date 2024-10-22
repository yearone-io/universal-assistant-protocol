// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Libraries
import { LSP2Utils } from '@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol';
// Interfaces
import { LSP1UniversalReceiverDelegateUP } from '@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/LSP1UniversalReceiverDelegateUP/LSP1UniversalReceiverDelegateUP.sol';
import { IERC725Y } from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
// Utils
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
// Constants
import { _INTERFACEID_LSP0 } from '@lukso/lsp-smart-contracts/contracts/LSP0ERC725Account/LSP0Constants.sol';

// Additional Interfaces
import "./IExecutiveAssistant.sol";
import "./IScreenerAssistant.sol";

/**
 * @title UniversalReceiverDelegateUAP
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(address executiveAssistant);

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
        // Check that the caller is an LSP0 (Universal Profile)
        require(
            ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_LSP0),
            "UniversalReceiverDelegateUAP: Caller is not an LSP0"
        );

        // Generate the key for UAPTypeConfig
        bytes32 typeConfigKey = LSP2Utils.generateMappingKey(
            bytes10(keccak256("UAPTypeConfig")),
            bytes20(typeId)
        );

        // Fetch the type configuration
        bytes memory typeConfig = IERC725Y(msg.sender).getData(typeConfigKey);

        if (typeConfig.length == 0) {
            // No configurations found, invoke default behavior
            return super.universalReceiverDelegate(notifier, value, typeId, data);
        }
        emit TypeIdConfigFound(typeId);

        // Decode the addresses of executive assistants
        address[] memory orderedExecutiveAssistants = customDecodeAddresses(typeConfig);
        if (orderedExecutiveAssistants.length == 0) {
            // No assistants found, invoke default behavior
            return super.universalReceiverDelegate(notifier, value, typeId, data);
        }

        // Loop through each executive assistant
        for (uint256 i = 0; i < orderedExecutiveAssistants.length; i++) {
            address executiveAssistant = orderedExecutiveAssistants[i];
            emit AssistantFound(executiveAssistant);

            // Generate the key for UAPExecutiveScreeners
            bytes32 screenerAssistantsKey = LSP2Utils.generateMappingKey(
                bytes10(keccak256("UAPExecutiveScreeners")),
                bytes20(executiveAssistant)
            );

            // Fetch the executive assistant configuration
            bytes memory executiveAssitantScreeners = IERC725Y(msg.sender).getData(screenerAssistantsKey);

            // Decode the addresses of screener assistants
            address[] memory orderedScreenerAssistants = executiveAssitantScreeners.length > 0
                ? customDecodeAddresses(executiveAssitantScreeners)
                : new address[](0);

            bool delegateToExecutive = true;

            // Evaluate each screener assistant
            for (uint256 j = 0; j < orderedScreenerAssistants.length; j++) {
                address screenerAssistant = orderedScreenerAssistants[j];

                // Ensure the screener assistant is trusted
                require(
                    isTrustedAssistant(screenerAssistant),
                    "UniversalReceiverDelegateUAP: Untrusted screener assistant"
                );

                // Call the screener assistant
                (bool success, bytes memory returnData) = screenerAssistant.delegatecall(
                    abi.encodeWithSelector(
                        IScreenerAssistant.evaluate.selector,
                        notifier,
                        value,
                        typeId,
                        data
                    )
                );

                // Handle failure
                require(success, _getRevertMsg(returnData));

                bool delegateToExecutiveResult = abi.decode(returnData, (bool));
                delegateToExecutive = delegateToExecutive && delegateToExecutiveResult;

                if (!delegateToExecutive) {
                    break;
                }
            }

            if (delegateToExecutive) {
                // Ensure the executive assistant is trusted
                require(
                    isTrustedAssistant(executiveAssistant),
                    "UniversalReceiverDelegateUAP: Untrusted executive assistant"
                );

                // Call the executive assistant
                (bool success, bytes memory returnData) = executiveAssistant.delegatecall(
                    abi.encodeWithSelector(
                        IExecutiveAssistant.execute.selector,
                        notifier,
                        value,
                        typeId,
                        data
                    )
                );

                // Handle failure
                require(success, _getRevertMsg(returnData));

                // Decode the returned value and data
                (value, data) = abi.decode(returnData, (uint256, bytes));
                emit AssistantInvoked(executiveAssistant);
            }
        }
        // Proceed with the default universal receiver behavior
        return super.universalReceiverDelegate(notifier, value, typeId, data);
    }

    /**
     * @dev Decodes a bytes array into an array of addresses.
     * @param encoded The encoded bytes array.
     * @return An array of addresses.
     */
    function customDecodeAddresses(bytes memory encoded) public pure returns (address[] memory) {
        require(encoded.length >= 2, "Invalid encoded data");

        uint256 offset = 32; // Skip the length field

        // Extract the number of addresses (first 2 bytes)
        uint16 numAddresses;
        assembly {
            numAddresses := shr(240, mload(add(encoded, offset)))
        }
        offset += 2;

        // Initialize the address array
        address[] memory addresses = new address[](numAddresses);

        // Extract each 20-byte address
        for (uint256 i = 0; i < numAddresses; i++) {
            require(encoded.length >= offset - 32 + 20, "Invalid encoded data");
            address addr;
            assembly {
                addr := shr(96, mload(add(encoded, add(offset, 12))))
            }
            addresses[i] = addr;
            offset += 20;
        }

        return addresses;
    }

    /**
     * @dev Checks if an assistant contract is trusted.
     * @param assistant The address of the assistant contract.
     * @return True if the assistant is trusted, false otherwise.
     */
    function isTrustedAssistant(address assistant) internal view returns (bool) {
        // todo: a hashlist ?
        return true;
    }

    /**
     * @dev Extracts the revert message from failed delegatecall.
     * @param returnData The return data from the failed call.
     * @return The revert message string.
     */
    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        // If the return data length is less than 68, then the transaction failed silently (without a revert message)
        if (returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Slice the sighash.
            returnData := add(returnData, 4)
        }
        return abi.decode(returnData, (string));
    }
}
