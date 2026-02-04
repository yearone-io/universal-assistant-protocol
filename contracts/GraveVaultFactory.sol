// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface ILSP9VaultInit {
    function initialize(address newOwner) external;
}

/**
 * @title GraveVaultFactory
 * @notice Deploys LSP9VaultInit clones for GRAVE spamboxes and tracks count.
 * @dev This factory is used to track "spamboxes created via UI" without chain-wide indexing.
 */
contract GraveVaultFactory {
    event VaultCreated(address indexed owner, address indexed vault, address implementation);

    address public immutable implementation;
    uint256 public vaultsCreated;

    error InvalidOwner();
    error InvalidImplementation();

    constructor(address implementationAddress) {
        if (implementationAddress == address(0)) revert InvalidImplementation();
        implementation = implementationAddress;
    }

    function createVault(address owner) external returns (address vault) {
        if (owner == address(0)) revert InvalidOwner();
        vault = Clones.clone(implementation);
        ILSP9VaultInit(vault).initialize(owner);
        unchecked {
            vaultsCreated += 1;
        }
        emit VaultCreated(owner, vault, implementation);
    }
}
