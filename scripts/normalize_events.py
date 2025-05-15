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

# Only set the OpenAI API key if it's not empty or a placeholder
if SET.OPENAI_KEY and not SET.OPENAI_KEY.startswith("sk-XXXXX"):
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
    # Always use simple pattern matching in demo mode
    if not hasattr(openai, 'api_key') or not openai.api_key or openai.api_key.startswith("sk-XXXXX"):
        LOG.warning("No valid OPENAI_KEY provided, using simple pattern matching")
        result = []
        for line in log_lines:
            # Simple pattern matching
            if "publish" in line.lower():
                result.append("publishEvent")
            elif "consum" in line.lower():
                result.append("consumeEvent")
            elif "charge" in line.lower():
                result.append("chargeCard")
            elif "ship" in line.lower():
                result.append("shipOrder")
            else:
                result.append("processEvent")
        return result
    
    # Otherwise, use the OpenAI API
    LOG.info("Using OpenAI API for event naming")
    msgs = [{"role": "system", "content": SYS_PROMPT}]
    msgs += [{"role": "user", "content": ln} for ln in log_lines]

    try:
        resp = openai.chat.completions.create(
            model="gpt-3.5-turbo-0125",
            messages=msgs,
            max_tokens=6,
            temperature=0,
        )
        # choices are stitched in order of user messages
        outs = [c.message.content.strip() for c in resp.choices]
        return outs
    except Exception as e:
        LOG.error("OpenAI API error: %s", e)
        LOG.warning("Falling back to simple pattern matching")
        return llm_event_names(log_lines)  # Recursive call will use pattern matching

# ---------- main ----------------------------------------------------

def main(csv_path: Path, demo: bool = False) -> Path:
    df = pd.read_csv(csv_path)

    # 1. correlation key extraction --------------------------------------------------
    df["corr_key"] = df["message"].apply(extract_corr_key)
    keep = df.dropna(subset=["corr_key"]).reset_index(drop=True)
    if keep.empty:
        LOG.error("No correlation keys found - adjust CORR_PATTERNS")
        raise SystemExit(1)

    # 2. LLM event normalisation (sample or full) -----------------------------------
    unique_msgs = keep["message"].unique()
    sample = unique_msgs if demo else unique_msgs[: SET.LOG_SAMPLE]

    LOG.info("Feeding %s log lines to LLM for naming", len(sample))
    mapping: dict[str, str] = {}

    for chunk in tqdm(list(batch(sample, 25)), unit="batch"):
        names = llm_event_names(chunk)
        mapping.update(dict(zip(chunk, names)))

    keep["event_point"] = keep["message"].map(mapping).fillna("unknownEvent")
    
    # Combine service name and event point for the full event_point identifier
    keep["event_point"] = keep["service.name"] + "_" + keep["event_point"]

    # 3. write structured events -----------------------------------------------------
    out = SET.OUTPUT_DIR / "events.csv"
    keep.to_csv(out, index=False)
    LOG.info("events written to %s", out)
    return out

if __name__ == "__main__":                          # manual test
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="output/raw_logs.csv", help="Input CSV file")
    parser.add_argument("--demo", action="store_true", help="Use simplified LLM logic")
    args = parser.parse_args() 
    main(Path(args.input), demo=args.demo)
