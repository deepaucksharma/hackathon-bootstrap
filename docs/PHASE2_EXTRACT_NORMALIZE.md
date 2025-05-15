# Phase 2: Extract & Normalize Stack

This phase focuses on implementing the log extraction from New Relic NRDB and LLM-powered event normalization to create structured events from raw logs.

## Progress Checklist

- [ ] Update dependencies
- [ ] Implement NRDB client
- [ ] Implement log extraction script
- [ ] Implement LLM-powered event normalization
- [ ] Test extract and normalize pipeline

## Step-by-Step Implementation

### Step 2.1: Update dependencies
```bash
# Add the requests package to requirements.txt
echo "requests       # NerdGraph HTTPS POST" >> requirements.txt
```

### Step 2.2: Implement the NRDB Client
```bash
# Replace the NRDB stub with a real implementation
cat > microlink/utils/nrdb.py << 'EOF'
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
EOF
```

### Step 2.3: Implement Log Extraction
```bash
# Replace the extract_logs.py stub with a real implementation
cat > scripts/extract_logs.py << 'EOF'
from __future__ import annotations
import argparse, sys
from pathlib import Path
import pandas as pd
from microlink.utils import nrdb, log, config

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
        LOG.warning("Demo mode → fake NRDB data")
        df = nrdb.nrdb_query_logs("demo", SET.NR_ACCOUNT, SET.NR_API_KEY)
    else:
        df = nrdb.nrdb_query_logs(nrql, SET.NR_ACCOUNT, SET.NR_API_KEY)
        if df.empty:
            LOG.error("NRDB returned no rows – check NRQL / timeframe")
            sys.exit(1)

    out = SET.OUTPUT_DIR / "raw_logs.csv"
    df.to_csv(out, index=False)
    LOG.info("raw logs written → %s", out)
    return out

if __name__ == "__main__":                       # local test helper
    argparse.ArgumentParser()
    main(demo=("--demo" in sys.argv))
EOF
```

### Step 2.4: Implement LLM-Powered Event Normalization
```bash
# Replace the normalize_events.py stub with a real implementation
cat > scripts/normalize_events.py << 'EOF'
from __future__ import annotations
from pathlib import Path
import re, json, itertools, os
import pandas as pd
from tqdm import tqdm
from microlink.utils.log import get_logger
from microlink import config
import openai

LOG = get_logger(__name__)
SET = config.settings
openai.api_key = SET.OPENAI_KEY

# ---------- helpers -------------------------------------------------

CORR_PATTERNS = [
    r"\borderId=(\d+)",
    r"\bpaymentId=([A-Za-z0-9-]+)",
    r"\buserId=([A-Za-z0-9-]+)",
]

def extract_corr_key(msg: str) -> str | None:
    for pat in CORR_PATTERNS:
        m = re.search(pat, msg)
        if m:
            return f"{m.group(0)}"          # e.g. orderId=1234
    return None

def batch(iterable, size):
    it = iter(iterable)
    while chunk := list(itertools.islice(it, size)):
        yield chunk

# ---------- LLM prompt templates -----------------------------------

SYS_PROMPT = (
    "You are a log-semantic classifier. "
    "Given an application log line, respond with a concise camelCase event name (max 4 words) "
    "that describes the **action** the service is performing. Do not quote the log."
)

def llm_event_names(log_lines: list[str]) -> list[str]:
    msgs = [{"role": "system", "content": SYS_PROMPT}]
    msgs += [{"role": "user", "content": ln} for ln in log_lines]

    resp = openai.chat.completions.create(
        model="gpt-3.5-turbo-0125",
        messages=msgs,
        max_tokens=6,
        temperature=0,
    )
    # choices are stitched in order of user messages
    outs = [c.message.content.strip() for c in resp.choices]
    return outs

# ---------- main ----------------------------------------------------

def main(csv_path: Path, demo: bool = False) -> Path:
    df = pd.read_csv(csv_path)

    # 1. correlation key extraction --------------------------------------------------
    df["corr_key"] = df["message"].apply(extract_corr_key)
    keep = df.dropna(subset=["corr_key"]).reset_index(drop=True)
    if keep.empty:
        LOG.error("No correlation keys found – adjust CORR_PATTERNS")
        raise SystemExit(1)

    # 2. LLM event normalisation (sample or full) -----------------------------------
    unique_msgs = keep["message"].unique()
    sample = unique_msgs if demo else unique_msgs[: SET.LOG_SAMPLE]

    LOG.info("Feeding %s log lines to LLM for naming …", len(sample))
    mapping: dict[str, str] = {}

    for chunk in tqdm(list(batch(sample, 25)), unit="batch"):
        names = llm_event_names(chunk)
        mapping.update(dict(zip(chunk, names)))

    keep["event_point"] = keep["message"].map(mapping).fillna("unknownEvent")

    # 3. write structured events -----------------------------------------------------
    out = SET.OUTPUT_DIR / "events.csv"
    keep.to_csv(out, index=False)
    LOG.info("events written → %s", out)
    return out

if __name__ == "__main__":                          # manual test
    main(Path("output/raw_logs.csv"), demo=True)
EOF
```

### Step 2.5: Test Extract & Normalize Stack
```bash
# Run the demo to test extraction and normalization
make demo
# Check output/raw_logs.csv and output/events.csv to see the results
```

## Expected Output

After completing this phase, you should have:
- A functional NRDB client that can fetch logs from New Relic
- Proper log extraction with support for large result sets
- LLM-powered event normalization that creates meaningful event names
- A structured events.csv file with extracted correlation keys

## Using with Real Data

To use with real New Relic data:
1. Add your New Relic account ID and API key to `.env`
2. Set a valid OpenAI API key in `.env` for LLM normalization
3. Run with real data:
```bash
OPENAI_API_KEY=<your-key> NR_ACCOUNT_ID=<your-account> NR_API_KEY=<your-key> python scripts/main.py
```

## Troubleshooting

- For New Relic API issues, verify your account ID and API key
- For OpenAI API issues, check your API key and ensure it has appropriate permissions
- If no correlation keys are found, adjust the CORR_PATTERNS in normalize_events.py
- For demo mode, OPENAI_API_KEY=dummy will prevent actual LLM calls
