# Universal Assistant Protocol Schema aka Protocol Configurations

## Overview

The Universal Assistant Protocol (UAP) extends LUKSO's LSP1 Universal Receiver pattern to create an automation layer for Universal Profiles. The user configured protocol settings adhere to the LSP2 JSON Schema standard which provides a structured way to interact with ERC725Y key-value data stored on Universal Profiles. It leverages ERC725Y's key-value storage capabilities to create a flexible and powerful automation system for Universal Profiles. The schema follows all best practices of LSP2 while adding custom functionality for complex automation logic.

The structure enables:
- Multiple executive assistants (automations) per transaction type flowing through the Universal Receiver.
- Layered filtering for transaction payloads through screener assistants
- Complex logic combinations for payload filtration (AND/OR)
- Efficient storage of configuration data
- Expandability for new assistant types

## LSP2 JSON Schema Standard & the UAP Schema Structure

The [LSP2 standard](https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-2-ERC725YJSONSchema.md) defines a format for keys and values in the ERC725Y storage. Each key-value pair follows specific encoding rules:

- **Keys**: 32 bytes (256 bits) identifiers, often created through hash functions
- **KeyTypes**: Define the structure of the key (Singleton, Array, Mapping, MappingWithGrouping)
- **ValueTypes**: Define the data type of the stored value
- **ValueContent**: Describe the semantic meaning of the value

The UAP schema closely matches the patterns set by the LSP2 standard in order to benefit from the tooling built around it and to reduce the cognitive load around learning new patterns when interacting and building on top of the UAP.

### 1. SupportedStandards:UAP

```json
{
  "name": "SupportedStandards:UAP",
  "key": "0xeafec4d89fa9619884b6000003309e5fff483f30b60c116ca9764e6e9b370a0b",
  "keyType": "Mapping",
  "valueType": "bytes4",
  "valueContent": "0x03309e5f"
}
```

This key follows LSP2's convention for registering supported standards. It uses:
- **KeyType**: Mapping with a prefix and a standard name
- **ValueType**: bytes4 (interface ID)
- **ValueContent**: The interface ID for UAP (0x03309e5f)

### 2. UAPTypeConfig:<bytes32>

```json
{
  "name": "UAPTypeConfig:<bytes32>",
  "key": "0x007d1fb981483053919f0000<bytes32>",
  "keyType": "Mapping",
  "valueType": "address[]",
  "valueContent": "Address"
}
```

This mapping stores the executive assistants to execute for a specific typeId:
- **KeyType**: Mapping with typeId placeholder
- **ValueType**: Array of addresses
- **ValueContent**: Addresses of executive assistants in execution order

### 3. UAPExecutiveScreeners:<bytes32>:<uint256>

```json
{
  "name": "UAPExecutiveScreeners:<bytes32>:<uint256>",
  "key": "0xf71242d9035c<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "address[]",
  "valueContent": "Address"
}
```

This key stores screener assistants for a specific typeId and execution order:
- **KeyType**: MappingWithGrouping (two-level mapping)
- **ValueType**: Array of addresses
- **ValueContent**: Addresses of screener assistants

### 4. UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>

```json
{
  "name": "UAPExecutiveScreenersANDLogic:<bytes32>:<uint256>",
  "key": "0x5c353a1de5ca<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "bool",
  "valueContent": "Boolean"
}
```

This key determines whether screeners use AND logic (all must pass) or OR logic (any can pass):
- **KeyType**: MappingWithGrouping (like above)
- **ValueType**: bool
- **ValueContent**: Boolean (true for AND logic, false for OR logic)

### 5. UAPExecutiveConfig:<bytes32>:<uint256>

```json
{
  "name": "UAPExecutiveConfig:<bytes32>:<uint256>",
  "key": "0xa2fcaddaa89b<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "(address,bytes)",
  "valueContent": "(Address,Bytes)"
}
```

