// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILSP1UniversalReceiver} from "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/ILSP1UniversalReceiver.sol";

/**
 * @title MockLSP8WithoutERC725Y
 * @author Universal Assistant Protocol
 * @notice Minimal LSP8-compatible NFT WITHOUT ERC725Y interface
 * @dev This contract replicates tokens that implement LSP8 functionality
 *      but do NOT expose the IERC725Y getData/setData interface.
 *      This is used to test the bug where creator screeners revert
 *      when trying to call getData() on non-ERC725Y tokens.
 *
 *      Key features:
 *      - Basic LSP8 functionality (tokenOwnerOf, transfer, mint)
 *      - LSP1 universalReceiver notifications
 *      - NO getData() or setData() methods
 *      - NO IERC725Y interface support
 */
contract MockLSP8WithoutERC725Y {
    // LSP8 Token Metadata
    string private _name;
    string private _symbol;
    uint256 private _totalSupply;

    // LSP8 Token Ownership
    mapping(bytes32 => address) private _tokenOwners;

    // LSP8 Type ID for notifications
    bytes32 internal constant _TYPEID_LSP8_TOKENSRECIPIENT =
        0x0b084a55ebf70fd3c06fd755269dac2212c4d3f0f4d09079780bfa50c1b2984d;

    // Events
    event Transfer(
        address indexed operator,
        address indexed from,
        address indexed to,
        bytes32 tokenId,
        bool force,
        bytes data
    );

    constructor(string memory name_, string memory symbol_, address initialOwner) {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @notice Returns the token name
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the token symbol
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the total supply
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Returns the owner of a specific token ID
     */
    function tokenOwnerOf(bytes32 tokenId) external view returns (address) {
        address owner = _tokenOwners[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }

    /**
     * @notice Transfers a token from one address to another
     */
    function transfer(
        address from,
        address to,
        bytes32 tokenId,
        bool force,
        bytes memory data
    ) external {
        require(_tokenOwners[tokenId] == from, "Not the owner");

        _tokenOwners[tokenId] = to;

        emit Transfer(msg.sender, from, to, tokenId, force, data);

        // Notify recipient via LSP1 if it implements the interface
        _notifyRecipient(to, tokenId, data);
    }

    /**
     * @notice Mints a token to an address (for testing)
     */
    function mint(address to, bytes32 tokenId) external {
        require(_tokenOwners[tokenId] == address(0), "Token already exists");

        _tokenOwners[tokenId] = to;
        _totalSupply += 1;

        emit Transfer(msg.sender, address(0), to, tokenId, true, "");

        // Notify recipient via LSP1
        _notifyRecipient(to, tokenId, "");
    }

    /**
     * @dev Notifies the recipient via LSP1 universalReceiver
     */
    function _notifyRecipient(
        address recipient,
        bytes32 tokenId,
        bytes memory data
    ) internal {
        // Encode LSP1 data for LSP8 token transfer
        bytes memory lsp1Data = abi.encode(
            msg.sender,  // operator
            address(0),  // from (0 for mint)
            recipient,   // to
            tokenId,     // tokenId
            data         // additional data
        );

        // Try to call universalReceiver on the recipient
        // Don't revert if it fails - some recipients may not implement LSP1
        try ILSP1UniversalReceiver(recipient).universalReceiver(
            _TYPEID_LSP8_TOKENSRECIPIENT,
            lsp1Data
        ) {
            // Success - notification sent
        } catch {
            // Recipient doesn't implement LSP1 or call failed
            // Continue without reverting
        }
    }

    /**
     * @notice This contract does NOT support ERC725Y
     * @dev Intentionally not implementing getData() or setData()
     *      to replicate tokens that don't have the ERC725Y interface
     */
    // NO getData() function
    // NO setData() function
    // NO supportsInterface() function
}
