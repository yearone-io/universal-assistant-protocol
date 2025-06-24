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
    
    // ERC725X operation types
    uint256 private constant OPERATION_0_CALL = 0;
    uint256 private constant OPERATION_1_CREATE = 1;
    uint256 private constant OPERATION_2_CREATE2 = 2;
    uint256 private constant OPERATION_3_STATICCALL = 3;
    uint256 private constant OPERATION_4_DELEGATECALL = 4;
    
    
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant);
    event AssistantNoOp(address indexed subscriber, address executiveAssistant);
    
    // Standardized events for monitoring and debugging
    event ScreenResult(
        bytes32 indexed typeId,
        address indexed profile,
        address indexed module,
        bool outcome
    );
    
    event ExecutionResult(
        bytes32 indexed typeId,
        address indexed profile,
        address indexed module,
        bool outcome
    );
    
    error ExecutiveAssistantExecutionFailed(address executiveAssistant, bytes32 typeId);
    error ScreenerAssistantExecutionFailed(address executiveAssistant, address screenerAssistant, bytes32 typeId);
    error InvalidEncodedData();
    error InvalidEncodedArrayData(bytes data);
    error InvalidEncodedBooleanData(bytes data);
    error InvalidEncodedExecutiveResultData(bytes data);
    error InvalidEncodedExecutionResultData(bytes data);

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

        // Safely decode executive assistants
        address[] memory executiveAssistants = _safeDecodeAddressArray(typeConfig);
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
                // Safely decode screener assistants
                address[] memory screenerAssistants = _safeDecodeAddressArray(screenersChainRaw);
                bytes memory screenersChainLogicRaw = IERC725Y(msg.sender).getData(screenersChainLogicKey);
                bool isAndChain = true;
                if (screenersChainLogicRaw.length > 0) {
                    isAndChain = (screenersChainLogicRaw[0] != 0x00);
                }
                
                for (uint256 j = 0; j < screenerAssistants.length; j++) {
                    address screener = screenerAssistants[j];
                    uint256 screenerOrder = (i * 1000) + j;
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, bytes memory ret) = screener.staticcall(
                        abi.encodeWithSelector(
                            IScreenerAssistant.evaluate.selector,
                            msg.sender,        // profile (UP address)
                            screener,          // screenerAddress
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
                        bool screenerResult = _safeDecodeBoolean(ret);
                        emit ScreenResult(typeId, msg.sender, screener, screenerResult);
                        
                        if (isAndChain && !screenerResult) {
                            shouldExecute = false;
                            break;
                        } else if (!isAndChain && screenerResult) {
                            shouldExecute = true;
                            break;
                        } else if (!isAndChain && !screenerResult) {
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
                ) = _safeDecodeExecutiveResult(returnData);


                if (execResultData.length > 0) {
                    (uint256 newValue, bytes memory newLsp1Data) = _safeDecodeExecutionResult(execResultData);
                    currentValue = newValue;
                    currentLsp1Data = newLsp1Data;
                }

                if (execOperationType != NO_OP) {
                    IERC725X(msg.sender).execute(execOperationType, execTarget, execValue, execData);
                    emit AssistantInvoked(msg.sender, executiveAssistant);
                    emit ExecutionResult(typeId, msg.sender, executiveAssistant, true);
                } else {
                    emit AssistantNoOp(msg.sender, executiveAssistant);
                    emit ExecutionResult(typeId, msg.sender, executiveAssistant, false);
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


    /**
     * @dev Safely decodes an address array with comprehensive validation
     * @param data The encoded data to decode
     * @return The decoded address array
     */
    function _safeDecodeAddressArray(bytes memory data) internal pure returns (address[] memory) {
        if (data.length == 0) {
            return new address[](0);
        }
        
        // Decode the array - abi.decode will revert if data is malformed
        address[] memory decodedArray = abi.decode(data, (address[]));
        return decodedArray;
    }

    /**
     * @dev Safely decodes a boolean value with validation
     * @param data The encoded data to decode
     * @return The decoded boolean value
     */
    function _safeDecodeBoolean(bytes memory data) internal pure returns (bool) {
        if (data.length == 0) {
            return false;
        }
        
        // Decode the boolean - abi.decode will revert if data is malformed
        bool decodedBool = abi.decode(data, (bool));
        return decodedBool;
    }

    /**
     * @dev Safely decodes executive assistant execution result data
     * @param data The encoded execution result data
     * @return execOperationType The operation type
     * @return execTarget The target address
     * @return execValue The value
     * @return execData The execution data
     * @return execResultData The result data
     */
    function _safeDecodeExecutiveResult(bytes memory data) internal pure returns (
        uint256 execOperationType,
        address execTarget,
        uint256 execValue,
        bytes memory execData,
        bytes memory execResultData
    ) {
        if (data.length == 0) {
            revert InvalidEncodedExecutiveResultData(data);
        }
        
        (execOperationType, execTarget, execValue, execData, execResultData) = 
            abi.decode(data, (uint256, address, uint256, bytes, bytes));
    }

    /**
     * @dev Safely decodes execution result data (value and lsp1Data)
     * @param data The encoded result data
     * @return newValue The new value
     * @return newLsp1Data The new LSP1 data
     */
    function _safeDecodeExecutionResult(bytes memory data) internal pure returns (
        uint256 newValue,
        bytes memory newLsp1Data
    ) {
        if (data.length == 0) {
            revert InvalidEncodedExecutionResultData(data);
        }
        
        (newValue, newLsp1Data) = abi.decode(data, (uint256, bytes));
    }

}