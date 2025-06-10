#!/usr/bin/env node

/**
 * Markdown Files Cleanup Script
 * 
 * This script cleans up and organizes all .md files in the project
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const V2_ROOT = path.join(PROJECT_ROOT, 'newrelic-message-queues-platform-v2');
const V1_ROOT = path.join(PROJECT_ROOT, 'newrelic-message-queues-platform');

// Files to keep (critical documentation)
const CRITICAL_FILES = {
  v2: [
    'README.md',
    'ARCHITECTURE.md',
    'TECHNICAL_GUIDE.md',
    'DATA_MODEL_SPECIFICATION.md'
  ],
  v1: [
    'README.md',
    'docs/DATA_MODEL.md',
    'docs/ARCHITECTURE.md'
  ],
  root: [
    'docs/MESSAGE_QUEUES_PRD.md',
    'docs/ULTRA_DETAILED_PRODUCT_SPECIFICATION.md',
    'docs/metrics-reference.md'
  ]
};

// Files to delete (outdated/redundant)
const FILES_TO_DELETE = [
  // V2 files
  'V2_PRODUCTION_READINESS_SUMMARY.md',
  'PROJECT_STATUS.md',
  'archive/CONSOLIDATED_SUMMARY.md',
  'archive/COMPREHENSIVE_V2_REVIEW.md',
  'archive/IMPLEMENTATION_SUMMARY.md',
  'archive/outdated-docs/*',
  
  // V1 files
  'ARCHITECTURAL_COMPONENT_MAPPING.md',
  'PLATFORM_ARCHITECTURE.md',
  'PLATFORM_VALIDATION_REPORT.md',
  'V2_CRITICAL_REVIEW.md',
  'DASHBOARD_ENHANCEMENT_SUMMARY.md',
  'CURRENT_DATA_MODEL.md',
  'LATEST_PIPELINE_REPORT.md',
  'data-pipeline-docs/*.md',
  
  // Root files
  'CLAUDE.md',
  'FINAL_SOLUTION.md',
  'docs/DOCUMENTATION_REVIEW.md',
  'docs/IMPLEMENTATION_SUMMARY.md',
  'docs/README_NEW.md',
  'docs/user-guide/quickstart-legacy.md',
  'docs/ULTRA_DETAILED_PRODUCT_SPECIFICATION_V2.md'
];

async function getAllFiles(dir, fileList = []) {
  try {
    const files = await readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isDirectory()) {
        if (!file.includes('node_modules') && !file.startsWith('.')) {
          await getAllFiles(filePath, fileList);
        }
      } else if (file.endsWith('.md')) {
        fileList.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return fileList;
}

function shouldDelete(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  
  for (const pattern of FILES_TO_DELETE) {
    if (pattern.endsWith('*')) {
      const dir = pattern.slice(0, -1);
      if (relativePath.startsWith(dir)) {
        return true;
      }
    } else {
      if (relativePath === pattern || filePath.endsWith(pattern)) {
        return true;
      }
    }
  }
  
  return false;
}

function shouldKeep(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  const fileName = path.basename(filePath);
  
  // Check critical files
  for (const files of Object.values(CRITICAL_FILES)) {
    for (const keepFile of files) {
      if (relativePath.endsWith(keepFile) || fileName === keepFile) {
        return true;
      }
    }
  }
  
  // Keep entity definition files
  if (relativePath.includes('entity-types') || relativePath.includes('newrelic-entity-definitions')) {
    return true;
  }
  
  // Keep implementation guides
  if (relativePath.includes('IMPLEMENTATION_GUIDES')) {
    return true;
  }
  
  return false;
}

async function cleanupMarkdownFiles() {
  console.log('🧹 Starting Markdown files cleanup...\n');
  
  // Get all markdown files
  const allFiles = await getAllFiles(PROJECT_ROOT);
  console.log(`Found ${allFiles.length} total .md files\n`);
  
  const toDelete = [];
  const toKeep = [];
  const toReview = [];
  
  // Categorize files
  for (const file of allFiles) {
    if (shouldDelete(file)) {
      toDelete.push(file);
    } else if (shouldKeep(file)) {
      toKeep.push(file);
    } else {
      toReview.push(file);
    }
  }
  
  // Display summary
  console.log('📊 Cleanup Summary:');
  console.log(`  ✅ Files to keep: ${toKeep.length}`);
  console.log(`  ❌ Files to delete: ${toDelete.length}`);
  console.log(`  ⚠️  Files to review: ${toReview.length}`);
  console.log();
  
  // Show files to be deleted
  if (toDelete.length > 0) {
    console.log('❌ Files to be deleted:');
    toDelete.forEach(file => {
      console.log(`  - ${path.relative(PROJECT_ROOT, file)}`);
    });
    console.log();
  }
  
  // Show files to keep
  console.log('✅ Files to keep:');
  toKeep.slice(0, 10).forEach(file => {
    console.log(`  - ${path.relative(PROJECT_ROOT, file)}`);
  });
  if (toKeep.length > 10) {
    console.log(`  ... and ${toKeep.length - 10} more`);
  }
  console.log();
  
  // Show files needing review
  if (toReview.length > 0) {
    console.log('⚠️  Files needing manual review:');
    toReview.forEach(file => {
      console.log(`  - ${path.relative(PROJECT_ROOT, file)}`);
    });
    console.log();
  }
  
  // Ask for confirmation
  console.log(`\n⚠️  This will DELETE ${toDelete.length} files permanently!`);
  console.log('Do you want to proceed? (y/N)');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n🗑️  Deleting files...');
      
      let deleted = 0;
      let errors = 0;
      
      for (const file of toDelete) {
        try {
          await unlink(file);
          deleted++;
          console.log(`  ✓ Deleted: ${path.relative(PROJECT_ROOT, file)}`);
        } catch (error) {
          errors++;
          console.error(`  ✗ Error deleting ${path.relative(PROJECT_ROOT, file)}: ${error.message}`);
        }
      }
      
      console.log(`\n✅ Cleanup complete!`);
      console.log(`  - Deleted: ${deleted} files`);
      console.log(`  - Errors: ${errors}`);
      console.log(`  - Kept: ${toKeep.length} files`);
      
      // Create organized structure
      await createOrganizedStructure();
      
    } else {
      console.log('\n❌ Cleanup cancelled.');
    }
    
    rl.close();
  });
}

async function createOrganizedStructure() {
  console.log('\n📁 Creating organized documentation structure...');
  
  const v2DocsDir = path.join(V2_ROOT, 'docs');
  const directories = [
    path.join(v2DocsDir, 'architecture'),
    path.join(v2DocsDir, 'guides'),
    path.join(v2DocsDir, 'api'),
    path.join(v2DocsDir, 'entity-definitions')
  ];
  
  for (const dir of directories) {
    try {
      await mkdir(dir, { recursive: true });
      console.log(`  ✓ Created: ${path.relative(V2_ROOT, dir)}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`  ✗ Error creating ${dir}: ${error.message}`);
      }
    }
  }
  
  console.log('\n📚 Documentation structure organized!');
  console.log('\nRecommended next steps:');
  console.log('  1. Move remaining guides to docs/guides/');
  console.log('  2. Consolidate entity definitions in docs/entity-definitions/');
  console.log('  3. Update README.md with new documentation structure');
}

// Run the cleanup
cleanupMarkdownFiles().catch(error => {
  console.error('Error during cleanup:', error);
  process.exit(1);
});