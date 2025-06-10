#!/usr/bin/env node

/**
 * Platform Runner using tsx
 * This is a wrapper that uses tsx to run the TypeScript directly
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get command line arguments
const args = process.argv.slice(2);

// Use tsx to run the TypeScript directly
const tsx = spawn('npx', ['tsx', 'src/platform.ts', ...args], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

// Handle exit
tsx.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
tsx.on('error', (err) => {
  console.error('Failed to start platform:', err);
  process.exit(1);
});