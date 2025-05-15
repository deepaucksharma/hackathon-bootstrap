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
    log.info("Step 1: Pulling logs...")
    csv_path = extract_logs.main(demo=True)  # returns Path
    log.info("Step 2: LLM normalizing...")
    events_path = normalize_events.main(csv_path, demo=True)
    log.info("Step 3: Building graph...")
    graph_obj = build_graph.main(events_path, demo=True)
    log.info("Step 4: Rendering flow...")
    html_path = visualize_flow.main(graph_obj, order_id=order_id, demo=True)
    log.info("Demo ready! -> %s", html_path.resolve())

if __name__ == "__main__":  # pragma: no cover
    demo()
