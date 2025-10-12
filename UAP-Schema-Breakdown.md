# Universal Assistant Protocol Schema Guide

> **Complete reference for configuring intelligent automation on Universal Profiles**

This guide provides a comprehensive overview of the ERC725Y schema used by the Universal Assistant Protocol (UAP). The schema follows LUKSO's LSP2 JSON Schema standard while adding powerful automation capabilities to Universal Profiles.

## 🎯 Quick Schema Overview

The UAP schema enables:
- **📋 Assistant Registration**: Map transaction types to executable assistants
- **🔧 Dynamic Configuration**: Store flexible configuration data for each assistant
- **🛡️ Sophisticated Filtering**: Chain screener assistants with AND/OR logic
- **📚 Address List Management**: Efficient allow/block list patterns
- **⚙️ Error Control**: Configure failure handling behavior

## 🏗️ Core Schema Structure

### 1. **SupportedStandards:UAP** - Protocol Registration

```json
{
  "name": "SupportedStandards:UAP",
  "key": "0xeafec4d89fa9619884b6000003309e5fff483f30b60c116ca9764e6e9b370a0b",
  "keyType": "Mapping",
  "valueType": "bytes4",
  "valueContent": "0x03309e5f"
}
```

**Purpose**: Registers UAP support on a Universal Profile following LSP2 conventions.

### 2. **UAPTypeConfig:\<bytes32\>** - Assistant Registration

```json
{
  "name": "UAPTypeConfig:<bytes32>",
  "key": "0x007d1fb981483053919f0000<bytes32>",
  "keyType": "Mapping",
  "valueType": "address[]", 
  "valueContent": "Address"
}
```

**Purpose**: Maps transaction typeIds to arrays of Executive Assistant addresses.
- **Key**: `typeId` (e.g., LSP7 transfer type, LSP0 value received)
- **Value**: Array of assistant contract addresses in execution order

**Example Usage**:
```typescript
// Register ForwarderAssistant and TipAssistant for LSP7 transfers
const typeId = "0xa4d96624a38e7b7e7b3d99a3c1e84e9ad3e3f..."; // LSP7 transfer
const assistants = [forwarderAssistant.address, tipAssistant.address];
await up.setData(
  erc725.encodeKeyName("UAPTypeConfig:<bytes32>", [typeId]),
  erc725.encodeValueType("address[]", assistants)
);
```

### 3. **UAPExecutiveConfig:\<bytes32\>:\<uint256\>** - Assistant Configuration

```json
{
  "name": "UAPExecutiveConfig:<bytes32>:<uint256>",
  "key": "0xa2fcaddaa89b<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "(address,bytes)",
  "valueContent": "(Address,Bytes)"
}
```

**Purpose**: Stores configuration data for each Executive Assistant.
- **typeId**: Transaction type identifier
- **executionOrder**: Position in execution sequence (0, 1, 2...)
- **Value**: Tuple of (assistant address, encoded configuration)

**Example Usage**:
```typescript
// Configure ForwarderAssistant to forward to specific address
const config = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address"], 
  ["0x742d35Cc6632C0532c718C"] // forward destination
);

await up.setData(
  erc725.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, "0"]),
  encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [forwarderAssistant.address, config])
);
```

### 4. **UAPExecutiveScreeners:\<bytes32\>:\<uint256\>** - Screener Registration

```json
{
  "name": "UAPExecutiveScreeners:<bytes32>:<uint256>",
  "key": "0xf71242d9035c<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping", 
  "valueType": "address[]",
  "valueContent": "Address"
}
```

**Purpose**: Associates screener assistants with specific executive assistants.
- **typeId**: Transaction type
- **executionOrder**: Executive assistant position
- **Value**: Array of screener assistant addresses

**Example Usage**:
```typescript
// Add allowlist screener to ForwarderAssistant
await up.setData(
  erc725.encodeKeyName("UAPExecutiveScreeners:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeValueType("address[]", [allowlistScreener.address])
);
```

### 5. **UAPExecutiveScreenersANDLogic:\<bytes32\>:\<uint256\>** - Screener Logic

```json
{
  "name": "UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>",
  "key": "0x5c353a1de5ca<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "bool",
  "valueContent": "Boolean"
}
```

**Purpose**: Determines how multiple screeners are evaluated.
- **true**: AND logic (all screeners must approve)
- **false**: OR logic (any screener can approve)

**Example Usage**:
```typescript
// Require ALL screeners to approve
await up.setData(
  erc725.encodeKeyName("UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>", [typeId, "0"]),
  "0x01" // true for AND logic
);
```

### 6. **UAPScreenerConfig:\<bytes32\>:\<uint256\>** - Screener Configuration

```json
{
  "name": "UAPScreenerConfig:<bytes32>:<uint256>",
  "key": "0xbad89b6f38d1<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "(address,address,bytes)",
  "valueContent": "(Address,Address,Bytes)"
}
```

**Purpose**: Stores configuration for individual screener assistants.
- **screenerOrder**: Calculated as `(executionOrder * 1000) + screenerIndex`
- **Value**: Tuple of (executive address, screener address, encoded config)

