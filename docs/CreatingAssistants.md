## Creating and Integrating a New Executive Assistant

### 1. Overview

An **Executive Assistant** is any contract that implements the `IExecutiveAssistant` interface. When the **Universal Receiver Delegate (URDuap)** is triggered in the Universal Profile (UP), it will:

1. Look up which Executive Assistants are associated with the `typeId`.
2. Call each Assistant’s `execute(...)` function, passing in context about the current transaction (`upAddress`, `notifier`, `value`, `typeId`, and `data`).
3. Receive back instructions on what operation to perform via the UP’s `ERC725X.execute(...)` function, plus optionally updated `value` and `data` for subsequent Assistants.

By implementing the `IExecutiveAssistant` interface, you gain access to a powerful extension point to customize how certain incoming transfers or messages are processed.

---

### 2. Implement the `IExecutiveAssistant` Interface

Your custom Executive Assistant **must** implement the following function signature:

```solidity
function execute(
    address upAddress, 
    address notifier, 
    uint256 value, 
    bytes32 typeId, 
    bytes memory data
)
    external 
    returns (
        uint256 operationType, 
        address target, 
        uint256 execValue, 
        bytes memory execData, 
        bytes memory newDataAfterExec
    );
```

- **`upAddress`**: The UP address that is delegating this call to the URDuap.
- **`notifier`**: The contract or account that triggered the universal receiver (e.g., a token contract sending LSP7/LSP8 tokens).
- **`value`**: The amount of native tokens (e.g., LYX) sent with the transaction.
- **`typeId`**: A bytes32 value identifying the type of incoming asset or event.
- **`data`**: Additional data relevant to the transaction (as forwarded by the token contract or the caller).

You must return:

1. **`operationType`**: The type of `IERC725X.execute` operation (0 = `CALL`, 1 = `CREATE`, 2 = `CREATE2`, etc.).
2. **`target`**: The address on which the UP will execute the operation (`execTarget`).
3. **`execValue`**: The amount of native tokens sent along with this operation.
4. **`execData`**: The encoded call data to execute on `target`.
5. **`newDataAfterExec`**: Arbitrary bytes that become the `data` parameter for the **next** Assistant in the chain (if any). This is how you can pass along updated context or instructions.

> **Note**: Returning `(0, address(0), 0, "", data)` would effectively mean "do nothing except pass along the `data`," which can be useful if your Assistant only updates `value` or modifies the data for the next Assistant but does not need to call an external contract.

---

### 3. Storing and Reading Configuration

Often, your Assistant needs additional settings or instructions (for example, a recipient address, a percentage, or a specific token ID). Because Assistants run in their **own** contract context when called by the URDuap, they can either:

1. **Use the UP’s ERC725Y Storage**  
   - Store configuration under a known key derived from your Assistant’s address.  
   - For example, the code uses a key like `UAPExecutiveConfig:<assistantAddress>` to store arbitrary settings.  
   - You can read from the UP’s storage with something like:
     ```solidity
     IERC725Y upERC725Y = IERC725Y(upAddress);
     bytes32 settingsKey = // e.g., keccak256("UAPExecutiveConfig") combined with assistantAddress
     bytes memory settingsData = upERC725Y.getData(settingsKey);
     // decode settingsData to retrieve your config
     ```
2. **Use Your Assistant’s Own Storage**  
   - Since the call from URDuap is a standard `.call()`, your Assistant has its own storage space.  
   - You can store configuration internally if you prefer, although it’s often more transparent and user-friendly to keep all per-UP settings in that UP’s ERC725Y store.

**Example** (taken from `TipAssistant`):
```solidity
bytes32 settingsKey = getSettingsDataKey(address(this));
bytes memory settingsData = upERC725Y.getData(settingsKey);

(address tipAddress, uint256 tipPercentage) = abi.decode(
    settingsData, 
    (address, uint256)
);
```

In this example, the Assistant expects the user to have stored `(tipAddress, tipPercentage)` in the UP’s ERC725Y store. If that data is missing or invalid, the Assistant reverts or defaults.

---

### 4. Adding Your Assistant to a `typeId`

1. **Compute the Key**: The URDuap uses:
   ```solidity
   bytes32 typeConfigKey = LSP2Utils.generateMappingKey(
       bytes10(keccak256("UAPTypeConfig")),
       bytes20(typeId)
   );
   ```
   to locate an array of Executive Assistant addresses for a given `typeId`.

2. **Encode an Array of Addresses**: The URDuap’s `customDecodeAddresses` function expects:
   - **First 2 bytes**: The number of addresses (in `uint16`).
   - **Then**: Each address in 20 bytes (no padding, just consecutive addresses).

   You can encode this on the client side or in a script. For example (in JavaScript/TypeScript, pseudo-code):
   ```ts
   function encodeAssistants(addresses: string[]): string {
     const num = addresses.length;
     const hexCount = num.toString(16).padStart(4, '0'); // for uint16
     // encode addresses in hex
     let encoded = '0x' + hexCount;
     addresses.forEach(addr => {
       encoded += addr.replace(/^0x/, '');
     });
     return encoded;
   }
   ```
3. **Set the Data** in the UP:
   ```solidity
   IERC725Y(upAddress).setData(typeConfigKey, encodedAssistants);
   ```

Once the `typeId` is mapped to your Assistant(s), the URDuap will automatically invoke them in the specified order whenever a transaction arrives with that `typeId`.

