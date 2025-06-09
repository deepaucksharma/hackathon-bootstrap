#!/usr/bin/env node

/**
 * Docker Connection Proof of Concept
 * 
 * This script tests basic connectivity to Docker and discovers message queue containers.
 * No abstractions - just direct API calls to prove it works.
 */

const Docker = require('dockerode');
const chalk = require('chalk');

async function testDockerConnection() {
  console.log(chalk.bold.blue('\n🐳 Testing Docker Connection\n'));
  
  try {
    // Create Docker client
    const docker = new Docker({
      socketPath: '/var/run/docker.sock' // Default for Linux/Mac
      // For Windows: socketPath: '//./pipe/docker_engine'
    });
    
    // Test basic connectivity
    console.log(chalk.cyan('📡 Testing Docker API connectivity...'));
    const info = await docker.info();
    console.log(chalk.green(`✅ Connected to Docker ${info.ServerVersion}`));
    console.log(chalk.gray(`   Containers: ${info.Containers} (${info.ContainersRunning} running)`));
    console.log(chalk.gray(`   Images: ${info.Images}`));
    
    // List all containers
    console.log(chalk.cyan('\n🔍 Searching for message queue containers...\n'));
    const containers = await docker.listContainers({ all: true });
    
    const mqContainers = [];
    
    for (const containerInfo of containers) {
      const name = containerInfo.Names[0] || 'unnamed';
      const image = containerInfo.Image;
      const labels = containerInfo.Labels || {};
      
      // Check if it's a message queue container
      if (image.includes('kafka') || image.includes('zookeeper') ||
          image.includes('redis') || image.includes('rabbitmq') ||
          name.includes('kafka') || name.includes('zookeeper')) {
        
        mqContainers.push({
          id: containerInfo.Id.substring(0, 12),
          name: name.replace('/', ''),
          image: image,
          state: containerInfo.State,
          status: containerInfo.Status,
          ports: containerInfo.Ports,
          labels: labels
        });
        
        console.log(chalk.green(`✅ Found ${name}`));
        console.log(chalk.gray(`   Image: ${image}`));
        console.log(chalk.gray(`   State: ${containerInfo.State}`));
        console.log(chalk.gray(`   Status: ${containerInfo.Status}`));
        
        // Show exposed ports
        if (containerInfo.Ports && containerInfo.Ports.length > 0) {
          console.log(chalk.gray('   Ports:'));
          containerInfo.Ports.forEach(port => {
            if (port.PublicPort) {
              console.log(chalk.gray(`     - ${port.PrivatePort} → ${port.PublicPort}`));
            } else {
              console.log(chalk.gray(`     - ${port.PrivatePort} (not exposed)`));
            }
          });
        }
      }
    }
    
    if (mqContainers.length === 0) {
      console.log(chalk.yellow('\n⚠️  No message queue containers found'));
      console.log(chalk.gray('   Try running: docker run -d -p 9092:9092 --name kafka confluentinc/cp-kafka'));
    } else {
      console.log(chalk.bold.green(`\n✅ Found ${mqContainers.length} message queue containers!\n`));
      
      // Get detailed stats for running containers
      for (const mq of mqContainers) {
        if (mq.state === 'running') {
          console.log(chalk.cyan(`📊 Getting stats for ${mq.name}...`));
          
          const container = docker.getContainer(mq.id);
          
          // Get container stats (one-time, not stream)
          const stats = await container.stats({ stream: false });
          
          // Calculate CPU percentage
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
          
          // Calculate memory usage
          const memUsage = stats.memory_stats.usage || 0;
          const memLimit = stats.memory_stats.limit || 1;
          const memPercent = (memUsage / memLimit) * 100;
          
          console.log(chalk.gray(`   CPU: ${cpuPercent.toFixed(2)}%`));
          console.log(chalk.gray(`   Memory: ${(memUsage / 1024 / 1024).toFixed(2)} MB (${memPercent.toFixed(2)}%)`));
          console.log(chalk.gray(`   Network RX: ${(stats.networks?.eth0?.rx_bytes || 0) / 1024} KB`));
          console.log(chalk.gray(`   Network TX: ${(stats.networks?.eth0?.tx_bytes || 0) / 1024} KB\n`));
        }
      }
    }
    
    return mqContainers;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Connection failed:'), error.message);
    
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.gray('   1. Is Docker running? Check: docker ps'));
      console.log(chalk.gray('   2. Do you have permissions? Try: sudo docker ps'));
      console.log(chalk.gray('   3. On Mac/Windows: Is Docker Desktop running?'));
      console.log(chalk.gray('   4. On Linux: Add user to docker group: sudo usermod -aG docker $USER'));
    }
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  testDockerConnection()
    .then(containers => {
      console.log(chalk.bold.blue('\n✨ Docker connection test complete!\n'));
      process.exit(0);
    })
    .catch(err => {
      console.error(chalk.red('\n💥 Test failed\n'));
      process.exit(1);
    });
}

module.exports = { testDockerConnection };