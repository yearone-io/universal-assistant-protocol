import { task } from 'hardhat/config';
import { getNetworkAccountsConfig } from '../constants/network';
import UniversalProfile from '@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json';
import { OPERATION_TYPES } from '@lukso/lsp-smart-contracts';
import * as fs from 'fs';
import * as path from 'path';

interface DeploymentInfo {
  name: string;
  address: string;
  contractPath: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  verified: boolean;
  constructorArgs: any[];
}

interface DeploymentFile {
  network: string;
  deployments: DeploymentInfo[];
}

function getDeploymentFilePath(network: string): string {
  const networkMapping: { [key: string]: string } = {
    'luksoTestnet': 'luksoTestnet',
    'luksoMain': 'luksoMain'
  };
  
  const fileName = networkMapping[network] || network;
  return path.join(process.cwd(), `deployments-${fileName}.json`);
}

function loadDeploymentFile(network: string): DeploymentFile {
  const filePath = getDeploymentFilePath(network);
  
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } else {
    return {
      network: network,
      deployments: []
    };
  }
}

function saveDeploymentInfo(network: string, deploymentInfo: DeploymentInfo): void {
  const deploymentFile = loadDeploymentFile(network);
  
  // Check if this contract is already deployed (avoid duplicates)
  const existingIndex = deploymentFile.deployments.findIndex(
    d => d.name === deploymentInfo.name && d.address === deploymentInfo.address
  );
  
  if (existingIndex >= 0) {
    // Update existing deployment
    deploymentFile.deployments[existingIndex] = deploymentInfo;
    console.log(`📝 Updated existing deployment record for ${deploymentInfo.name}`);
  } else {
    // Add new deployment
    deploymentFile.deployments.push(deploymentInfo);
    console.log(`📝 Added new deployment record for ${deploymentInfo.name}`);
  }
  
  const filePath = getDeploymentFilePath(network);
  fs.writeFileSync(filePath, JSON.stringify(deploymentFile, null, 2));
}

function updateVerificationStatus(network: string, address: string, verified: boolean): void {
  const deploymentFile = loadDeploymentFile(network);
  const deployment = deploymentFile.deployments.find(d => d.address === address);
  
  if (deployment) {
    deployment.verified = verified;
    const filePath = getDeploymentFilePath(network);
    fs.writeFileSync(filePath, JSON.stringify(deploymentFile, null, 2));
  }
}

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

    const deployedContracts: Array<{name: string, address: string, path: string}> = [];

    for (let i = 0; i < contractNames.length; i++) {
      const trimmedName = contractNames[i].trim();
      const contractPath = contractPaths[i].trim();

      console.log(`\n--- Deploying ${trimmedName} via UP ---`);

     // Get the contract factory to access the deployment bytecode
     const ContractFactory = await ethers.getContractFactory(trimmedName);
      
     // Get the deployment bytecode
     const deploymentBytecode = ContractFactory.bytecode;

     // Execute the deployment through UP
     const deployedAddress = await (UP.connect(eoaSigner) as any).execute.staticCall(
         OPERATION_TYPES.CREATE,
         ethers.ZeroAddress,
         0,
         deploymentBytecode,
     );
     const tx = await (UP.connect(eoaSigner) as any).execute(
       OPERATION_TYPES.CREATE,
       ethers.ZeroAddress,
       0,
       deploymentBytecode
     );
     const receipt = await tx.wait();

     if (!deployedAddress) {
       throw new Error('Failed to get deployed contract address');
     }

     console.log(`✅ ${trimmedName} deployed to: ${deployedAddress}`);
     console.log(`   Transaction hash: ${receipt?.hash}`);
     
     // Save deployment info to JSON file
     const deploymentInfo: DeploymentInfo = {
       name: trimmedName,
       address: deployedAddress,
       contractPath: `${contractPath}/${trimmedName}.sol:${trimmedName}`,
       txHash: receipt?.hash || '',
       blockNumber: receipt?.blockNumber || 0,
       timestamp: Date.now(),
       verified: false,
       constructorArgs: []
     };
     
     saveDeploymentInfo(network, deploymentInfo);
     
     // Store deployment info for later verification
     deployedContracts.push({
       name: trimmedName,
       address: deployedAddress,
       path: contractPath
     });
    }

    // Wait 30 seconds before starting verification process
    if (deployedContracts.length > 0) {
      console.log('\n⏳ Waiting 30 seconds before verification to ensure contracts are indexed...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      console.log('\n--- Starting Verification Process ---');
      
      for (const contract of deployedContracts) {
        try {
          console.log(`\n🔍 Verifying ${contract.name}...`);
          await hre.run('verify:verify', {
            address: contract.address,
            constructorArguments: [],
            contract: `${contract.path}/${contract.name}.sol:${contract.name}`,
          });
          console.log(`✅ ${contract.name} verified successfully`);
          
          // Update verification status in deployment file
          updateVerificationStatus(network, contract.address, true);
        } catch (error: any) {
          if (error.message?.includes('Already Verified')) {
            console.log(`✅ ${contract.name} was already verified`);
            
            // Update verification status in deployment file
            updateVerificationStatus(network, contract.address, true);
          } else {
            console.error(`❌ ${contract.name} verification failed:`, error.message || error);
            
            // Keep verification status as false (already set during deployment)
          }
        }
      }
    }
  });

task('deployFullProtocol', 'Deploys the complete UAP protocol (main contract + all assistants)')
  .setAction(async (taskArgs, hre) => {
    const network = hre.network.name;
    
    console.log(`\n🚀 Deploying Full Universal Assistant Protocol to ${network}`);
    console.log('=' .repeat(60));
    
    // Define all contracts to deploy in logical order
    const allContracts = {
      names: [
        'UniversalReceiverDelegateUAP',
        'ForwarderAssistant', 
        'TipAssistant',
        'BurntPixRefinerAssistant',
        'NotifierListScreener',
        'NotifierCurationScreener'
      ],
      paths: [
        'contracts',
        'contracts/executive-assistants',
        'contracts/executive-assistants', 
        'contracts/executive-assistants',
        'contracts/screener-assistants',
        'contracts/screener-assistants'
      ]
    };
    
    console.log('\n📋 Contracts to deploy:');
    console.log('  🏗️  Core Contract:');
    console.log('    - UniversalReceiverDelegateUAP');
    console.log('  ⚡ Executive Assistants:');
    console.log('    - ForwarderAssistant');
    console.log('    - TipAssistant'); 
    console.log('    - BurntPixRefinerAssistant');
    console.log('  🛡️  Screener Assistants:');
    console.log('    - NotifierListScreener');
    console.log('    - NotifierCurationScreener');
    
    console.log('\n🎯 Starting deployment...\n');
    
    // Call the existing deployContracts task with all contracts
    await hre.run('deployContracts', {
      names: allContracts.names.join(','),
      paths: allContracts.paths.join(',')
    });
    
    console.log('\n🎉 Full Protocol Deployment Complete!');
    console.log('=' .repeat(60));
    console.log(`📁 Deployment records saved to: deployments-${network}.json`);
    console.log('✅ All contracts deployed and verified successfully');
  });

  module.exports = {};
