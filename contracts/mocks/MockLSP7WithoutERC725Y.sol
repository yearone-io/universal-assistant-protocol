// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILSP1UniversalReceiver} from "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/ILSP1UniversalReceiver.sol";

/**
 * @title MockLSP7WithoutERC725Y
 * @author Universal Assistant Protocol
 * @notice Minimal LSP7-compatible token WITHOUT ERC725Y interface
 * @dev This contract replicates tokens that implement LSP7 functionality
 *      but do NOT expose the IERC725Y getData/setData interface.
 *      This is used to test the bug where creator screeners revert
 *      when trying to call getData() on non-ERC725Y tokens.
 *
 *      Key features:
 *      - Basic LSP7 functionality (balanceOf, transfer, mint)
 *      - LSP1 universalReceiver notifications
 *      - NO getData() or setData() methods
 *      - NO IERC725Y interface support
 */
contract MockLSP7WithoutERC725Y {
    // LSP7 Token Metadata
    string private _name;
    string private _symbol;
    uint256 private _totalSupply;

    // LSP7 Balances
    mapping(address => uint256) private _balances;

    // LSP7 Type ID for notifications
    bytes32 internal constant _TYPEID_LSP7_TOKENSRECIPIENT =
        0x429ac7a06903dbc9c13dfcb3c9d11df8194581fa047c96d7a4171fc7402958ea;

    // Events
    event Transfer(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 amount,
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
     * @notice Returns the balance of an address
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Transfers tokens from one address to another
     */
    function transfer(
        address from,
        address to,
        uint256 amount,
        bool force,
        bytes memory data
    ) external {
        require(_balances[from] >= amount, "Insufficient balance");

        _balances[from] -= amount;
        _balances[to] += amount;

        emit Transfer(msg.sender, from, to, amount, force, data);

        // Notify recipient via LSP1 if it implements the interface
        _notifyRecipient(to, amount, data);
    }

    /**
     * @notice Mints tokens to an address (for testing)
     */
    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
        _totalSupply += amount;

        emit Transfer(msg.sender, address(0), to, amount, true, "");

        // Notify recipient via LSP1
        _notifyRecipient(to, amount, "");
    }

    /**
     * @dev Notifies the recipient via LSP1 universalReceiver
     */
    function _notifyRecipient(
        address recipient,
        uint256 amount,
        bytes memory data
    ) internal {
        // Encode LSP1 data for LSP7 token transfer
        bytes memory lsp1Data = abi.encode(
            msg.sender,  // operator
            address(0),  // from (0 for mint)
            recipient,   // to
            amount,      // amount
            data         // additional data
        );

        // Try to call universalReceiver on the recipient
        // Don't revert if it fails - some recipients may not implement LSP1
        try ILSP1UniversalReceiver(recipient).universalReceiver(
            _TYPEID_LSP7_TOKENSRECIPIENT,
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
