# Entity Synthesis Experiment Library

This directory contains the experiment definitions for testing entity synthesis with the ESVP platform.

## Structure

### Phase 1: Baseline Experiments
- **Purpose**: Establish known working configurations and negative controls
- **Location**: `phase-1-baseline/`
- **Contents**:
  - `01-golden-cluster.yaml` - Working cluster payload
  - `02-golden-broker.yaml` - Working broker payload
  - `03-golden-topic.yaml` - Working topic payload
  - `04-negative-missing-provider.yaml` - Negative control

### Phase 2: Deconstruction Experiments
- **Purpose**: Identify minimal required fields for entity synthesis
- **Location**: `phase-2-deconstruction/`
- **Contents**:
  - `01-minimal-broker.yaml` - Test with minimal fields
  - `02-remove-entity-name.yaml` - Test without entityName
  - `03-remove-entity-guid.yaml` - Test without entityGuid

### Phase 3: Component Tests
- **Purpose**: Test specific components and variations
- **Location**: `phase-3-component-tests/`
- **Contents**:
  - `01-test-collector-name.yaml` - Test collector.name variations
  - `02-test-provider-variations.yaml` - Test provider field formats
  - `03-test-metric-aggregations.yaml` - Test metric aggregation requirements

### Phase 4: Advanced Tests
- **Purpose**: Complex scenarios and edge cases
- **Location**: `phase-4-advanced/`
- **Contents**: (To be added)

## Running Experiments

### Single Experiment
```bash
node 1-run-experiment.js experiment experiments/phase-1-baseline/01-golden-cluster.yaml
```

### Entire Phase
```bash
node 1-run-experiment.js phase phase-1-baseline
```

### All Phases
```bash
node 1-run-experiment.js all
```

## Experiment Format

Each experiment YAML file contains:
- `name`: Descriptive name
- `description`: What the experiment tests
- `baseTemplate`: Which template to use (awsmskcluster, awsmskbroker, awsmsktopic)
- `entityType`: Type of entity (cluster, broker, topic)
- `modifications`: Changes to apply to the base template
- `verification`: Checks to run after submission

## Results

Results are saved to `results/detailed-reports/` with timestamps.