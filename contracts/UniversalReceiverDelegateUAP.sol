// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Libraries
import {LSP2Utils} from "@lukso/lsp-smart-contracts/contracts/LSP2ERC725YJSONSchema/LSP2Utils.sol";

// Interfaces
import {LSP1UniversalReceiverDelegateUP} from "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/LSP1UniversalReceiverDelegateUP/LSP1UniversalReceiverDelegateUP.sol";
import {IERC725X} from "@erc725/smart-contracts/contracts/interfaces/IERC725X.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {IScreenerAssistant} from "./screener-assistants/IScreenerAssistant.sol";
import {IExecutiveAssistant} from "./executive-assistants/IExecutiveAssistant.sol";

/**
 * @title UniversalReceiverDelegateUAP
 * @dev Universal Receiver Delegate for the Universal Assistant Protocol.
 */
contract UniversalReceiverDelegateUAP is LSP1UniversalReceiverDelegateUP {
    uint256 private constant NO_OP = type(uint256).max;
    bytes4 public constant _INTERFACEID_UAP = 0x03309e5f;
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant);
    event AssistantNoOp(address indexed subscriber, address executiveAssistant);
    error ExecutiveAssistantExecutionFailed(address executiveAssistant, bytes32 typeId);
    error ScreenerAssistantExecutionFailed(address executiveAssistant, address screenerAssistant, bytes32 typeId);
    error InvalidEncodedData();

    /**
     * @dev Handles incoming transactions by evaluating Filters and invoking Assistants.
     * @param notifier The address that triggered the URD on the Universal Profile.
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the transaction.
     * @return A bytes array containing any returned data from the Assistant(s).
     */
    function universalReceiverDelegate(
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
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
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }
        emit TypeIdConfigFound(typeId);

        // Decode executive assistants
        address[] memory executiveAssistants = abi.decode(typeConfig, (address[]));
        if (executiveAssistants.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }

        bytes memory currentLsp1Data = lsp1Data;
        uint256 currentValue = value;
        for (uint256 i = 0; i < executiveAssistants.length; i++) {
            bool shouldExecute = true;
            address executiveAssistant = executiveAssistants[i];
            // Fetch and evaluate screener assistants
            bytes32 screenersChainKey = LSP2Utils.generateMappingWithGroupingKey(
                bytes6(keccak256("UAPExecutiveScreeners")),
                bytes4(typeId),
                uint256ToBytes20(i)
            );
            // Get whether the chain is an AND or OR logic chain
            bytes32 screenersChainLogicKey = LSP2Utils.generateMappingWithGroupingKey(
                bytes6(keccak256("UAPExecutiveScreenersANDLogic")),
                bytes4(typeId),
                uint256ToBytes20(i)
            );
            bytes memory screenersChainRaw = IERC725Y(msg.sender).getData(screenersChainKey);
            if (screenersChainRaw.length > 0) {
                address[] memory screenerAssistants = abi.decode(screenersChainRaw, (address[]));
                bytes memory screenersChainLogicRaw = IERC725Y(msg.sender).getData(screenersChainLogicKey);
                bool isAndChain = true;
                if (screenersChainLogicRaw.length > 0) {
                    isAndChain = (screenersChainLogicRaw[0] != 0x00);
                }
                for (uint256 j = 0; j < screenerAssistants.length; j++) {
                    address screener = screenerAssistants[j];
                    uint256 screenerOrder = (i * 1000) + j;
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, bytes memory ret) = screener.delegatecall(
                        abi.encodeWithSelector(
                            IScreenerAssistant.evaluate.selector,
                            screener,
                            screenerOrder,
                            notifier,
                            currentValue,
                            typeId,
                            currentLsp1Data
                        )
                    );
                    if (!success) {
                        if (ret.length > 0) {
                            // solhint-disable-next-line no-inline-assembly
                            assembly {
                                revert(add(ret, 32), mload(ret))
                            }
                        } else {
                            revert ScreenerAssistantExecutionFailed(executiveAssistant, screener, typeId);
                        }
                    } else if (success) {
                        if (isAndChain && !abi.decode(ret, (bool))) {
                            shouldExecute = false;
                            break;
                        } else if (!isAndChain && abi.decode(ret, (bool))) {
                            shouldExecute = true;
                            break;
                        } else if (!isAndChain && !abi.decode(ret, (bool))) {
                            shouldExecute = false;
                        }
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
                        i,
                        msg.sender,
                        notifier,
                        currentValue,
                        typeId,
                        currentLsp1Data
                    )
                );
                if (!success) {
                    if (returnData.length > 0) {
                        // solhint-disable-next-line no-inline-assembly
                        assembly {
                            revert(add(returnData, 32), mload(returnData))
                        }
                    } else {
                        revert ExecutiveAssistantExecutionFailed(executiveAssistant, typeId);
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
                    (uint256 newValue, bytes memory newLsp1Data) = abi.decode(execResultData, (uint256, bytes));
                    currentValue = newValue;
                    currentLsp1Data = newLsp1Data;
                }

                if (execOperationType != NO_OP) {
                    IERC725X(msg.sender).execute(execOperationType, execTarget, execValue, execData);
                    emit AssistantInvoked(msg.sender, executiveAssistant);
                } else {
                    emit AssistantNoOp(msg.sender, executiveAssistant);
                }
            }
        }
        return super.universalReceiverDelegate(notifier, currentValue, typeId, currentLsp1Data);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == _INTERFACEID_UAP ||
            super.supportsInterface(interfaceId);
    }

    function uint256ToBytes20(uint256 value) internal pure returns (bytes20) {
        // Mask the uint256 to keep only the least significant 20 bytes (160 bits)
        uint256 maskedValue = value & (2**160 - 1);
        // Cast the masked value to bytes20
        return bytes20(uint160(maskedValue));
    }
}