import { ethers } from "ethers";
import fs from "fs";

// Event signatures for UAP analytics
const UAP_ABI = [
  "event ExecutionResult(address indexed executiveAssistant, bool success)",
  "event ScreenResult(address indexed screenerAssistant, bool result)",
  "event AssistantNoOp(address indexed executiveAssistant, string reason)",
  // Legacy events for backward compatibility
  "event AssistantInvoked(address indexed subscriber, address indexed executiveAssistant)"
];

interface AnalyticsReport {
  network: string;
  urdAddress: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  uniqueProfiles: number;
  assistantUsage: Record<string, number>;
  screenerUsage: Record<string, number>;
  blockRange: { from: number; to: number };
  timestamp: number;
}

async function main() {
  // Get network and configuration
  const network = process.env.HARDHAT_NETWORK || "luksoTestnet";
  console.log(`📊 Analyzing UAP usage on ${network}`);

  // Load deployment state to get URD address
  const deploymentStateFile = `deployments-${network}.json`;
  if (!fs.existsSync(deploymentStateFile)) {
    console.error(`❌ Deployment state file not found: ${deploymentStateFile}`);
    console.log('   Deploy UAP first using: npx hardhat run scripts/deployURDUAP.ts');
    return;
  }

  const deploymentState = JSON.parse(fs.readFileSync(deploymentStateFile, 'utf-8'));
  const urdDeployment = deploymentState.deployments.find((d: any) => d.name === 'UniversalReceiverDelegateUAP');
  
  if (!urdDeployment) {
    console.error('❌ UniversalReceiverDelegateUAP not found in deployment state');
    return;
  }

  const URD_CONTRACT_ADDRESS = urdDeployment.address;
  console.log(`📝 Analyzing URD at: ${URD_CONTRACT_ADDRESS}`);

  // Setup network connection
  let RPC_URL: string;
  if (network === 'luksoTestnet') {
    RPC_URL = "https://rpc.testnet.lukso.network";
  } else if (network === 'luksoMain') {
    RPC_URL = "https://lukso.rpc.thirdweb.com";
  } else {
    throw new Error(`Unknown network: ${network}`);
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const urdContract = new ethers.Contract(URD_CONTRACT_ADDRESS, UAP_ABI, provider);

  // Get current block for range
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, urdDeployment.blockNumber || 0);
  
  console.log(`🔍 Scanning blocks ${fromBlock} to ${latestBlock}...`);

  try {
    // Query execution events
    const executionFilter = urdContract.filters.ExecutionResult();
    const executionEvents = await urdContract.queryFilter(executionFilter, fromBlock, "latest");
    
    // Query screening events  
    const screenFilter = urdContract.filters.ScreenResult();
    const screenEvents = await urdContract.queryFilter(screenFilter, fromBlock, "latest");
    
    // Query no-op events
    const noOpFilter = urdContract.filters.AssistantNoOp();
    const noOpEvents = await urdContract.queryFilter(noOpFilter, fromBlock, "latest");

    // Process execution analytics
    const assistantUsage: Record<string, number> = {};
    const screenerUsage: Record<string, number> = {};
    const uniqueProfiles = new Set<string>();
    let successfulExecutions = 0;
    let failedExecutions = 0;

    // Analyze execution events
    for (const event of executionEvents) {
      const assistant = event.args?.executiveAssistant;
      const success = event.args?.success;
      
      if (assistant) {
        assistantUsage[assistant] = (assistantUsage[assistant] || 0) + 1;
        
        if (success) {
          successfulExecutions++;
        } else {
          failedExecutions++;
        }
        
        // Get transaction to find the Universal Profile
        try {
          const tx = await provider.getTransaction(event.transactionHash);
          if (tx?.to) {
            uniqueProfiles.add(tx.to);
          }
        } catch (error) {
          console.warn(`Warning: Could not get transaction ${event.transactionHash}`);
        }
      }
    }

    // Analyze screening events
    for (const event of screenEvents) {
      const screener = event.args?.screenerAssistant;
      if (screener) {
        screenerUsage[screener] = (screenerUsage[screener] || 0) + 1;
      }
    }

    // Generate report
    const report: AnalyticsReport = {
      network,
      urdAddress: URD_CONTRACT_ADDRESS,
      totalExecutions: executionEvents.length,
      successfulExecutions,
      failedExecutions,
      uniqueProfiles: uniqueProfiles.size,
      assistantUsage,
      screenerUsage,
      blockRange: { from: fromBlock, to: latestBlock },
      timestamp: Date.now()
    };

    // Display results
    console.log('\n📈 UAP Usage Analytics');
    console.log('========================');
    console.log(`Network: ${network}`);
    console.log(`URD Address: ${URD_CONTRACT_ADDRESS}`);
    console.log(`Block Range: ${fromBlock} - ${latestBlock}`);
    console.log('');
    
    console.log(`📊 Execution Statistics:`);
    console.log(`  Total Executions: ${report.totalExecutions}`);
    console.log(`  Successful: ${successfulExecutions} (${report.totalExecutions > 0 ? ((successfulExecutions / report.totalExecutions) * 100).toFixed(1) : 0}%)`);
    console.log(`  Failed: ${failedExecutions} (${report.totalExecutions > 0 ? ((failedExecutions / report.totalExecutions) * 100).toFixed(1) : 0}%)`);
    console.log(`  Unique Profiles: ${uniqueProfiles.size}`);
    console.log('');
    
    if (Object.keys(assistantUsage).length > 0) {
      console.log(`🤖 Assistant Usage:`);
      Object.entries(assistantUsage)
        .sort(([,a], [,b]) => b - a)
        .forEach(([assistant, count]) => {
          console.log(`  ${assistant}: ${count} executions`);
        });
      console.log('');
    }
    
    if (Object.keys(screenerUsage).length > 0) {
      console.log(`🔍 Screener Usage:`);
      Object.entries(screenerUsage)
        .sort(([,a], [,b]) => b - a)
        .forEach(([screener, count]) => {
          console.log(`  ${screener}: ${count} evaluations`);
        });
      console.log('');
    }
    
    if (noOpEvents.length > 0) {
      console.log(`⏸️  No-Op Events: ${noOpEvents.length}`);
    }

    // Save report
    const reportFile = `uap-analytics-${network}-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`💾 Analytics report saved to: ${reportFile}`);
    
    if (report.totalExecutions === 0) {
      console.log('\n📝 No UAP activity detected.');
      console.log('   This could mean:');
      console.log('   - No Universal Profiles are using this URD');
      console.log('   - No assistants have been configured');
      console.log('   - No transactions have triggered the assistants');
    }

  } catch (error: any) {
    console.error('❌ Analytics failed:', error.message);
    
    if (error.message.includes('does not exist')) {
      console.log('   The URD contract may not be deployed or the address is incorrect');
    } else if (error.message.includes('query returned more than')) {
      console.log('   Too many events to query at once. Try with a smaller block range.');
    }
    
    throw error;
  }
}

main().catch(console.error);
