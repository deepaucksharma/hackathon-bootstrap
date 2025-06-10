#!/bin/bash

# Demo Script: Platform Integration with Pipeline Documentation
# This script demonstrates how to run the platform with documentation enabled

echo "=== Message Queues Platform V2 - Pipeline Documentation Demo ==="
echo

# Set environment variables for demo
export NODE_ENV=development
export PLATFORM_MODE=simulation
export NEW_RELIC_ACCOUNT_ID=demo-account
export NEW_RELIC_API_KEY=demo-key
export NEW_RELIC_INGEST_KEY=demo-ingest-key
export NEW_RELIC_REGION=US

# Create a demo runner script
cat > run-with-documentation.ts << 'EOF'
import 'reflect-metadata';
import * as path from 'path';

// Set up path aliases before importing anything else
import { register } from 'tsconfig-paths';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

register({
  baseUrl: path.join(__dirname, 'dist'),
  paths: {
    '@application/*': ['application/*'],
    '@domain/*': ['domain/*'],
    '@infrastructure/*': ['infrastructure/*'],
    '@presentation/*': ['presentation/*'],
    '@shared/*': ['shared/*']
  }
});

async function runPlatformWithDocumentation() {
  const { MessageQueuesPlatform } = await import('./dist/main.js');
  const { ContainerFactory, TYPES } = await import('./dist/infrastructure/config/container.js');
  
  console.log('Starting Message Queues Platform V2 with Documentation...\n');
  
  const platform = new MessageQueuesPlatform();
  const container = ContainerFactory.getInstance();
  
  try {
    // Start the platform
    await platform.start();
    
    // Get the orchestrator and enable documentation
    const orchestrator = container.get(TYPES.PlatformOrchestrator);
    const outputDir = path.join(process.cwd(), 'platform-documentation-reports');
    
    console.log('Enabling pipeline documentation...');
    orchestrator.enableDocumentationMode(outputDir);
    
    // Wait for data collection cycles
    console.log('\nRunning data collection cycles...');
    console.log('Cycle 1 starting...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Cycle 2 starting...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate report
    console.log('\nGenerating pipeline documentation...');
    const reportPath = orchestrator.generateDocumentationReport();
    
    if (reportPath) {
      console.log(`\n✅ Documentation generated: ${reportPath}`);
      
      const stats = orchestrator.getStats();
      console.log('\n📊 Platform Statistics:');
      console.log(`   Mode: ${stats.currentMode}`);
      console.log(`   Cycles: ${stats.cyclesRun}`);
      console.log(`   Entities: ${stats.totalEntitiesProcessed}`);
      console.log(`   Errors: ${stats.errors}`);
    }
    
    // Stop platform
    await platform.stop();
    console.log('\n✅ Platform stopped successfully');
    
  } catch (error) {
    console.error('Error:', error);
    await platform.stop();
    process.exit(1);
  }
}

runPlatformWithDocumentation().catch(console.error);
EOF

echo "📝 Created run-with-documentation.ts"
echo

echo "🔨 Building the platform..."
npm run build

echo
echo "🚀 Running platform with documentation enabled..."
echo

# Run with tsx to handle TypeScript and module resolution
npx tsx run-with-documentation.ts

echo
echo "=== Demo Complete ==="
echo "📄 Check the 'platform-documentation-reports' directory for the generated report"