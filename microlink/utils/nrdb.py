"""
Very small wrapper around New Relic NerdGraph v1.
Only the bits needed for Log export are implemented.
"""
from __future__ import annotations
import json, requests, os
from typing import Dict, Any
import pandas as pd
from microlink.utils.log import get_logger

LOG = get_logger(__name__)
NERD_GRAPH_URL = "https://api.newrelic.com/graphql"

def _post(query: str, variables: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    resp = requests.post(
        NERD_GRAPH_URL,
        headers={
            "Api-Key": api_key,
            "Content-Type": "application/json",
        },
        data=json.dumps({"query": query, "variables": variables}),
        timeout=30,
    )
    resp.raise_for_status()
    out = resp.json()
    if "errors" in out:
        raise RuntimeError(out["errors"])
    return out["data"]

def nrdb_query_logs(nrql: str, account_id: str, api_key: str, cursor: str = None) -> pd.DataFrame:
    """
    Runs a NRQL query against Log data and returns a Pandas dataframe.
    Batched via cursor paging (maxRows = 2000) so it can stream big windows.
    """
    # In demo mode, return the same mock data as before
    if nrql == "demo":
        import random, datetime as dt
        rows = []
        for i in range(1, 40):
            rows.append(
                {
                    "timestamp": (dt.datetime.utcnow() - dt.timedelta(seconds=40-i)).isoformat()+"Z",
                    "service.name": random.choice(["checkout-svc", "payment-svc", "shipper-svc"]),
                    "message": f"Order orderId={123+i} stage={random.choice(['publish','consume','charge','ship'])}",
                }
            )
        return pd.DataFrame(rows)
    
    # Otherwise, perform a real NRDB query
    logs: list[dict] = []
    gql = """
      query($acct:Int!, $nrql:String!, $cursor:String) {
        actor {
          account(id: $acct) {
            nrql(query: $nrql, cursor:$cursor) {
              results
              nextCursor
            }
          }
        }
      }
    """
    next_cur = cursor
    while True:
        dat = _post(
            gql,
            {"acct": int(account_id), "nrql": nrql, "cursor": next_cur},
            api_key,
        )
        chunk = dat["actor"]["account"]["nrql"]
        logs.extend(chunk["results"])
        next_cur = chunk.get("nextCursor")
        if not next_cur:
            break
    LOG.info("NRDB fetched %s log rows", len(logs))
    return pd.DataFrame(logs)
