# Pipeline Documentation Feature

The Message Queues Platform V2 includes a powerful pipeline documentation feature that captures and reports on all three stages of data transformation without percentage status metrics.

## Overview

The pipeline documenter tracks data as it flows through:

1. **Raw Data Collection** - Initial data from Kafka infrastructure or simulation
2. **Data Transformation** - Field mapping, validation, and enrichment
3. **Entity Synthesis** - Creation of New Relic entities with relationships

## Features

- **Real-time Capture**: Documents data at each pipeline stage during execution
- **Comprehensive Reports**: Generates detailed Markdown reports with:
  - Executive summary with pipeline metrics
  - Sample data structures from each stage
  - Entity distribution statistics
  - Data flow visualization (Mermaid diagrams)
  - Transformation mapping tables
- **No Percentage Metrics**: Designed specifically without percentage status metrics per requirements

## Usage

### 1. Simple Demo Script

Run the standalone demo to see the documentation in action:

```bash
node demo-documentation-simple.js
```

This creates a sample report in `pipeline-documentation-demo/`.

### 2. Platform Integration

Enable documentation mode in the platform orchestrator:

```javascript
// Get the orchestrator from the container
const orchestrator = container.get(TYPES.PlatformOrchestrator);

// Enable documentation with custom output directory
orchestrator.enableDocumentationMode('./my-reports');

// ... run platform cycles ...

// Generate the report
const reportPath = orchestrator.generateDocumentationReport();
```

### 3. Shell Script Demo

Run the full platform with documentation enabled:

```bash
./demo-platform-documentation.sh
```

## Report Structure

Generated reports include:

```markdown
# Data Transformation Pipeline Report

## Executive Summary
- Pipeline metrics table (input/output counts)
- Entity distribution table

## Stage 1: Raw Data Collection
- Data source information
- Sample counts by type
- Example raw data structures

## Stage 2: Data Transformation
- Transformation operation counts
- Example transformed entity

## Stage 3: Entity Synthesis
- Entity and relationship counts
- Entity type distribution
- Example synthesized entity with relationships

## Data Flow Visualization
- Mermaid diagram showing pipeline flow

## Transformation Mapping
- Field mapping table
- Entity type mapping table
```

## Output Files

- `pipeline-report-YYYY-MM-DD.md` - Timestamped report
- `LATEST_PIPELINE_REPORT.md` - Always contains the most recent report

## Integration Points

The documenter integrates at three key points in `PlatformOrchestrator`:

1. After `collect()` - Captures raw samples
2. After `transform()` - Captures transformed metrics
3. After `synthesize()` - Captures entities and relationships

## Example Report Excerpt

```markdown
### Pipeline Metrics

| Stage | Input | Output | Description |
|:------|:------|:-------|:------------|
| **Collection** | - | 6 samples | Raw data from simulation |
| **Transformation** | 6 samples | 4 entities | Field mapping and validation |
| **Synthesis** | 4 entities | 4 entities + 4 relationships | Entity creation with relationships |
```

## Configuration

No special configuration required. The documenter uses the platform's existing logger and creates output directories as needed.

## Performance Impact

Minimal - the documenter only captures references to existing data structures and generates reports on-demand.