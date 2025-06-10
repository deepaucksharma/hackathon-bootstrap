# Message Queue Dashboard Templates

This directory contains standardized dashboard templates for creating consistent Message Queue monitoring dashboards aligned with New Relic UI/UX patterns.

## Standard Message Queue Dashboard

The `standard-message-queue-dashboard.js` template creates a comprehensive 4-page dashboard with:

### Pages Included
1. **Executive Overview** - Business KPIs and platform health
2. **Consumer Groups** - Detailed lag analysis and monitoring
3. **Infrastructure & Cost** - Resource utilization and cost analytics
4. **Topics & Partitions** - Topic performance and data flow

### Usage

#### As a CLI Tool
```bash
# Set environment variables
export NEW_RELIC_ACCOUNT_ID=your_account_id
export NEW_RELIC_USER_API_KEY=your_api_key

# Create dashboard with default name
node standard-message-queue-dashboard.js

# Create dashboard with custom name
node standard-message-queue-dashboard.js "My Kafka Dashboard" "Custom description"
```

#### As a Module
```javascript
const MessageQueueDashboardBuilder = require('./standard-message-queue-dashboard');

const builder = new MessageQueueDashboardBuilder({
  accountId: '123456',
  userApiKey: 'NRAK-XXXXXXXXX',
  dashboardName: 'Production Kafka Monitoring',
  dashboardDescription: 'Enterprise Kafka cluster monitoring'
});

const result = await builder.createDashboard();
if (result.success) {
  console.log('Dashboard URL:', result.dashboard.url);
}
```

#### Customizing the Dashboard
```javascript
// Create a custom builder extending the standard template
class CustomDashboardBuilder extends MessageQueueDashboardBuilder {
  // Override specific pages
  buildExecutiveOverviewPage() {
    const page = super.buildExecutiveOverviewPage();
    // Add custom widgets
    page.widgets.push({
      title: "Custom Metric",
      layout: { column: 1, row: 10, width: 4, height: 3 },
      visualization: { id: "viz.billboard" },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: this.config.accountId,
          query: "FROM MessageQueue SELECT count(*) WHERE custom = true"
        }]
      }
    });
    return page;
  }
}
```

### Dashboard Features

#### Executive Overview
- Platform health score with thresholds
- Real-time message throughput
- Active consumer groups count
- Total consumer lag with alerts
- Infrastructure cost estimation
- Trend analysis charts
- Status summary tables

#### Consumer Groups
- State distribution (pie chart)
- Lag distribution histogram
- Consumer lag heatmap
- Lag trend analysis
- Detailed performance table

#### Infrastructure & Cost
- Cost breakdown by resource type
- Efficiency metrics (messages per dollar)
- Resource utilization gauges
- Broker health matrix
- Capacity planning insights
- Cost optimization opportunities

#### Topics & Partitions
- Topic throughput ranking
- Topic size distribution
- Partition health monitoring
- Message flow visualization
- Topic configuration details

### Best Practices

1. **Consistent Naming**: Use descriptive names for dashboards
2. **Time Ranges**: Keep default time ranges consistent (30m, 2h, 24h)
3. **Thresholds**: Set meaningful alert thresholds based on SLAs
4. **Colors**: Use standard New Relic color scheme
5. **Layout**: Follow 12-column grid system

### Widget Types Used
- **Billboard**: Key metrics with thresholds
- **Line Chart**: Time-series trends
- **Area Chart**: Stacked metrics
- **Heatmap**: Multi-dimensional analysis
- **Table**: Detailed entity listings
- **Pie Chart**: Distribution analysis
- **Bar Chart**: Comparative metrics
- **Histogram**: Distribution patterns

### Customization Points

The template is designed to be easily customizable:

1. **Metrics**: Update NRQL queries for your specific needs
2. **Thresholds**: Adjust alert thresholds based on your SLAs
3. **Cost Calculations**: Modify cost formulas for your pricing
4. **Time Ranges**: Change default time windows
5. **Widget Layout**: Adjust grid positions and sizes

### Integration with Platform

This template works seamlessly with the Message Queue Platform:
- Queries MESSAGE_QUEUE_* entities created by the platform
- Uses standard metric names from the transformer
- Follows v3.0 data model specification
- Compatible with all platform modes (simulation, infrastructure, hybrid)

### Troubleshooting

**No data appearing?**
- Ensure MESSAGE_QUEUE entities are being created
- Check that the platform is running and streaming data
- Verify account ID and API key are correct

**Widgets showing errors?**
- Check NRQL syntax in queries
- Ensure entity types match your data
- Verify metric names are correct

**Layout issues?**
- Follow 12-column grid system
- Ensure no overlapping widgets
- Check widget dimensions add up correctly