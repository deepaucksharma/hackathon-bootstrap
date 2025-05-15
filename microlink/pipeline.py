"""
Embeds the *orchestrated* happy-path pipeline so `scripts/main.py --demo`
turns raw logs → structured events → graph → HTML visual in one shot.
Real logic lives in the dedicated scripts; here we just import & call them.
"""

from pathlib import Path
import pickle
from microlink.utils.log import get_logger
from scripts import (
    extract_logs,
    normalize_events,
    build_graph,
    visualize_flow,
    detect_anomalies
)

log = get_logger(__name__)

def demo(order_id: str = "orderId=124"):
    """Run the happy-path demo end-to-end."""
    # Create output directory if it doesn't exist
    Path("output").mkdir(exist_ok=True)
    
    log.info("Step 1: Pulling logs...")
    csv_path = extract_logs.main(demo=True)  # returns Path
    
    log.info("Step 2: LLM normalizing...")
    events_path = normalize_events.main(csv_path, demo=True)
    
    log.info("Step 3: Building graph...")
    graph_obj = build_graph.main(events_path, demo=True)
    
    # Persist graph to pickle file for reuse
    graph_pickle_path = Path("output/G.pkl")
    with open(graph_pickle_path, "wb") as f:
        pickle.dump(graph_obj, f)
    log.info("Graph persisted to %s", graph_pickle_path)
    
    log.info("Step 4: Rendering flow...")
    html_path = visualize_flow.main(graph_obj, order_id=order_id, demo=True)
    
    log.info("Step 5: Anomaly detection...")
    anomaly_report = detect_anomalies.main(graph_obj)
    
    log.info("Demo ready!")
    log.info("- Lineage graph: %s", Path(f"output/{order_id}.html").resolve())
    log.info("- Dependency map: %s", Path("output/dep_map.html").resolve())
    log.info("- Anomaly report: %s", anomaly_report.resolve())
    
    return {
        "lineage": Path(f"output/{order_id}.html"),
        "dep_map": Path("output/dep_map.html"),
        "anomalies": anomaly_report,
        "graph": graph_obj
    }

if __name__ == "__main__":  # pragma: no cover
    demo()
