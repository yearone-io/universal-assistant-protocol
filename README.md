# Universal Assistant Protocol (UAP)

The **Universal Assistant Protocol** extends a Universal Profile's (UP) functionality by allowing modular "Executive Assistants" that respond to incoming transactions. Below is an outline of the documentation available in this repository.

## Table of Contents

1. [Architecture & Components](./docs/ArchitectureAndComponents.md)
2. [Transaction Flow Diagram](./docs/TransactionFlow.md)
3. [Creating and Integrating a New Executive Assistant](./docs/CreatingAssistants.md)
4. [Future: Screener Assistants](./docs/FutureScreenerAssistants.md)
5. [Deployment & Verification](./docs/DeploymentAndVerification.md)

---

### Quick Introduction

- **Universal Profile (UP):** Your on-chain identity that handles tokens, assets, and messages.
- **Key Manager (LSP6):** Controls permissions for your UP.
- **URDuap:** The custom Universal Receiver Delegate that orchestrates Executive Assistants.
- **Executive Assistants:** Modular contracts implementing specific actions (e.g., tipping, refining tokens, forwarding).

See the [Architecture & Components](./docs/ArchitectureAndComponents.md) doc for more details, and check [Creating and Integrating a New Executive Assistant](./docs/CreatingAssistants.md) to build your own Assistant.

---

> **Note**: This repository is evolving. [Screener Assistants](./docs/FutureScreenerAssistants.md) will be introduced in a future release.
