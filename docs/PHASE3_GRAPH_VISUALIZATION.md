# Phase 3: Graph & Visual Modules

This phase implements the graph building with NetworkX and visualization components using PyVis, along with anomaly detection capabilities.

## Progress Checklist

- [ ] Implement Graph Builder with dual backend
- [ ] Implement Visualization with PyVis
- [ ] Implement Anomaly Detection
- [ ] Update Pipeline
- [ ] Test Graph & Visual Modules

## Step-by-Step Implementation

### Step 3.1: Implement Graph Builder with Dual Backend
```bash
# Replace the build_graph.py stub with a real implementation
cat > scripts/build_graph.py << 'EOF'
"""
CSV -> Graph builder
Supports two back-ends:
  • networkx (default, zero-install)
  • neo4j     (set GRAPH_BACKEND=neo4j and run docker compose up neo4j)
Edges:
  (EventPoint)-[:PROCESSED {ts}] -> (DataInstance)
  (EventPoint)-[:PUBLISHED]      -> (:Queue)
  (:Queue)   -[:DELIVERED {lag}] -> (EventPoint)
Also adds PRECEDES edges in-memory for timeline queries.
"""

from __future__ import annotations
from pathlib import Path
import pandas as pd, networkx as nx, re, datetime as dt
from microlink import config
from microlink.utils.log import get_logger

SET, LOG = config.settings, get_logger(__name__)
QUEUE_NAME = "order.events"              # demo constant — adjust / infer as needed
PUB_RE  = re.compile(r"\bpublish(ed)?\b", re.I)
CON_RE  = re.compile(r"\bconsum(e|ed|ing)\b|\bprocess(ing)?\b", re.I)

def _build_nx(df: pd.DataFrame) -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()
    df = df.sort_values("timestamp")
    last_by_id: dict[str, str] = {}

    for _, row in df.iterrows():
        eid  = row["event_point"]
        did  = row["corr_key"]
        svc  = row["service.name"]
        ts   = pd.to_datetime(row["timestamp"])

        G.add_node(did, type="DataInstance")
        G.add_node(eid, type="EventPoint", svc=svc, ts=str(ts))

        # processed edge
        G.add_edge(eid, did, rel="PROCESSED", ts=str(ts))

        # async hop edges (very naive keyword check)
        msg = row["message"]
        if PUB_RE.search(msg):
            G.add_node(QUEUE_NAME, type="Queue")
            G.add_edge(eid, QUEUE_NAME, rel="PUBLISHED", ts=str(ts))
            last_by_id[did] = QUEUE_NAME
        elif CON_RE.search(msg):
            if did in last_by_id and last_by_id[did] == QUEUE_NAME:
                lag = (ts - pd.to_datetime(row["timestamp"])).total_seconds()
            else:
                lag = None
            G.add_node(QUEUE_NAME, type="Queue")
            G.add_edge(QUEUE_NAME, eid, rel="DELIVERED", lag=lag, ts=str(ts))
        # PRECEDES (timeline) — link last EventPoint to current
        prev = last_by_id.get(did+"@prev")
        if prev and prev != eid:
            G.add_edge(prev, eid, rel="PRECEDES")
        last_by_id[did+"@prev"] = eid
    return G

def _commit_neo4j(G: nx.MultiDiGraph):
    import neo4j, json, os
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    auth = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASS", "neo4j"))
    driver = neo4j.GraphDatabase.driver(uri, auth=auth)
    with driver.session() as s, s.begin_transaction() as tx:
        for n, d in G.nodes(data=True):
            tx.run("MERGE (n:Node {id:$id}) "
                   "SET n += $props", id=n, props=d)
        for u, v, d in G.edges(data=True):
            tx.run("MATCH (a:Node {id:$u}),(b:Node {id:$v}) "
                   "MERGE (a)-[r:"+d.pop("rel")+"]->(b) "
                   "SET r += $props", u=u, v=v, props=d)
        tx.commit()
    driver.close()
    LOG.info("Neo4j graph loaded ✔")

def main(events_csv: Path, demo: bool = False):
    df = pd.read_csv(events_csv)
    G  = _build_nx(df)
    LOG.info("graph: %s nodes, %s edges", len(G), len(G.edges))
    if SET.GRAPH_BACKEND.lower() == "neo4j":
        _commit_neo4j(G)
    return G

if __name__ == "__main__":
    main(Path("output/events.csv"))
EOF
```

