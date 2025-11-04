# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the Universal Assistant Protocol (UAP) - a blockchain automation framework built on the LUKSO ecosystem. UAP extends LUKSO's Universal Receiver pattern (LSP1) to provide programmable automation for Universal Profiles through configurable "Executive Assistants" and "Screener Assistants".

### Core Architecture

The project implements a smart contract system with the following key components:

- **UniversalReceiverDelegateUAP**: Main entry point that extends LUKSO's LSP1UniversalReceiverDelegateUP
- **Executive Assistants**: Automation contracts that perform actions (ForwarderAssistant, TipAssistant, BurntPixRefinerAssistant)
- **Screener Assistants**: Filtering logic contracts that determine execution conditions (NotifierListScreener, NotifierCurationScreener)
- **Configuration Schema**: ERC725Y key-value storage system for managing assistants and their settings

## Development Commands

### Building and Testing
```bash
# Build the project
npm run build

# Run all tests with gas reporting
npm run test

# Generate test coverage report
npm run coverage

# Generate TypeChain types
npm run typechain

# Lint Solidity contracts
npm run lint

# Fix linting issues
npm run lint:fix
```

### Deployment Commands
```bash
# Deploy contracts to testnet
npx hardhat deployContracts \
  --network luksoTestnet \
  --names "UniversalReceiverDelegateUAP,ForwarderAssistant" \
  --paths "contracts,contracts/executive-assistants"

# Verify deployed contracts
npx hardhat verifyContracts \
  --network luksoTestnet \
  --names "UniversalReceiverDelegateUAP,TipAssistant" \
  --addresses "0x...,0x..." \
  --paths "contracts,contracts/executive-assistants"

# Deploy LSP9VaultImplementation (with auto-verification!)
npx hardhat deployContracts \
  --network luksoTestnet \
  --names "LSP9VaultImplementation" \
  --paths "contracts/vault"

# For mainnet
npx hardhat deployContracts \
  --network luksoMain \
  --names "LSP9VaultImplementation" \
  --paths "contracts/vault"
```

### Testing Individual Components
```bash
# Test specific assistant types
npx hardhat test test/executive-assistants/
npx hardhat test test/screener-assistants/
npx hardhat test test/universal-receiver-delegate/

# Run a single test file
npx hardhat test test/executive-assistants/ForwarderAssistant.test.ts
```

## Project Structure

### Contract Organization
- `contracts/`: Main smart contracts
  - `UniversalReceiverDelegateUAP.sol`: Core UAP logic
  - `executive-assistants/`: Automation contracts
    - `ExecutiveAssistantBase.sol`: Base class for all executive assistants
    - `IExecutiveAssistant.sol`: Interface definition
    - `ForwarderAssistant.sol`: Token forwarding automation
    - `TipAssistant.sol`: Native token tipping automation
    - `BurntPixRefinerAssistant.sol`: BurntPix-specific automation
  - `screener-assistants/`: Filtering logic contracts
    - `ScreenerAssistantBase.sol`: Base class for screeners
    - `IScreenerAssistant.sol`: Interface definition
    - `NotifierListScreener.sol`: Address list-based filtering
    - `NotifierCurationScreener.sol`: LSP8 token-based filtering
  - `mocks/`: Test helper contracts

### Key Files
- `schemas/UAP.json`: Complete ERC725Y schema for UAP configuration
- `schemas/GRAVEAllowlist.json`: Example address list schema
- `UAP-Schema-Breakdown.md`: Detailed schema documentation
- `test/utils/TestUtils.ts`: Comprehensive test utilities
- `constants/network.ts`: Network configuration helpers
- `hardhat.config.ts`: Hardhat configuration for LUKSO networks
- `deployments-{network}.json`: Records of all deployed contracts per network

## Development Patterns

### Creating New Executive Assistants
1. Extend `ExecutiveAssistantBase` contract
2. Implement the `execute` function from `IExecutiveAssistant`
3. Use `fetchConfiguration` to read settings from Universal Profile's ERC725Y storage
4. Return execution data in format: `(operationType, notifier, value, execData, newDataAfterExec)`

### Creating New Screener Assistants
1. Extend `ScreenerAssistantBase` contract
2. Implement the `evaluate` function from `IScreenerAssistant`
3. Return boolean indicating whether executive should proceed
4. Access configuration via ERC725Y storage patterns

### Working with ERC725Y Configuration
- Use `ERC725` library for key encoding/decoding
- Follow UAP schema patterns defined in `schemas/UAP.json`
- Leverage test utilities in `TestUtils.ts` for configuration setup
- Use mapping keys for typeId-specific settings
- Use MappingWithGrouping for executive-specific configurations

### Test Development
- Use `deployUniversalProfile` utility for test setup
- Use `setExecutiveConfig` and `setScreenerConfig` for configuration
- Use `mergeListEntry`/`removeListEntry` for address list management
- Follow existing test patterns in `/test` directory
- Mock contracts are available in `contracts/mocks/`

## Network Configuration

The project supports LUKSO networks:
- **luksoTestnet**: Testnet (chainId: 4201)
- **luksoMain**: Mainnet (chainId: 42)

Environment variables required:
- Network-specific private keys via `constants/network.ts`
- No API keys needed for block explorers

## Key Dependencies
- **@lukso/lsp-smart-contracts**: Core LUKSO protocol contracts
- **@erc725/erc725.js**: ERC725Y data handling
- **Hardhat**: Development framework
- **ethers.js v6**: Ethereum interaction library
- **TypeChain**: Type-safe contract interactions

## Important Notes
- All assistants execute via delegatecall in URD context
- Executive assistants can modify transaction value/data for subsequent assistants
- Screeners can be chained with AND/OR logic
- Configuration uses LSP2 JSON Schema standard
- Address lists follow LUKSO's established patterns (LSP5, LSP10, etc.)