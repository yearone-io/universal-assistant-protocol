// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import the LSP8IdentifiableDigitalAsset contract
import {LSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8IdentifiableDigitalAsset.sol";
import {_LSP4_TOKEN_TYPE_COLLECTION} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {_LSP8_TOKENID_FORMAT_NUMBER} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";

contract MockLSP8IdentifiableDigitalAsset is LSP8IdentifiableDigitalAsset {
    constructor(
        string memory name,
        string memory symbol,
        address newOwner
    )
        LSP8IdentifiableDigitalAsset(
            name, symbol, newOwner, _LSP4_TOKEN_TYPE_COLLECTION, _LSP8_TOKENID_FORMAT_NUMBER)
    {}

    /**
     * @dev Allows minting of new tokens for testing.
     * @param to The address to receive the token.
     * @param tokenId The unique identifier of the token.
     */
    function mint(address to, bytes32 tokenId) public {
        _mint(to, tokenId, true, "0x");
    }
}
