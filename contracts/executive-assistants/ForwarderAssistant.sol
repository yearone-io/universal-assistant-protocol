// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import {IExecutiveAssistant} from "../IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/ILSP7DigitalAsset.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";

// Constants
import {_TYPEID_LSP7_TOKENSRECIPIENT} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7Constants.sol";
import {_TYPEID_LSP8_TOKENSRECIPIENT} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";



contract ForwarderAssistant is IExecutiveAssistant, ERC165 {
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

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExecutiveAssistant).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev The execute function called by URDuap via delegatecall.
     * @param upAddress The address of the Universal Profile
     * @param notifier The address that triggered the URD on the UP (e.g., token contract).
     * @param value The amount of Ether sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     * @return A bytes array containing the updated value and data.
     */
    function execute(
        address upAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) external override returns (uint256, address, uint256, bytes memory, bytes memory) {
        if (data.length == 0) {
            return (0, notifier, value, "", "");
        }
        // Read settings from the UP's ERC725Y data store.
        IERC725Y upERC725Y = IERC725Y(upAddress);
        bytes32 settingsKey = getSettingsDataKey(address(this));
        bytes memory settingsData = upERC725Y.getData(settingsKey);
        // Decode the settingsData to get targetAddress.
        // Assume settingsData is encoded as: abi.encode(address targetAddress)
        (address targetAddress, bool skipOwnTx) = abi.decode(settingsData, (address, bool));
        if (targetAddress == address(0)) {
            revert TargetAddressNotSet();
        }
        if (typeId == _TYPEID_LSP7_TOKENSRECIPIENT) {
            (
                address sender,
                ,
                ,
                uint256 amount,
                bytes memory lsp7Data
            ) = abi.decode(data, (address, address, address, uint256, bytes));
            if (sender == upAddress && skipOwnTx) {
                return (0, notifier, value, data, "");
            }
            // Prepare the transfer call
            bytes memory encodedLSP7Tx = abi.encodeWithSelector(
                ILSP7DigitalAsset.transfer.selector,
                upAddress,
                targetAddress,
                amount,
                true,
                lsp7Data
            );
            emit LSP7AssetForwarded(notifier, amount, targetAddress);
            return (0, notifier, value, encodedLSP7Tx, abi.encode(value, ""));
        } else if (typeId == _TYPEID_LSP8_TOKENSRECIPIENT) {
            // Decode data to extract the tokenId
            (
                address sender,
                ,
                ,
                bytes32 tokenId,
            ) = abi.decode(data, (address, address, address, bytes32, bytes));
            if (sender == upAddress && skipOwnTx) {
                return (0, notifier, value, data, "");
            }
            // Prepare the transfer call
            bytes memory encodedLSP8Tx = abi.encodeCall(
                ILSP8IdentifiableDigitalAsset.transfer,
                (upAddress, targetAddress, tokenId, true, data)
            );
            emit LSP8AssetForwarded(notifier, tokenId, targetAddress);
            return (0, notifier, value, encodedLSP8Tx, abi.encode(value, ""));
        }
        revert InvalidTypeId();
    }

    /**
     * @dev Helper function to generate the assistant instructions key.
     * @param assistantAddress The address of the assistant.
     * @return The bytes32 key.
     */
    function getSettingsDataKey(
        address assistantAddress
    ) internal pure returns (bytes32) {
        bytes32 firstWordHash = keccak256(bytes("UAPExecutiveConfig"));

        bytes memory temporaryBytes = bytes.concat(
            bytes10(firstWordHash),
            bytes2(0),
            bytes20(assistantAddress)
        );

        return bytes32(temporaryBytes);
    }
}