### Step 3.2: Implement Visualization with PyVis
```bash
# Replace the visualize_flow.py stub with a real implementation
cat > scripts/visualize_flow.py << 'EOF'
"""
Two views:
  • lineage for ONE corr_key (orderId=123)          → output/<id>.html
  • dependency map of services & queues (aggregate) → output/dep_map.html
Colour scheme:
    DataInstance  – yellow
    Queue         – purple
    EventPoint    – blue (label = svc:action)
Edges styled by rel type.
"""

from pathlib import Path
import networkx as nx
from pyvis.network import Network
from microlink.utils.log import get_logger

LOG = get_logger(__name__)
COLORS = {"DataInstance": "#FFDD33", "Queue": "#B266FF", "EventPoint": "#1f78b4"}

def _style(net: Network, n: str, d: dict):
    lbl = n if d["type"] == "DataInstance" else \
          (n if d["type"] == "Queue" else f'{d["svc"]}:{n.split("_")[-1]}')
    net.add_node(n, label=lbl, color=COLORS[d["type"]])

def lineage_html(G: nx.MultiDiGraph, corr_key: str, out_dir=Path("output")) -> Path:
    H = nx.edge_subgraph(G, [e for e in G.edges if corr_key in e])
    net = Network(height="600px", directed=True, cdn_resources="in_line")
    for n, d in H.nodes(data=True): _style(net, n, d)
    for u, v, d in H.edges(data=True):
        net.add_edge(u, v, title=d["rel"], color="red" if d["rel"]=="DELIVERED" else None)
    out = out_dir / f"{corr_key}.html"
    net.show(str(out))
    LOG.info("lineage rendered → %s", out)
    return out

def dep_map_html(G: nx.MultiDiGraph, out_dir=Path("output")) -> Path:
    agg = nx.DiGraph()
    for u, v, d in G.edges(data=True):
        if d["rel"] in ("PUBLISHED", "DELIVERED"):
            su = G.nodes[u].get("svc") or u
            sv = G.nodes[v].get("svc") or v
            if su == sv: continue
            agg.add_edge(su, sv, weight=1+agg.get_edge_data(su, sv, {}).get("weight",0))
    net = Network(height="600px", directed=True, cdn_resources="in_line")
    for n in agg.nodes(): net.add_node(n, label=n, color="#0072B2")
    for u,v,d in agg.edges(data=True):
        net.add_edge(u,v, value=d["weight"], title=f"{d['weight']} msgs")
    out = out_dir / "dep_map.html"
    net.show(str(out))
    LOG.info("dependency map → %s", out)
    return out

def main(G: nx.MultiDiGraph, order_id: str, demo: bool = False):
    lineage_html(G, order_id)
    return dep_map_html(G)

if __name__ == "__main__":
    import pickle, sys
    G = pickle.load(open("output/G.pkl","rb"))
    main(G, sys.argv[1])
EOF
```

### Step 3.3: Implement Anomaly Detection
```bash
# Implement the anomaly detection script
cat > scripts/detect_anomalies.py << 'EOF'
"""
Scans the NetworkX graph for two quick wins:

1. Bottleneck hop  – highest median lag (edge DELIVERED) or duration
2. Lost messages   – DataInstances that never reach a consumer

Outputs markdown summary to output/anomalies.md
"""

from pathlib import Path, defaultdict
import networkx as nx, statistics, datetime as dt
from microlink.utils.log import get_logger

LOG = get_logger(__name__)

def _edge_lag(e_data):
    try: return float(e_data.get("lag", 0))
    except TypeError: return 0

def scan(G: nx.MultiDiGraph) -> str:
    # 1) bottleneck
    lags = defaultdict(list)
    for u, v, d in G.edges(data=True):
        if d["rel"] == "DELIVERED" and d.get("lag"):
            key = f'{u}->{v}'
            lags[key].append(_edge_lag(d))
    bottleneck = max(lags.items(), key=lambda kv: statistics.median(kv[1]), default=None)

    # 2) lost messages
    lost = []
    for data_node, d in G.nodes(data=True):
        if d["type"] != "DataInstance": continue
        outs = [v for _, v, ed in G.out_edges(data_node, data=True) if ed["rel"] == "PUBLISHED"]
        ins  = [v for _, v, ed in G.in_edges(data_node, data=True)  if ed["rel"] == "DELIVERED"]
        if outs and not ins:
            lost.append(data_node)

    md = ["# MicroLink Anomaly Report", f"_generated {dt.datetime.utcnow().isoformat()}Z_"]
    if bottleneck:
        name, vals = bottleneck
        md.append(f"## Bottleneck hop\n`{name}` median lag **{statistics.median(vals):.2f}s** ")
    else:
        md.append("## Bottleneck hop\n_No publish→consume edges with lag found._")

    md.append("\n## Lost messages")
    md.append(f"{len(lost)} lost DataInstances")
    if lost:
        md.extend([f"- {n}" for n in lost[:20]])
    return "\n".join(md)

def main(G: nx.MultiDiGraph):
    txt = scan(G)
    out = Path("output/anomalies.md")
    out.write_text(txt)
    LOG.info("anomaly report → %s", out)
    return out

if __name__ == "__main__":
    import pickle
    G = pickle.load(open("output/G.pkl","rb"))
    print(scan(G))
EOF
```

### Step 3.4: Update Pipeline to Include Anomaly Detection
```bash
# Update the pipeline.py to include saving the graph and calling the anomaly scanner
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
    log.info("🎉  demo artefacts ready → %s  + dep_map.html + anomalies.md",
             html_path.name)

if __name__ == "__main__":  # pragma: no cover
    demo()
EOF
```

### Step 3.5: Test the Graph & Visual Modules
```bash
# Run the demo to test the graph building and visualizations
make demo
# Check output/*.html and output/anomalies.md to see the results
```

## Expected Output

After completing this phase, you should have:
- A graph backend that builds a NetworkX MultiDiGraph from events
- Optional Neo4j persistence (if configured)
- Two visualization views:
  - Per-order lineage graph showing the flow of a specific order
  - System-wide dependency map showing service interactions
- Anomaly detection that identifies:
  - Bottleneck hops with highest lag
  - Lost messages that never reach consumers

## Graph Structure

The graph has three types of nodes:
- **DataInstance** - Correlation identifiers (e.g., orderId=123)
- **EventPoint** - Service actions (e.g., payment-svc_chargeCard)
- **Queue** - Message queues (e.g., order.events)

And multiple relationship types:
- **PROCESSED** - EventPoint to DataInstance
- **PUBLISHED** - EventPoint to Queue
- **DELIVERED** - Queue to EventPoint
- **PRECEDES** - EventPoint to EventPoint (timeline)

## Using with Neo4j

To use the Neo4j backend:
1. Set GRAPH_BACKEND=neo4j in your .env
2. Have a Neo4j instance running (default credentials are neo4j/neo4j)
3. Run the pipeline

## Troubleshooting

- For visualization issues, ensure PyVis is correctly installed
- If Neo4j connection fails, verify your Neo4j URI and credentials
- For large graphs, the visualization might be slow - consider filtering the data
