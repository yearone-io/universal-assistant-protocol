// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC725Y } from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {LSP0ERC725Account} from "@lukso/lsp-smart-contracts/contracts/LSP0ERC725Account/LSP0ERC725Account.sol";

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
        (bool success, bytes memory returnData) = delegateAddress.delegatecall(
            abi.encodeWithSignature(
                "universalReceiverDelegate(address,uint256,bytes32,bytes)",
                notifier,
                value,
                typeId,
                data
            )
        );
        require(success, "Delegatecall failed");
        return returnData;
    }
}
