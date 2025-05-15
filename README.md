# MicroLink Monorepo

A microservice observability toolkit that builds lineage graphs from distributed logs.

## Features

- **Extract logs** from New Relic NRDB (or use demo mode)
- **LLM-powered event normalization** to structure raw logs
- **Graph-based event correlation** with NetworkX and Neo4j
- **Visual flow graphs** for lineage tracing
- **Anomaly detection** for bottlenecks and lost messages
- **Policy guardrails** for compliance checking
- **Real-time Kafka ingestion** for continuous monitoring
- **GitHub PR automation** for report publishing

## Quick Start

```bash
# Clone the repository
git clone <your-repo>
cd <repo-dir>

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys if needed

# Run the demo pipeline (uses mock data)
make demo
```

Open the generated HTML files in your browser to see the results:
- `output/orderId=124.html` - Lineage graph for a specific order
- `output/dep_map.html` - Service dependency map
- `output/anomalies.md` - Bottleneck and lost message report
- `output/policy_report.md` - Policy compliance report

## Documentation

For detailed implementation instructions, check the docs folder:

- [Implementation Overview](docs/IMPLEMENTATION_PLAN.md) - Complete implementation plan
- [Phase 1: Repo Setup](docs/PHASE1_REPO_SETUP.md) - Project skeleton and basic pipeline
- [Phase 2: Extract & Normalize](docs/PHASE2_EXTRACT_NORMALIZE.md) - Log extraction and LLM normalization
- [Phase 3: Graph & Visualization](docs/PHASE3_GRAPH_VISUALIZATION.md) - Graph building and visualization
- [Phase 4: Policy & Neo4j](docs/PHASE4_POLICY_NEO4J.md) - Policy guardrails and Neo4j integration
- [Phase 5: Streaming & PR](docs/PHASE5_STREAMING_PR.md) - Kafka streaming and GitHub PR automation

## License

MIT