**Example Usage**:
```typescript
// Configure NotifierListScreener
const screenerConfig = ethers.AbiCoder.defaultAbiCoder().encode(
  ["bool"], 
  [true] // return true when address is in list
);

const screenerOrder = 0 * 1000 + 0; // Executive 0, Screener 0
await up.setData(
  erc725.encodeKeyName("UAPScreenerConfig:<bytes32>:<uint256>", [typeId, screenerOrder.toString()]),
  encodeTupleKeyValue("(Address,Address,Bytes)", "(address,address,bytes)", 
    [forwarderAssistant.address, listScreener.address, screenerConfig])
);
```

### 7. **UAPAddressListName:\<bytes32\>:\<uint256\>** - List References

```json
{
  "name": "UAPAddressListName:<bytes32>:<uint256>",
  "key": "0xcfd5d9478c49<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "string",
  "valueContent": "String"
}
```

**Purpose**: Links screeners to named address lists for flexible access control.

**Example Usage**:
```typescript
// Link screener to "TrustedSenders" list
await up.setData(
  erc725.encodeKeyName("UAPAddressListName:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeValueType("string", "TrustedSenders")
);
```

### 8. **UAPRevertOnFailure** - Error Handling Control

```json
{
  "name": "UAPRevertOnFailure",
  "key": "0x8631ee7d1d9475e6b2c38694122192970d91cafd1c64176ecc23849e17441672",
  "keyType": "Singleton",
  "valueType": "bool",
  "valueContent": "Boolean"
}
```

**Purpose**: Controls error handling behavior across all assistants.
- **true**: Revert entire transaction on any assistant failure
- **false** (default): Continue execution, emit failure events

## 📚 Address List Pattern

UAP leverages LUKSO's established address list pattern for efficient access control:

### List Structure
```typescript
// List length
"TrustedSenders[]" -> uint256 (number of addresses)

// Individual entries  
"TrustedSenders[0]" -> address (first address)
"TrustedSenders[1]" -> address (second address)

// Fast lookup mapping
"TrustedSendersMap:<address>" -> (bytes4, uint128) (interface ID, index)
```

### Managing Lists

**Add Address to List**:
```typescript
await mergeListEntry(erc725, up, "TrustedSenders", "0x742d35Cc...", "0x00000000");
```

**Remove Address from List**:
```typescript
await removeListEntry(erc725, up, "TrustedSenders", "0x742d35Cc...");
```

**Check List Membership**:
```typescript
const mapKey = erc725.encodeKeyName("TrustedSendersMap:<address>", ["0x742d35Cc..."]);
const exists = await up.getData(mapKey) !== "0x";
```

## 🚀 Configuration Examples

### Example 1: Simple Auto-Forwarder

```typescript
const typeId = LSP7_TOKENS_RECIPIENT_NOTIFICATION;

// 1. Register ForwarderAssistant
await up.setData(
  erc725.encodeKeyName("UAPTypeConfig:<bytes32>", [typeId]),
  erc725.encodeValueType("address[]", [forwarderAssistant.address])
);

// 2. Configure forwarding destination
const config = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address"], 
  ["0x742d35Cc6632C0532c718C"]
);

await up.setData(
  erc725.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, "0"]),
  encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [forwarderAssistant.address, config])
);
```

### Example 2: Curated-Token Tipping

```typescript
const typeId = LSP0_VALUE_RECEIVED_NOTIFICATION;

// 1. Register TipAssistant with NFT screener
await up.setDataBatch([
  erc725.encodeKeyName("UAPTypeConfig:<bytes32>", [typeId]),
  erc725.encodeKeyName("UAPExecutiveScreeners:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeKeyName("UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>", [typeId, "0"])
], [
  erc725.encodeValueType("address[]", [tipAssistant.address]),
  erc725.encodeValueType("address[]", [curationScreener.address]),
  "0x01" // AND logic
]);

// 2. Configure tip percentage
const tipConfig = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "uint256"], 
  ["0xCharityAddress...", 1000] // 10% in basis points
);

await up.setData(
  erc725.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, "0"]),
  encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.address, tipConfig])
);

// 3. Configure NFT requirement
const screenerConfig = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "bool"], 
  ["0xNFTContract...", true] // Address must be curated
);

await up.setData(
  erc725.encodeKeyName("UAPScreenerConfig:<bytes32>:<uint256>", [typeId, "0"]),
  encodeTupleKeyValue("(Address,Address,Bytes)", "(address,address,bytes)", 
    [tipAssistant.address, curationScreener.address, screenerConfig])
);
```

### Example 3: Multi-Step Allowlist Automation

