from __future__ import annotations
import argparse, sys
from pathlib import Path
import pandas as pd
from microlink.utils import nrdb, log
from microlink import config

LOG = log.get_logger(__name__)
SET = config.settings

DEFAULT_NRQL = """
SELECT timestamp, message, service.name, entity.guid
FROM Log
WHERE message LIKE '%orderId=%'
SINCE 2 hours ago
LIMIT MAX
"""

def main(demo: bool = False, nrql: str = DEFAULT_NRQL) -> Path:
    """
    Writes raw_logs.csv into output/ and returns the Path.
    In --demo mode we call the stub; otherwise we hit real NRDB.
    """
    if demo:
        LOG.warning("Demo mode - fake NRDB data")
        df = nrdb.nrdb_query_logs("demo", SET.NR_ACCOUNT, SET.NR_API_KEY)
    else:
        df = nrdb.nrdb_query_logs(nrql, SET.NR_ACCOUNT, SET.NR_API_KEY)
        if df.empty:
            LOG.error("NRDB returned no rows - check NRQL / timeframe")
            sys.exit(1)

    out = SET.OUTPUT_DIR / "raw_logs.csv"
    df.to_csv(out, index=False)
    LOG.info("raw logs written to %s", out)
    return out

if __name__ == "__main__":                       # local test helper
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="Use demo data")
    parser.add_argument("--nrql", default=DEFAULT_NRQL, help="Custom NRQL query")
    args = parser.parse_args()
    main(demo=args.demo, nrql=args.nrql)
