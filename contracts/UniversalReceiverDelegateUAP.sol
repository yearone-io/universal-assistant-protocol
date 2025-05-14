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
    // Operation types from IERC725X
    uint256 private constant OPERATION_CALL = 0;
    uint256 private constant OPERATION_CREATE = 1;
    uint256 private constant OPERATION_CREATE2 = 2;
    uint256 private constant OPERATION_STATICCALL = 3;
    uint256 private constant OPERATION_DELEGATECALL = 4;
    uint256 private constant NO_OP = type(uint256).max;

    bytes4 public constant _INTERFACEID_UAP = 0x03309e5f;
    bytes32 public constant VERIFIED_SCREENERS_KEY = 0x57e1c9aeeb8d707aa6d484032ae2eebb4ee09b6786488dafe2d927a8f6446417;
    
    event TypeIdConfigFound(bytes32 typeId);
    event AssistantFound(address executiveAssistant);
    event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant);
    event AssistantNoOp(address indexed subscriber, address executiveAssistant);
    event ScreenerVerificationFailed(address screenerAssistant);
    
    error ExecutiveAssistantExecutionFailed(address executiveAssistant, bytes32 typeId);
    error ScreenerAssistantExecutionFailed(address executiveAssistant, address screenerAssistant, bytes32 typeId);
    error InvalidEncodedData();
    error InvalidOperationType(uint256 operationType);
    error UntrustedScreenerAssistant(address screenerAssistant);

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
            bytes20(keccak256(abi.encodePacked(typeId)))
        );
        bytes memory typeConfig = IERC725Y(msg.sender).getData(typeConfigKey);
        if (typeConfig.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }
        emit TypeIdConfigFound(typeId);

        // Decode executive assistants
        address[] memory executiveAssistants;
        
        // Basic data validation
        if (typeConfig.length < 64) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }
        
        // Try to decode address array - catch any decode errors
        bool decodeSuccess;
        bytes memory result;
        
        (bool decodeCallSuccess, bytes memory decodeReturnData) = address(this).staticcall(
            abi.encodeWithSelector(this.attemptDecodeAddressArray.selector, typeConfig)
        );
        
        if (!decodeCallSuccess || decodeReturnData.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }
        
        (decodeSuccess, result) = abi.decode(decodeReturnData, (bool, bytes));
        
        if (!decodeSuccess) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }
        
        executiveAssistants = abi.decode(result, (address[]));
        
        if (executiveAssistants.length == 0) {
            return super.universalReceiverDelegate(notifier, value, typeId, lsp1Data);
        }

        bytes memory currentLsp1Data = lsp1Data;
        uint256 currentValue = value;
        
        // Original data for screener assistants
        bytes memory originalLsp1Data = lsp1Data;
        uint256 originalValue = value;
        
        // Track data modification
        bool dataModified = false;
        
        for (uint256 i = 0; i < executiveAssistants.length; i++) {
            address executiveAssistant = executiveAssistants[i];
            bool shouldExecute = true;
            
            // Generate keys using the typeId hash
            bytes32 typeIdHash = keccak256(abi.encodePacked(typeId));
            
            // Use index for keys instead of address
            bytes32 screenersChainKey = LSP2Utils.generateMappingWithGroupingKey(
                bytes6(keccak256("UAPExecutiveScreeners")),
                bytes4(typeIdHash),
                uint256ToBytes20(i)
            );
            
            // Get whether the chain is an AND or OR logic chain
            bytes32 screenersChainLogicKey = LSP2Utils.generateMappingWithGroupingKey(
                bytes6(keccak256("UAPExecutiveScreenersANDLogic")),
                bytes4(typeIdHash),
                uint256ToBytes20(i)
            );
            
            bytes memory screenersChainRaw = IERC725Y(msg.sender).getData(screenersChainKey);
            if (screenersChainRaw.length > 0) {
                // Decode screener assistant addresses - verify data
                if (screenersChainRaw.length < 64) {
                    continue; // Skip if invalid data
                }
                
                (bool screenerDecodeSuccess, bytes memory screenerResult) = address(this).staticcall(
                    abi.encodeWithSelector(this.attemptDecodeAddressArray.selector, screenersChainRaw)
                );
                
                // Continue if decode fails
                if (!screenerDecodeSuccess || screenerResult.length == 0) {
                    continue;
                }
                
                (bool screenerArraySuccess, bytes memory screenerArrayResult) = abi.decode(screenerResult, (bool, bytes));
                
                if (!screenerArraySuccess) {
                    continue;
                }
                
                address[] memory screenerAssistants = abi.decode(screenerArrayResult, (address[]));
                
                // Skip if no screeners
                if (screenerAssistants.length == 0) {
                    continue;
                }
                
                // Determine chain logic
                bytes memory screenersChainLogicRaw = IERC725Y(msg.sender).getData(screenersChainLogicKey);
                bool isAndChain = true;
                if (screenersChainLogicRaw.length > 0) {
                    isAndChain = (screenersChainLogicRaw[0] != 0x00);
                }
                
                for (uint256 j = 0; j < screenerAssistants.length; j++) {
                    address screener = screenerAssistants[j];
                    uint256 screenerOrder = (i * 1000) + j;
                    
                    // Check if screener is in verified list
                    if (!isVerifiedScreenerAssistant(msg.sender, screener)) {
                        emit ScreenerVerificationFailed(screener);
                        if (isAndChain) {
                            shouldExecute = false;
                            break;
                        }
                        continue;
                    }
                    
                    // Use original values for screeners to prevent contamination
                    (bool delegateSuccess, bytes memory returnValue) = screener.delegatecall(
                        abi.encodeWithSelector(
                            IScreenerAssistant.evaluate.selector,
                            screener,
                            screenerOrder,
                            notifier,
                            originalValue,
                            typeId,
                            originalLsp1Data
                        )
                    );
                    
                    if (!delegateSuccess) {
                        emit ScreenerVerificationFailed(screener);
                        if (returnValue.length > 0) {
                            assembly {
                                revert(add(returnValue, 32), mload(returnValue))
                            }
                        } else {
                            revert ScreenerAssistantExecutionFailed(executiveAssistant, screener, typeId);
                        }
                    }
                    
                    // Safely decode boolean result
                    bool evalResult = false;
                    if (returnValue.length >= 32) {
                        assembly {
                            evalResult := mload(add(returnValue, 32))
                        }
                        evalResult = evalResult != false;
                    }
                    
                    if (isAndChain && !evalResult) {
                        shouldExecute = false;
                        break;
                    } else if (!isAndChain && evalResult) {
                        shouldExecute = true;
                        break;
                    } else if (!isAndChain && !evalResult) {
                        shouldExecute = false;
                    }
                }
            }
            
            // Execute assistant if all screeners pass
            if (shouldExecute) {
                emit AssistantFound(executiveAssistant);
                
                (bool execSuccess, bytes memory execReturnData) = executiveAssistant.call(
                    abi.encodeWithSelector(
                        IExecutiveAssistant.execute.selector,
                        i,
                        msg.sender,
                        notifier,
                        dataModified ? currentValue : originalValue,
                        typeId,
                        dataModified ? currentLsp1Data : originalLsp1Data
                    )
                );
                
                if (!execSuccess) {
                    if (execReturnData.length > 0) {
                        assembly {
                            revert(add(execReturnData, 32), mload(execReturnData))
                        }
                    } else {
                        revert ExecutiveAssistantExecutionFailed(executiveAssistant, typeId);
                    }
                }
                
                // Validate and decode return data
                if (execReturnData.length < 160) {
                    emit AssistantNoOp(msg.sender, executiveAssistant);
                    continue; // Skip this assistant if return data is invalid
                }
                
                uint256 execOperationType;
                address execTarget;
                uint256 execValue;
                bytes memory execData;
                bytes memory execResultData;
                
                (bool tupleDecodeSuccess, bytes memory decodedTuple) = validateAndDecodeTuple(execReturnData);
                
                if (!tupleDecodeSuccess) {
                    emit AssistantNoOp(msg.sender, executiveAssistant);
                    continue;
                }
                
                (execOperationType, execTarget, execValue, execData, execResultData) = 
                    abi.decode(decodedTuple, (uint256, address, uint256, bytes, bytes));
                
                // Process data modifications
                if (execResultData.length > 0) {
                    (bool resultDecodeSuccess, bytes memory decodedResult) = validateAndDecodeResult(execResultData);
                    
                    if (resultDecodeSuccess) {
                        (uint256 newValue, bytes memory newLsp1Data) = abi.decode(decodedResult, (uint256, bytes));
                        currentValue = newValue;
                        currentLsp1Data = newLsp1Data;
                        dataModified = true;
                    } else {
                        emit AssistantNoOp(msg.sender, executiveAssistant);
                        continue;
                    }
                }
                
                // Validate operation type and execute
                if (execOperationType != NO_OP) {
                    if (!isValidOperationType(execOperationType)) {
                        revert InvalidOperationType(execOperationType);
                    }
                    
                    // Extra validation for DELEGATECALL which is high risk
                    if (execOperationType == OPERATION_DELEGATECALL && !isVerifiedScreenerAssistant(msg.sender, execTarget)) {
                        revert UntrustedScreenerAssistant(execTarget);
                    }
                    
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
    
    /**
     * @dev Helper function to safely decode an address array
     * @param data The encoded data
     * @return A tuple with success status and decoded data
     */
    function attemptDecodeAddressArray(bytes memory data) public pure returns (bool, bytes memory) {
        // Verify data format before decoding
        if (data.length < 64) {
            return (false, "");
        }
        
        // To safely decode without try/catch, we need to do manual validation
        // For address[] the first 32 bytes contain the offset, which should be 32 for a well-formed array
        // The next 32 bytes contain the length of the array
        uint256 offset;
        uint256 length;
        
        assembly {
            // Load offset
            offset := mload(add(data, 32))
            // Load length if offset is valid
            if eq(offset, 32) {
                length := mload(add(data, 64))
            }
        }
        
        // Check if offset is valid (should be 32)
        if (offset != 32) {
            return (false, "");
        }
        
        // Check if length makes sense with data size
        // Each address is 20 bytes, but encoded as 32 bytes in memory
        if (data.length < 64 + (length * 32)) {
            return (false, "");
        }
        
        // Decode if validation passes
        address[] memory addresses = abi.decode(data, (address[]));
        
        // Check for zero addresses
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == address(0)) {
                return (false, "");
            }
        }
        
        return (true, abi.encode(addresses));
    }
    
    /**
     * @dev Helper function to safely validate and decode a tuple
     * @param data The encoded tuple data
     * @return A tuple with success status and decoded data
     */
    function validateAndDecodeTuple(bytes memory data) internal pure returns (bool, bytes memory) {
        // Manual validation for tuple format before decoding
        if (data.length < 160) {
            return (false, "");
        }
        
        // Perform actual decoding
        (uint256 opType, address target, uint256 value, bytes memory execData, bytes memory resultData) = 
            abi.decode(data, (uint256, address, uint256, bytes, bytes));
            
        // Additional validations
        if (target == address(0)) {
            return (false, "");
        }
        
        return (true, abi.encode(opType, target, value, execData, resultData));
    }
    
    /**
     * @dev Helper function to validate and decode result data
     * @param data The encoded result data
     * @return A tuple with success status and decoded data
     */
    function validateAndDecodeResult(bytes memory data) internal pure returns (bool, bytes memory) {
        // Basic validation
        if (data.length < 64) {
            return (false, "");
        }
        
        // Perform the decoding
        (uint256 value, bytes memory lsp1Data) = abi.decode(data, (uint256, bytes));
        
        // No special validation needed for these values
        return (true, abi.encode(value, lsp1Data));
    }
    
    /**
     * @dev Validates if the operation type is valid
     * @param operationType The operation type to validate
     * @return True if the operation type is valid, false otherwise
     */
    function isValidOperationType(uint256 operationType) internal pure returns (bool) {
        return (
            operationType == OPERATION_CALL ||
            operationType == OPERATION_CREATE ||
            operationType == OPERATION_CREATE2 ||
            operationType == OPERATION_STATICCALL ||
            operationType == OPERATION_DELEGATECALL ||
            operationType == NO_OP
        );
    }
    
    /**
     * @dev Check if a screener assistant is verified
     * @param upAddress The address of the Universal Profile
     * @param screenerAddress The address of the screener assistant to check
     * @return True if the screener is trusted, false otherwise
     */
    function isVerifiedScreenerAssistant(address upAddress, address screenerAddress) internal view returns (bool) {
        bytes memory verifiedScreenersData = IERC725Y(upAddress).getData(VERIFIED_SCREENERS_KEY);
        
        if (verifiedScreenersData.length < 64) {
            return false;
        }
        
        (bool success, bytes memory result) = address(this).staticcall(
            abi.encodeWithSelector(this.attemptDecodeAddressArray.selector, verifiedScreenersData)
        );
        
        if (!success || result.length == 0) {
            return false;
        }
        
        (bool decodeSuccess, bytes memory decodedResult) = abi.decode(result, (bool, bytes));
        
        if (!decodeSuccess) {
            return false;
        }
        
        address[] memory verifiedScreeners = abi.decode(decodedResult, (address[]));
        
        for (uint256 i = 0; i < verifiedScreeners.length; i++) {
            if (verifiedScreeners[i] == screenerAddress) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * @dev Convert a uint256 to bytes20
     * @param value The uint256 value to convert
     * @return The bytes20 representation
     */
    function uint256ToBytes20(uint256 value) internal pure returns (bytes20) {
        uint256 maskedValue = value & (2**160 - 1);
        return bytes20(uint160(maskedValue));
    }
}