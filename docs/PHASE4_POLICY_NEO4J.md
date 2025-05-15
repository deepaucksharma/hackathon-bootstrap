# Phase 4: Policy Guardrails and Neo4j Integration

This phase implements policy-based compliance checking for message flows and adds Docker-based Neo4j integration.

## Progress Checklist

- [ ] Create Docker-Compose file for Neo4j
- [ ] Create Policy Definition file
- [ ] Implement Policy Checker
- [ ] Update Build Graph script to include raw message
- [ ] Update Pipeline to include Policy Checker
- [ ] Setup GitHub Actions workflow
- [ ] Test Neo4j Integration and Policy Checker

## Step-by-Step Implementation

### Step 4.1: Create Docker-Compose File for Neo4j
```bash
# Create docker-compose.yml for Neo4j
cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  neo4j:
    image: neo4j:5.13
    container_name: microlink-neo4j
    environment:
      - NEO4J_AUTH=neo4j/neo4j
    ports:
      - "7474:7474"   # browser
      - "7687:7687"   # bolt
    volumes:
      - ./graph.db:/data
EOF
```

### Step 4.2: Create Policy Definition File
```bash
# Create policies.yaml for defining compliance rules
cat > policies.yaml << 'EOF'
# Each rule = expected step(s) (regex) that must appear in every flow
rules:
  - name: Fraud check present
    appliesTo: orderId             # which corr_key family
    mustContain:
      - fraudCheck               # eventPoint substring
  - name: Payment precedes Ship
    appliesTo: orderId
    sequence:
      - chargeCard
      - shipOrder
  - name: No PII in logs
    appliesTo: userId
    forbiddenRegex: '[0-9]{16}'   # credit-card pattern
EOF
```

### Step 4.3: Implement Policy Checker
```bash
# Implement the policy_checker.py script
cat > scripts/policy_checker.py << 'EOF'
"""
Evaluate flow-level compliance rules defined in policies.yaml
Outputs markdown summary → output/policy_report.md
"""

from pathlib import Path
import yaml, networkx as nx, re, datetime as dt, collections
from microlink.utils.log import get_logger

LOG = get_logger(__name__)
POLICY_PATH = Path("policies.yaml")
OUT_MD      = Path("output/policy_report.md")

def _load_rules():
    with open(POLICY_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)["rules"]

def _events_for(G, data_node):
    # return ordered list of eventPoint names for a given DataInstance node
    eps = [
        u for u, v, d in G.in_edges(data_node, data=True)
        if d["rel"] == "PROCESSED"
    ]
    return [e.split("_")[-1] for e in eps]  # action part

def evaluate(G: nx.MultiDiGraph):
    rules = _load_rules()
    failures = collections.defaultdict(list)   # rule -> [data_ids]

    for dn, d in G.nodes(data=True):
        if d["type"] != "DataInstance":
            continue
        key_type = dn.split("=")[0]           # e.g. orderId
        events = _events_for(G, dn)
        lineage = "→".join(events)

        for rule in rules:
            if rule["appliesTo"] != key_type:
                continue
            # --- presence rule
            if "mustContain" in rule:
                if not all(any(mc in ev for ev in events) for mc in rule["mustContain"]):
                    failures[rule["name"]].append(dn)
            # --- sequence rule
            if "sequence" in rule:
                seq = rule["sequence"]
                pattern = ".*".join(seq)
                if not re.search(pattern, lineage):
                    failures[rule["name"]].append(dn)
            # --- forbidden pattern
            if "forbiddenRegex" in rule:
                pat = re.compile(rule["forbiddenRegex"])
                # naive: check original msg text on node attr snapshot (optional)
                if any(pat.search(G.nodes[ep]["raw"]) for ep in events if "raw" in G.nodes[ep]):
                    failures[rule["name"]].append(dn)

    # ---------- write report ----------------------
    lines = [
        "# Policy Compliance Report",
        f"_generated {dt.datetime.utcnow().isoformat()}Z_\n",
    ]
    for rule in rules:
        name = rule["name"]
        bad  = failures.get(name, [])
        lines.append(f"## {name}")
        if bad:
            lines.append(f"❌ **{len(bad)} violation(s)**")
            lines.extend([f"- {x}" for x in bad[:20]])
        else:
            lines.append("✅ No violations detected.")
        lines.append("")
    OUT_MD.write_text("\n".join(lines))
    LOG.info("policy report → %s", OUT_MD)
    return OUT_MD

if __name__ == "__main__":
    import pickle
    G = pickle.load(open("output/G.pkl","rb"))
    evaluate(G)
EOF
```

