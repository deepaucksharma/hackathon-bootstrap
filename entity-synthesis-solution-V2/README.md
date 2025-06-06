# Entity Synthesis Solution V2 - Complete Testing Framework

## 🎯 Mission
Create a rapid iteration framework to discover the exact payloads that make Kafka/MSK entities appear in the New Relic Message Queues UI by comparing with working accounts and testing minimal payloads.

## 📋 Strategy

### Phase 1: Analyze Working Accounts
Compare what's in NRDB for working accounts (3001033, 1, 3026020) vs our account to identify exact differences.

### Phase 2: Minimal Payload Testing
Send incremental payloads to discover exactly which fields trigger UI visibility.

### Phase 3: Full Implementation
Once we know the exact format, implement the complete solution.

## 🛠️ Consolidated Testing Framework

### Main Entry Points

1. **Quick Interactive Test** (`./test.js`)
   - Simple menu-driven interface
   - Choose your testing mode interactively
   - Best for quick testing

2. **Comprehensive Tester** (`entity-synthesis-tester.js`)
   - All testing functionality in one tool
   - Multiple modes: send, validate, compare, discover, test
   - Direct command-line usage

### Available Testing Modes

- **send** - Send a working payload pattern with all critical fields
- **validate** - Check if entities appear in the Message Queues UI
- **compare** - Compare your account with working MSK accounts
- **discover** - Test different field combinations to find what works
- **test** - Run the complete test suite (send → wait → validate → compare)

### Legacy Scripts (Still Available)

- `compare-working-accounts.js` - Original account comparison tool
- `minimal-payload-tester.js` - Test minimal payload variations
- `payload-discovery.js` - Systematic field discovery
- `ui-visibility-validator.js` - Validate UI visibility
- `working-payload-sender.js` - Send known working payloads
- `batch-test-runner.js` - Batch testing for speed

## 🚀 Quick Start

1. **Set Environment Variables**:
   ```bash
   # Create .env file or export these variables
   export IKEY="your-license-key"      # Your ingest key
   export UKEY="your-user-key"         # Your user key for queries  
   export ACC="your-account-id"        # Your account ID
   ```

2. **Run Interactive Test Menu**:
   ```bash
   ./test.js
   ```

3. **Or Use Direct Commands**:
   ```bash
   # Send working payload
   node entity-synthesis-tester.js send
   
   # Validate UI visibility
   node entity-synthesis-tester.js validate
   
   # Compare with working accounts
   node entity-synthesis-tester.js compare
   
   # Discover optimal payload format
   node entity-synthesis-tester.js discover
   
   # Run full test suite
   node entity-synthesis-tester.js test
   ```

## 📊 Expected Outcomes

1. **Exact Field Requirements**: Know precisely which fields make entities appear
2. **Working Payload Template**: A proven payload structure that works
3. **Validation Process**: Automated way to verify UI visibility
4. **Documentation**: Clear understanding of entity synthesis rules

## 🔍 Key Insights So Far

From our research, we know:
- Must use `collector.name: "cloudwatch-metric-streams"`
- Need `providerExternalId` field (CRITICAL!)
- Entity type must be exact: `AWS_KAFKA_BROKER`, etc.
- Dimensional metrics format is preferred

## 📁 Folder Structure

```
entity-synthesis-solution-V2/
├── README.md                       # This file
├── test.js                        # Interactive test menu (start here!)
├── entity-synthesis-tester.js     # Unified testing framework
├── lib/                           # Shared libraries
│   └── common.js                  # Common utility functions
├── results/                       # Test results and reports
│   └── *.json                     # Timestamped result files
├── test-payloads/                 # Test payload templates
│   └── minimal-broker.json        # Example payload
└── Legacy scripts (for reference):
    ├── compare-working-accounts.js
    ├── minimal-payload-tester.js
    ├── payload-discovery.js
    ├── ui-visibility-validator.js
    ├── working-payload-sender.js
    └── batch-test-runner.js
```

## ✅ Success Criteria

We'll know we've succeeded when:
1. We can send a minimal payload that creates an entity
2. That entity appears in the Message Queues UI
3. We have documented the exact required fields
4. We can reliably reproduce the results

Let's start with the comparison tool to see what's working in other accounts!