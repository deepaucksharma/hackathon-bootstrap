# Entity Synthesis Consolidation Plan

## 🎯 Goal
Consolidate entity-synthesis-solution and entity-synthesis-solution-V2 into a single, streamlined solution based on our latest discoveries.

## 🔍 Current State Analysis

### entity-synthesis-solution (V1)
- Contains mostly documentation and analysis
- Has cloudwatch_emulator.go (not needed - we discovered cloud-integrations format works)
- Has various strategy documents
- Focused on CloudWatch Metric Streams approach (incorrect)

### entity-synthesis-solution-V2
- Contains working implementation scripts
- Has successful analysis of working accounts
- Multiple redundant scripts doing similar things
- Discovered the correct cloud-integrations format

## 🏗️ New Consolidated Structure

```
kafka-entity-synthesis/
├── README.md                           # Main documentation with quick start
├── DISCOVERY_INSIGHTS.md               # Key discoveries and patterns
├── .env.example                        # Example environment file
│
├── src/                                # Core implementation
│   ├── send-events.js                  # Main script to send events
│   ├── validate-ui.js                  # UI visibility validator
│   ├── analyze-accounts.js             # Account comparison tool
│   └── lib/
│       ├── common.js                   # Shared utilities
│       ├── event-builder.js            # Event construction helpers
│       └── nrql-queries.js             # NRQL query library
│
├── tools/                              # Additional utilities
│   ├── payload-discovery.js            # Test field combinations
│   ├── batch-tester.js                 # Batch testing
│   └── minimal-tester.js               # Minimal payload testing
│
├── reference/                          # Reference data and docs
│   ├── working-account-samples/        # Sample data from working accounts
│   │   ├── cluster-events.json
│   │   ├── broker-events.json
│   │   └── topic-events.json
│   ├── field-mappings.json             # Field requirement mappings
│   └── TROUBLESHOOTING.md              # Common issues and solutions
│
├── test/                               # Test scripts and data
│   ├── test-all.js                     # Comprehensive test suite
│   └── test-payloads/
│       └── *.json
│
└── results/                            # Test results (gitignored)
    └── .gitkeep
```

## 🔄 Consolidation Steps

### 1. Core Implementation (src/)
- **send-events.js**: Merge working-payload-sender.js + send-cloud-integration-format.js
  - Use cloud-integrations format (the working approach)
  - Remove CloudWatch Metric Streams code
  
- **validate-ui.js**: Keep ui-visibility-validator.js as is
  
- **analyze-accounts.js**: Keep analyze-working-accounts.js as is

### 2. Libraries (src/lib/)
- **common.js**: Existing common utilities
- **event-builder.js**: Extract event construction logic
- **nrql-queries.js**: Extract all NRQL queries to one place

### 3. Tools (tools/)
- Keep specialized testing tools but simplify interfaces
- Remove redundant functionality

### 4. Reference (reference/)
- Move working account samples here
- Create field-mappings.json from CRITICAL_PATTERNS.md
- Consolidate all troubleshooting docs

### 5. Cleanup Actions
- Remove all CloudWatch Metric Streams related code
- Remove duplicate scripts (test.js, entity-synthesis-tester.js do same thing)
- Archive old documentation to reference/archive/
- Clean up results directory (keep structure, remove old results)

## 📝 Key Changes

### 1. Single Entry Point
```bash
# Main usage
node src/send-events.js              # Send events
node src/validate-ui.js              # Validate UI visibility
node src/analyze-accounts.js         # Compare accounts
```

### 2. Simplified Configuration
- Single .env file with clear variable names
- Default values where sensible
- Better error messages

### 3. Focus on What Works
- Cloud integrations format only
- Remove experimental approaches
- Clear documentation of requirements

### 4. Better Organization
- Logical separation: src/, tools/, reference/, test/
- No duplicate functionality
- Clear naming conventions

## 🚀 Implementation Priority

1. **Phase 1**: Create new structure and move core files
2. **Phase 2**: Refactor and merge duplicate functionality  
3. **Phase 3**: Update documentation
4. **Phase 4**: Clean up old files
5. **Phase 5**: Test everything works

## ✅ Success Criteria

- Single command to send working events
- Clear documentation of the solution
- No duplicate or confusing scripts
- All discoveries preserved in reference docs
- Clean, maintainable codebase