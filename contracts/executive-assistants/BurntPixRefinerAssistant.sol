// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Import interfaces and contracts
import {IExecutiveAssistant} from "../IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// Utils
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IRegistry {
    function refine(bytes32 burntPixId, uint256 iters) external;
    function tokenOwnerOf(bytes32 tokenId) external view returns (address);
}

// IRegistry(registry).getOperatorsOf(burntPixId).length > 0, to ensure that the burntPix exists

contract BurntPixRefinerAssistant is IExecutiveAssistant, ERC165 {
    error TargetAddressNotSet();

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExecutiveAssistant).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev The execute function called by URDuap via delegatecall.
     * @param upAddress The universal profile address
     * @return A bytes array containing the updated value and data.
     */
    function execute(
        address upAddress,
        address,
        uint256,
        bytes32,
        bytes memory
    ) external override view returns (uint256, address, uint256, bytes memory, bytes memory) {
        // Read settings from the UP's ERC725Y data store.
        IERC725Y upERC725Y = IERC725Y(upAddress);
        bytes32 settingsKey = getSettingsDataKey(address(this));
        bytes memory settingsData = upERC725Y.getData(settingsKey);
        // Decode the settingsData to get targetAddress.
        // Assume settingsData is encoded as: abi.encode(address targetAddress)
        (address burntPixCollection, bytes32 burntPixId, uint256 iters) = abi
            .decode(settingsData, (address, bytes32, uint256));

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

    /**
     * @dev Helper function to generate the assistant instructions key.
     * @param assistantAddress The address of the assistant.
     * @return The bytes32 key.
     */
    function getSettingsDataKey(
        address assistantAddress
    ) internal pure returns (bytes32) {
        bytes32 firstWordHash = keccak256(bytes("UAPExecutiveConfig"));

        bytes memory temporaryBytes = bytes.concat(
            bytes10(firstWordHash),
            bytes2(0),
            bytes20(assistantAddress)
        );

        return bytes32(temporaryBytes);
    }
}
