import { task } from 'hardhat/config';
import { getNetworkAccountsConfig } from '../constants/network';
import UniversalProfile from '@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json';
import { OPERATION_TYPES } from '@lukso/lsp-smart-contracts';

task('deployContracts', 'Deploys specified contracts')
  .addParam('names', 'Comma-separated names of the contracts to deploy')
  .addParam('paths', 'Comma-separated paths to the contract files')
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    const network = hre.network.name;
    const { UP_ADDR_CONTROLLED_BY_EOA } = getNetworkAccountsConfig(network);
    
    const eoaSigner = (await ethers.getSigners())[0]
    const UP = new ethers.Contract(
      UP_ADDR_CONTROLLED_BY_EOA,
      UniversalProfile.abi,
      eoaSigner
    );

    const contractNames = taskArgs.names.split(',');
    const contractPaths = taskArgs.paths.split(',');

    if (contractNames.length !== contractPaths.length) {
      throw new Error('The number of contract names and paths must be equal.');
    }

    for (let i = 0; i < contractNames.length; i++) {
      const trimmedName = contractNames[i].trim();
      const contractPath = contractPaths[i].trim();

      console.log(`\n--- Deploying ${trimmedName} via UP ---`);

     // Get the contract factory to access the deployment bytecode
     const ContractFactory = await ethers.getContractFactory(trimmedName);
      
     // Get the deployment bytecode
     const deploymentBytecode = ContractFactory.bytecode;

     // Execute the deployment through UP
     const deployedAddress = await UP.connect(eoaSigner).execute.staticCall(
         OPERATION_TYPES.CREATE,
         ethers.ZeroAddress,
         0,
         deploymentBytecode,
     );
     const tx = await UP.connect(eoaSigner).execute(
       OPERATION_TYPES.CREATE,
       ethers.ZeroAddress,
       0,
       deploymentBytecode
     );
     await tx.wait();

     if (!deployedAddress) {
       throw new Error('Failed to get deployed contract address from receipt');
     }

     console.log(`✅ ${trimmedName} deployed to:`, deployedAddress);

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
