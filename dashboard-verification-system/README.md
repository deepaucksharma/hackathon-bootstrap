# Dashboard Verification System

A comprehensive verification platform for New Relic Message Queues dashboard implementation that ensures proper data visualization and user experience functionality.

## 🎯 Mission

Verify that MESSAGE_QUEUE_* entity data is properly flowing to custom dashboards and that all dashboard widgets, visualizations, and interactions work as expected per the [Dashboard Implementation Guide](../docs/DASHBOARD_IMPLEMENTATION_GUIDE.md).

## 🔄 Verification Approach

**From**: AWS MSK/Confluent entity verification in Messages & Queues UI  
**To**: MESSAGE_QUEUE_* entity verification in custom dashboards

### New Focus Areas
- **Dashboard Widget Functionality**: Billboard, chart, table, and custom widgets
- **Data Visualization**: Proper rendering of MESSAGE_QUEUE_* entity data
- **Interactive Features**: Variables, filters, drill-downs, and navigation
- **Performance Validation**: Load times, refresh rates, and responsiveness
- **Mobile Compatibility**: Responsive design and touch interactions

## 🏗️ Verification Architecture

```yaml
Dashboard_Verification_Components:
  Entity_Data_Validation:
    - MESSAGE_QUEUE_CLUSTER entity presence
    - MESSAGE_QUEUE_BROKER entity relationships
    - MESSAGE_QUEUE_TOPIC metric availability
    - MESSAGE_QUEUE_QUEUE data integrity
    
  Widget_Functionality:
    - Billboard metric accuracy
    - Chart data rendering
    - Table sorting and filtering
    - Custom visualization elements
    
  Dashboard_Interaction:
    - Variable synchronization
    - Filter application
    - Navigation flows
    - Drill-down functionality
    
  Performance_Metrics:
    - Widget load times
    - Data refresh rates
    - Query execution performance
    - User experience responsiveness
```

## 🚀 Quick Start

### 1. Verify Dashboard Data
```bash
# Verify MESSAGE_QUEUE_* entities are available
node verify.js --dashboard-type=overview --entity-types=all

# Verify specific dashboard widgets
node verify.js --dashboard-id=YOUR_DASHBOARD_ID --widget-validation=true

# Run comprehensive dashboard suite
node verify.js --suite=DASHBOARD_COMPREHENSIVE --account-id=YOUR_ACCOUNT
```

### 2. Validate Widget Functionality
```bash
# Test billboard widget data accuracy
node lib/validators.js --widget-type=billboard --entity-type=cluster

# Validate chart widget performance
node lib/validators.js --widget-type=chart --time-range=24h

# Test table widget interactions
node lib/validators.js --widget-type=table --interaction-tests=true
```

### 3. Performance Testing
```bash
# Test dashboard load performance
node performance-test-runner.js --dashboard-config=./config/dashboards.json

# Validate mobile responsiveness
node mobile-compatibility-test.js --viewport=mobile

# Test concurrent user simulation
node load-test-simulator.js --concurrent-users=50
```

## 📊 Verification Categories

### 1. Entity Data Verification
- **MESSAGE_QUEUE_CLUSTER**: Health scores, throughput totals, availability
- **MESSAGE_QUEUE_BROKER**: CPU, memory, network, request latency
- **MESSAGE_QUEUE_TOPIC**: Throughput in/out, consumer lag, error rates
- **MESSAGE_QUEUE_QUEUE**: Depth, processing time, message flow

### 2. Dashboard Widget Verification
- **Billboard Widgets**: KPI display, threshold indicators, comparison values
- **Chart Widgets**: Time series accuracy, real-time updates, axis scaling
- **Table Widgets**: Data sorting, filtering, pagination, row actions
- **Custom Widgets**: Interactive elements, status displays, progress indicators

### 3. User Experience Verification
- **Navigation**: Breadcrumbs, drill-downs, back buttons, contextual links
- **Filtering**: Variable synchronization, filter persistence, smart defaults
- **Performance**: Load times under 2s, smooth scrolling, responsive interactions
- **Mobile**: Touch targets, responsive layout, portrait/landscape compatibility

