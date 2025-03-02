// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces
import {IExecutiveAssistant} from "../IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// Constants
import {_TYPEID_LSP0_VALUE_RECEIVED} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";


contract TipAssistant is IExecutiveAssistant, ERC165 {
    error TipConfigNotSet();
    error InvalidTipRecipient();
    error InvalidTipPercentage();
    error InvalidTipType();
    event TipSent(
        address indexed upAddress,
        address indexed tipAddress,
        uint256 tipAmount
    );
    /**
     * @dev Check which interfaces this contract supports.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExecutiveAssistant).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev The main execution function of this Assistant, called via delegatecall by the UniversalReceiverDelegateUAP.
     *
     * @param upAddress The address of the Universal Profile.
     * @param value The amount of native tokens (e.g. LYX) sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param lsp1Data Additional data relevant to the notification
     *
     * @return A bytes array containing any data you wish to return.
     */
    function execute(
        address upAddress,
        address ,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external override returns (uint256, address, uint256, bytes memory, bytes memory) {
        IERC725Y upERC725Y = IERC725Y(upAddress);
        // This key is where we expect the tip config to be stored (address, uint256).
        bytes32 settingsKey = getSettingsDataKey(address(this));
        bytes memory settingsData = upERC725Y.getData(settingsKey);
        if (settingsData.length == 0) {
            revert TipConfigNotSet();
        }
        (address tipAddress, uint256 tipPercentage) = abi.decode(
            settingsData,
            (address, uint256)
        );
        // Basic sanity checks
        if (tipAddress == address(0)) revert InvalidTipRecipient();
        if (typeId != _TYPEID_LSP0_VALUE_RECEIVED) revert InvalidTipType();
        if (tipPercentage == 0 || tipPercentage > 100) revert InvalidTipPercentage();
        uint256 tipAmount = value > 0 ? (value * tipPercentage) / 100 : 0;
        emit TipSent(upAddress, tipAddress, tipAmount);
        return (0, tipAddress, tipAmount, "", abi.encode(value - tipAmount, lsp1Data));
    }

    /**
     * @dev Generate the settings key used to store the (address, uint256) config.
     */
    function getSettingsDataKey(
        address assistantAddress
    ) internal pure returns (bytes32) {
        bytes32 firstWordHash = keccak256(bytes("UAPExecutiveConfig"));
        return
            bytes32(
                bytes.concat(
                    bytes10(firstWordHash),
                    bytes2(0),
                    bytes20(assistantAddress)
                )
            );
    }
}
