/**
 * Demo Script: Pipeline Documentation Generation
 * 
 * This script demonstrates how to generate pipeline documentation
 * for the data transformation stages in the Message Queues Platform V2.
 * 
 * The documentation captures all three stages:
 * 1. Raw Data Collection
 * 2. Data Transformation  
 * 3. Entity Synthesis
 * 
 * Note: No percentage status metrics are included in the reports
 * as per requirements.
 */

import 'reflect-metadata';
import * as path from 'path';
import { MessageQueuesPlatform } from './dist/main.js';
import { ContainerFactory, TYPES } from './dist/infrastructure/config/container.js';

async function generatePipelineDocumentation() {
  console.log('=== Pipeline Documentation Demo ===\n');
  
  // Initialize platform
  const platform = new MessageQueuesPlatform();
  const container = ContainerFactory.getInstance();
  
  try {
    // Start the platform
    console.log('Starting Message Queues Platform V2...');
    await platform.start();
    
    // Get the orchestrator from the container
    const orchestrator = container.get(TYPES.PlatformOrchestrator);
    
    // Enable documentation mode with custom output directory
    const outputDir = path.join(process.cwd(), 'pipeline-documentation-demo');
    console.log(`\nEnabling documentation mode...`);
    console.log(`Output directory: ${outputDir}`);
    orchestrator.enableDocumentationMode(outputDir);
    
    // Wait for the first cycle to complete
    console.log('\nWaiting for data collection cycle...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Generate the documentation report
    console.log('\nGenerating pipeline documentation report...');
    const reportPath = orchestrator.generateDocumentationReport();
    
    if (reportPath) {
      console.log(`\n✅ Pipeline documentation generated successfully!`);
      console.log(`📄 Report location: ${reportPath}`);
      
      // Get platform stats
      const stats = orchestrator.getStats();
      console.log('\n📊 Platform Statistics:');
      console.log(`   - Mode: ${stats.currentMode}`);
      console.log(`   - Cycles Run: ${stats.cyclesRun}`);
      console.log(`   - Total Entities Processed: ${stats.totalEntitiesProcessed}`);
      console.log(`   - Errors: ${stats.errors}`);
      
      if (stats.lastCycleDuration) {
        console.log(`   - Last Cycle Duration: ${stats.lastCycleDuration}ms`);
      }
    } else {
      console.error('\n❌ Failed to generate documentation report');
    }
    
    // Stop the platform
    console.log('\nStopping platform...');
    await platform.stop();
    
  } catch (error) {
    console.error('\n❌ Error during documentation generation:', error);
    await platform.stop();
    process.exit(1);
  }
  
  console.log('\n=== Demo Complete ===');
}

// Run the demo
generatePipelineDocumentation().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});