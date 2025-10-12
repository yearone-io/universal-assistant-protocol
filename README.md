# Universal Assistant Protocol (UAP)

> **Transform your Universal Profile into an intelligent, automated blockchain entity**

The Universal Assistant Protocol (UAP) is a powerful automation framework for [LUKSO](https://lukso.network)'s Universal Profiles. UAP enables profiles to automatically execute custom logic in response to incoming transactions, token transfers, and other blockchain events through a flexible system of **Executive Assistants** and **Screener Assistants**.

## ✨ What UAP Does

UAP turns your Universal Profile into a smart, automated agent that can do things like (but not limited to):

- 🔄 **Automatically forward tokens** to other addresses when received
- 💰 **Send tips** - share a percentage of incoming payments with others
- 🎯 **Filter interactions** - only respond to trusted addresses or token holders
- 🔗 **Chain complex behaviors** - combine multiple actions with sophisticated conditions
- 🛡️ **Secure automation** - all logic runs through your Universal Profile's permissions system

## 🚀 Quick Start

### Basic Example: Auto-Forward Tokens
```typescript
// 1. Deploy UAP to your Universal Profile
const uap = await deployUAP(universalProfile);

// 2. Deploy a ForwarderAssistant
const forwarder = await deployAssistant("ForwarderAssistant");

// 3. Configure auto-forwarding for LSP7 tokens
await configureAssistant(universalProfile, {
  typeId: LSP7_TRANSFER_TYPE_ID,
  assistant: forwarder.address,
  config: { forwardTo: "0x..." }
});
```

Now your Universal Profile will automatically forward any received LSP7 tokens to the specified address!

## 🏗️ Core Concepts

### Executive Assistants
**Executive Assistants** are smart contracts that perform actions on behalf of your Universal Profile. They implement the automation logic - what should happen when certain events occur.

**Initial Built-in Executive Assistants:**
- **🔄 ForwarderAssistant** - Forwards received tokens to another address
- **💰 TipAssistant** - Sends a percentage of received LYX to a tip address  
- **🎨 BurntPixRefinerAssistant** - Specialized automation for BurntPix ecosystem

### Screener Assistants
**Screener Assistants** act as filters - they decide whether an Executive Assistant should run based on custom conditions.

**Built-in Screener Assistants:**
- **📋 NotifierListScreener** - Allow/block based on address lists
- **🎫 NotifierCurationScreener** -  Allow/block based on address in curated list of addresses

### Configuration Flexibility
- **Chain Multiple Assistants**: Execute several actions for the same event
- **Complex Conditions**: Combine screeners with AND/OR logic
- **Dynamic Lists**: Update allowed/blocked addresses without redeploying
- **Error Handling**: Choose between graceful degradation or strict failure modes

## 🔧 Building Your Own Assistants

Creating custom assistants is straightforward and powerful:

### Executive Assistant Example
```solidity
pragma solidity ^0.8.24;

import "./ExecutiveAssistantBase.sol";

contract MyCustomAssistant is ExecutiveAssistantBase {
    function execute(
        uint256 executionOrder,
        address upAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external returns (uint256, address, uint256, bytes memory, bytes memory) {
        // Fetch your configuration from the Universal Profile
        (, bytes memory config) = fetchConfiguration(upAddress, typeId, executionOrder);
        
        // Decode configuration parameters
        address targetAddress = abi.decode(config, (address));
        
        // Your custom logic here!
        bytes memory executeData = abi.encodeWithSignature(
            "transfer(address,uint256)", 
            targetAddress, 
            value
        );
        
        // Return execution details
        return (0, notifier, value, executeData, "");
    }
}
```

### Screener Assistant Example
```solidity
pragma solidity ^0.8.24;

import "./ScreenerAssistantBase.sol";

contract MyCustomScreener is ScreenerAssistantBase {
    function evaluate(
        address upAddress,
        address notifier,
        uint256 value,
        bytes32 typeId,
        bytes memory lsp1Data
    ) external view returns (bool) {
        // Your filtering logic here
        return value > 1 ether; // Only allow high-value transactions
    }
}
```

## 📋 Real-World Use Cases

### **1. Automated Tip Jar**
Automatically share 10% of all incoming payments with a charity:
```typescript
await configureAssistant(universalProfile, {
  typeId: LSP0_VALUE_RECEIVED,
  assistant: tipAssistant.address,
  config: { 
    recipient: "0x...", // charity address
    percentage: 1000    // 10% (basis points)
  }
});
```

### **2. Auto-Forwarder for Curated Tokens**
Only forward tokens when the sender's address is on a curated list:
```typescript
await configureAssistant(universalProfile, {
  typeId: LSP7_TRANSFER_TYPE_ID,
  assistant: forwarderAssistant.address,
  screeners: [curationScreener.address],
  screenerConfig: {
    tokenContract: "0x...", // Required NFT contract
    returnWhenTrue: true
  },
  config: { forwardTo: "0x..." }
});
```

### **3. Multi-Step Automation**
Execute multiple actions in sequence with complex conditions:
```typescript
// Configure multiple assistants for the same event
await configureMultipleAssistants(universalProfile, {
  typeId: LSP7_TRANSFER_TYPE_ID,
  assistants: [
    { 
      assistant: tipAssistant.address,
      config: { recipient: "0x...", percentage: 500 }, // 5% tip
      screeners: [allowlistScreener.address] // Only from trusted addresses
    },
    { 
      assistant: forwarderAssistant.address,
      config: { forwardTo: "0x..." } // Forward remaining amount
    }
  ]
});
```

## 🛡️ Security & Control

UAP is designed with security as the top priority:

- **Permission-Based**: All automation runs through your Universal Profile's existing permission system
- **Configurable Error Handling**: Choose between graceful degradation or strict failure modes
- **Static Screening**: Screener assistants cannot modify state, only read and evaluate

## 🔧 Development Setup

```bash
# Clone and install
git clone https://github.com/yearone-io/universal-assistant-protocol
cd universal-assistant-protocol
npm install

# Run tests
npm run test

# Deploy to LUKSO testnet
npx hardhat deployContracts --network luksoTestnet \
  --names "UniversalReceiverDelegateUAP,ForwarderAssistant,TipAssistant" \
  --paths "contracts,contracts/executive-assistants,contracts/executive-assistants"
```

## 📚 Documentation

- **[Schema Guide](./UAP-Schema-Breakdown.md)** - Complete ERC725Y configuration reference
- **[Assistant Examples](./contracts/executive-assistants/)** - Browse built-in assistant implementations
- **[Test Suite](./test/)** - Comprehensive examples and patterns
- **[LUKSO Docs](./lukso-docs.md)** - Integration with LUKSO ecosystem

## 🌟 Why Build on UAP?

### **For Users**
- **Set and Forget**: Configure once, automate forever
- **Composable**: Mix and match assistants for custom workflows
- **Secure**: Built on LUKSO's battle-tested Universal Profile system
- **Transparent**: All actions are on-chain and auditable

### **For Developers**
- **Easy Extension**: Simple interfaces for custom logic
- **Rich Tooling**: Comprehensive test utilities and base classes
- **Gas Efficient**: Optimized execution patterns
- **Well Documented**: Clear examples and detailed guides

## 🤝 Contributing

We welcome contributions! UAP thrives on a diverse ecosystem of assistants.

**Ways to contribute:**
- 🔨 Build new Executive Assistants for specific use cases
- 🛡️ Create innovative Screener Assistants for complex conditions
- 📖 Improve documentation and examples
- 🐛 Report bugs and suggest improvements
- 🧪 Add test coverage and edge cases

See our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📜 License

Licensed under Apache-2.0 and MIT licenses as specified in individual contract files.

## 🚀 Get Started Building

Ready to create intelligent, automated Universal Profiles? 

1. **[Explore Examples](./test/)** - See UAP in action
2. **[Read the Schema Guide](./UAP-Schema-Breakdown.md)** - Understand configuration patterns  
3. **[Browse Built-in Assistants](./contracts/)** - Learn from existing implementations
4. **Join the Community** - Coming soon

**The future of blockchain automation starts with UAP. What will you build?** 🌟