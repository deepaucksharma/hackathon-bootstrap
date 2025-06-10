# New Relic Entity Definitions Repository Structure

This document captures the complete structure of the New Relic entity-definitions repository, showing how entity types are organized and defined.

## Repository Structure

```
newrelic-entity-definitions/
├── README.md
├── docs/
│   ├── entities/
│   │   ├── entity_summary.md
│   │   ├── golden_metrics.md
│   │   ├── golden_tags.md
│   │   ├── guid_spec.md
│   │   ├── lifecycle.md
│   │   ├── summary_metrics.md
│   │   └── synthesis.md
│   └── relationships/
│       ├── candidate_relationships.md
│       └── relationship_synthesis.md
├── entity-types/
│   ├── {domain}-{type}/          # Each entity type has its own folder
│   │   ├── definition.yml        # Core entity definition (required)
│   │   ├── golden_metrics.yml    # Golden metrics definition
│   │   ├── summary_metrics.yml   # Summary metrics definition
│   │   ├── dashboard.json        # Entity dashboard template
│   │   └── tests/               # Test data for synthesis validation
│   │       └── {EventType}.json
├── relationships/
│   ├── candidates/              # Candidate relationship definitions
│   └── synthesis/              # Relationship synthesis rules
├── validator/                  # Validation tools and schemas
└── .github/                   # GitHub workflows and templates
```

## Entity Type Naming Convention

- Folder names: `{domain}-{type}` in lowercase
- Example: `infra-host`, `ext-service`, `apm-application`
- Domain and type in definition.yml should be uppercase

## Standard Entity Definition Files

1. **definition.yml** (Required)
   - Domain and type specification
   - Synthesis rules
   - Configuration (alertable, expiration)
   - Golden tags

2. **golden_metrics.yml**
   - Key performance metrics
   - NRQL queries
   - Units and display configuration

3. **summary_metrics.yml**
   - Metrics for entity list view
   - References to golden metrics
   - Maximum 3 metrics recommended

4. **dashboard.json**
   - Entity summary dashboard
   - Exported from New Relic One
   - Multiple dashboards for different providers

## Test Data Structure

Test data files in `tests/` directory:
- File name = Event type (e.g., `KafkaBrokerSample.json`)
- Contains array of sample telemetry data points
- Used to validate synthesis rules

## Validation Requirements

1. Schema validation for all YAML/JSON files
2. Unique identifiers across entity types
3. Folder name must match domain-type pattern
4. Dashboard sanitization (remove account IDs, permissions)
5. Relationship synthesis rule validation

## Key Configuration Patterns

### Entity Expiration Times
- `EIGHT_DAYS`: Long-lived infrastructure (hosts, brokers)
- `FOUR_HOURS`: Short-lived entities (containers)
- `DAILY`: 24-hour retention
- `QUARTERLY`: 3-month retention (mobile apps)
- `MANUAL`: User-managed entities (dashboards)

### Common Golden Tags
- `account`, `accountId`
- `environment`
- `cloud.provider`, `cloud.region`
- `k8s.cluster.name`, `k8s.namespace.name`
- `instrumentation.provider`