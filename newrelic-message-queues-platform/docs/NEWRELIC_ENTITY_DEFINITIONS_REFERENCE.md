# Complete Entity Definitions from New Relic entity-definitions Repository

## Repository overview and structure

The New Relic entity-definitions repository at https://github.com/newrelic/entity-definitions contains a comprehensive framework for defining how telemetry data is synthesized into entities within the New Relic platform. The repository is organized into several key directories, with entity definitions stored in the `entity-types/` directory, each containing up to four standard files: `definition.yml`, `golden_metrics.yml`, `summary_metrics.yml`, and `dashboard.json`.

## Complete list of entity types by domain

### APM Domain
**APM-APPLICATION**
- **Definition**: Application Performance Monitoring entities for tracking application behavior
- **Golden Metrics**:
```yaml
responseTimeMs:
  title: Response time
  unit: MS
  query:
    select: average(apm.service.transaction.duration) * 1000 AS 'Response time (ms)'
    eventName: appName
throughput:
  title: Throughput
  unit: REQUESTS_PER_MINUTE
  query:
    select: rate(count(apm.service.transaction.duration), 1 minute) AS 'Throughput'
    eventName: appName
errorRate:
  title: Error rate
  unit: PERCENTAGE
  query:
    select: (count(apm.service.error.count) / count(apm.service.transaction.duration)) * 100 AS 'Error %'
    eventName: appName
```

### INFRA Domain

**INFRA-HOST**
- **Entity Type**: Infrastructure hosts including physical servers, VMs, and cloud instances
- **Definition Structure** (partial):
```yaml
domain: INFRA
type: HOST
goldenTags:
- account
- windowsPlatform
- linuxDistribution
- aws.awsRegion
- aws.region
- aws.availabilityZone
- aws.accountId
- azure.regionName
- azure.subscriptionId
- azure.resourceGroup
- gcp.zone
- gcp.projectId
- cloud.provider
- cloud.account.id
- cloud.region
- cloud.availability_zone
- cloud.platform
synthesis:
  rules:
    # opentelemetry host data from k8s-otel-collector preview 
    - identifier: k8s.node.name
      name: k8s.node.name
      legacyFeatures:
        overrideGuidType: true
      encodeIdentifierInGUID: true
      conditions:
        - attribute: k8s.node.name
          present: true
        - attribute: eventType
          value: Metric
        - attribute: metricName
          prefix: system.
        - attribute: newrelic.source
          value: 'api.metrics.otlp'
        - attribute: service.name
          present: false
        - attribute: container.id
          present: false

    # opentelemetry host data from opentelemetry-collector
    - identifier: host.id
      name: host.name
      legacyFeatures:
        overrideGuidType: true
      encodeIdentifierInGUID: true
      conditions:
        - attribute: eventType
          value: Metric
        - attribute: newrelic.source
          value: 'api.metrics.otlp'
        - attribute: service.name
          present: false
        - attribute: container.id
          present: false
      tags:
        cloud.provider:
        cloud.account.id:
        cloud.region:
        cloud.availability_zone:
        cloud.platform:
        host.id:
        host.name:
        host.type:
        host.arch:
        host.image.name:
        host.image.id:
        host.image.version:
        instrumentation.provider:
        k8s.cluster.name:

    # AWS EC2 or On a host
    - identifier: instance
      name: instance
      legacyFeatures:
        overrideGuidType: true
      encodeIdentifierInGUID: true
      conditions:
      - attribute: metricName
        prefix: "node_"
      - attribute: instrumentation.provider
        value: "prometheus"
      tags:
        instance:
        instanceid:
          entityTagNames: [host.id, instanceid]
        nodename:
          entityTagNames: [hostname]
```
- **Golden Metrics**: Memory usage percentage, CPU usage percentage, disk usage percentage
- **Configuration**: Entities expire after 8 days, alertable

**INFRA-CONTAINER**
- **Entity Type**: Docker containers and Kubernetes containers
- **Definition Structure** (partial):
```yaml
domain: INFRA
type: CONTAINER
synthesis:
  rules:
    - identifier: entity.id
      name: docker.name
      encodeIdentifierInGUID: false
      conditions:
        - attribute: docker.containerId
      tags:
        container.state:
        docker.state:
          entityTagNames: [container.state, docker.state]
        docker.containerId:
          multiValue: false
        docker.shortContainerId:
        docker.imageName:
        docker.ecsClusterArn:
        docker.ecsClusterName:
        docker.ecsContainerName:
        docker.ecsLaunchType:
        docker.ecsTaskArn:
        docker.ecsTaskDefinitionFamily:
        docker.ecsTaskDefinitionVersion:
      legacyFeatures:
        overrideGuidType: true

    - identifier: entity.id
      name: k8s.containerName
      encodeIdentifierInGUID: false
      conditions:
        - attribute: k8s.containerName
      tags:
        k8s.status:
          entityTagNames: [container.state, k8s.status]
        k8s.clusterName:
        k8s.namespaceName:
        k8s.podName:
        k8s.containerImage:
          multiValue: false
        k8s.nodeName:
        k8s.containerId:
          multiValue: false

goldenTags:
  - environment
  - container.state

configuration:
  entityExpirationTime: FOUR_HOURS
  alertable: true
```
- **Configuration**: Entities expire after 4 hours, alertable

