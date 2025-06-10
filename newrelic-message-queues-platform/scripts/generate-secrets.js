#!/usr/bin/env node

/**
 * Generate encrypted secrets file
 * 
 * Usage: node scripts/generate-secrets.js
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { SecretsManager } = require('../core/security/secrets-manager');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function generateSecrets() {
  console.log('🔐 New Relic Message Queues Platform - Secrets Generator\n');
  
  // Generate or get encryption key
  let encryptionKey = process.env.SECRETS_ENCRYPTION_KEY;
  
  if (!encryptionKey) {
    console.log('No encryption key found. Generating a new one...');
    encryptionKey = crypto.randomBytes(32).toString('hex');
    console.log(`\n⚠️  Save this encryption key securely: ${encryptionKey}`);
    console.log('Set it as SECRETS_ENCRYPTION_KEY environment variable\n');
  }
  
  // Initialize secrets manager
  const secretsManager = new SecretsManager({
    backend: 'file',
    encryptionKey: encryptionKey,
    secretsPath: path.join(process.cwd(), '.secrets')
  });
  
  console.log('Enter your New Relic configuration:\n');
  
  // Collect secrets
  const secrets = {};
  
  secrets.NEW_RELIC_ACCOUNT_ID = await question('Account ID: ');
  secrets.NEW_RELIC_API_KEY = await question('User API Key: ');
  secrets.NEW_RELIC_INGEST_KEY = await question('Ingest Key: ');
  
  const region = await question('Region (us/eu) [us]: ');
  secrets.NEW_RELIC_REGION = region || 'us';
  
  // Optional: additional configuration
  const addMore = await question('\nAdd additional secrets? (y/n) [n]: ');
  
  if (addMore.toLowerCase() === 'y') {
    let moreSecrets = true;
    while (moreSecrets) {
      const key = await question('Secret name (or enter to finish): ');
      if (!key) {
        moreSecrets = false;
      } else {
        const value = await question(`Value for ${key}: `);
        secrets[key] = value;
      }
    }
  }
  
  console.log('\n📝 Saving encrypted secrets...');
  
  // Save all secrets
  for (const [key, value] of Object.entries(secrets)) {
    await secretsManager.setSecret(key, value);
  }
  
  // Generate .env.example
  const envExample = Object.keys(secrets)
    .map(key => `${key}=your_${key.toLowerCase()}_here`)
    .join('\n');
  
  await fs.writeFile('.env.example', envExample + '\n');
  
  // Generate docker-compose override with secrets
  const dockerOverride = `version: '3.8'

services:
  message-queues-platform:
    environment:
      - SECRETS_ENCRYPTION_KEY=${encryptionKey}
    volumes:
      - ./.secrets:/app/.secrets:ro
`;
  
  await fs.writeFile('docker-compose.override.yml', dockerOverride);
  
  console.log('\n✅ Secrets generated successfully!');
  console.log('\nCreated files:');
  console.log('  - .secrets/ (encrypted secrets)');
  console.log('  - .env.example (template for others)');
  console.log('  - docker-compose.override.yml (for Docker deployment)');
  
  console.log('\n🔒 Security recommendations:');
  console.log('  1. Add .secrets/ to .gitignore');
  console.log('  2. Store SECRETS_ENCRYPTION_KEY in a secure location');
  console.log('  3. Use different encryption keys for each environment');
  console.log('  4. Rotate encryption keys regularly');
  
  rl.close();
}

// Run if called directly
if (require.main === module) {
  generateSecrets().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { generateSecrets };