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
import json
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
    """Generate lineage view for a specific correlation key."""
    # Create subgraph with nodes connected to the correlation key
    nodes = set()
    nodes.add(corr_key)  # Add the correlation key node
    
    # Find all event points that processed this correlation key
    for u, v, _ in G.edges(data=True):
        if v == corr_key:
            nodes.add(u)
    
    # Add queue nodes
    for node in list(nodes):  # Use a copy of nodes to avoid modification during iteration
        if G.nodes[node].get("type") == "EventPoint":
            # Check if this event point has published to a queue
            for _, v, d in G.out_edges(node, data=True):
                if d["rel"] == "PUBLISHED":
                    nodes.add(v)
            # Check if this event point received from a queue
            for u, _, d in G.in_edges(node, data=True):
                if d["rel"] == "DELIVERED":
                    nodes.add(u)
    
    # Create the subgraph with all relevant nodes
    H = G.subgraph(nodes)
    
    # Create PyVis network
    net = Network(height="600px", width="100%", directed=True, notebook=False)
    
    # Add nodes
    for n, d in H.nodes(data=True):
        _style(net, n, d)
    
    # Add edges with appropriate styling
    for u, v, d in H.edges(data=True):
        edge_color = "#ff0000" if d["rel"] == "DELIVERED" else "#999999"
        edge_width = 2 if d["rel"] in ["PUBLISHED", "DELIVERED"] else 1
        edge_title = f"{d['rel']}" + (f" (lag: {d.get('lag', 'N/A')}s)" if d.get("lag") else "")
        
        net.add_edge(u, v, title=edge_title, color=edge_color, width=edge_width)
    
    # Configure physics
    net.toggle_physics(True)
    physics_options = {
        "solver": "forceAtlas2Based",
        "forceAtlas2Based": {
            "springLength": 100,
            "springConstant": 0.08,
            "damping": 0.4,
            "avoidOverlap": 0.8
        },
        "stabilization": {
            "enabled": True,
            "iterations": 1000
        }
    }
    
    # Convert physics options to JSON
    physics_json = json.dumps({"physics": physics_options})
    net.set_options(physics_json)
    
    # Save to HTML file
    out = out_dir / f"{corr_key}.html"
    try:
        net.save_graph(str(out))
        LOG.info("lineage rendered to %s", out)
    except Exception as e:
        LOG.error("Failed to render lineage graph: %s", e)
        # Fallback to simple HTML table
        _create_fallback_html(H, out)
        LOG.info("created fallback lineage view to %s", out)
    
    return out

