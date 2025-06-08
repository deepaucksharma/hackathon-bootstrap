/**
 * Message Queues Dashboard Example
 * 
 * Demonstrates how to use the generic dashboard framework with MESSAGE_QUEUE_* content.
 * This example shows the separation between framework and content.
 */

const DashboardFramework = require('../framework/core/dashboard-framework');
const MessageQueuesContentProvider = require('../content/message-queues/message-queues-content-provider');

async function createMessageQueuesDashboards() {
  try {
    console.log('🚀 Creating MESSAGE_QUEUE_* dashboards using framework + content pattern');
    
    // 1. Initialize the generic framework
    const framework = new DashboardFramework({
      apiKey: process.env.NEW_RELIC_USER_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      layoutOptions: {
        responsive: true,
        gridColumns: 12
      }
    });
    
    // 2. Set the MESSAGE_QUEUE_* content provider
    const contentProvider = new MessageQueuesContentProvider({
      domain: 'message-queues',
      version: '1.0.0'
    });
    
    framework.setContentProvider(contentProvider);
    
    // 3. Create dashboards using different templates
    const dashboards = [];
    
    // Cluster Overview Dashboard
    console.log('📊 Creating cluster overview dashboard...');
    const clusterDashboard = await framework.buildAndDeploy('cluster-overview', {
      provider: 'kafka',
      environment: 'production',
      timeRange: 'SINCE 2 hours ago'
    }, {
      name: 'Kafka Cluster Overview - Production',
      description: 'Production Kafka cluster health and performance overview',
      permissions: 'PUBLIC_READ_WRITE'
    });
    
    dashboards.push(clusterDashboard);
    console.log(`✅ Created: ${clusterDashboard.name} (${clusterDashboard.guid})`);
    
    // Topic Analysis Dashboard
    console.log('📈 Creating topic analysis dashboard...');
    const topicDashboard = await framework.buildAndDeploy('topic-analysis', {
      provider: 'kafka',
      clusterName: 'production-cluster-1',
      timeRange: 'SINCE 1 hour ago'
    }, {
      name: 'Topic Performance Analysis',
      description: 'Detailed topic throughput and consumer lag analysis',
      permissions: 'PUBLIC_READ_WRITE'
    });
    
    dashboards.push(topicDashboard);
    console.log(`✅ Created: ${topicDashboard.name} (${topicDashboard.guid})`);
    
    // Broker Health Dashboard
    console.log('🖥️ Creating broker health dashboard...');
    const brokerDashboard = await framework.buildAndDeploy('broker-health', {
      clusterName: 'production-cluster-1',
      timeRange: 'SINCE 4 hours ago'
    }, {
      name: 'Broker Health Monitoring',
      description: 'Broker resource utilization and performance monitoring',
      permissions: 'PUBLIC_READ_WRITE'
    });
    
    dashboards.push(brokerDashboard);
    console.log(`✅ Created: ${brokerDashboard.name} (${brokerDashboard.guid})`);
    
    // Queue Monitoring Dashboard (for RabbitMQ/SQS)
    console.log('📬 Creating queue monitoring dashboard...');
    const queueDashboard = await framework.buildAndDeploy('queue-monitoring', {
      provider: 'rabbitmq',
      region: 'us-east-1',
      timeRange: 'SINCE 1 hour ago'
    }, {
      name: 'RabbitMQ Queue Monitoring',
      description: 'Queue depth, processing time, and throughput monitoring',
      permissions: 'PUBLIC_READ_WRITE'
    });
    
    dashboards.push(queueDashboard);
    console.log(`✅ Created: ${queueDashboard.name} (${queueDashboard.guid})`);
    
    // 4. Summary
    console.log('\n📋 Dashboard Creation Summary:');
    console.log(`Total dashboards created: ${dashboards.length}`);
    dashboards.forEach((dashboard, index) => {
      console.log(`  ${index + 1}. ${dashboard.name}`);
      console.log(`     GUID: ${dashboard.guid}`);
      console.log(`     URL: ${dashboard.permalink}`);
    });
    
    // 5. Demonstrate framework capabilities
    console.log('\n🔍 Framework Capabilities Demonstration:');
    
    // List available templates
    const availableTemplates = framework.getAvailableTemplates();
    console.log(`Available templates: ${Object.keys(availableTemplates).join(', ')}`);
    
    // Get template details
    const templateDetails = framework.getTemplateDetails('cluster-overview');
    console.log(`Cluster template sections: ${templateDetails.sections.map(s => s.title).join(', ')}`);
    
    // Preview dashboard (without deploying)
    console.log('🔮 Generating preview for infrastructure dashboard...');
    const preview = await framework.previewDashboard('broker-health', {
      clusterName: 'preview-cluster',
      timeRange: 'SINCE 1 hour ago'
    });
    
    console.log(`Preview generated with ${preview.dashboard.pages.length} pages and ${preview.dashboard.pages.reduce((total, page) => total + page.widgets.length, 0)} widgets`);
    
    return {
      dashboards,
      summary: {
        totalDashboards: dashboards.length,
        framework: 'DashboardFramework',
        contentProvider: 'MessageQueuesContentProvider',
        templatesUsed: ['cluster-overview', 'topic-analysis', 'broker-health', 'queue-monitoring']
      }
    };
    
  } catch (error) {
    console.error('❌ Dashboard creation failed:', error.message);
    throw error;
  }
}