---

### 5. Best Practices & Considerations

1. **Keep Logic Focused**  
   - Each Assistant should do **one** well-defined task (e.g., tipping, refining, forwarding, etc.).  
   - Complex or multi-step logic might be split into separate Assistants for clarity and composability.

2. **Handle Missing or Invalid Configuration Gracefully**  
   - If your Assistant depends on config in `ERC725Y` that might not exist, consider reverting with a clear error message or defaulting to a safe no-op.

3. **Reverts vs. Bubbles**  
   - If your Assistant fails (reverts), the entire URDuap flow reverts. Decide carefully whether to revert or to continue with partial success.  
   - Provide meaningful revert reasons or error events to help users debug.

4. **Avoid Unbounded Loops**  
   - The URDuap will invoke each Assistant in order. If your Assistant triggers additional loops or calls that might be unbounded, you risk hitting gas limits.

5. **Beware of Re-entrancy**  
   - If your Assistant performs external calls with non-trivial logic, consider re-entrancy safeguards (e.g., checks-effects-interactions pattern).  
   - Typically, `IERC725X.execute(...)` calls can be considered safe, but be mindful of external calls your Assistant might make.

6. **Gas Efficiency**  
   - Keep the computation in `execute(...)` as minimal as possible to avoid large overhead in normal UP usage.  
   - Store only necessary data on-chain.  
   - Consider using well-optimized libraries for encoding/decoding if your logic is complex.

7. **Test Thoroughly**  
   - Write unit tests and integration tests against your custom Assistant.  
   - Verify correct behavior when receiving different `value`, `typeId`, or `data`.

8. **Security Audits**  
   - Because Assistants can instruct the UP to execute arbitrary operations, a bug in your Assistant can lead to unexpected or dangerous calls.  
   - Make sure to audit for any potential logic flaws or vulnerabilities.

---

### 6. Example: Creating a New “MyCoolAssistant”

Below is a minimal example of a new Assistant that might:

- Read a stored “recipientAddress” from the UP’s ERC725Y data.
- Always forward a fixed portion of `value` to that recipient.

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IExecutiveAssistant} from "./IExecutiveAssistant.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MyCoolAssistant is IExecutiveAssistant, ERC165 {
    // Custom error for no configuration found
    error NoConfigFound();

    function supportsInterface(bytes4 interfaceId) 
        public view override(ERC165) 
        returns (bool) 
    {
        return interfaceId == type(IExecutiveAssistant).interfaceId 
            || super.supportsInterface(interfaceId);
    }

    function execute(
        address upAddress, 
        address /*notifier*/, 
        uint256 value, 
        bytes32 /*typeId*/, 
        bytes memory data
    )
        external 
        override 
        returns (
            uint256 operationType, 
            address target, 
            uint256 execValue, 
            bytes memory execData, 
            bytes memory newDataAfterExec
        )
    {
        // 1. Fetch config from UP
        IERC725Y upERC725Y = IERC725Y(upAddress);
        bytes32 settingsKey = _computeSettingsKey(address(this));
        bytes memory settings = upERC725Y.getData(settingsKey);
        if (settings.length == 0) {
            revert NoConfigFound();
        }

        // 2. Decode recipient
        address recipient = abi.decode(settings, (address));
        // 3. Forward 10% of the value
        uint256 forwardAmount = (value * 10) / 100;

        // 4. Return operation instructions
        // operationType = 0 (CALL), target = recipient, execValue = forwardAmount
        // no call data needed for a plain value transfer, so execData = ""
        // newDataAfterExec is the updated data for next assistant (we reduce the value by the forwardAmount)
        return (
            0, 
            recipient, 
            forwardAmount, 
            "", 
            abi.encode(value - forwardAmount, data)
        );
    }

    function _computeSettingsKey(address assistantAddr) internal pure returns (bytes32) {
        // same pattern used in examples (UAPExecutiveConfig plus assistantAddr)
        bytes32 firstWordHash = keccak256(bytes("UAPExecutiveConfig"));
        bytes memory temp = bytes.concat(
            bytes10(firstWordHash),
            bytes2(0),
            bytes20(assistantAddr)
        );
        return bytes32(temp);
    }
}
```

**Configuration Steps**:
1. Deploy `MyCoolAssistant`.
2. Set `UAPTypeConfig:<typeId>` in your UP’s ERC725Y to include the address of `MyCoolAssistant`.
3. Store the “recipient” under the key `UAPExecutiveConfig:myCoolAssistantAddress`.

With that, whenever a transfer or call with the matching `typeId` arrives, the URDuap will call `MyCoolAssistant.execute(...)`, which in turn forwards 10% of the provided `value` to the configured recipient.

---

## Final Thoughts

- **Executive Assistants** give developers modular, composable “plugins” to process incoming transactions on a Universal Profile.
- By storing or reading settings from the UP’s `ERC725Y` data store, you can create highly configurable logic for specific token types (`typeId`), event types, or other scenarios.
- Always design and **test** your Assistants carefully to avoid security pitfalls or unexpected behaviors.  

This is an evolving ecosystem, and future releases will add **Screener Assistants**, which will act as gatekeepers before any Executive Assistant logic is invoked. Until then, the approach outlined here (implementing `IExecutiveAssistant` and registering your contract under a `typeId`) is the primary way to integrate with the UAP.