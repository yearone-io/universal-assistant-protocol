// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces
import {IExecutiveAssistant} from "../IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {IERC725X} from "@erc725/smart-contracts/contracts/interfaces/IERC725X.sol";

// Constants
import {_TYPEID_LSP0_VALUE_RECEIVED} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";


contract TipAssistant is IExecutiveAssistant, ERC165 {
    error TipConfigNotSet();
    error InvalidTipRecipient();
    error InvalidTipPercentage();
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
     * @param assistantAddress The address of this Assistant contract.
     * @param notifier The address that triggered the URD on the UP (e.g., token contract).
     * @param value The amount of native tokens (e.g. LYX) sent with the transaction.
     * @param typeId The identifier representing the type of transaction or asset.
     * @param data Additional data relevant to the transaction.
     *
     * @return A bytes array containing any data you wish to return.
     */
    function execute(
        address assistantAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) external override returns (bytes memory) {
        // <-- added payable
        address upAddress = msg.sender;

        // 1) Read config data from the UP’s ERC725Y
        IERC725Y upERC725Y = IERC725Y(upAddress);

        // // This key is where we expect the tip config to be stored (address, uint256).
        bytes32 settingsKey = getSettingsDataKey(assistantAddress);
        bytes memory settingsData = upERC725Y.getData(settingsKey);
        if (settingsData.length == 0) {
            revert TipConfigNotSet();
        }

        // // 2) Decode the tip address + tip percentage
        (address tipAddress, uint256 tipPercentage) = abi.decode(
            settingsData,
            (address, uint256)
        );

        // Basic sanity checks
        if (tipAddress == address(0)) {
            revert InvalidTipRecipient();
        }
        if (tipPercentage == 0) {
            // if 0 do nothing:
            return abi.encode(value, data);
        }
        // 3) We only do the tip if the typeId is "value received" and there's actual value

        if (typeId == _TYPEID_LSP0_VALUE_RECEIVED && value > 0) {
            // Calculate how much to donate
            // e.g. if tipPercentage = 2 => 2%
            // or if tipPercentage = 10 => 10%
            uint256 tipAmount = (value * tipPercentage) / 100;

            if (tipAmount > 0) {
                // 4) Transfer that portion via the UP
                IERC725X(upAddress).execute(
                    0, // OPERATION_CALL
                    tipAddress, // The address that receives the tip
                    tipAmount, // The tip amount
                    "" // No extra data for a plain LYX transfer
                );
                emit TipSent(upAddress, tipAddress, tipAmount);
            }
        }
        // Return the same data or anything else you need
        return abi.encode(value, data);
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
