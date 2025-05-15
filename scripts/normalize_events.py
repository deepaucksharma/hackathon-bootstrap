from pathlib import Path
import pandas as pd
from microlink.utils.log import get_logger
LOG = get_logger(__name__)

def main(csv_path: Path, demo: bool = False) -> Path:
    df = pd.read_csv(csv_path)
    # stub: tag each row with naive eventPoint & correlationKey
    # Fix the extraction to handle the DataFrame properly
    stage_col = df["message"].str.extract(r"stage=(\w+)")
    df["event_point"] = df["service.name"] + "_" + stage_col[0].fillna("unknown")
    df["corr_key"] = df["message"].str.extract(r"(orderId=\d+)")[0].fillna("unknown")
    out = Path("output/events.csv")
    df.to_csv(out, index=False)
    LOG.info("wrote %s", out)
    return out