**INFRA-REDISINSTANCE**
- **Entity Type**: Redis database instances
- **Purpose**: Infrastructure monitoring for Redis databases

**INFRA-AWSECSCONTAINERINSTANCE**
- **Entity Type**: AWS ECS container instances
- **Purpose**: AWS-specific container instance monitoring

### BROWSER Domain

**BROWSER-APPLICATION**
- **Entity Type**: Browser application monitoring
- **Purpose**: Real User Monitoring (RUM) for web applications
- **Note**: Full definition files were not accessible in the current repository structure

### MOBILE Domain

**MOBILE-APPLICATION**
- **Entity Type**: Mobile application monitoring
- **Purpose**: Performance monitoring for iOS and Android applications
- **Features**: Crash reporting, performance metrics, user interactions

### SYNTH Domain

**SYNTH-MONITOR**
- **Entity Type**: Synthetic monitoring entities
- **Purpose**: Proactive monitoring through scripted tests
- **Features**: Availability monitoring, performance benchmarking, multi-location testing

### EXT Domain (External/Custom Entities)

**EXT-SERVICE**
- **Entity Type**: Generic external services
- **Definition Structure** (partial):
```yaml
domain: EXT
type: SERVICE
goldenTags:
  - instrumentation.provider
  - k8s.clusterName
  - k8s.namespaceName
synthesis:
  rules:
    # telemetry with service_name attribute
    - identifier: service_name
      name: service_name
      encodeIdentifierInGUID: true
      conditions:
        - attribute: service_name
        - attribute: newrelic.entity.type
          present: false
        - attribute: collector.name
          present: false
      tags:
        telemetry.sdk.name:
          entityTagName: instrumentation.provider
    # telemetry from opentelemetry provider
    - identifier: service.name
      name: service.name
      encodeIdentifierInGUID: true
      conditions:
        - attribute: instrumentation.provider
          value: opentelemetry
        - attribute: newrelic.entity.type
          present: false
      tags:
        k8s.cluster.name:
          ttl: P1D
        k8s.deployment.name:
          ttl: P1D
        k8s.namespace.name:
          ttl: P1D
        telemetry.sdk.language:
          entityTagName: language
        service.namespace:
        faas.name:
        faas.id:
```
- **Supports**: OpenTelemetry, Kamon, Micrometer, JFR-Uploader, Pixie, NR eBPF providers

**EXT-PIHOLE**
- **Entity Type**: Pi-hole DNS filtering service
- **Purpose**: Monitoring Pi-hole DNS servers
- **Synthesis**: Uses hostname as identifier, Prometheus-based telemetry

**EXT-PIXIE_POSTGRES**
- **Entity Type**: PostgreSQL via Pixie
- **Purpose**: Database monitoring through Pixie platform
- **Features**: Kubernetes-aware with cluster and namespace tags

**EXT-PIXIE-DNS**
- **Entity Type**: DNS monitoring via Pixie
- **Purpose**: DNS service observability

**EXT-PIXIE-REDIS**
- **Entity Type**: Redis monitoring via Pixie
- **Purpose**: Redis database observability through Pixie

**EXT-SOLARWINDS_SERVER**
- **Entity Type**: SolarWinds server monitoring
- **Purpose**: Integration with SolarWinds monitoring platform

**EXT-SNOWFLAKEACC**
- **Entity Type**: Snowflake account entities
- **Purpose**: Snowflake data warehouse account monitoring

**EXT-SNOWFLAKE_WAREHOUSE**
- **Entity Type**: Snowflake warehouse entities
- **Purpose**: Snowflake compute warehouse monitoring

### VIZ Domain

**VIZ-DASHBOARD**
- **Entity Type**: Dashboard entities
- **Purpose**: Visualization and dashboard management
- **Features**: Dashboard as an entity for management and monitoring

### AWS-Specific Entities

**AWS-CLOUDFRONT**
- **Entity Type**: AWS CloudFront distributions
- **Purpose**: CDN monitoring
- **Relationships**: Connects to S3 buckets

**AWS-S3**
- **Entity Type**: AWS S3 buckets
- **Purpose**: Object storage monitoring
- **Relationships**: Connected from CloudFront, MSK clusters

**AWS-MSK-CLUSTER**
- **Entity Type**: AWS Managed Streaming for Kafka clusters
- **Purpose**: Kafka cluster monitoring on AWS
- **Event Types**: `AwsMskClusterSample`, `AwsMskBrokerSample`, `AwsMskTopicSample`
- **Relationships**: Connects to S3 for data persistence

### Recently Added Entity Types (2024-2025)

