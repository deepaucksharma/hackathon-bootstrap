#!/usr/bin/env node

/**
 * Kubernetes Connection Proof of Concept
 * 
 * This script tests basic connectivity to Kubernetes and discovers message queue workloads.
 * No abstractions - just direct API calls to prove it works.
 */

const k8s = require('@kubernetes/client-node');
const chalk = require('chalk');

async function testK8sConnection() {
  console.log(chalk.bold.blue('\n🔍 Testing Kubernetes Connection\n'));
  
  try {
    // Load kubeconfig
    const kc = new k8s.KubeConfig();
    
    // Try multiple config sources
    try {
      kc.loadFromDefault(); // ~/.kube/config or in-cluster
      console.log(chalk.green('✅ Loaded kubeconfig successfully'));
    } catch (e) {
      console.log(chalk.yellow('⚠️  Could not load default kubeconfig, trying in-cluster...'));
      try {
        kc.loadFromCluster();
        console.log(chalk.green('✅ Loaded in-cluster config'));
      } catch (e2) {
        throw new Error('No Kubernetes configuration found');
      }
    }
    
    // Create API clients
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    
    // Test basic connectivity
    console.log(chalk.cyan('\n📡 Testing API connectivity...'));
    const namespaces = await coreApi.listNamespace();
    console.log(chalk.green(`✅ Connected! Found ${namespaces.body.items.length} namespaces`));
    
    // Look for message queue workloads
    console.log(chalk.cyan('\n🔍 Searching for message queue workloads...\n'));
    
    const mqLabels = [
      'app=kafka',
      'app=rabbitmq',
      'app=redis',
      'app.kubernetes.io/name=kafka',
      'app.kubernetes.io/name=rabbitmq',
      'app.kubernetes.io/name=redis'
    ];
    
    const foundWorkloads = [];
    
    // Search all namespaces
    for (const ns of namespaces.body.items) {
      const namespace = ns.metadata.name;
      
      // Skip system namespaces
      if (namespace.startsWith('kube-') || namespace === 'default') continue;
      
      // Look for StatefulSets
      try {
        const statefulSets = await appsApi.listNamespacedStatefulSet(namespace);
        for (const sts of statefulSets.body.items) {
          const labels = sts.metadata.labels || {};
          const name = sts.metadata.name;
          
          // Check if it's a message queue
          if (name.includes('kafka') || name.includes('rabbitmq') || name.includes('redis') ||
              labels.app?.includes('kafka') || labels.app?.includes('rabbitmq')) {
            
            foundWorkloads.push({
              type: 'StatefulSet',
              name: name,
              namespace: namespace,
              replicas: sts.status.replicas,
              labels: labels
            });
            
            console.log(chalk.green(`✅ Found ${name} in ${namespace}`));
            console.log(chalk.gray(`   Type: StatefulSet`));
            console.log(chalk.gray(`   Replicas: ${sts.status.replicas}`));
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
      
      // Look for Deployments
      try {
        const deployments = await appsApi.listNamespacedDeployment(namespace);
        for (const dep of deployments.body.items) {
          const labels = dep.metadata.labels || {};
          const name = dep.metadata.name;
          
          if (name.includes('kafka') || name.includes('rabbitmq') || name.includes('redis') ||
              labels.app?.includes('kafka') || labels.app?.includes('rabbitmq')) {
            
            foundWorkloads.push({
              type: 'Deployment',
              name: name,
              namespace: namespace,
              replicas: dep.status.replicas,
              labels: labels
            });
            
            console.log(chalk.green(`✅ Found ${name} in ${namespace}`));
            console.log(chalk.gray(`   Type: Deployment`));
            console.log(chalk.gray(`   Replicas: ${dep.status.replicas}`));
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    }
    
    if (foundWorkloads.length === 0) {
      console.log(chalk.yellow('\n⚠️  No message queue workloads found'));
      console.log(chalk.gray('   Try deploying Kafka or RabbitMQ to test'));
      
      // Show example deployment
      console.log(chalk.cyan('\n📝 Example: Deploy test Kafka using Helm:\n'));
      console.log(chalk.gray('   helm repo add bitnami https://charts.bitnami.com/bitnami'));
      console.log(chalk.gray('   helm install my-kafka bitnami/kafka --namespace kafka --create-namespace'));
    } else {
      console.log(chalk.bold.green(`\n✅ Found ${foundWorkloads.length} message queue workloads!\n`));
      
      // Try to get pods for first workload
      const firstWorkload = foundWorkloads[0];
      console.log(chalk.cyan(`📊 Getting pods for ${firstWorkload.name}...\n`));
      
      const pods = await coreApi.listNamespacedPod(
        firstWorkload.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${firstWorkload.name}`
      );
      
      for (const pod of pods.body.items) {
        console.log(chalk.green(`✅ Pod: ${pod.metadata.name}`));
        console.log(chalk.gray(`   Status: ${pod.status.phase}`));
        console.log(chalk.gray(`   IP: ${pod.status.podIP}`));
        
        // Show container ports
        for (const container of pod.spec.containers) {
          if (container.ports) {
            console.log(chalk.gray(`   Container ${container.name} ports:`));
            for (const port of container.ports) {
              console.log(chalk.gray(`     - ${port.name || 'unnamed'}: ${port.containerPort}`));
            }
          }
        }
      }
    }
    
    return foundWorkloads;
    
  } catch (error) {
    console.error(chalk.red('\n❌ Connection failed:'), error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.gray('   1. Check if kubectl works: kubectl get nodes'));
      console.log(chalk.gray('   2. Check kubeconfig: export KUBECONFIG=~/.kube/config'));
      console.log(chalk.gray('   3. If using minikube: minikube start'));
      console.log(chalk.gray('   4. If using Docker Desktop: Enable Kubernetes in settings'));
    }
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  testK8sConnection()
    .then(workloads => {
      console.log(chalk.bold.blue('\n✨ Kubernetes connection test complete!\n'));
      process.exit(0);
    })
    .catch(err => {
      console.error(chalk.red('\n💥 Test failed\n'));
      process.exit(1);
    });
}

module.exports = { testK8sConnection };