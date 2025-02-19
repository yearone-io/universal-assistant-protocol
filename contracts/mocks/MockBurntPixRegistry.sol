// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IRegistry {
    function refine(bytes32 burntPixId, uint256 iters) external;
    function tokenOwnerOf(bytes32 tokenId) external view returns (address);
}

contract MockBurntPixRegistry is IRegistry {
    event Refined(bytes32 indexed burntPixId, uint256 iters);
    mapping(bytes32 => address) public owners;

    function refine(bytes32 burntPixId, uint256 iters) external override {
        emit Refined(burntPixId, iters);
    }

    function tokenOwnerOf(bytes32 tokenId) external view override returns (address) {
        return owners[tokenId];
    }

    function setOwnerOf(bytes32 tokenId, address owner) external {
        owners[tokenId] = owner;
    }
}