def _create_fallback_html(G, file_path):
    """Create a simple HTML table as fallback for visualization."""
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>MicroLink Lineage View</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; }}
            h1, h2 {{ color: #333; }}
            table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
            th, td {{ text-align: left; padding: 8px; border: 1px solid #ddd; }}
            th {{ background-color: #f2f2f2; }}
            tr:nth-child(even) {{ background-color: #f9f9f9; }}
            .datainstance {{ background-color: #FFDD33; }}
            .queue {{ background-color: #B266FF; color: white; }}
            .eventpoint {{ background-color: #1f78b4; color: white; }}
        </style>
    </head>
    <body>
        <h1>MicroLink Lineage View</h1>
        
        <h2>Nodes</h2>
        <table>
            <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Details</th>
            </tr>
    """
    
    # Add nodes
    for node, data in G.nodes(data=True):
        node_type = data.get("type", "Unknown")
        css_class = node_type.lower()
        details = ""
        if node_type == "EventPoint":
            details = f"Service: {data.get('svc', 'Unknown')}"
        
        html += f"""
            <tr class="{css_class}">
                <td>{node}</td>
                <td>{node_type}</td>
                <td>{details}</td>
            </tr>
        """
    
    html += """
        </table>
        
        <h2>Relationships</h2>
        <table>
            <tr>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
                <th>Properties</th>
            </tr>
    """
    
    # Add edges
    for u, v, data in G.edges(data=True):
        props = []
        for k, val in data.items():
            if k != "rel":
                props.append(f"{k}: {val}")
        
        html += f"""
            <tr>
                <td>{u}</td>
                <td>{v}</td>
                <td>{data.get('rel', 'Unknown')}</td>
                <td>{', '.join(props)}</td>
            </tr>
        """
    
    html += """
        </table>
        <p><em>Note: This is a fallback view. PyVis visualization failed.</em></p>
    </body>
    </html>
    """
    
    with open(file_path, 'w') as f:
        f.write(html)

def dep_map_html(G: nx.MultiDiGraph, out_dir=Path("output")) -> Path:
    """Generate dependency map of services and queues."""
    agg = nx.DiGraph()
    
    # Process edges to create service-level dependency graph
    for u, v, d in G.edges(data=True):
        if d["rel"] in ("PUBLISHED", "DELIVERED"):
            # Get service names for source and target nodes
            su = G.nodes[u].get("svc") or u
            sv = G.nodes[v].get("svc") or v
            
            # Skip self-references
            if su == sv:
                continue
            
            # Add edge with weight (count of messages)
            weight = 1 + agg.get_edge_data(su, sv, {}).get("weight", 0)
            agg.add_edge(su, sv, weight=weight, rel=d["rel"])
    
    # Create PyVis network
    net = Network(height="600px", width="100%", directed=True, notebook=False)
    
    # Add service nodes
    for n in agg.nodes():
        if n == QUEUE_NAME:
            net.add_node(n, label=n, color="#B266FF", shape="diamond")
        else:
            net.add_node(n, label=n, color="#0072B2", shape="box")
    
    # Add edges with width proportional to message count
    for u, v, d in agg.edges(data=True):
        net.add_edge(u, v, value=d["weight"], title=f"{d['weight']} msgs", width=1+d["weight"]*0.5)
    
    # Configure physics for better layout
    net.toggle_physics(True)
    physics_options = {
        "solver": "forceAtlas2Based",
        "forceAtlas2Based": {
            "gravitationalConstant": -50,
            "centralGravity": 0.01,
            "springLength": 100,
            "springConstant": 0.08,
            "damping": 0.4
        },
        "stabilization": {
            "enabled": True,
            "iterations": 1000
        }
    }
    
    # Convert physics options to JSON
    physics_json = json.dumps({"physics": physics_options})
    net.set_options(physics_json)
    
    # Save to HTML file
    out = out_dir / "dep_map.html"
    try:
        net.save_graph(str(out))
        LOG.info("dependency map to %s", out)
    except Exception as e:
        LOG.error("Failed to render dependency map: %s", e)
        # Create a fallback simple HTML table
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>MicroLink Dependency Map</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                h1 {{ color: #333; }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ text-align: left; padding: 8px; border: 1px solid #ddd; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            <h1>Service Dependency Map</h1>
            <table>
                <tr>
                    <th>From Service</th>
                    <th>To Service</th>
                    <th>Message Count</th>
                </tr>
        """
        
        for u, v, d in agg.edges(data=True):
            html += f"""
                <tr>
                    <td>{u}</td>
                    <td>{v}</td>
                    <td>{d.get('weight', 0)}</td>
                </tr>
            """
            
        html += """
            </table>
            <p><em>Note: This is a fallback view. PyVis visualization failed.</em></p>
        </body>
        </html>
        """
        
        with open(out, 'w') as f:
            f.write(html)
        LOG.info("created fallback dependency map to %s", out)
    
    return out

# Define QUEUE_NAME for the dependency map
QUEUE_NAME = "order.events"

def main(G: nx.MultiDiGraph, order_id: str, demo: bool = False) -> Path:
    """Generate both lineage and dependency map visualizations."""
    lineage_html(G, order_id)
    return dep_map_html(G)

if __name__ == "__main__":
    import pickle, sys
    if len(sys.argv) < 2:
        print("Usage: python visualize_flow.py <correlation_key>")
        sys.exit(1)
    try:
        G = pickle.load(open("output/G.pkl", "rb"))
        main(G, sys.argv[1])
    except FileNotFoundError:
        print("Graph pickle not found. Run the pipeline first.")
        sys.exit(1)
