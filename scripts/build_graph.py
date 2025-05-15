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
        G.add_node(
            eid,
            type="EventPoint",
            svc=svc,
            ts=str(ts),
            raw=row["message"][:250],
        )

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
        try:
            _commit_neo4j(G)
        except Exception as e:
            LOG.error("Neo4j connection failed: %s", e)
            LOG.warning("Continuing with NetworkX backend only")
    return G

if __name__ == "__main__":
    main(Path("output/events.csv"))
