# Phase 1: Repo Skeleton and Basic Pipeline

This phase sets up the basic project structure and implements a skeleton pipeline that can run end-to-end with mock data.

## Progress Checklist

- [ ] Create directory structure
- [ ] Create basic configuration files
- [ ] Set up Python package files
- [ ] Create pipeline orchestrator
- [ ] Create script stubs
- [ ] Create environment file
- [ ] Test basic pipeline

## Step-by-Step Implementation

### Step 1.1: Create Directory Structure
```bash
# Create the main project directory
mkdir -p microlink/utils
mkdir -p scripts
```

### Step 1.2: Create Basic Configuration Files
```bash
# Create top-level files
touch Makefile
touch requirements.txt
touch .env.example
touch README.md
```

### Step 1.3: Set up Makefile
```bash
# Add the following content to Makefile
cat > Makefile << 'EOF'
VENV ?= .venv
PYTHON := $(VENV)/bin/python

.PHONY: venv demo clean

venv:
	python3 -m venv $(VENV)
	$(PYTHON) -m pip install -r requirements.txt

demo: venv
	$(PYTHON) scripts/main.py --demo

clean:
	rm -rf $(VENV) output/ graph.db
EOF
```

### Step 1.4: Set up requirements.txt
```bash
# Add dependencies to requirements.txt
cat > requirements.txt << 'EOF'
pandas
networkx
pyvis
python-dotenv
neo4j==5.13.0 ; extra == "neo"
openai>=1.3
tqdm
EOF
```

### Step 1.5: Create .env.example File
```bash
# Create .env.example with placeholders
cat > .env.example << 'EOF'
NR_ACCOUNT_ID=1234567
NR_API_KEY=NRAK-XXXXXXXXXXXXXXXXXXXX
OPENAI_API_KEY=sk-XXXXXXXXXXXXXXXX
EOF
```

### Step 1.6: Set up Python Package Files

```bash
# Create __init__.py
cat > microlink/__init__.py << 'EOF'
__all__ = ["config", "pipeline", "utils"]
EOF

# Create config.py
cat > microlink/config.py << 'EOF'
import os
from pathlib import Path
from dotenv import load_dotenv

# load .env if present
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

class Settings:  # pylint: disable=too-few-public-methods
    NR_ACCOUNT   = os.getenv("NR_ACCOUNT_ID", "0")
    NR_API_KEY   = os.getenv("NR_API_KEY",    "")
    OPENAI_KEY   = os.getenv("OPENAI_API_KEY", "")
    LOG_SAMPLE   = int(os.getenv("LOG_SAMPLE", 200))     # for LLM probe
    GRAPH_BACKEND= os.getenv("GRAPH_BACKEND", "networkx") # or "neo4j"
    OUTPUT_DIR   = Path(os.getenv("OUTPUT_DIR", "output")).resolve()

settings = Settings()
settings.OUTPUT_DIR.mkdir(exist_ok=True)
EOF

# Create logging utility
cat > microlink/utils/log.py << 'EOF'
import logging
import sys

def get_logger(name: str = "microlink") -> logging.Logger:
    """Return colourised console logger."""
    log = logging.getLogger(name)
    if log.handlers:      # already configured
        return log
    log.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "\033[36m%(asctime)s\033[0m | %(levelname)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    handler.setFormatter(formatter)
    log.addHandler(handler)
    return log
EOF

# Create NRDB utility stub
cat > microlink/utils/nrdb.py << 'EOF'
from typing import List
import pandas as pd

def nrdb_query(nrql: str, account_id: str, api_key: str) -> pd.DataFrame:
    """
    Placeholder that fakes an NRDB result set so the pipeline runs end-to-end.
    In Turn 2 we'll swap in a real NerdGraph POST.
    """
    import random, datetime as dt
    rows: List[dict] = []
    for i in range(1, 40):
        rows.append(
            {
                "timestamp": (dt.datetime.utcnow() - dt.timedelta(seconds=40-i)).isoformat()+"Z",
                "service.name": random.choice(["checkout-svc", "payment-svc", "shipper-svc"]),
                "message": f"Order orderId={123+i} stage={random.choice(['publish','consume','charge','ship'])}",
            }
        )
    return pd.DataFrame(rows)
EOF
```