```typescript
const typeId = LSP7_TOKENS_RECIPIENT_NOTIFICATION;

// 1. Register multiple assistants in sequence
await up.setData(
  erc725.encodeKeyName("UAPTypeConfig:<bytes32>", [typeId]),
  erc725.encodeValueType("address[]", [tipAssistant.address, forwarderAssistant.address])
);

// 2. Add allowlist screener to first assistant only
await up.setDataBatch([
  erc725.encodeKeyName("UAPExecutiveScreeners:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeKeyName("UAPAddressListName:<bytes32>:<uint256>", [typeId, "0"])
], [
  erc725.encodeValueType("address[]", [listScreener.address]),
  erc725.encodeValueType("string", "TrustedSenders")
]);

// 3. Configure both assistants
const tipConfig = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "uint256"], 
  ["0xTipRecipient...", 500] // 5% tip
);

const forwarderConfig = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address"], 
  ["0xForwardDestination..."]
);

await up.setDataBatch([
  erc725.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeKeyName("UAPExecutiveConfig:<bytes32>:<uint256>", [typeId, "1"])
], [
  encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [tipAssistant.address, tipConfig]),
  encodeTupleKeyValue("(Address,Bytes)", "(address,bytes)", [forwarderAssistant.address, forwarderConfig])
]);

// 4. Setup allowlist
await mergeListEntry(erc725, up, "TrustedSenders", "0xTrustedAddress1...", "0x00000000");
await mergeListEntry(erc725, up, "TrustedSenders", "0xTrustedAddress2...", "0x00000000");
```

## 🛠️ Advanced Configuration Patterns

### Conditional Execution Chains

Configure different assistant chains for different conditions:

```typescript
// Different behavior based on token amount
const highValueScreener = await deployScreener("ValueThresholdScreener");
const lowValueScreener = await deployScreener("InverseValueThresholdScreener");

// High value: tip 10% to charity, forward rest
await configureConditionalChain(up, typeId, {
  screener: highValueScreener,
  assistants: [tipAssistant, forwarderAssistant],
  configs: [charityTipConfig, mainForwarderConfig]
});

// Low value: forward everything
await configureConditionalChain(up, typeId, {
  screener: lowValueScreener, 
  assistants: [forwarderAssistant],
  configs: [mainForwarderConfig]
});
```

### Dynamic List Management

Update access control without reconfiguring assistants:

```typescript
// Add new trusted address
await mergeListEntry(erc725, up, "TrustedSenders", newTrustedAddress, "0x00000000");

// Remove compromised address
await removeListEntry(erc725, up, "TrustedSenders", compromisedAddress);

// Switch to different list
await up.setData(
  erc725.encodeKeyName("UAPAddressListName:<bytes32>:<uint256>", [typeId, "0"]),
  erc725.encodeValueType("string", "PremiumUsers")
);
```

### Error Handling Strategies

```typescript
// Strict mode: any failure reverts entire transaction
await up.setData(
  "0x8631ee7d1d9475e6b2c38694122192970d91cafd1c64176ecc23849e17441672",
  "0x01"
);

// Graceful mode: log failures but continue (default)
await up.setData(
  "0x8631ee7d1d9475e6b2c38694122192970d91cafd1c64176ecc23849e17441672", 
  "0x00"
);
```

## 🔧 Developer Utilities

### Schema Validation

```typescript
import { ERC725 } from "@erc725/erc725.js";
import UAP_SCHEMA from "./schemas/UAP.json";

const erc725 = new ERC725(UAP_SCHEMA);

// Validate key encoding
const key = erc725.encodeKeyName("UAPTypeConfig:<bytes32>", [typeId]);
console.log("Generated key:", key);

// Validate value encoding  
const value = erc725.encodeValueType("address[]", assistantAddresses);
console.log("Encoded value:", value);
```

### Configuration Helpers

The test utilities provide comprehensive helpers for complex configurations:

```typescript
import { 
  setExecutiveConfig,
  setScreenerConfig, 
  setListNameOnScreener,
  mergeListEntry
} from "./test/utils/TestUtils";

// Use helper functions for cleaner configuration
await setExecutiveConfig(erc725, up, assistantAddress, typeId, 0, config);
await setScreenerConfig(erc725, up, assistantAddress, 0, [screenerAddress], typeId, [screenerConfig]);
```

## 🎯 Best Practices

### 1. **Execution Order Planning**
- Order value-modifying assistants carefully 
- Consider gas costs in ordering decisions

### 2. **Configuration Validation**
- Always validate assistant addresses match configuration addresses
- Test screener logic thoroughly before deploying
- Use events to monitor execution success/failure

### 3. **Security Considerations**
- Review all assistant code before configuration
- Use address lists for access control
- Consider attack vectors when chaining assistants
- Test with small amounts first

### 4. **Gas Optimization**
- Minimize screener complexity for frequently-triggered events
- Use static calls for read-only operations
- Consider batching configuration updates

### 5. **Upgradeability**
- Design configurations to be easily updateable
- Use address lists instead of hardcoded addresses
- Plan for assistant version migrations

The UAP schema provides a powerful foundation for building sophisticated blockchain automation. By understanding these patterns and following best practices, developers can create intelligent, secure, and efficient automation for Universal Profiles.

**Ready to build? Start with the [built-in assistants](./contracts/) and extend from there!** 🚀