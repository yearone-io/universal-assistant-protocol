// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";

// Interfaces
import {LSP1UniversalReceiverDelegateUP} from "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/LSP1UniversalReceiverDelegateUP/LSP1UniversalReceiverDelegateUP.sol";
import {IERC725X} from "@erc725/smart-contracts/contracts/interfaces/IERC725X.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {IScreenerAssistant} from "./IScreenerAssistant.sol";
import {IExecutiveAssistant} from "./IExecutiveAssistant.sol";

/**
 * @title UniversalReceiverDelegateUAP
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant);
    
    error UntrustedAssistant(address assistant);
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
        // Fetch type configuration
        bytes32 typeConfigKey = LSP2Utils.generateMappingKey(
            bytes10(keccak256("UAPTypeConfig")),
            bytes20(typeId)
        );
        bytes memory typeConfig = IERC725Y(msg.sender).getData(typeConfigKey);
        if (typeConfig.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, data);
        }
        emit TypeIdConfigFound(typeId);

        // Decode executive assistants
        address[] memory executiveAssistants = customDecodeAddresses(typeConfig);
        if (executiveAssistants.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, data);
        }

        bytes memory currentData = data;
        uint256 currentValue = value;
        for (uint256 i = 0; i < executiveAssistants.length; i++) {
            address executiveAssistant = executiveAssistants[i];

            // Fetch and evaluate screener assistants
            bytes32 screenerKey = keccak256(abi.encode("UAPExecutiveScreenersByType", typeId, executiveAssistant));
            bytes memory screenerData = IERC725Y(msg.sender).getData(screenerKey);
            bool shouldExecute = true;

            if (screenerData.length > 0) {
                address[] memory screeners = customDecodeAddresses(screenerData);
                for (uint256 j = 0; j < screeners.length; j++) {
                    address screener = screeners[j];
                    bytes32 screenerConfigKey = generateScreenerConfigKey(executiveAssistant, screener, typeId);
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, bytes memory ret) = screener.delegatecall(
                        abi.encodeWithSelector(
                            IScreenerAssistant.evaluate.selector,
                            screenerConfigKey, // Pass screener config key
                            notifier,
                            currentValue,
                            typeId,
                            currentData
                        )
                    );
                    if (!success || !abi.decode(ret, (bool))) {
                        shouldExecute = false;
                        break;
                    }
                }
            }

            // Execute the assistant if all screeners pass
            if (shouldExecute) {
                emit AssistantFound(executiveAssistant);
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory returnData) = executiveAssistant.call(
                    abi.encodeWithSelector(
                        IExecutiveAssistant.execute.selector,
                        msg.sender,
                        notifier,
                        currentValue,
                        typeId,
                        currentData
                    )
                );
                if (!success) {
                    if (returnData.length > 0) {
                        // solhint-disable-next-line no-inline-assembly
                        assembly {
                            revert(add(returnData, 32), mload(returnData))
                        }
                    } else {
                        revert AssistantExecutionFailed(executiveAssistant);
                    }
                }

                (
                    uint256 execOperationType,
                    address execTarget,
                    uint256 execValue,
                    bytes memory execData,
                    bytes memory execResultData
                ) = abi.decode(returnData, (uint256, address, uint256, bytes, bytes));

                if (execResultData.length > 0) {
                    (uint256 newValue, bytes memory newTxData) = abi.decode(execResultData, (uint256, bytes));
                    currentValue = newValue;
                    currentData = newTxData;
                }

                IERC725X(msg.sender).execute(execOperationType, execTarget, execValue, execData);
                emit AssistantInvoked(msg.sender, executiveAssistant);
            }
        }
        return super.universalReceiverDelegate(notifier, currentValue, typeId, currentData);
    }

    function generateScreenerConfigKey(
        address executiveAssistant,
        address screenerAssistant,
        bytes32 typeId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            "UAPScreenerConfig",
            executiveAssistant,
            screenerAssistant,
            typeId
        ));
    }

    /**
     * @dev Decodes a bytes array into an array of addresses.
     */
    function customDecodeAddresses(bytes memory encoded) public pure returns (address[] memory) {
        if (encoded.length < 2) revert InvalidEncodedData();
        uint16 numAddresses;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            numAddresses := shr(240, mload(add(encoded, 32)))
        }
        address[] memory addresses = new address[](numAddresses);
        for (uint256 i = 0; i < numAddresses; i++) {
            address addr;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                addr := shr(96, mload(add(encoded, add(34, mul(i, 20)))))
            }
            addresses[i] = addr;
        }
        return addresses;
    }
}