/**
 * Demonstrate framework extensibility
 */
async function demonstrateFrameworkExtensibility() {
  console.log('\n🔧 Demonstrating Framework Extensibility:');
  
  // Initialize framework
  const framework = new DashboardFramework({
    apiKey: process.env.NEW_RELIC_USER_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });
  
  // Create custom content provider
  class CustomInfrastructureContentProvider {
    getTemplates() {
      return {
        'system-overview': {
          name: 'System Overview',
          description: 'System performance overview',
          entityType: 'HOST',
          sections: [
            {
              title: 'CPU & Memory',
              widgets: [
                {
                  type: 'line',
                  title: 'CPU Usage',
                  query: {
                    from: 'SystemSample',
                    select: 'average(cpuPercent)',
                    timeseries: true,
                    since: '{{timeRange}}'
                  },
                  position: { column: 1, row: 1, width: 6, height: 4 }
                }
              ]
            }
          ]
        }
      };
    }
    
    getTemplate(name) {
      return this.getTemplates()[name];
    }
    
    getVisualizationConfig(type) {
      return { legend: { enabled: true } };
    }
    
    getEntityVariables(entityType) {
      return [{ name: 'hostname', type: 'STRING', title: 'Hostname' }];
    }
    
    getMetadata() {
      return {
        domain: 'infrastructure',
        name: 'Custom Infrastructure Provider',
        version: '1.0.0'
      };
    }
  }
  
  // Use custom content provider with same framework
  framework.setContentProvider(new CustomInfrastructureContentProvider());
  
  // Preview with custom content
  const customPreview = await framework.previewDashboard('system-overview', {
    timeRange: 'SINCE 1 hour ago'
  });
  
  console.log('✅ Custom content provider works with same framework!');
  console.log(`   Generated ${customPreview.dashboard.pages.length} pages for infrastructure monitoring`);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Create MESSAGE_QUEUE_* dashboards
    const result = await createMessageQueuesDashboards();
    
    // Demonstrate extensibility
    await demonstrateFrameworkExtensibility();
    
    console.log('\n🎉 Framework + Content Pattern Example Completed Successfully!');
    console.log('\n📈 Benefits Demonstrated:');
    console.log('   ✅ Generic framework works with domain-specific content');
    console.log('   ✅ Same framework can be used for different domains');
    console.log('   ✅ Content providers are pluggable and reusable');
    console.log('   ✅ Templates are declarative and data-driven');
    console.log('   ✅ Framework handles layout, optimization, and deployment');
    
    return result;
    
  } catch (error) {
    console.error('❌ Example execution failed:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  createMessageQueuesDashboards,
  demonstrateFrameworkExtensibility,
  main
};