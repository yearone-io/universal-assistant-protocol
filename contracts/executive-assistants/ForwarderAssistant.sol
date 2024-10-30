// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

// Import interfaces and contracts
import { IExecutiveAssistant } from "../IExecutiveAssistant.sol";
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

import {console} from "hardhat/console.sol";

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

        bytes32 settingsKey = getSettingsDataKey(assistantAddress);

        bytes memory settingsData = upERC725Y.getData(settingsKey);

        // Decode the settingsData to get targetAddress.
        // Assume settingsData is encoded as: abi.encode(address targetAddress)
        console.log("ForwarderAssistant: settingsData redirect address");
        address targetAddress = abi.decode(settingsData, (address));
        console.logAddress(targetAddress);

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
        /*
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
                true,
                lsp7Data
            );

            // Execute the transfer via the UP's ERC725X execute function
            IERC725X(upAddress).execute(0, notifier, 0, encodedLSP7Tx);

            // Modify the data to set amount to zero
            uint256 modifiedAmount = 0;
            bytes memory modifiedData = abi.encode(sender, receiver, operator, modifiedAmount, lsp7Data);

            // Return the modified value and data
            return abi.encode(value, modifiedData);

        } else */if (typeId == _TYPEID_LSP8_TOKENSRECIPIENT) {
            // Decode data to extract the tokenId
            (address txSource, address from, address to, bytes32 tokenId, bytes memory txData) = abi.decode(
                data,
                (address, address, address, bytes32, bytes)
            );
            console.log("ForwarderAssistant: msg.sender");
            console.logAddress(msg.sender);
            console.log("ForwarderAssistant: txSource contract");
            console.logAddress(txSource);
            console.log("ForwarderAssistant: original from");
            console.logAddress(from);
            console.log("ForwarderAssistant: original to");
            console.logAddress(to);
            console.log("ForwarderAssistant: redirected targetAddress");
            console.logAddress(targetAddress);

            // Prepare the transfer call
            bytes memory encodedLSP8Tx = abi.encodeCall(
                ILSP8IdentifiableDigitalAsset.transfer,
                (msg.sender, targetAddress, tokenId, true, data)
            );
            console.log("ForwarderAssistant: encodedLSP8Tx");
            // Execute the transfer via the UP's ERC725X execute function
            IERC725X(msg.sender).execute(0, notifier, 0, encodedLSP8Tx);
            console.log("ForwarderAssistant: IERC725X(msg.sender).execute done");

            // Modify the data to set tokenId to zero
            bytes memory modifiedData = abi.encode(txSource, from, to, bytes32(0), txData);

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
    function getSettingsDataKey(address assistantAddress) internal pure returns (bytes32) {
        bytes32 firstWordHash = keccak256(bytes("UAPExecutiveConfig"));

        bytes memory temporaryBytes = bytes.concat(
            bytes10(firstWordHash),
            bytes2(0),
            bytes20(assistantAddress)
        );

        return bytes32(temporaryBytes);
    }
}
