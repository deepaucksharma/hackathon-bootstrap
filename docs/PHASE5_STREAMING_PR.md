# Phase 5: Realtime Stream and GitHub PR Publisher

This phase implements real-time log ingestion from Kafka and adds GitHub PR automation to continuously update reports when new data is processed.

## Progress Checklist

- [ ] Update Docker-Compose for Kafka
- [ ] Create Stream Configuration
- [ ] Implement Stream Ingestion
- [ ] Implement GitHub PR Publisher
- [ ] Update Main Script for Continuous Monitoring
- [ ] Update GitHub Actions for PR Creation
- [ ] Test Full Pipeline with Streaming

## Step-by-Step Implementation

### Step 5.1: Update Docker-Compose for Kafka
```bash
# Append Kafka and ZooKeeper services to docker-compose.yml
cat >> docker-compose.yml << 'EOF'
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.2
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
    ports: [ "2181:2181" ]

  kafka:
    image: confluentinc/cp-kafka:7.5.2
    depends_on: [ zookeeper ]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports: [ "9092:9092" ]
EOF
```

### Step 5.2: Create Stream Configuration
```bash
# Create stream_config.yaml for configuring Kafka connection
cat > stream_config.yaml << 'EOF'
# Map of service → regex that pulls correlation key from log line.
services:
  checkout-svc:   "orderId=\\d+"
  payment-svc:    "orderId=\\d+"
  shipper-svc:    "orderId=\\d+"
topic: logs.demo          # Kafka topic name
bootstrap: kafka:9092     # broker
EOF
```

### Step 5.3: Implement Stream Ingestion
```bash
# Add kafka-python to requirements.txt
echo "kafka-python         # Kafka stream consumer" >> requirements.txt

# Implement the stream_ingest.py script
cat > scripts/stream_ingest.py << 'EOF'
"""
Consumes Kafka topic & appends to output/stream_events.csv
Each record must have key=service.name, value=raw log line.
"""

from __future__ import annotations
from pathlib import Path
import yaml, json, re, time, datetime as dt
import pandas as pd
from kafka import KafkaConsumer
from microlink.utils.log import get_logger

CONF   = yaml.safe_load(Path("stream_config.yaml").read_text())
OUT_CSV= Path("output/stream_events.csv")
LOG    = get_logger(__name__)

def _extract_id(msg: str, rex: re.Pattern) -> str | None:
    m = rex.search(msg)
    return m.group(0) if m else None

def main():
    consumer = KafkaConsumer(
        CONF["topic"],
        bootstrap_servers=[CONF["bootstrap"]],
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        value_deserializer=lambda x: x.decode(),
        key_deserializer=lambda k: k.decode() if k else None,
        consumer_timeout_ms=1000,
    )
    regex_by_svc = {svc: re.compile(rx) for svc, rx in CONF["services"].items()}
    rows = []

    LOG.info("Kafka ingest started …")
    while True:
        for msg in consumer:
            svc = msg.key
            line= msg.value
            corr = _extract_id(line, regex_by_svc.get(svc, re.compile("$^")))
            if not corr:
                continue
            rows.append({
                "timestamp": dt.datetime.utcnow().isoformat()+"Z",
                "service.name": svc,
                "message": line,
                "corr_key": corr,
            })
        if rows:
            df = pd.DataFrame(rows)
            df.to_csv(OUT_CSV, mode="a", header=not OUT_CSV.exists(), index=False)
            LOG.info("appended %s rows → %s", len(rows), OUT_CSV)
            rows.clear()
        time.sleep(2)

if __name__ == "__main__":
    main()
EOF
```

### Step 5.4: Implement GitHub PR Publisher
```bash
# Implement the github_publisher.py script
cat > scripts/github_publisher.py << 'EOF'
"""
Bundles output/* and pushes (or updates) a PR against `main`.
Needs GITHUB_TOKEN with `repo` scope and GH_REPO="owner/repo".
"""

import os, subprocess, tempfile, shutil, pathlib, json, base64
from pathlib import Path
from microlink.utils.log import get_logger

LOG  = get_logger(__name__)
REPO = os.getenv("GH_REPO")
GH_T = os.getenv("GITHUB_TOKEN")

def _run(cmd, **kw):
    return subprocess.check_output(cmd, shell=True, text=True, **kw).strip()

def _ensure_branch(branch):
    try:
        _run(f"git rev-parse --verify {branch}")
    except subprocess.CalledProcessError:
        _run(f"git checkout -b {branch}")
    else:
        _run(f"git checkout {branch}")

def main():
    branch = "microlink-report"
    _ensure_branch(branch)
    out_dir = Path("output")
    for f in out_dir.glob("*"):
        _run(f"git add {f}")
    if not _run("git status --porcelain"):
        LOG.info("no changes – skip PR update")
        return
    msg = "chore(microlink): automated report update"
    _run(f'git commit -m "{msg}"')
    _run(f"git push -f origin {branch}")
    # create / update PR via gh cli if available
    if shutil.which("gh"):
        try:
            _run(f'gh pr create --title "MicroLink report" '
                 f'--body "Automated artefact update" --base main --head {branch}')
        except subprocess.CalledProcessError:
            _run(f'gh pr edit $(gh pr view --json number -q .number) '
                 f'--add-label "microlink"')
    LOG.info("PR pushed (branch %s)", branch)

if __name__ == "__main__":
    main()
EOF
```

