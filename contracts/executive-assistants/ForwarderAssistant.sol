// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import {ExecutiveAssistantBase} from "./ExecutiveAssistantBase.sol";
import {ILSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/ILSP7DigitalAsset.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";

// Constants
import {_TYPEID_LSP7_TOKENSRECIPIENT} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7Constants.sol";
import {_TYPEID_LSP8_TOKENSRECIPIENT} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";


contract ForwarderAssistant is ExecutiveAssistantBase {
    // uint256 public NO_OP = type(uint256).max;
    event LSP7AssetForwarded(
        address asset,
        uint256 amount,
        address destination
    );
    event LSP8AssetForwarded(
        address asset,
        bytes32 tokenId,
        address destination
    );
    error TargetAddressNotSet();
    error InvalidTypeId();
    error InvalidEncodedForwarderConfigData(bytes data);

    /**
     * @dev The execute function called by URDuap via delegatecall.
     * @param upAddress The address of the Universal Profile
     * @param notifier The address that triggered the URD on the UP (e.g., token contract).
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the transaction.
     * @return A bytes array containing the updated value and data.
     */
    function execute(
        uint256 executionOrder,
        address upAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external returns (uint256, address, uint256, bytes memory, bytes memory) {
        if (lsp1Data.length == 0) {
            return (0, notifier, value, "", "");
        }
        (, bytes memory encodedConfig) = this.fetchConfiguration(upAddress, typeId, executionOrder);
        address targetAddress = _safeDecodeForwarderConfig(encodedConfig);
        if (targetAddress == address(0)) {
            revert TargetAddressNotSet();
        }
        if (typeId == _TYPEID_LSP7_TOKENSRECIPIENT) {
            // lsp1Data when minting https://github.com/lukso-network/lsp-smart-contracts/blob/7ec72e7c549f1e071a440f343e5c8a7fef22cf55/packages/lsp7-contracts/contracts/LSP7DigitalAsset.sol#L609
            // lsp1Data when transferring https://github.com/lukso-network/lsp-smart-contracts/blob/7ec72e7c549f1e071a440f343e5c8a7fef22cf55/packages/lsp7-contracts/contracts/LSP7DigitalAsset.sol#L754
            (
                address operator,
                address sender,
                address receiver,
                uint256 amount,
                bytes memory lsp7Data
            ) = abi.decode(lsp1Data, (address, address, address, uint256, bytes));
            // Prepare the transfer call
            bytes memory encodedLSP7Tx = abi.encodeWithSelector(
                ILSP7DigitalAsset.transfer.selector,
                upAddress,
                targetAddress,
                amount,
                true,
                lsp7Data
            );
            bytes memory resultingLsp1Data = abi.encode(
                operator,
                sender,
                receiver,
                0,
                lsp7Data
            );
            // Check UP's balance before proceeding
            uint256 upBalance = ILSP7DigitalAsset(notifier).balanceOf(upAddress);
            if (amount <= upBalance) {
                emit LSP7AssetForwarded(notifier, amount, targetAddress);
                return (0, notifier, value, encodedLSP7Tx, abi.encode(value, resultingLsp1Data));
            } else {
                return (NO_OP, notifier, value, "", abi.encode(value, resultingLsp1Data));
            }
        } else if (typeId == _TYPEID_LSP8_TOKENSRECIPIENT) {
            // lsp1Data when minting https://github.com/lukso-network/lsp-smart-contracts/blob/7ec72e7c549f1e071a440f343e5c8a7fef22cf55/packages/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol#L731
            // lsp1Data when transferring https://github.com/lukso-network/lsp-smart-contracts/blob/7ec72e7c549f1e071a440f343e5c8a7fef22cf55/packages/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol#L858
            (
                address operator,
                address sender,
                address receiver,
                bytes32 tokenId,
                bytes memory lsp8Data
            ) = abi.decode(lsp1Data, (address, address, address, bytes32, bytes));
            // Prepare the transfer call
            bytes memory encodedLSP8Tx = abi.encodeCall(
                ILSP8IdentifiableDigitalAsset.transfer,
                (upAddress, targetAddress, tokenId, true, lsp1Data)
            );
            bytes memory resultingLsp1Data = abi.encode(
                operator,
                sender,
                receiver,
                "",
                lsp8Data
            );
            // Check if UP owns the tokenId (LSP8-specific)
            address tokenOwner = ILSP8IdentifiableDigitalAsset(notifier).tokenOwnerOf(tokenId);
            if (tokenOwner != upAddress) {
                emit LSP8AssetForwarded(notifier, tokenId, targetAddress);
                return (0, notifier, value, encodedLSP8Tx, abi.encode(value, resultingLsp1Data));
            } else {
                return (NO_OP, notifier, value, "", abi.encode(value, resultingLsp1Data));
            } 
        }
        revert InvalidTypeId();
    }

    /**
     * @dev Safely decodes forwarder configuration (address) 
     * @param data The encoded data to decode
     * @return targetAddress The forward target address
     */
    function _safeDecodeForwarderConfig(bytes memory data) internal pure returns (address targetAddress) {
        if (data.length == 0) {
            revert InvalidEncodedForwarderConfigData(data);
        }
        
        // Decode the address - abi.decode will revert if data is malformed
        targetAddress = abi.decode(data, (address));
    }
}