### Step 4.4: Update Build Graph to Include Raw Message
```bash
# Update build_graph.py to include the raw message in the node properties
sed -i 's/G.add_node(eid, type="EventPoint", svc=svc, ts=str(ts))/G.add_node(\n            eid,\n            type="EventPoint",\n            svc=svc,\n            ts=str(ts),\n            raw=row["message"][:250],\n        )/g' scripts/build_graph.py
```

### Step 4.5: Update Pipeline to Include Policy Checker
```bash
# Update the pipeline.py to call the policy checker
cat > microlink/pipeline.py << 'EOF'
"""
Embeds the *orchestrated* happy-path pipeline so `scripts/main.py --demo`
turns raw logs → structured events → graph → HTML visual in one shot.
Real logic lives in the dedicated scripts; here we just import & call them.
"""

from pathlib import Path
from microlink.utils.log import get_logger
from scripts import (
    extract_logs,
    normalize_events,
    build_graph,
    visualize_flow,
)

log = get_logger(__name__)

def demo(order_id: str = "orderId=124"):
    """Run the happy-path demo end-to-end."""
    Path("output").mkdir(exist_ok=True)
    log.info("1️⃣  pulling logs …")
    csv_path = extract_logs.main(demo=True)  # returns Path
    log.info("2️⃣  LLM normalising …")
    events_path = normalize_events.main(csv_path, demo=True)
    log.info("3️⃣  building graph …")
    graph_obj = build_graph.main(events_path, demo=True)
    import pickle; pickle.dump(graph_obj, open("output/G.pkl","wb"))
    log.info("4️⃣  rendering flow …")
    html_path = visualize_flow.main(graph_obj, order_id=order_id, demo=True)
    log.info("5️⃣  anomaly scan …")
    from scripts import detect_anomalies
    detect_anomalies.main(graph_obj)
    log.info("6️⃣  policy compliance …")
    from scripts import policy_checker
    policy_checker.evaluate(graph_obj)
    log.info("🎉  artefacts: lineage html, dep_map.html, anomalies.md, policy_report.md")

if __name__ == "__main__":  # pragma: no cover
    demo()
EOF
```

### Step 4.6: Setup GitHub Actions Workflow
```bash
# Create the GitHub Actions directory
mkdir -p .github/workflows

# Create the GitHub Actions workflow file
cat > .github/workflows/demo.yml << 'EOF'
name: MicroLink demo

on: [push, pull_request]

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Run pipeline (mock)
        env:
          OPENAI_API_KEY: dummy
        run: |
          python scripts/main.py --demo
      - name: Upload artefacts
        uses: actions/upload-artifact@v4
        with:
          name: microlink-demo-output
          path: output/
EOF
```

### Step 4.7: Test Neo4j Integration and Policy Checker
```bash
# Start Neo4j
docker compose up -d neo4j

# Set environment variable to use Neo4j backend
echo "GRAPH_BACKEND=neo4j" >> .env

# Run the demo
make demo

# Check Neo4j browser at http://localhost:7474
# Check output/policy_report.md for policy violations
```

## Expected Output

After completing this phase, you should have:
- A running Neo4j instance via Docker
- Policy definitions in YAML format
- Policy compliance checking that evaluates flow-level rules
- A policy report in markdown format
- A GitHub Actions workflow that runs the demo and uploads artifacts

## Policy Rule Types

The policy engine supports three types of rules:

1. **mustContain** - Checks if specific action names appear in the flow
2. **sequence** - Checks if actions appear in the correct order
3. **forbiddenRegex** - Checks if log messages contain prohibited patterns

## Neo4j Visualization

With Neo4j running, you can visualize the graph using the Neo4j Browser:

1. Open http://localhost:7474 in your browser
2. Connect with username `neo4j` and password `neo4j`
3. Run Cypher queries like:
   - `MATCH (n) RETURN n LIMIT 100` - View all nodes
   - `MATCH p=()-[r:PROCESSED]->() RETURN p LIMIT 25` - View processing relationships
   - `MATCH (e)-[:DELIVERED]->(n) RETURN e, n` - Show message delivery

## Troubleshooting

- For Docker issues, ensure Docker is installed and running
- If Neo4j connection fails, check if the Neo4j container is running
- For policy violations, check the policy definitions and log messages
- If the GitHub Actions workflow fails, check the workflow logs for details