This key stores configuration data for each executive assistant:
- **KeyType**: MappingWithGrouping
- **ValueType**: Tuple of address and bytes
- **ValueContent**: Executive assistant address and its encoded configuration

### 6. UAPScreenerConfig:<bytes32>:<uint256>

```json
{
  "name": "UAPScreenerConfig:<bytes32>:<uint256>",
  "key": "0xbad89b6f38d1<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "(address,address,bytes)",
  "valueContent": "(Address,Address,Bytes)"
}
```

This key stores configuration for screener assistants:
- **KeyType**: MappingWithGrouping
- **ValueType**: Tuple with two addresses and bytes
- **ValueContent**: Executive assistant address, screener address, and encoded configuration

### 7. UAPAddressListName:<bytes32>:<uint256>

```json
{
  "name": "UAPAddressListName:<bytes32>:<uint256>",
  "key": "0xbba64f30d800<bytes32>0000<uint256>",
  "keyType": "MappingWithGrouping",
  "valueType": "string",
  "valueContent": "String"
}
```

This key stores the list name used by screener assistants:
- **KeyType**: MappingWithGrouping
- **ValueType**: string
- **ValueContent**: Name of the list used for address verification

### 8. NOTE: The Address List Pattern in the UAP
Within the UAP screeners users can point to special object that follows what we call "the Address List pattern" which is a recurring well-established pattern within exiting LUKSO standards (LSP5 ReceivedAssets, LSP10 ReceivedVaults, LSP12 IssuedAssets). It uses ERC725Y key-value storage to efficiently manage lists of addresses. This pattern consists of:

1. **A main array key** that stores the length of all addresses in a list (ex: `"LSP5ReceivedAssets[]", "Allowlist[]"`)
2. **Individual mapping keys** that provide quick lookup of an index and interface id for each address (ex: `"LSP5ReceivedAssetsMap:<address>", "AllowlistMap:<address>"`)
3. **Index look up key** that provides the address at a particular index (ex: `"LSP5ReceivedAssets[index]", "Allowlist[index]"`)
3. **A consistent naming convention** that links these components

#### Purpose in the UAP Framework

Address lists serve several crucial purposes in the UAP:

1. **Efficient Screener Evaluations**: The `NotifierListScreener` and `NotifierCurationScreener` use these lists to quickly determine if an address is allowed or blocked from executing actions.

2. **Flexible Configuration**: The schema provides a standardized way to store and access lists of addresses that can be:
   - Allowlists (addresses that are permitted)
   - Blocklists (addresses that are restricted)

3. **Dynamic Access Control**: Universal Profiles can use these lists to control which addresses can interact with their automated assistants.

#### Example AddressList Schema Implementation

Looking at the provided schemas in `schemas/GRAVEAllowlist.json`, we can see an example implementation:

```json
[
  {
    "name": "GRAVEAllowlistMap:<address>",
    "key": "0x538db0639104fb35016d0000<address>",
    "keyType": "Mapping",
    "valueType": "(bytes4,uint128)",
    "valueContent": "(Bytes4,Number)"
  },
  {
    "name": "GRAVEAllowlist[]",
    "key": "0x6395719ed241bd1fd292a270f8cff2fd1791609fdb8ff7f4f333465b86e1e220",
    "keyType": "Array",
    "valueType": "address",
    "valueContent": "Address"
  }
]
```

#### Practical Application

In practice, the AddressList is used by Screener Assistants to:

1. **Retrieve a list name** using `fetchListName()` based on the transaction type and execution order
2. **Generate a mapping key** specific to an address using `LSP2Utils.generateMappingKey()`
3. **Perform a lookup** to see if that address exists in the list
4. **Make a decision** based on whether the address is in the list and the configured return value

This allows for flexible access control that can be dynamically updated by the Universal Profile owner without requiring smart contract redeployments.

The pattern brings standardization and efficiency to address management within the Universal Assistant Protocol, enabling complex, automated behaviors in a gas-efficient and structured way.