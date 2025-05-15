"""
Scans the NetworkX graph for two quick wins:

1. Bottleneck hop  – highest median lag (edge DELIVERED) or duration
2. Lost messages   – DataInstances that never reach a consumer

Outputs markdown summary to output/anomalies.md
"""

from pathlib import Path
from collections import defaultdict
import networkx as nx
import statistics
import datetime as dt
from microlink.utils.log import get_logger

LOG = get_logger(__name__)

def _edge_lag(e_data):
    """Extract lag value from edge data."""
    try:
        return float(e_data.get("lag", 0))
    except (TypeError, ValueError):
        return 0

def scan(G: nx.MultiDiGraph) -> str:
    """Scan graph for anomalies and return markdown report."""
    # 1) Find bottlenecks (edges with highest median lag)
    lags = defaultdict(list)
    for u, v, d in G.edges(data=True):
        if d["rel"] == "DELIVERED" and d.get("lag"):
            key = f'{u}->{v}'
            lags[key].append(_edge_lag(d))
    
    # Find the edge with highest median lag
    bottleneck = None
    if lags:
        bottleneck = max(lags.items(), key=lambda kv: statistics.median(kv[1]))

    # 2) Identify lost messages (published but never consumed)
    lost = []
    for data_node, d in G.nodes(data=True):
        if d["type"] != "DataInstance":
            continue
        
        # Find events that published this data instance
        published = False
        consumed = False
        
        for u, v in G.edges():
            if v == data_node:  # This is an edge to our data instance
                event_node = u
                event_type = G.nodes[event_node].get("type", "")
                
                if event_type == "EventPoint":
                    # Check if this event point published to a queue
                    for _, q, ed in G.out_edges(event_node, data=True):
                        if (G.nodes[q].get("type") == "Queue" and 
                            ed["rel"] == "PUBLISHED"):
                            published = True
                            
                    # Check if it's a consumer (processed a queue message)
                    for q, _, ed in G.in_edges(event_node, data=True):
                        if (G.nodes[q].get("type") == "Queue" and 
                            ed["rel"] == "DELIVERED"):
                            consumed = True
        
        # If published but not consumed, it's lost
        if published and not consumed:
            lost.append(data_node)

    # 3) Find slow hops (significant lag in DELIVERED edges)
    slow_hops = []
    for u, v, d in G.edges(data=True):
        if d["rel"] == "DELIVERED" and d.get("lag"):
            lag = _edge_lag(d)
            if lag > 1.0:  # Threshold for slow hops (1 second)
                slow_hops.append((u, v, lag))
    
    # Sort slow hops by lag (descending)
    slow_hops.sort(key=lambda x: x[2], reverse=True)

    # Generate markdown report
    md = ["# MicroLink Anomaly Report", 
          f"_Generated {dt.datetime.utcnow().isoformat()}Z_\n"]
    
    # Bottleneck section
    md.append("## Bottleneck hop")
    if bottleneck:
        name, vals = bottleneck
        median_lag = statistics.median(vals)
        md.append(f"`{name}` median lag **{median_lag:.2f}s** ")
        # Additional stats
        if len(vals) > 1:
            md.append(f"\n- Minimum lag: {min(vals):.2f}s")
            md.append(f"- Maximum lag: {max(vals):.2f}s")
            md.append(f"- Average lag: {sum(vals)/len(vals):.2f}s")
            if len(vals) > 2:
                md.append(f"- Standard deviation: {statistics.stdev(vals):.2f}s")
    else:
        md.append("_No publish to consume edges with lag found._")

    # Lost messages section
    md.append("\n## Lost messages")
    if lost:
        md.append(f"**{len(lost)} lost DataInstances:**")
        md.extend([f"- {n}" for n in lost[:20]])
        if len(lost) > 20:
            md.append(f"- _(and {len(lost) - 20} more...)_")
    else:
        md.append("_No lost messages detected._")

    # Slow hops section
    md.append("\n## Slow hops")
    if slow_hops:
        md.append(f"**{len(slow_hops)} slow message deliveries:**")
        for u, v, lag in slow_hops[:10]:
            # Get service name if available
            to_svc = G.nodes[v].get("svc", "unknown")
            md.append(f"- `{u} to {v}` ({to_svc}): **{lag:.2f}s**")
        if len(slow_hops) > 10:
            md.append(f"- _(and {len(slow_hops) - 10} more...)_")
    else:
        md.append("_No significant delivery delays detected._")

    return "\n".join(md)

def main(G: nx.MultiDiGraph) -> Path:
    """Generate anomaly report and save to file."""
    txt = scan(G)
    out = Path("output/anomalies.md")
    out.write_text(txt)
    LOG.info("anomaly report written to %s", out)
    return out

if __name__ == "__main__":
    import pickle, sys
    try:
        G = pickle.load(open("output/G.pkl", "rb"))
        main(G)
    except FileNotFoundError:
        print("Graph pickle not found. Run the pipeline first.")
        sys.exit(1)
