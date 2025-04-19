// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ExecutiveAssistantBase} from "./ExecutiveAssistantBase.sol";

interface IRegistry {
    function refine(bytes32 burntPixId, uint256 iters) external;
    function tokenOwnerOf(bytes32 tokenId) external view returns (address);
}

contract BurntPixRefinerAssistant is ExecutiveAssistantBase {
    /**
     * @dev The execute function called by URDuap via delegatecall.
     * @param upAddress The universal profile address
     * @return A bytes array containing the updated value and data.
     */
    function execute(
        uint256 executionOrder,
        address upAddress,
        address,
        uint256,
        bytes32 typeId,
        bytes memory
    ) external override view returns (uint256, address, uint256, bytes memory, bytes memory) {
        (, bytes memory encodedConfig) = this.fetchConfiguration(upAddress, typeId, executionOrder);
        (address burntPixCollection, bytes32 burntPixId, uint256 iters) = abi
            .decode(encodedConfig, (address, bytes32, uint256));

        // Prepare the transfer call
        bytes memory encodedBurntPixRefinementTx = abi.encodeWithSelector(
            IRegistry.refine.selector,
            burntPixId,
            iters
        );
        return (0,
            burntPixCollection,
            0,
            encodedBurntPixRefinementTx,
            ""
        );
    }
}
