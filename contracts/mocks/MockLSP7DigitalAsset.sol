// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import the LSP7DigitalAsset contract
import {LSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7DigitalAsset.sol";

contract MockLSP7DigitalAsset is LSP7DigitalAsset {
    constructor(
        string memory name,
        string memory symbol,
        address newOwner
    )
    LSP7DigitalAsset(
        name,
        symbol,
        newOwner,
        0, //token
        false
    ){}

    /**
     * @dev Allows minting of new tokens for testing.
     * @param to The address to receive the token.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount, true, "0x");
    }
}