### Step 5.5: Update Main Script to Add Continuous Monitoring
```bash
# Update scripts/main.py to add watch command
cat > scripts/main.py << 'EOF'
import argparse
from microlink.pipeline import demo
from microlink.utils.log import get_logger

log = get_logger()

parser = argparse.ArgumentParser(description="MicroLink demo driver")
sub = parser.add_subparsers(dest="cmd")
sub.required = True
sub.add_parser("demo")
sub.add_parser("watch")   # continuous
args = parser.parse_args()

if args.cmd == "demo":
    log.info("🚀  MicroLink demo starting …")
    demo()
    log.info("✅  Done.")
elif args.cmd == "watch":
    from scripts import stream_ingest
    import threading, time
    threading.Thread(target=stream_ingest.main, daemon=True).start()
    log.info("Stream ingest running  ➜ Ctrl+C to stop")
    while True:
        time.sleep(10)
        demo()                 # reuse pipeline every 10 s
        from scripts import github_publisher
        github_publisher.main()
EOF
```

### Step 5.6: Update GitHub Actions to Support PR Creation
```bash
# Update the GitHub Actions workflow file to add PR creation
cat > .github/workflows/demo.yml << 'EOF'
name: MicroLink demo

on: [push, pull_request]

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Run pipeline (mock)
        env:
          OPENAI_API_KEY: dummy
        run: |
          python scripts/main.py demo
      - name: Upload artefacts
        uses: actions/upload-artifact@v4
        with:
          name: microlink-demo-output
          path: output/
      - name: Create / update PR with artefacts
        if: github.event_name == 'push'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        uses: actions/github-script@v7
        with:
          script: |
            const branch='ci-microlink-report'
            const base ='${{ github.ref_name }}'
            const fs   = require('fs')
            await exec.exec('git', ['checkout','-B',branch])
            await exec.exec('cp','-r',['output','.'])
            await exec.exec('git',['add','-A'])
            const status = await exec.getExecOutput('git',['status','--porcelain'])
            if(status.stdout.trim()===''){core.info('no changes');return}
            await exec.exec('git',['config','user.email','bot@microlink'])
            await exec.exec('git',['config','user.name','microlink-bot'])
            await exec.exec('git',['commit','-m','auto: microlink artefacts'])
            await exec.exec('git',['push','-f','origin',branch])
            const prs = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo:  context.repo.repo,
              head:  `${context.repo.owner}:${branch}`,
              base
            })
            if(prs.data.length===0){
              await github.rest.pulls.create({
                owner: context.repo.owner,
                repo:  context.repo.repo,
                head:  branch,
                base,
                title:'MicroLink artefacts',
                body :'Automated reports attached.'
              })
            }
EOF
```

### Step 5.7: Test Full Pipeline with Streaming
```bash
# Start all services
docker compose up -d kafka neo4j

# Install additional requirements
pip install -r requirements.txt

# Run the continuous monitoring
python scripts/main.py watch

# In another terminal, produce sample messages to Kafka
# For example:
docker exec -it kafka kafka-console-producer \
  --bootstrap-server kafka:9092 --topic logs.demo \
  --property "parse.key=true" --property "key.separator=:"

# Then enter messages like:
# checkout-svc:INFO orderId=800 publish cart
# payment-svc:INFO orderId=800 chargeCard success
# shipper-svc:INFO orderId=800 shipOrder
```

## Expected Output

After completing this phase, you should have:
- A Kafka service for real-time message ingestion
- A stream ingestion process that consumes Kafka messages
- A continuous monitoring mode that rebuilds artifacts every 10 seconds
- A GitHub PR publisher that creates or updates reports via pull requests
- A complete CI/CD pipeline that automates the entire process

## Producing Test Messages

You can simulate real service logs by producing messages to the Kafka topic:

```bash
# Start the Kafka producer
docker exec -it kafka kafka-console-producer \
  --bootstrap-server kafka:9092 --topic logs.demo \
  --property "parse.key=true" --property "key.separator=:"

# Then enter messages in format service:message
checkout-svc:INFO orderId=800 publish cart
payment-svc:INFO orderId=800 chargeCard success
shipper-svc:INFO orderId=800 shipOrder

# For testing a policy violation (no fraud check)
checkout-svc:INFO orderId=801 publish cart
payment-svc:INFO orderId=801 chargeCard success
shipper-svc:INFO orderId=801 shipOrder

# For testing a bottleneck (add delay between these)
checkout-svc:INFO orderId=802 publish cart
# Wait 5 seconds
payment-svc:INFO orderId=802 consume from queue
```

## Production Considerations

For production deployment, consider:
- Using a managed Kafka service (AWS MSK, Confluent Cloud)
- Setting up proper authentication for Kafka and Neo4j
- Configuring automatic scaling for high message volumes
- Implementing robust error handling and retries
- Setting up monitoring and alerting for the pipeline
- Using a separate database for persistence in production
- Implementing proper secrets management for API keys

## Troubleshooting

- If Kafka connection fails, check if the Kafka container is running
- For GitHub PR issues, verify that your GitHub token has sufficient permissions
- If messages are not being processed, check Kafka topic and consumer configuration
- For continuous monitoring issues, check logs for any errors or exceptions
