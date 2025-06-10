#!/usr/bin/env node

/**
 * Demo script to showcase the beautiful pipeline documentation
 * 
 * This script runs the platform with enhanced documentation capturing
 * all three stages of data transformation
 */

const { spawn } = require('child_process');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

console.log(chalk.blue.bold(`
╔════════════════════════════════════════════════════════════════╗
║                Pipeline Documentation Demo                      ║
║                                                                ║
║  This demo will showcase the comprehensive data pipeline       ║
║  documentation with all transformation stages                  ║
╚════════════════════════════════════════════════════════════════╝
`));

// Configuration for the demo
const demoConfig = {
  mode: 'simulation',
  provider: 'kafka',
  duration: 1, // Run for 1 cycle only
  accountId: process.env.NEW_RELIC_ACCOUNT_ID || '123456',
  apiKey: process.env.NEW_RELIC_API_KEY || 'NRAK-demo',
  continuous: false,
  generateDocs: true,
  generateDashboards: false,
  debug: true
};

console.log(chalk.cyan('📋 Demo Configuration:'));
console.log(chalk.gray(`   Mode: ${demoConfig.mode}`));
console.log(chalk.gray(`   Provider: ${demoConfig.provider}`));
console.log(chalk.gray(`   Account ID: ${demoConfig.accountId}`));
console.log(chalk.gray(`   Documentation: Enabled`));
console.log('');

// Build command arguments
const args = [
  'run-platform-unified.js',
  '--mode', demoConfig.mode,
  '--provider', demoConfig.provider,
  '--account-id', demoConfig.accountId,
  '--api-key', demoConfig.apiKey,
  '--no-continuous'
];

if (demoConfig.debug) {
  args.push('--debug');
}

console.log(chalk.blue('🚀 Starting platform with enhanced documentation...'));
console.log('');

// Run the platform
const platformProcess = spawn('node', args, {
  cwd: __dirname,
  stdio: 'inherit'
});

platformProcess.on('close', (code) => {
  if (code === 0) {
    console.log('');
    console.log(chalk.green.bold('✅ Platform execution completed successfully!'));
    console.log('');
    
    // Check for generated documentation
    const pipelineReportPath = path.join(__dirname, 'LATEST_PIPELINE_REPORT.md');
    const docsDir = path.join(__dirname, 'data-pipeline-docs');
    
    if (fs.existsSync(pipelineReportPath)) {
      console.log(chalk.blue.bold('📄 Generated Documentation:'));
      console.log('');
      console.log(chalk.green('   ✓ Comprehensive Pipeline Report:'));
      console.log(chalk.gray(`     ${pipelineReportPath}`));
      
      // Show file size
      const stats = fs.statSync(pipelineReportPath);
      console.log(chalk.gray(`     Size: ${(stats.size / 1024).toFixed(2)} KB`));
      console.log('');
      
      // List other generated files
      if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir)
          .filter(f => f.endsWith('.md') || f.endsWith('.csv') || f.endsWith('.mermaid'))
          .sort((a, b) => b.localeCompare(a));
        
        if (files.length > 0) {
          console.log(chalk.green('   ✓ Additional Documentation Files:'));
          files.slice(0, 5).forEach(file => {
            console.log(chalk.gray(`     - ${file}`));
          });
          if (files.length > 5) {
            console.log(chalk.gray(`     ... and ${files.length - 5} more files`));
          }
        }
      }
      
      console.log('');
      console.log(chalk.cyan.bold('📊 Documentation Highlights:'));
      console.log('');
      console.log('   The generated report includes:');
      console.log('   • Executive dashboard with pipeline metrics');
      console.log('   • Stage 1: Raw data collection analysis');
      console.log('   • Stage 2: Transformation mapping and comparison');
      console.log('   • Stage 3: Entity synthesis with relationships');
      console.log('   • Data quality assessment across all stages');
      console.log('   • Performance analysis with bottleneck detection');
      console.log('   • Entity catalog with health scores');
      console.log('   • Visual diagrams (Mermaid) for data flow');
      console.log('   • Comprehensive metrics comparison tables');
      console.log('   • Actionable recommendations');
      console.log('');
      
      console.log(chalk.yellow.bold('📖 View the Report:'));
      console.log('');
      console.log(chalk.white('   Open the following file in your markdown viewer:'));
      console.log(chalk.cyan(`   ${pipelineReportPath}`));
      console.log('');
      console.log(chalk.gray('   Or use VS Code with markdown preview:'));
      console.log(chalk.gray(`   code "${pipelineReportPath}"`));
      console.log('');
      
      // Extract some key metrics from the report
      try {
        const reportContent = fs.readFileSync(pipelineReportPath, 'utf8');
        const totalEntitiesMatch = reportContent.match(/Total Entities[^\d]*(\d+)/);
        const performanceMatch = reportContent.match(/Performance-([^?]+)\?/);
        const healthScoreMatch = reportContent.match(/Pipeline Health Score: (\d+)\/100/);
        
        if (totalEntitiesMatch || performanceMatch || healthScoreMatch) {
          console.log(chalk.magenta.bold('🎯 Key Metrics from Report:'));
          console.log('');
          if (totalEntitiesMatch) {
            console.log(chalk.white(`   • Total Entities Generated: ${chalk.green(totalEntitiesMatch[1])}`));
          }
          if (performanceMatch) {
            console.log(chalk.white(`   • Pipeline Performance: ${chalk.green(performanceMatch[1])}`));
          }
          if (healthScoreMatch) {
            console.log(chalk.white(`   • Pipeline Health Score: ${chalk.green(healthScoreMatch[1] + '/100')}`));
          }
          console.log('');
        }
      } catch (e) {
        // Ignore errors in parsing
      }
      
    } else {
      console.log(chalk.yellow('⚠️  Documentation file not found at expected location'));
    }
    
  } else {
    console.log('');
    console.log(chalk.red(`❌ Platform exited with code ${code}`));
  }
  
  console.log(chalk.blue('═'.repeat(65)));
});

platformProcess.on('error', (error) => {
  console.error(chalk.red('❌ Failed to start platform:'), error);
});