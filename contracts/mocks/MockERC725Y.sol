// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC725Y } from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

contract MockERC725Y is IERC725Y {
    mapping(bytes32 => bytes) private store;

    function getData(bytes32 dataKey) external view override(IERC725Y) returns (bytes memory values) {
        return store[dataKey];
    }

    function setData(bytes32 dataKey, bytes memory dataValue) external payable override(IERC725Y) {
        store[dataKey] = dataValue;
        emit IERC725Y.DataChanged(dataKey, dataValue);
    }

    // Multi-key getData
    function getDataBatch(bytes32[] memory keys) external view override(IERC725Y) returns (bytes[] memory values) {
        values = new bytes[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            values[i] = store[keys[i]];
        }
    }

    function setDataBatch(bytes32[] memory keys, bytes[] memory values) external payable override(IERC725Y) {
        require(keys.length == values.length, "Keys/values array mismatch");
        for (uint256 i = 0; i < keys.length; i++) {
            store[keys[i]] = values[i];
            emit IERC725Y.DataChanged(keys[i], values[i]);
        }
    }

     function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return interfaceId == type(IERC725Y).interfaceId ;
     }
}