### 4. Data Integrity Verification
- **Metric Accuracy**: Validate calculated values match source data
- **Relationship Integrity**: Entity relationships display correctly
- **Time Synchronization**: All widgets show consistent time ranges
- **Real-time Updates**: Live data refresh without page reload

## 🔧 Configuration

### Dashboard Configuration
```json
{
  "dashboards": [
    {
      "id": "message-queues-overview",
      "name": "Message Queues Overview",
      "type": "overview",
      "widgets": [
        {
          "type": "billboard",
          "entity": "MESSAGE_QUEUE_CLUSTER",
          "metric": "health.score",
          "thresholds": {"warning": 80, "critical": 60}
        },
        {
          "type": "chart",
          "entity": "MESSAGE_QUEUE_TOPIC",
          "metric": "throughput.in",
          "timeRange": "1h"
        }
      ]
    }
  ]
}
```

### Environment Variables
```bash
# New Relic Configuration
export NEWRELIC_API_KEY="your-api-key"
export NEWRELIC_ACCOUNT_ID="your-account-id"

# Dashboard Verification Settings
export DASHBOARD_VERIFICATION_MODE="comprehensive"  # basic, detailed, comprehensive
export PERFORMANCE_THRESHOLD_MS="2000"             # Dashboard load time threshold
export MOBILE_VIEWPORT_TESTING="true"              # Enable mobile testing
```

## 📋 Verification Test Suites

### DASHBOARD_CRITICAL
Essential dashboard functionality that must pass:
- Entity data availability for all MESSAGE_QUEUE_* types
- Core widget rendering (billboard, chart, table)
- Basic navigation and filtering
- Dashboard load time under threshold

### DASHBOARD_COMPREHENSIVE
Complete dashboard feature validation:
- All widget types and configurations
- Advanced interactions and drill-downs
- Performance across multiple data volumes
- Mobile and responsive design
- Cross-browser compatibility

### DASHBOARD_PERFORMANCE
Performance and scalability testing:
- Load testing with high data volumes
- Concurrent user simulation
- Memory usage optimization
- Network request optimization
- Cache effectiveness

### DASHBOARD_REGRESSION
Regression testing for dashboard changes:
- Widget configuration consistency
- Data visualization accuracy
- Interaction behavior preservation
- Performance regression detection

## 🧪 Testing Scenarios

### Production Load Simulation
```javascript
{
  "scenario": "production-load",
  "entities": {
    "MESSAGE_QUEUE_CLUSTER": 10,
    "MESSAGE_QUEUE_BROKER": 50,
    "MESSAGE_QUEUE_TOPIC": 500,
    "MESSAGE_QUEUE_QUEUE": 250
  },
  "concurrent_users": 25,
  "test_duration": "10m"
}
```

### Edge Case Testing
```javascript
{
  "scenario": "edge-cases",
  "conditions": {
    "zero_data": "Test widgets with no data",
    "high_cardinality": "Test with 10k+ entities",
    "rapid_changes": "Test with 1s refresh rate",
    "error_states": "Test with simulated errors"
  }
}
```

## 📈 Verification Metrics

### Success Criteria
```yaml
Dashboard_Health_Score:
  entity_data_availability: 100%
  widget_rendering_success: 99%
  interaction_functionality: 95%
  performance_compliance: 90%
  mobile_compatibility: 85%

Performance_Benchmarks:
  dashboard_load_time: < 2s
  widget_refresh_time: < 500ms
  filter_response_time: < 300ms
  navigation_speed: < 1s
```

### Failure Thresholds
- **Critical**: Entity data missing, widgets not rendering
- **Warning**: Performance degradation, minor visual issues
- **Info**: Enhancement opportunities, optimization suggestions

## 🎨 Dashboard-Specific Validation

### Widget Type Validations

#### Billboard Widget Verification
```javascript
{
  "widget_type": "billboard",
  "validations": [
    "metric_value_accuracy",
    "threshold_color_coding",
    "comparison_value_display",
    "trend_indicator_accuracy"
  ]
}
```

