// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC725Y } from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import { LSP0ERC725Account } from "@lukso/lsp-smart-contracts/contracts/LSP0ERC725Account/LSP0ERC725Account.sol";
import { UniversalReceiverDelegateUAP } from "../UniversalReceiverDelegateUAP.sol";
import {console} from "hardhat/console.sol";

contract MockLSP0 is LSP0ERC725Account(address(0)) {
    address private erc725Y;

    function setERC725Y(address _erc725Y) public {
        erc725Y = _erc725Y;
    }

    function getData(bytes32 key) public view override returns (bytes memory values) {
        return IERC725Y(erc725Y).getData(key);
    }

    function callUniversalReceiverDelegate(
        address delegateAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) public returns (bytes memory) {
        UniversalReceiverDelegateUAP delegate = UniversalReceiverDelegateUAP(delegateAddress);
        return delegate.universalReceiverDelegate(notifier, value, typeId, data);
    }

    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        // If the return data length is less than 68, then the transaction failed silently (without a revert message)
        if (returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Slice the sighash.
            returnData := add(returnData, 4)
        }
        return abi.decode(returnData, (string));
    }
}
