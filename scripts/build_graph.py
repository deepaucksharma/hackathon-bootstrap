from pathlib import Path
import pandas as pd, networkx as nx
from microlink.utils.log import get_logger
LOG = get_logger(__name__)

def main(events_csv: Path, demo: bool = False) -> nx.MultiDiGraph:
    df = pd.read_csv(events_csv)
    G = nx.MultiDiGraph()
    for _, row in df.iterrows():
        data_node = row["corr_key"]
        ep_node   = row["event_point"]
        G.add_node(data_node, type="DataInstance")
        G.add_node(ep_node,   type="EventPoint", svc=row["service.name"])
        G.add_edge(ep_node, data_node, rel="PROCESSED", ts=row["timestamp"])
    LOG.info("graph built with %s nodes", len(G))
    return G
