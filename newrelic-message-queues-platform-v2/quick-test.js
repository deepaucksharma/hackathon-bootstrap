#!/usr/bin/env node

// Quick test script to verify platform works
import 'dotenv/config';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🧪 Quick Platform Test - Simulation Mode\n');

// Set test environment
process.env.PLATFORM_MODE = 'simulation';
process.env.PLATFORM_INTERVAL = '10';
process.env.DASHBOARD_ENABLED = 'false';

// Run platform for 30 seconds
const platform = spawn('node', ['run-platform-unified.js'], {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit'
});

// Stop after 30 seconds
setTimeout(() => {
  console.log('\n\n✅ Test completed - stopping platform...');
  platform.kill('SIGINT');
  setTimeout(() => process.exit(0), 1000);
}, 30000);

// Handle errors
platform.on('error', (err) => {
  console.error('❌ Failed to start platform:', err);
  process.exit(1);
});