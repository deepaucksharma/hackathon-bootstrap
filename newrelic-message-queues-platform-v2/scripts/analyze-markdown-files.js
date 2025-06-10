#!/usr/bin/env node

/**
 * Analyze Markdown Files Script
 * 
 * This script analyzes all .md files and provides a cleanup plan
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const V2_ROOT = path.join(PROJECT_ROOT, 'newrelic-message-queues-platform-v2');
const V1_ROOT = path.join(PROJECT_ROOT, 'newrelic-message-queues-platform');

// Categories for analysis
const categories = {
  critical: {
    name: '🔴 Critical (Must Keep)',
    files: [],
    patterns: [
      'README.md',
      'ARCHITECTURE.md',
      'TECHNICAL_GUIDE.md',
      'DATA_MODEL_SPECIFICATION.md',
      'DATA_MODEL.md',
      'MESSAGE_QUEUES_PRD.md',
      'ULTRA_DETAILED_PRODUCT_SPECIFICATION.md',
      'metrics-reference.md'
    ]
  },
  entityDefs: {
    name: '📋 Entity Definitions',
    files: [],
    patterns: ['entity-types/', 'entity-definitions/', 'definition.yml']
  },
  guides: {
    name: '📚 Implementation Guides',
    files: [],
    patterns: ['IMPLEMENTATION_GUIDE', 'GUIDE.md', 'user-guide/']
  },
  pipeline: {
    name: '🔄 Pipeline Reports',
    files: [],
    patterns: ['PIPELINE_REPORT', 'DATA_TRANSFORMATION', 'pipeline-report']
  },
  archive: {
    name: '📦 Archived',
    files: [],
    patterns: ['archive/', 'outdated-docs/', 'legacy', 'old']
  },
  status: {
    name: '📊 Status/Summary Reports',
    files: [],
    patterns: ['STATUS', 'SUMMARY', 'REVIEW', 'VALIDATION_REPORT']
  },
  duplicate: {
    name: '🔁 Potential Duplicates',
    files: []
  },
  other: {
    name: '❓ Other',
    files: []
  }
};

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
    // Ignore errors
  }
  
  return fileList;
}

function categorizeFile(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  const fileName = path.basename(filePath);
  
  // Check each category
  for (const [key, category] of Object.entries(categories)) {
    if (key === 'duplicate' || key === 'other') continue;
    
    for (const pattern of category.patterns) {
      if (relativePath.includes(pattern) || fileName.includes(pattern)) {
        return key;
      }
    }
  }
  
  return 'other';
}

async function getFileInfo(filePath) {
  try {
    const stats = await stat(filePath);
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').length;
    const hasContent = lines > 10 && content.trim().length > 100;
    
    return {
      size: stats.size,
      modified: stats.mtime,
      lines,
      hasContent
    };
  } catch (error) {
    return {
      size: 0,
      modified: new Date(),
      lines: 0,
      hasContent: false
    };
  }
}

async function findDuplicates(files) {
  const contentMap = new Map();
  
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      const contentHash = content.trim().substring(0, 200); // Simple comparison
      
      if (contentMap.has(contentHash)) {
        contentMap.get(contentHash).push(file);
      } else {
        contentMap.set(contentHash, [file]);
      }
    } catch (error) {
      // Ignore
    }
  }
  
  const duplicates = [];
  for (const [hash, fileList] of contentMap) {
    if (fileList.length > 1) {
      duplicates.push(...fileList.slice(1)); // Keep first, mark rest as duplicates
    }
  }
  
  return duplicates;
}

async function analyzeMarkdownFiles() {
  console.log('🔍 Analyzing Markdown files...\n');
  
  // Get all markdown files
  const allFiles = await getAllFiles(PROJECT_ROOT);
  console.log(`Found ${allFiles.length} total .md files\n`);
  
  // Find duplicates
  const duplicates = await findDuplicates(allFiles);
  
  // Categorize files
  for (const file of allFiles) {
    const category = categorizeFile(file);
    const fileInfo = await getFileInfo(file);
    
    const fileData = {
      path: file,
      relativePath: path.relative(PROJECT_ROOT, file),
      ...fileInfo
    };
    
    if (duplicates.includes(file)) {
      categories.duplicate.files.push(fileData);
    } else {
      categories[category].files.push(fileData);
    }
  }
  
  // Display analysis
  console.log('📊 File Analysis:\n');
  
  for (const [key, category] of Object.entries(categories)) {
    if (category.files.length === 0) continue;
    
    console.log(`${category.name} (${category.files.length} files):`);
    
    // Sort by path
    category.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    
    // Show files
    category.files.slice(0, 10).forEach(file => {
      const sizeKB = (file.size / 1024).toFixed(1);
      const ageInDays = Math.floor((Date.now() - file.modified) / (1000 * 60 * 60 * 24));
      const status = file.hasContent ? '✓' : '✗';
      
      console.log(`  ${status} ${file.relativePath}`);
      console.log(`     Size: ${sizeKB}KB | Lines: ${file.lines} | Age: ${ageInDays} days`);
    });
    
    if (category.files.length > 10) {
      console.log(`  ... and ${category.files.length - 10} more`);
    }
    
    console.log();
  }
  
  // Cleanup recommendations
  console.log('🧹 Cleanup Recommendations:\n');
  
  const recommendations = [
    {
      action: 'DELETE',
      reason: 'Archived/outdated files',
      count: categories.archive.files.length,
      files: categories.archive.files
    },
    {
      action: 'DELETE',
      reason: 'Status/summary reports (regeneratable)',
      count: categories.status.files.length,
      files: categories.status.files
    },
    {
      action: 'DELETE',
      reason: 'Pipeline reports (regeneratable)',
      count: categories.pipeline.files.length,
      files: categories.pipeline.files
    },
    {
      action: 'DELETE',
      reason: 'Duplicate files',
      count: categories.duplicate.files.length,
      files: categories.duplicate.files
    },
    {
      action: 'KEEP',
      reason: 'Critical documentation',
      count: categories.critical.files.length,
      files: categories.critical.files
    },
    {
      action: 'KEEP',
      reason: 'Entity definitions',
      count: categories.entityDefs.files.length,
      files: categories.entityDefs.files
    },
    {
      action: 'ORGANIZE',
      reason: 'Implementation guides',
      count: categories.guides.files.length,
      files: categories.guides.files
    }
  ];
  
  let totalToDelete = 0;
  let totalToKeep = 0;
  
  recommendations.forEach(rec => {
    if (rec.count === 0) return;
    
    const icon = rec.action === 'DELETE' ? '❌' : rec.action === 'KEEP' ? '✅' : '📁';
    console.log(`${icon} ${rec.action}: ${rec.reason} (${rec.count} files)`);
    
    if (rec.action === 'DELETE') {
      totalToDelete += rec.count;
      rec.files.slice(0, 5).forEach(file => {
        console.log(`     - ${file.relativePath}`);
      });
      if (rec.files.length > 5) {
        console.log(`     ... and ${rec.files.length - 5} more`);
      }
    }
    
    if (rec.action === 'KEEP') {
      totalToKeep += rec.count;
    }
    
    console.log();
  });
  
  // Summary
  console.log('📈 Summary:');
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  To delete: ${totalToDelete} (${((totalToDelete / allFiles.length) * 100).toFixed(1)}%)`);
  console.log(`  To keep: ${totalToKeep} (${((totalToKeep / allFiles.length) * 100).toFixed(1)}%)`);
  console.log(`  To organize: ${categories.guides.files.length}`);
  console.log(`  To review: ${categories.other.files.length}`);
  
  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: allFiles.length,
      toDelete: totalToDelete,
      toKeep: totalToKeep,
      toOrganize: categories.guides.files.length,
      toReview: categories.other.files.length
    },
    categories,
    recommendations
  };
  
  const reportPath = path.join(V2_ROOT, 'markdown-cleanup-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${path.relative(PROJECT_ROOT, reportPath)}`);
  
  console.log('\n💡 Next steps:');
  console.log('  1. Review the detailed report');
  console.log('  2. Run cleanup-markdown-files.js to execute cleanup');
  console.log('  3. Organize remaining files into proper structure');
}

// Run the analysis
analyzeMarkdownFiles().catch(error => {
  console.error('Error during analysis:', error);
  process.exit(1);
});