#### Chart Widget Verification
```javascript
{
  "widget_type": "chart",
  "validations": [
    "time_series_accuracy",
    "axis_scaling_correctness",
    "legend_completeness",
    "interactive_tooltip_data"
  ]
}
```

#### Table Widget Verification
```javascript
{
  "widget_type": "table",
  "validations": [
    "column_sorting_functionality",
    "row_filtering_accuracy",
    "pagination_correctness",
    "cell_value_precision"
  ]
}
```

## 🔍 Troubleshooting Dashboard Issues

### Common Dashboard Problems
1. **Widget Not Loading**: Check entity data availability
2. **Incorrect Metric Values**: Validate NRQL query accuracy
3. **Poor Performance**: Optimize query efficiency
4. **Mobile Issues**: Test responsive breakpoints

### Debug Mode
```bash
# Enable detailed debug logging
node verify.js --debug=true --log-level=verbose

# Test specific widget in isolation
node widget-debug.js --widget-id=YOUR_WIDGET_ID --debug-mode=true

# Validate NRQL queries directly
node query-validator.js --query="FROM MESSAGE_QUEUE_CLUSTER_SAMPLE SELECT..."
```

## 📊 Reporting

### Verification Report Structure
```json
{
  "verification_summary": {
    "dashboard_id": "message-queues-overview",
    "verification_time": "2025-06-07T14:30:00Z",
    "overall_health": "HEALTHY",
    "scores": {
      "entity_data": 100,
      "widget_functionality": 98,
      "performance": 95,
      "mobile_compatibility": 90
    }
  },
  "widget_results": [
    {
      "widget_id": "cluster-health-billboard",
      "widget_type": "billboard",
      "status": "PASS",
      "load_time_ms": 450,
      "data_accuracy": 100,
      "issues": []
    }
  ]
}
```

## 🛠️ Architecture

### Core Components
```
dashboard-verification-system/
├── lib/
│   ├── api-client.js           # New Relic API interactions
│   ├── dashboard-validator.js  # Dashboard-specific validation logic
│   ├── widget-validators.js    # Widget type-specific validations
│   ├── performance-tester.js   # Performance testing utilities
│   └── mobile-tester.js        # Mobile compatibility testing
├── verification/
│   └── test-runners/
│       ├── dashboard-test-runner.js     # Main dashboard test execution
│       ├── widget-functionality-test.js # Widget behavior testing
│       └── performance-test-runner.js   # Performance validation
└── config/
    ├── dashboard-configs.json   # Dashboard definitions
    ├── widget-templates.json    # Widget configuration templates
    └── test-scenarios.json      # Testing scenario definitions
```

## 🚀 Advanced Features

### AI-Powered Verification
- **Anomaly Detection**: Identify unusual dashboard behavior
- **Performance Prediction**: Forecast dashboard performance issues
- **User Experience Analysis**: Analyze interaction patterns
- **Optimization Recommendations**: Suggest dashboard improvements

### Continuous Monitoring
- **Real-time Dashboard Health**: Monitor live dashboard status
- **Performance Trending**: Track dashboard performance over time
- **Alert Integration**: Notify on dashboard failures
- **Automated Recovery**: Self-healing dashboard configurations

## 📚 Documentation

- [NRQL Query Documentation](./VERIFICATION_NRQL_QUERIES.md) - Dashboard query patterns
- [Widget Validation Guide](./lib/widget-validation-guide.md) - Widget-specific testing
- [Performance Testing Guide](./operations/PERFORMANCE_AND_MONITORING_GUIDE.md) - Performance optimization
- [Troubleshooting Guide](./troubleshooting/PRODUCTION_TROUBLESHOOTING_GUIDE.md) - Issue resolution

---

**Note**: This verification system is specifically designed for validating MESSAGE_QUEUE_* entity data in custom New Relic dashboards, ensuring optimal user experience and data accuracy for message queue monitoring.