# Deployments

Ensure your .env file is configured.

Deploy the UAP URD and multiple assistants at once:

```bash
npx hardhat deployContracts \
  --network luksoTestnet \
  --names "UniversalReceiverDelegateUAP,ForwarderAssistant" \
  --paths "contracts,contracts/executive-assistants"
```

# Verifications

Verify the UAP URD and multiple assistants post-deployment:

```bash
npx hardhat verifyContracts \
  --network luksoTestnet \
  --names "UniversalReceiverDelegateUAP,TipAssistant,BurntPixRefinerAssistant,ForwarderAssistant" \
  --addresses "0xcf44a050c9b1fc87141d77b646436443bdc05a2b,0xf24c39a4d55994e70059443622fc166f05b5ff14,0x34a8ad9cf56dece5790f64f790de137b517169c6,0x67cc9c63af02f743c413182379e0f41ed3807801" \
  --paths "contracts,contracts/executive-assistants,contracts/executive-assistants,contracts/executive-assistants"
```