### Step 1.7: Create Pipeline Orchestrator
```bash
# Create the pipeline module
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
    log.info("4️⃣  rendering flow …")
    html_path = visualize_flow.main(graph_obj, order_id=order_id, demo=True)
    log.info("🎉  demo ready → %s", html_path.resolve())

if __name__ == "__main__":  # pragma: no cover
    demo()
EOF
```

### Step 1.8: Create Script Stubs
```bash
# Create the main entry point script
cat > scripts/main.py << 'EOF'
import argparse
from microlink.pipeline import demo
from microlink.utils.log import get_logger

log = get_logger()

parser = argparse.ArgumentParser(description="MicroLink demo driver")
parser.add_argument("--demo", action="store_true", help="Run end-to-end demo")
args = parser.parse_args()

if args.demo:
    log.info("🚀  MicroLink demo starting …")
    demo()
    log.info("✅  Done.")
else:
    parser.print_help()
EOF

# Create extract_logs.py stub
cat > scripts/extract_logs.py << 'EOF'
from pathlib import Path
import pandas as pd
from microlink.utils import nrdb, log, config
LOGGER = log.get_logger(__name__)

def main(demo: bool = False) -> Path:
    if demo:
        df = nrdb.nrdb_query("demo", config.settings.NR_ACCOUNT, config.settings.NR_API_KEY)
    else:
        raise NotImplementedError("Real NRDB export coming in Turn 2")
    out = Path("output/raw_logs.csv")
    df.to_csv(out, index=False)
    LOGGER.info("wrote %s", out)
    return out
EOF

# Create normalize_events.py stub
cat > scripts/normalize_events.py << 'EOF'
from pathlib import Path
import pandas as pd
from microlink.utils.log import get_logger
LOG = get_logger(__name__)

def main(csv_path: Path, demo: bool = False) -> Path:
    df = pd.read_csv(csv_path)
    # stub: tag each row with naive eventPoint & correlationKey
    df["event_point"] = df["service.name"] + "_" + df["message"].str.extract(r"stage=(\w+)")
    df["corr_key"]   = df["message"].str.extract(r"(orderId=\d+)")
    out = Path("output/events.csv")
    df.to_csv(out, index=False)
    LOG.info("wrote %s", out)
    return out
EOF

# Create build_graph.py stub
cat > scripts/build_graph.py << 'EOF'
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
EOF

# Create visualize_flow.py stub
cat > scripts/visualize_flow.py << 'EOF'
from pathlib import Path
import networkx as nx
from pyvis.network import Network
from microlink.utils.log import get_logger
LOG = get_logger(__name__)

def main(G: nx.MultiDiGraph, order_id: str, demo: bool = False) -> Path:
    sub = [e for e in G.edges if order_id in e]
    H   = nx.edge_subgraph(G, sub)
    net = Network(height="600px", cdn_resources="in_line", directed=True)
    for n, d in H.nodes(data=True):
        net.add_node(n, label=n if d["type"]=="DataInstance" else n.split("_")[1])
    for u, v, d in H.edges(data=True):
        net.add_edge(u, v, title=d["rel"])
    out = Path("output") / f"{order_id}.html"
    net.show(str(out))
    LOG.info("rendered %s", out)
    return out
EOF

# Create placeholders for future scripts
touch scripts/detect_anomalies.py
touch scripts/policy_checker.py
```

### Step 1.9: Create the .env File
```bash
# Create .env file from example
cp .env.example .env
# (Remember to edit .env with your actual API keys if you have them)
```

### Step 1.10: Test Basic Pipeline
```bash
# Run the demo to test the entire skeleton pipeline
make demo
# This will create a virtual environment, install requirements, and run the pipeline
# Check output/*.html in your browser to see the demo graph
```

## Expected Output

After completing this phase, you should have:
- A working directory structure with all necessary files
- A functional pipeline that generates a mock graph
- The ability to visualize one order's journey through the system

## Troubleshooting

- If you encounter issues with Python packages, make sure your Python version is 3.8 or higher
- If the output directory isn't created, check the permissions on your system
- For visualization issues, make sure you have a modern browser to open the HTML files
