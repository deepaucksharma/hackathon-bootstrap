#!/usr/bin/env node

/**
 * Execute Markdown Cleanup Script
 * 
 * This script performs the actual cleanup based on the analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const rename = promisify(fs.rename);
const readFile = promisify(fs.readFile);

// Files to delete based on analysis
const FILES_TO_DELETE = [
  // Archived/outdated files
  'docs/operations/infrastructure-integration-legacy.md',
  'docs/operations/infrastructure-setup-legacy.md',
  'newrelic-message-queues-platform-v2/archive/COMPREHENSIVE_V2_REVIEW.md',
  'newrelic-message-queues-platform-v2/archive/CONSOLIDATED_SUMMARY.md',
  'newrelic-message-queues-platform-v2/archive/IMPLEMENTATION_SUMMARY.md',
  'newrelic-message-queues-platform-v2/archive/outdated-docs/DATA_MODEL_FLOW_2025-06-09T21-30-30-582Z.md',
  'newrelic-message-queues-platform-v2/archive/outdated-docs/DOCUMENTATION_STREAMLINING_PLAN.md',
  'newrelic-message-queues-platform-v2/archive/outdated-docs/MASTER_DOCUMENTATION.md',
  'newrelic-message-queues-platform-v2/archive/outdated-docs/V1_VS_V2_COMPREHENSIVE_COMPARISON.md',
  'newrelic-message-queues-platform-v2/archive/README-v2.md',
  
  // Status/summary reports
  'docs/CONSOLIDATION_SUMMARY.md',
  'docs/DOCUMENTATION_REVIEW.md',
  'docs/IMPLEMENTATION_SUMMARY.md',
  'newrelic-message-queues-platform-v2/DASHBOARD_INTEGRATION_SUMMARY.md',
  'newrelic-message-queues-platform-v2/PROJECT_STATUS.md',
  'newrelic-message-queues-platform-v2/V2_PRODUCTION_READINESS_SUMMARY.md',
  'newrelic-message-queues-platform/core/workers/IMPLEMENTATION_SUMMARY.md',
  'newrelic-message-queues-platform/DASHBOARD_ENHANCEMENT_SUMMARY.md',
  'newrelic-message-queues-platform/docs/ENTITY_COMPLIANCE_SUMMARY.md',
  'newrelic-message-queues-platform/docs/IMPLEMENTATION_VALIDATION_REPORT.md',
  'newrelic-message-queues-platform/PLATFORM_VALIDATION_REPORT.md',
  'newrelic-message-queues-platform/V2_CRITICAL_REVIEW.md',
  
  // Pipeline reports
  'newrelic-message-queues-platform-v2/pipeline-documentation-demo/LATEST_PIPELINE_REPORT.md',
  'newrelic-message-queues-platform-v2/pipeline-documentation-demo/pipeline-report-2025-06-10.md',
  'newrelic-message-queues-platform/docs/DATA_TRANSFORMATION_PIPELINE.md',
  'newrelic-message-queues-platform/LATEST_PIPELINE_REPORT.md',
  'newrelic-message-queues-platform/data-pipeline-docs/2025-06-09_DATA_TRANSFORMATION_PIPELINE.md',
  'newrelic-message-queues-platform/data-pipeline-docs/2025-06-10_COMPREHENSIVE_PIPELINE_REPORT.md',
  'newrelic-message-queues-platform/data-pipeline-docs/2025-06-10_DATA_TRANSFORMATION_PIPELINE.md',
  'newrelic-message-queues-platform/docs/LIVE_DATA_TRANSFORMATION_PIPELINE.md',
  
  // Duplicate files
  'docs/getting-started/README_CONSOLIDATED.md',
  'docs/operations/infrastructure-setup_CONSOLIDATED.md',
  'docs/user-guide/quickstart-legacy.md',
  
  // Other redundant files
  'CLAUDE.md',
  'FINAL_SOLUTION.md',
  'docs/README_NEW.md',
  'docs/ULTRA_DETAILED_PRODUCT_SPECIFICATION_V2.md',
  'newrelic-message-queues-platform/ARCHITECTURAL_COMPONENT_MAPPING.md',
  'newrelic-message-queues-platform/PLATFORM_ARCHITECTURE.md',
  'newrelic-message-queues-platform/CURRENT_DATA_MODEL.md'
];

const PROJECT_ROOT = path.resolve(__dirname, '../..');

async function executeCleanup() {
  console.log('🧹 Markdown Cleanup Execution\n');
  
  // Count files
  const filesToDelete = FILES_TO_DELETE.map(f => path.join(PROJECT_ROOT, f));
  const existingFiles = filesToDelete.filter(f => fs.existsSync(f));
  
  console.log(`📊 Cleanup Summary:`);
  console.log(`  Files to delete: ${existingFiles.length} of ${FILES_TO_DELETE.length}`);
  console.log(`  Missing files: ${FILES_TO_DELETE.length - existingFiles.length}`);
  console.log();
  
  if (existingFiles.length === 0) {
    console.log('✅ No files to delete. Cleanup already complete!');
    return;
  }
  
  // Show files to be deleted
  console.log('❌ Files to be deleted:');
  existingFiles.forEach(file => {
    const relativePath = path.relative(PROJECT_ROOT, file);
    const stats = fs.statSync(file);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`  - ${relativePath} (${sizeKB}KB)`);
  });
  
  // Calculate total size
  const totalSize = existingFiles.reduce((sum, file) => {
    return sum + fs.statSync(file).size;
  }, 0);
  console.log(`\n  Total size to free: ${(totalSize / 1024).toFixed(1)}KB`);
  
  // Ask for confirmation
  console.log(`\n⚠️  This will permanently delete ${existingFiles.length} files!`);
  console.log('Do you want to proceed? (y/N) ');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n🗑️  Deleting files...\n');
      
      let deleted = 0;
      let errors = 0;
      
      for (const file of existingFiles) {
        try {
          await unlink(file);
          deleted++;
          console.log(`  ✓ Deleted: ${path.relative(PROJECT_ROOT, file)}`);
        } catch (error) {
          errors++;
          console.error(`  ✗ Error: ${path.relative(PROJECT_ROOT, file)} - ${error.message}`);
        }
      }
      
      console.log(`\n✅ Cleanup complete!`);
      console.log(`  - Deleted: ${deleted} files`);
      console.log(`  - Errors: ${errors}`);
      console.log(`  - Freed: ${(totalSize / 1024).toFixed(1)}KB`);
      
      // Clean up empty directories
      await cleanupEmptyDirectories();
      
      // Create organized structure
      await createOrganizedStructure();
      
    } else {
      console.log('\n❌ Cleanup cancelled.');
    }
    
    rl.close();
  });
}

async function cleanupEmptyDirectories() {
  console.log('\n📁 Cleaning up empty directories...');
  
  const dirsToCheck = [
    'newrelic-message-queues-platform-v2/archive/outdated-docs',
    'newrelic-message-queues-platform-v2/archive',
    'newrelic-message-queues-platform-v2/pipeline-documentation-demo',
    'newrelic-message-queues-platform/data-pipeline-docs',
    'docs/operations'
  ];
  
  for (const dir of dirsToCheck) {
    const dirPath = path.join(PROJECT_ROOT, dir);
    if (fs.existsSync(dirPath)) {
      try {
        const files = fs.readdirSync(dirPath);
        if (files.length === 0) {
          fs.rmdirSync(dirPath);
          console.log(`  ✓ Removed empty directory: ${dir}`);
        }
      } catch (error) {
        // Ignore errors
      }
    }
  }
}

async function createOrganizedStructure() {
  console.log('\n📚 Creating organized documentation structure...');
  
  // Create clean structure in V2
  const v2Dirs = [
    'newrelic-message-queues-platform-v2/docs',
    'newrelic-message-queues-platform-v2/docs/architecture',
    'newrelic-message-queues-platform-v2/docs/guides',
    'newrelic-message-queues-platform-v2/docs/api',
    'newrelic-message-queues-platform-v2/docs/reference'
  ];
  
  for (const dir of v2Dirs) {
    const dirPath = path.join(PROJECT_ROOT, dir);
    try {
      await mkdir(dirPath, { recursive: true });
      console.log(`  ✓ Ensured directory: ${path.relative(PROJECT_ROOT, dirPath)}`);
    } catch (error) {
      // Directory might already exist
    }
  }
  
  console.log('\n💡 Recommended next steps:');
  console.log('  1. Move ARCHITECTURE.md to docs/architecture/');
  console.log('  2. Move TECHNICAL_GUIDE.md to docs/guides/');
  console.log('  3. Move DATA_MODEL_SPECIFICATION.md to docs/reference/');
  console.log('  4. Update README.md with new documentation structure');
  console.log('  5. Create docs/INDEX.md as documentation entry point');
}

// Run the cleanup
executeCleanup().catch(error => {
  console.error('Error during cleanup:', error);
  process.exit(1);
});