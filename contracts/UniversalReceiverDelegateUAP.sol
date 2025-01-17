// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";
// Interfaces
import {LSP1UniversalReceiverDelegateUP} from "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/LSP1UniversalReceiverDelegateUP/LSP1UniversalReceiverDelegateUP.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// Additional Interfaces
import {IExecutiveAssistant} from "./IExecutiveAssistant.sol";
import {IScreenerAssistant} from "./IScreenerAssistant.sol";

/**
 * @title UniversalReceiverDelegateUAP
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(
        address indexed subscriber,
        address indexed executiveAssistant
    );

    // Custom errors
    error UntrustedAssistant(address assistant);
    error ScreenerEvaluationFailed(address screener);
    error AssistantExecutionFailed(address assistant);
    error InvalidEncodedData();

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
        // Generate the key for UAPTypeConfig
        bytes32 typeConfigKey = LSP2Utils.generateMappingKey(
            bytes10(keccak256("UAPTypeConfig")),
            bytes20(typeId)
        );
        // Fetch the type configuration
        bytes memory typeConfig = IERC725Y(msg.sender).getData(typeConfigKey);
        if (typeConfig.length == 0) {
            // No configurations found, invoke default behavior
            return
                super.universalReceiverDelegate(notifier, value, typeId, data);
        }
        emit TypeIdConfigFound(typeId);

        // Decode the addresses of executive assistants
        address[] memory orderedExecutiveAssistants = customDecodeAddresses(
            typeConfig
        );
        if (orderedExecutiveAssistants.length == 0) {
            // No assistants found, invoke default behavior
            return
                super.universalReceiverDelegate(notifier, value, typeId, data);
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
            bytes memory executiveAssistantScreeners = IERC725Y(msg.sender)
                .getData(screenerAssistantsKey);

            // Decode the addresses of screener assistants
            address[]
                memory orderedScreenerAssistants = executiveAssistantScreeners
                    .length > 0
                    ? customDecodeAddresses(executiveAssistantScreeners)
                    : new address[](0);

            bool delegateToExecutive = true;

            // Evaluate each screener assistant
            for (uint256 j = 0; j < orderedScreenerAssistants.length; j++) {
                address screenerAssistant = orderedScreenerAssistants[j];

                // Ensure the screener assistant is trusted
                if (!isTrustedAssistant(screenerAssistant)) {
                    revert UntrustedAssistant(screenerAssistant);
                }

                // Call the screener assistant
                (bool success, bytes memory returnData) = screenerAssistant
                    .delegatecall(
                        abi.encodeWithSelector(
                            IScreenerAssistant.evaluate.selector,
                            screenerAssistant,
                            notifier,
                            value,
                            typeId,
                            data
                        )
                    );

                if (!success) {
                    revert ScreenerEvaluationFailed(screenerAssistant);
                }

                bool delegateToExecutiveResult = abi.decode(returnData, (bool));
                delegateToExecutive =
                    delegateToExecutive &&
                    delegateToExecutiveResult;

                if (!delegateToExecutive) {
                    break;
                }
            }

            if (delegateToExecutive) {
                if (!isTrustedAssistant(executiveAssistant)) {
                    revert UntrustedAssistant(executiveAssistant);
                }
                (bool success, ) = executiveAssistant.delegatecall(
                    abi.encodeWithSelector(
                        IExecutiveAssistant.execute.selector,
                        executiveAssistant,
                        notifier,
                        value,
                        typeId,
                        data
                    )
                );

                if (!success) {
                    revert AssistantExecutionFailed(executiveAssistant);
                }

                emit AssistantInvoked(msg.sender, executiveAssistant);
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
    function customDecodeAddresses(
        bytes memory encoded
    ) public pure returns (address[] memory) {
        if (encoded.length < 2) {
            revert InvalidEncodedData();
        }

        uint16 numAddresses;
        assembly {
            numAddresses := shr(240, mload(add(encoded, 32)))
        }

        address[] memory addresses = new address[](numAddresses);

        for (uint256 i = 0; i < numAddresses; i++) {
            address addr;
            assembly {
                addr := shr(96, mload(add(encoded, add(34, mul(i, 20)))))
            }
            addresses[i] = addr;
        }

        return addresses;
    }

    /**
     * @dev Checks if an assistant contract is trusted.
     * @return True if the assistant is trusted, false otherwise.
     */
    function isTrustedAssistant(
        address /*assistant*/
    ) internal view returns (bool) {
        return true;
    }
}
