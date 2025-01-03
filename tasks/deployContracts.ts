import { task } from 'hardhat/config';
import { getNetworkAccountsConfig } from '../constants/network';

task('deployContracts', 'Deploys specified contracts')
  .addParam('names', 'Comma-separated names of the contracts to deploy')
  .addParam('paths', 'Comma-separated paths to the contract files')
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const network = hre.network.name;
    console.log('Network:', network, getNetworkAccountsConfig(network));
    const { UP_ADDR_CONTROLLED_BY_EOA } = getNetworkAccountsConfig(network);
    
    const deployer = UP_ADDR_CONTROLLED_BY_EOA;
    console.log('Deploying contracts with the account:', deployer);

    const contractNames = taskArgs.names.split(',');
    const contractPaths = taskArgs.paths.split(',');

    if (contractNames.length !== contractPaths.length) {
      throw new Error('The number of contract names and paths must be equal.');
    }

    for (let i = 0; i < contractNames.length; i++) {
      const trimmedName = contractNames[i].trim();
      const contractPath = contractPaths[i].trim();
      const AssistantContract = await ethers.getContractFactory(trimmedName);
      const assistantContract = await AssistantContract.deploy();
      // wait until the contract is mined
      await assistantContract.waitForDeployment();

      const address = await assistantContract.getAddress();
      console.log(`✅ ${trimmedName} deployed to:`, address);

      try {
        await hre.run('verify:verify', {
          address: assistantContract.target,
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
