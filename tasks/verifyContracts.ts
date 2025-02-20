import { task } from 'hardhat/config';

task('verifyContracts', 'Verifies specified contracts')
  .addParam('names', 'Comma-separated names of the contracts to verify')
  .addParam('addresses', 'Comma-separated addresses of the contracts to verify')
  .addParam('paths', 'Comma-separated paths to the contract files')
  .setAction(async (taskArgs, hre) => {

    const contractNames = taskArgs.names.split(',');
    const contractPaths = taskArgs.paths.split(',');
    const contractAddresses = taskArgs.addresses.split(',');

    if (contractNames.length !== contractPaths.length) {
      throw new Error('The number of contract names and paths must be equal.');
    }

    for (let i = 0; i < contractNames.length; i++) {
      const trimmedName = contractNames[i].trim();
      const contractPath = contractPaths[i].trim();
      const deployedAddress = contractAddresses[i].trim();

      console.log(`\n--- Verifying ${trimmedName} ---`);

      try {
        await hre.run('verify:verify', {
          address: deployedAddress,
          constructorArguments: [],
          contract: `${contractPath}/${trimmedName}.sol:${trimmedName}`,
        });
        console.log(`${trimmedName} verified`);
      } catch (error) {
        console.error(`${trimmedName} verification failed:`, error);
      }
    }
  });

  module.exports = {};
