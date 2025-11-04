// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.17;

/**
 * @title LSP9VaultImplementation
 * @dev Simple re-export of LSP9VaultInit for deployment in this project
 * This allows us to compile and deploy LSP9VaultInit with the correct compiler version
 * and have automatic verification on block explorers.
 */
import {LSP9VaultInit} from "@lukso/lsp9-contracts/contracts/LSP9VaultInit.sol";

contract LSP9VaultImplementation is LSP9VaultInit {
    // No additional code needed - this just re-exports LSP9VaultInit
}
