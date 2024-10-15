// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

// Import interfaces and contracts
import { IExecutiveAssistant } from "./IExecutiveAssistant.sol";
import { IERC725Y } from '@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol';
import { IERC725X } from '@erc725/smart-contracts/contracts/interfaces/IERC725X.sol';
import { ILSP7DigitalAsset } from '@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/ILSP7DigitalAsset.sol';
import { ILSP8IdentifiableDigitalAsset } from '@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol';

// Constants
import { _INTERFACEID_LSP9 } from '@lukso/lsp-smart-contracts/contracts/LSP9Vault/LSP9Constants.sol';
import { _TYPEID_LSP7_TOKENSRECIPIENT } from '@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7Constants.sol';
import { _TYPEID_LSP8_TOKENSRECIPIENT } from '@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol';

// Utils
import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import { ERC165Checker } from '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

interface IVault {
    function owner() external view returns (address);
}

contract ForwarderAssistant is IExecutiveAssistant, ERC165 {
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return interfaceId == type(IExecutiveAssistant).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev The execute function called by URDuap via delegatecall.
     * @param assistantAddress The address of the Assistant contract.
     * @param notifier The address that triggered the URD on the UP (e.g., token contract).
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     * @return A bytes array containing the updated value and data.
     */
    function execute(
        address assistantAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    )
        external
        override
        returns (bytes memory)
    {
        // Since we're called via delegatecall, msg.sender is the UP's address.
        address upAddress = msg.sender;

        // Read settings from the UP's ERC725Y data store.
        IERC725Y upERC725Y = IERC725Y(upAddress);

        // Generate the key for assistant instructions: "UAPAssistantInstructions:<assistantAddress>"
        bytes32 assistantInstructionsKey = generateAssistantInstructionsKey(assistantAddress);

        bytes memory settingsData = upERC725Y.getData(assistantInstructionsKey);

        // Decode the settingsData to get targetAddress.
        // Assume settingsData is encoded as: abi.encode(address targetAddress)
        address targetAddress = abi.decode(settingsData, (address));

        require(
            targetAddress != address(0),
            'ForwarderAssistant: target address not set'
        );

        // Ensure the notifier is a contract and the UP has a balance
        if (notifier.code.length > 0) {
            bool hasBalance = false;
            // Check for LSP7 balance
            try ILSP7DigitalAsset(notifier).balanceOf(upAddress) returns (uint256 balance) {
                if (balance > 0) {
                    hasBalance = true;
                }
            } catch {
                // Not LSP7, try LSP8
                try ILSP8IdentifiableDigitalAsset(notifier).balanceOf(upAddress) returns (uint256 balance) {
                    if (balance > 0) {
                        hasBalance = true;
                    }
                } catch {
                    // Not LSP8, proceed without setting hasBalance
                }
            }
            if (!hasBalance) {
                // Return the original value and data
                return abi.encode(value, data);
            }
        }

        if (typeId == _TYPEID_LSP7_TOKENSRECIPIENT) {
            // Decode data to extract the amount
            (address sender, address receiver, address operator, uint256 amount, bytes memory lsp7Data) = abi.decode(
                data,
                (address, address, address, uint256, bytes)
            );

            // Prepare the transfer call
            bytes memory encodedLSP7Tx = abi.encodeWithSelector(
                ILSP7DigitalAsset.transfer.selector,
                upAddress,
                targetAddress,
                amount,
                false,
                lsp7Data
            );

            // Execute the transfer via the UP's ERC725X execute function
            IERC725X(upAddress).execute(0, notifier, 0, encodedLSP7Tx);

            // Modify the data to set amount to zero
            uint256 modifiedAmount = 0;
            bytes memory modifiedData = abi.encode(sender, receiver, operator, modifiedAmount, lsp7Data);

            // Return the modified value and data
            return abi.encode(value, modifiedData);

        } else if (typeId == _TYPEID_LSP8_TOKENSRECIPIENT) {
            // Decode data to extract the tokenId
            (address sender, address receiver, address operator, bytes32 tokenId, bytes memory lsp8Data) = abi.decode(
                data,
                (address, address, address, bytes32, bytes)
            );

            // Prepare the transfer call
            bytes memory encodedLSP8Tx = abi.encodeWithSelector(
                ILSP8IdentifiableDigitalAsset.transfer.selector,
                upAddress,
                targetAddress,
                tokenId,
                false,
                lsp8Data
            );

            // Execute the transfer via the UP's ERC725X execute function
            IERC725X(upAddress).execute(0, notifier, 0, encodedLSP8Tx);

            // Modify the data to set tokenId to zero
            bytes32 modifiedTokenId = bytes32(0);
            bytes memory modifiedData = abi.encode(sender, receiver, operator, modifiedTokenId, lsp8Data);

            // Return the modified value and data
            return abi.encode(value, modifiedData);

        }

        // If no action taken, return the original value and data
        return abi.encode(value, data);
    }

    /**
     * @dev Helper function to generate the assistant instructions key.
     * @param assistantAddress The address of the assistant.
     * @return The bytes32 key.
     */
    function generateAssistantInstructionsKey(address assistantAddress) internal pure returns (bytes32) {
        // The key is: keccak256("UAPAssistantInstructions") + first 20 bytes of assistantAddress
        return bytes32(abi.encodePacked(bytes10(keccak256("UAPAssistantInstructions")), bytes20(assistantAddress)));
    }
}
