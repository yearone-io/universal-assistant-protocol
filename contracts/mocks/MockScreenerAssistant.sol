// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../IScreenerAssistant.sol";

contract MockScreenerAssistant is IScreenerAssistant {
    bool private returnValue;
    bool private shouldRevert;
    string private revertMessage;

    function setEvaluateReturnValue(bool _value) public {
        returnValue = _value;
    }

    function setShouldRevert(bool _shouldRevert, string memory _revertMessage) public {
        shouldRevert = _shouldRevert;
        revertMessage = _revertMessage;
    }

    function evaluate(
       address filterAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory data
    ) external override(IScreenerAssistant) returns (bool) {
        if (shouldRevert) {
            revert(revertMessage);
        }
        return returnValue;
    }
}