**OCSF Entities**
- **Purpose**: Open Cybersecurity Schema Framework support
- **Added**: feat: OCSF entity (#1756)

**Confluent Cloud Cluster**
- **Purpose**: Confluent Cloud Kafka monitoring
- **Features**: Golden metrics for Confluent Cloud
- **Entity Type**: EXT-CONFLUENT-CLOUD-CLUSTER

**Scheduled Report Entities**
- **Purpose**: Report scheduling and management
- **Features**: Updated entity definitions for scheduled reports

**NGEP Entities**
- **Purpose**: Next Generation Entity Platform representations
- **Features**: Types to represent NGEP entities in Entity Platform

## Entity Definition File Structure

Each entity type contains up to four standard files:

### definition.yml
Core entity definition including:
- Domain and type specification
- Synthesis rules for creating entities from telemetry
- Golden tags for key attributes
- Configuration options (alertable, expiration time)

### golden_metrics.yml
Key performance metrics:
- Metric definitions with NRQL queries
- Support for multiple data sources
- Units and display titles
- Query specifications for metric calculation

### summary_metrics.yml
Metrics for entity explorer list view:
- References to golden metrics
- Limited to 3 recommended metrics
- Optimized for quick overview

### dashboard.json
Entity summary dashboard:
- JSON format exported from New Relic dashboards
- Templates for different data sources
- Default visualizations for entity type

## Relationship Definitions

The repository includes comprehensive relationship synthesis rules in the `relationships/synthesis/` directory:

### Relationship Structure
```yaml
relationships:
  - name: [uniqueRuleName]
    version: "1"
    origins: [list of telemetry sources]
    conditions: [matching conditions]
    relationship:
      expires: P75M
      relationshipType: CALLS
      source: [source entity configuration]
      target: [target entity configuration]
```

### Common Relationship Types
- **CALLS**: Service-to-service communication
- **HOSTS**: Infrastructure hosting relationships
- **SERVES**: Service provision relationships
- **CONTAINS**: Container relationships
- **CONNECTS_TO**: Network connections

### AWS Relationship Examples
- **AWS_CLOUDFRONT-to-AWS_S3**: CloudFront distribution to S3 bucket
- **AWS_MSK_CLUSTER-to-AWS_S3**: MSK cluster to S3 storage
- **AWS_AUTOSCALING_GROUP-to-AWS_EC2_INSTANCE**: Auto scaling relationships
- **AWS_KINESIS_FIREHOSE-to-[TARGET]**: Kinesis data delivery

## Synthesis Rules Pattern

All entities follow a consistent synthesis pattern:
```yaml
synthesis:
  rules:
    - identifier: [unique_identifier_attribute]
      name: [display_name_attribute]
      encodeIdentifierInGUID: [true/false]
      conditions:
        - attribute: [attribute_name]
          value: [expected_value]
          present: [true/false]
      tags:
        [tag_name]:
          entityTagName: [alternative_name]
          multiValue: [true/false]
          ttl: [duration]
```

## Key Features and Integrations

### Cloud Provider Support
- **AWS**: Extensive EC2, Lambda, RDS, MSK, Kinesis, CloudFront, S3, ElastiCache support
- **Azure**: Azure regions, subscriptions, resource groups
- **GCP**: Zones, projects, cloud platform attributes

### Container and Orchestration
- **Docker**: Full container lifecycle monitoring
- **Kubernetes**: Nodes, pods, containers, deployments, namespaces
- **ECS**: AWS container service integration
- **OpenShift**: Container platform support

### Observability Standards
- **OpenTelemetry**: First-class support across multiple entity types
- **Prometheus**: Node exporter and metrics integration
- **Pixie**: eBPF-based observability for databases and services

### Database Support
- **Redis**: Both native and Pixie-based monitoring
- **PostgreSQL**: Via Pixie integration
- **MySQL**: Referenced in relationships
- **MongoDB**: Referenced in documentation
- **Snowflake**: Account and warehouse monitoring

## Configuration Options

### Entity Expiration Times
- **FOUR_HOURS**: Containers and short-lived entities
- **EIGHT_DAYS**: Default for hosts and long-lived entities
- **Custom**: Configurable per entity type

### Alertability
Most entity types are alertable, allowing attachment of alert conditions and incident management.

### Golden Tags
Key attributes promoted for filtering, grouping, and organization across the New Relic platform.

## Recent Development Trends

The repository shows active development with focus on:
1. **Cloud-native support**: Enhanced Kubernetes and container monitoring
2. **Streaming platforms**: Kafka (MSK, Confluent Cloud) integrations
3. **Security frameworks**: OCSF entity support
4. **Multi-cloud**: Consistent support across AWS, Azure, GCP
5. **OpenTelemetry**: Expanding OTLP support across entity types

This comprehensive entity definition framework enables New Relic to synthesize telemetry from diverse sources into a unified entity model, providing the foundation for observability across modern distributed systems.